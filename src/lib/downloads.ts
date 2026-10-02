"use client";

import { useSyncExternalStore } from "react";

/**
 * DOWNLOADS — client-side offline audio storage via IndexedDB.
 *
 * Stores the full audio blob for a track so it can play without a network
 * connection. Each record maps trackId -> { blob, title, artist, downloadedAt }.
 * Scoped per active user/device so each user retains their own distinct memory.
 */

const BASE_DB_NAME = "euskalsoinua-downloads";
const STORE = "tracks";
const DB_VERSION = 1;

export function getUserScope(): string {
  if (typeof window === "undefined") return "default";
  try {
    const syncKey = localStorage.getItem("euskalsoinua-sync-key");
    if (syncKey && syncKey.trim()) return `sync_${syncKey.trim()}`;
    const deviceId = localStorage.getItem("euskalsoinua-device-id");
    if (deviceId && deviceId.trim()) return `dev_${deviceId.trim()}`;
  } catch {}
  return "default";
}

function getIdsCacheKey(): string {
  return `euskalsoinua_downloaded_track_ids_${getUserScope()}`;
}

function getTitlesCacheKey(): string {
  return `euskalsoinua_downloaded_track_titles_${getUserScope()}`;
}

function getDbName(): string {
  const scope = getUserScope();
  return scope === "default" ? BASE_DB_NAME : `${BASE_DB_NAME}_${scope}`;
}

export function normalizeTrackString(str?: string | null): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents (e.g. è, é, á -> e, a)
    .replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, " ") // remove parentheticals like (Official Video), [Remastered]
    .replace(/[^a-z0-9]/g, "") // keep only alphanumerics
    .trim();
}

let dbMigrationDone = false;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const currentDbName = getDbName();
    const req = indexedDB.open(currentDbName, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "trackId" });
      }
    };
    req.onsuccess = async () => {
      const db = req.result;
      // Auto-migrate from legacy un-scoped DB if needed
      if (!dbMigrationDone && currentDbName !== BASE_DB_NAME && typeof window !== "undefined") {
        dbMigrationDone = true;
        try {
          const legacyReq = indexedDB.open(BASE_DB_NAME, DB_VERSION);
          legacyReq.onsuccess = () => {
            const legacyDb = legacyReq.result;
            if (legacyDb.objectStoreNames.contains(STORE)) {
              const tx = legacyDb.transaction(STORE, "readonly");
              const getAllReq = tx.objectStore(STORE).getAll();
              getAllReq.onsuccess = () => {
                const legacyRecords = (getAllReq.result as DownloadedTrack[]) || [];
                if (legacyRecords.length > 0) {
                  const targetTx = db.transaction(STORE, "readwrite");
                  const targetStore = targetTx.objectStore(STORE);
                  for (const r of legacyRecords) {
                    targetStore.put(r);
                  }
                }
              };
            }
          };
        } catch {}
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

export interface DownloadedTrack {
  trackId: number;
  blob: Blob;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  duration: number;
  downloadedAt: number;
  albumId?: number | null;
  albumName?: string | null;
  isFullTrack?: boolean;
  fileSize?: number;
}

function readCachedIds(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(getIdsCacheKey());
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map(Number).filter((n) => !isNaN(n) && n > 0));
      }
    }
  } catch {}
  return new Set();
}

function readCachedTitles(): { combo: Set<string>; titles: Set<string> } {
  const combo = new Set<string>();
  const titles = new Set<string>();
  if (typeof window === "undefined") return { combo, titles };
  try {
    const raw = localStorage.getItem(getTitlesCacheKey());
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.combo)) data.combo.forEach((k: string) => combo.add(k));
    }
  } catch {}
  return { combo, titles };
}

function persistCachedIds(ids: Set<number>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getIdsCacheKey(), JSON.stringify(Array.from(ids)));
  } catch {}
}

function persistCachedTitles(combo: Set<string>, titles: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      getTitlesCacheKey(),
      JSON.stringify({
        combo: Array.from(combo),
      })
    );
  } catch {}
}

// Synchronous cache for IDs, titles and Blob URLs to allow instant, synchronous playback
let downloadedIds = readCachedIds();
const cachedTitlesObj = readCachedTitles();
let downloadedTitlesCombo = cachedTitlesObj.combo;
let downloadedTitlesOnly = new Set<string>();
let blobUrlCache = new Map<number | string, string>();

// Listeners for useSyncExternalStore subscription
const listeners = new Set<() => void>();
function notifyListeners() {
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {}
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("downloads-changed", notifyListeners);
}

function subscribeDownloads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Helper to check downloaded status synchronously */
export function isDownloadedSync(
  trackId: number | string,
  title?: string,
  artistName?: string
): boolean {
  const num = Number(trackId);
  if (!isNaN(num) && num > 0) {
    return downloadedIds.has(num);
  }
  if (trackId && downloadedIds.has(Number(trackId))) {
    return true;
  }
  if (title && artistName) {
    const normTitle = normalizeTrackString(title);
    const normArtist = normalizeTrackString(artistName);
    if (normTitle && normArtist && downloadedTitlesCombo.has(`${normTitle}:::${normArtist}`)) {
      return true;
    }
  }
  return false;
}

/** Helper to get downloaded URL synchronously */
export function getDownloadedUrlSync(
  trackId: number | string,
  title?: string,
  artistName?: string
): string | null {
  const num = Number(trackId);
  if (!isNaN(num) && num > 0) {
    const byId = blobUrlCache.get(num) || blobUrlCache.get(String(num));
    if (byId) return byId;
  }

  if (title && artistName) {
    const normTitle = normalizeTrackString(title);
    const normArtist = normalizeTrackString(artistName);
    if (normTitle && normArtist) {
      const byCombo = blobUrlCache.get(`key:${normTitle}:::${normArtist}`);
      if (byCombo) return byCombo;
    }
  }
  return null;
}

/** Preload all downloaded track audio blobs into memory URLs for instant 0ms playback */
export async function preloadDownloadedUrls(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const records = (req.result as DownloadedTrack[]) || [];
        const nextIds = new Set<number>();
        const nextCombo = new Set<string>();

        // Revoke any previous URLs that are not in this fresh load
        for (const rec of records) {
          if (!rec) continue;
          const numId = Number(rec.trackId);
          if (!isNaN(numId) && numId > 0) {
            nextIds.add(numId);
          }
          const normT = normalizeTrackString(rec.title);
          const normA = normalizeTrackString(rec.artist);
          if (normT && normA) {
            nextCombo.add(`${normT}:::${normA}`);
          }

          if (rec.blob) {
            const existingUrl = blobUrlCache.get(numId) || blobUrlCache.get(String(numId));
            if (!existingUrl) {
              const safeBlob =
                rec.blob instanceof Blob
                  ? rec.blob
                  : new Blob([rec.blob], { type: "audio/mpeg" });
              const url = URL.createObjectURL(safeBlob);
              blobUrlCache.set(numId, url);
              blobUrlCache.set(String(numId), url);
              if (normT && normA) {
                blobUrlCache.set(`key:${normT}:::${normA}`, url);
              }
            }
          }
        }
        downloadedIds = nextIds;
        downloadedTitlesCombo = nextCombo;
        persistCachedIds(downloadedIds);
        persistCachedTitles(downloadedTitlesCombo, new Set());
        notifyListeners();
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {
    /* ignore */
  }
}

/** React hook to check if a specific track is downloaded (reacts to download events) */
export function useIsDownloaded(trackId: number | string): boolean {
  return useSyncExternalStore(
    subscribeDownloads,
    () => isDownloadedSync(trackId),
    () => false,
  );
}

/** React hook to retrieve all downloaded track IDs as a Set */
export function useDownloadedTrackIds(): Set<number> {
  return useSyncExternalStore(
    subscribeDownloads,
    () => downloadedIds,
    () => new Set<number>(),
  );
}

async function getBlobAudioDuration(blob: Blob): Promise<number | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      const cleanup = () => {
        try {
          URL.revokeObjectURL(url);
          audio.removeAttribute("src");
          audio.load();
        } catch {}
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 4000);
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        const dur = Math.round(audio.duration);
        cleanup();
        resolve(dur > 0 && !isNaN(dur) && isFinite(dur) ? dur : null);
      };
      audio.onerror = () => {
        clearTimeout(timer);
        cleanup();
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

const prewarmedTrackIds = new Set<number | string>();

/** Prewarm download route & audio conversion in the background when user hovers over download button */
export function prewarmTrackDownload(trackId: number | string): void {
  if (typeof window === "undefined" || !trackId) return;
  if (prewarmedTrackIds.has(trackId)) return;
  prewarmedTrackIds.add(trackId);
  try {
    const deviceId = localStorage.getItem("euskalsoinua-device-id") || "";
    const headers: Record<string, string> = {};
    if (deviceId) {
      headers["x-device-id"] = deviceId;
    }
    fetch(`/api/download?trackId=${trackId}&warm=true`, {
      headers,
      priority: "low",
      signal: AbortSignal.timeout(6000),
    }).catch(() => {});
  } catch {}
}

/** Download a track's full audio and store it in IndexedDB. */
export async function downloadTrack(track: {
  id: number;
  title: string;
  artistName: string;
  artworkUrl?: string | null;
  duration: number;
  albumId?: number | null;
  albumName?: string | null;
}): Promise<{ isFullTrack: boolean; fileSize: number; duration: number }> {
  const deviceId =
    typeof window !== "undefined"
      ? localStorage.getItem("euskalsoinua-device-id") || ""
      : "";
  const headers: Record<string, string> = {};
  if (deviceId) {
    headers["x-device-id"] = deviceId;
  }

  // 1. Try dedicated full-track download API first (converts YouTube audio to full MP3)
  let res: Response | null = null;
  try {
    res = await fetch(`/api/download?trackId=${track.id}`, {
      headers,
    });
  } catch {}

  // 2. Fall back to stream proxy if download endpoint had transient network issue
  if (!res || !res.ok) {
    res = await fetch(`/api/stream?trackId=${track.id}&mode=full`, {
      headers,
    });
  }

  if (!res.ok) {
    if (res.status === 503) {
      throw new Error("Full track unavailable");
    }
    throw new Error("fetch failed");
  }

  const isFullHeader = res.headers.get("x-is-full-track") === "true";
  const streamProvider = res.headers.get("x-stream-provider");
  const durHeader = Number(res.headers.get("x-track-duration"));
  const blob = await res.blob();
  if (blob.size < 1000) throw new Error("empty audio");

  const detectedDur = await getBlobAudioDuration(blob);
  const finalDuration =
    detectedDur && detectedDur > 0
      ? detectedDur
      : durHeader && durHeader > 0
      ? durHeader
      : track.duration;

  // An audio file larger than 1.2MB is definitively a full track (30s previews are <600KB)
  const isFull =
    (isFullHeader || blob.size > 1_200_000 || finalDuration > 45) &&
    streamProvider !== "preview";

  // Strict offline requirement: NEVER save a 30-second preview as an offline download!
  if (!isFull) {
    throw new Error("Full track unavailable");
  }

  let offlineArtwork = track.artworkUrl ?? null;
  if (track.artworkUrl && !track.artworkUrl.startsWith("data:")) {
    try {
      const artRes = await fetch(track.artworkUrl, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (artRes.ok) {
        const artBlob = await artRes.blob();
        const reader = new FileReader();
        offlineArtwork = await new Promise<string>((res) => {
          reader.onloadend = () => res(reader.result as string);
          reader.readAsDataURL(artBlob);
        });
      }
    } catch {
      // Keep original artworkUrl if caching fails
    }
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const numId = Number(track.id);
    tx.objectStore(STORE).put({
      trackId: numId,
      blob,
      title: track.title,
      artist: track.artistName,
      artworkUrl: offlineArtwork,
      duration: finalDuration,
      downloadedAt: Date.now(),
      albumId: track.albumId ?? null,
      albumName: track.albumName ?? null,
      isFullTrack: isFull,
      fileSize: blob.size,
    });
    tx.oncomplete = () => {
      // Cache album offline metadata if available
      if (track.albumId || track.albumName) {
        try {
          const albumKey = track.albumId ? `euskalsoinua-album-cache-${track.albumId}` : `euskalsoinua-album-cache-${encodeURIComponent(track.albumName || "")}`;
          const existingRaw = localStorage.getItem(albumKey);
          let albumObj = existingRaw ? JSON.parse(existingRaw) : null;
          if (!albumObj || !albumObj.album) {
            albumObj = {
              album: {
                id: track.albumId || 0,
                externalId: null,
                source: "local",
                title: track.albumName || "Downloaded Album",
                artistId: null,
                artistName: track.artistName,
                thumbnail: offlineArtwork,
                year: null,
                genre: "Basque",
                region: "eu",
                trackCount: 1,
                saved: true,
              },
              tracks: [],
            };
          }
          // Add or update track in cached album
          const existingIndex = albumObj.tracks.findIndex((t: any) => t.id === numId);
          const trackItem = {
            id: numId,
            externalId: null,
            source: "local",
            title: track.title,
            artistId: null,
            artistName: track.artistName,
            albumId: track.albumId ?? null,
            albumName: track.albumName ?? null,
            duration: finalDuration,
            thumbnail: null,
            genre: null,
            region: "eu",
            language: "eu",
            demoAudio: null,
            isrc: null,
            previewUrl: null,
            previewUrlAlt: null,
            artworkUrl: offlineArtwork,
            playCount: 0,
            liked: false,
          };
          if (existingIndex >= 0) {
            albumObj.tracks[existingIndex] = trackItem;
          } else {
            albumObj.tracks.push(trackItem);
          }
          albumObj.album.trackCount = albumObj.tracks.length;
          localStorage.setItem(albumKey, JSON.stringify(albumObj));
          if (track.albumName) {
            localStorage.setItem(`euskalsoinua-album-cache-${encodeURIComponent(track.albumName)}`, JSON.stringify(albumObj));
          }
        } catch {}
      }

      // Add to our synchronous caches
      const nextIds = new Set(downloadedIds);
      nextIds.add(numId);
      downloadedIds = nextIds;
      persistCachedIds(downloadedIds);

      const normT = normalizeTrackString(track.title);
      const normA = normalizeTrackString(track.artistName);
      if (normT) {
        downloadedTitlesOnly.add(normT);
        if (normA) downloadedTitlesCombo.add(`${normT}:::${normA}`);
        persistCachedTitles(downloadedTitlesCombo, downloadedTitlesOnly);
      }

      try {
        const oldUrl = blobUrlCache.get(numId) || blobUrlCache.get(track.id);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
      } catch {}
      const safeBlob =
        blob instanceof Blob
          ? blob
          : new Blob([blob], { type: "audio/mpeg" });
      const url = URL.createObjectURL(safeBlob);
      blobUrlCache.set(numId, url);
      blobUrlCache.set(track.id, url);
      blobUrlCache.set(String(track.id), url);
      if (normT) {
        blobUrlCache.set(`title:${normT}`, url);
        if (normA) blobUrlCache.set(`key:${normT}:::${normA}`, url);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("downloads-changed"));
      }
      resolve({ isFullTrack: isFull, fileSize: blob.size, duration: finalDuration });
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Get the blob URL for a downloaded track, or null if not downloaded. */
export async function getDownloadedUrl(
  trackId: number | string,
  title?: string,
  artist?: string
): Promise<string | null> {
  const sync = getDownloadedUrlSync(trackId, title, artist);
  if (sync) return sync;

  const numId = Number(trackId);
  const strId = String(trackId);
  const normTitle = normalizeTrackString(title);
  const normArtist = normalizeTrackString(artist);

  try {
    const db = await openDb();
    const rec = await new Promise<DownloadedTrack | undefined>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);

      // 1. Try numeric key lookup
      const req1 = store.get(numId);
      req1.onsuccess = () => {
        if (req1.result) {
          resolve(req1.result);
        } else {
          // 2. Try raw key lookup
          const req2 = store.get(trackId);
          req2.onsuccess = () => {
            if (req2.result) {
              resolve(req2.result);
            } else {
              // 3. Try string key lookup
              const req3 = store.get(strId);
              req3.onsuccess = () => {
                if (req3.result) {
                  resolve(req3.result);
                } else {
                  // 4. Exhaustive search across records by ID or title/artist
                  const allReq = store.getAll();
                  allReq.onsuccess = () => {
                    const allRecs = (allReq.result as DownloadedTrack[]) || [];
                    // Try numeric match first
                    let match = allRecs.find((r) => r && Number(r.trackId) === numId);
                    // Then combo title + artist match
                    if (!match && normTitle && normArtist) {
                      match = allRecs.find(
                        (r) =>
                          r &&
                          normalizeTrackString(r.title) === normTitle &&
                          normalizeTrackString(r.artist) === normArtist
                      );
                    }
                    // Then title-only match
                    if (!match && normTitle) {
                      match = allRecs.find(
                        (r) => r && normalizeTrackString(r.title) === normTitle
                      );
                    }
                    resolve(match);
                  };
                  allReq.onerror = () => resolve(undefined);
                }
              };
              req3.onerror = () => resolve(undefined);
            }
          };
          req2.onerror = () => resolve(undefined);
        }
      };
      req1.onerror = () => resolve(undefined);
    });

    if (rec && rec.blob) {
      const safeBlob =
        rec.blob instanceof Blob
          ? rec.blob
          : new Blob([rec.blob], { type: "audio/mpeg" });
      const url = URL.createObjectURL(safeBlob);
      blobUrlCache.set(numId, url);
      blobUrlCache.set(trackId, url);
      blobUrlCache.set(strId, url);
      if (rec.trackId) {
        blobUrlCache.set(rec.trackId, url);
      }
      const recNormT = normalizeTrackString(rec.title);
      const recNormA = normalizeTrackString(rec.artist);
      if (recNormT) {
        blobUrlCache.set(`title:${recNormT}`, url);
        if (recNormA) blobUrlCache.set(`key:${recNormT}:::${recNormA}`, url);
        downloadedTitlesOnly.add(recNormT);
        if (recNormA) downloadedTitlesCombo.add(`${recNormT}:::${recNormA}`);
        persistCachedTitles(downloadedTitlesCombo, downloadedTitlesOnly);
      }
      if (normTitle) {
        blobUrlCache.set(`title:${normTitle}`, url);
        if (normArtist) blobUrlCache.set(`key:${normTitle}:::${normArtist}`, url);
      }
      const nextIds = new Set(downloadedIds);
      nextIds.add(numId);
      if (rec.trackId) nextIds.add(Number(rec.trackId));
      downloadedIds = nextIds;
      persistCachedIds(downloadedIds);
      notifyListeners();
      return url;
    }
  } catch {
    /* not downloaded */
  }
  return null;
}

/** Check if a track is downloaded. */
export async function isDownloaded(trackId: number | string): Promise<boolean> {
  const numId = Number(trackId);
  if (isDownloadedSync(trackId)) return true;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const countReq = store.count(numId);
      countReq.onsuccess = () => {
        const hasIt = countReq.result > 0;
        if (hasIt) {
          downloadedIds.add(numId);
          persistCachedIds(downloadedIds);
          resolve(true);
        } else {
          // Check raw key
          const rawReq = store.count(trackId);
          rawReq.onsuccess = () => {
            const hasRaw = rawReq.result > 0;
            if (hasRaw) {
              downloadedIds.add(numId);
              persistCachedIds(downloadedIds);
            }
            resolve(hasRaw);
          };
          rawReq.onerror = () => resolve(false);
        }
      };
      countReq.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Get all downloaded track ids. */
export async function getDownloadedIds(): Promise<Set<number>> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => {
        const ids = new Set((req.result as any[]).map((k) => Number(k)).filter((k) => !isNaN(k)));
        downloadedIds = ids;
        persistCachedIds(ids);
        resolve(ids);
      };
      req.onerror = () => resolve(new Set(downloadedIds));
    });
  } catch {
    return new Set(downloadedIds);
  }
}

/** List all downloaded tracks (metadata only, no blobs). */
export async function listDownloads(): Promise<
  Omit<DownloadedTrack, "blob">[]
> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result as DownloadedTrack[]).map((r) => {
          const isFull =
            r.isFullTrack ??
            (r.blob ? r.blob.size > 1_200_000 : (r.fileSize ? r.fileSize > 1_200_000 : r.duration > 45));
          const fSize = r.fileSize ?? (r.blob ? r.blob.size : undefined);
          return {
            trackId: r.trackId,
            title: r.title,
            artist: r.artist,
            artworkUrl: r.artworkUrl,
            duration: r.duration,
            downloadedAt: r.downloadedAt,
            albumId: r.albumId,
            albumName: r.albumName,
            isFullTrack: isFull,
            fileSize: fSize,
          };
        });
        rows.sort((a, b) => b.downloadedAt - a.downloadedAt);
        resolve(rows);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Remove a downloaded track completely from memory and storage. */
export async function removeDownload(trackId: number | string): Promise<void> {
  const numId = Number(trackId);
  const strId = String(trackId);

  const db = await openDb();

  // 1. Fetch the track to find its title and artist before deleting
  let recToDelete: DownloadedTrack | undefined;
  try {
    recToDelete = await new Promise<DownloadedTrack | undefined>((res) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(numId);
      req.onsuccess = () => {
        if (req.result) {
          res(req.result);
        } else {
          const req2 = store.get(trackId);
          req2.onsuccess = () => res(req2.result);
          req2.onerror = () => res(undefined);
        }
      };
      req.onerror = () => res(undefined);
    });
  } catch {}

  // 2. Perform the delete in IndexedDB
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(numId);
    store.delete(trackId);
    store.delete(strId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  // 3. Clear ALL in-memory blob URLs associated with this track
  const urlsToRevoke: string[] = [];
  const keysToDel: (number | string)[] = [numId, trackId, strId];
  if (recToDelete) {
    const normT = normalizeTrackString(recToDelete.title);
    const normA = normalizeTrackString(recToDelete.artist);
    if (normT) {
      keysToDel.push(`title:${normT}`);
      if (normA) keysToDel.push(`key:${normT}:::${normA}`);
    }
  }

  for (const k of keysToDel) {
    const u = blobUrlCache.get(k);
    if (u) {
      urlsToRevoke.push(u);
      blobUrlCache.delete(k);
    }
  }

  for (const u of urlsToRevoke) {
    try {
      URL.revokeObjectURL(u);
    } catch {}
  }

  // 4. Recompute the active downloadedIds and titles cleanly from the remaining records in DB
  try {
    const remaining = await new Promise<DownloadedTrack[]>((res) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => res([]);
    });

    const newIds = new Set<number>();
    const newCombo = new Set<string>();
    const newTitles = new Set<string>();

    for (const r of remaining) {
      if (!r) continue;
      const nId = Number(r.trackId);
      if (!isNaN(nId)) newIds.add(nId);
      const nT = normalizeTrackString(r.title);
      const nA = normalizeTrackString(r.artist);
      if (nT) {
        newTitles.add(nT);
        if (nA) newCombo.add(`${nT}:::${nA}`);
      }
    }

    downloadedIds = newIds;
    downloadedTitlesCombo = newCombo;
    downloadedTitlesOnly = newTitles;
    persistCachedIds(downloadedIds);
    persistCachedTitles(downloadedTitlesCombo, downloadedTitlesOnly);
  } catch {
    downloadedIds.delete(numId);
    persistCachedIds(downloadedIds);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("downloads-changed"));
  }
}

/** Clear all downloaded tracks from IndexedDB and free memory completely. */
export async function clearAllDownloads(): Promise<void> {
  // Revoke and clear synchronous caches
  for (const url of Array.from(blobUrlCache.values())) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  downloadedIds = new Set();
  downloadedTitlesCombo = new Set();
  downloadedTitlesOnly = new Set();
  persistCachedIds(downloadedIds);
  persistCachedTitles(downloadedTitlesCombo, downloadedTitlesOnly);
  blobUrlCache.clear();

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("downloads-changed"));
      }
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// Retain cache from localStorage and pre-warm blob URLs on module load immediately
if (typeof window !== "undefined") {
  downloadedIds = readCachedIds();
  preloadDownloadedUrls().catch(() => {});
}
