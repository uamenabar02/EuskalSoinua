"use client";

import type { Track } from "@/lib/types";
import { getDownloadedUrlSync, isDownloadedSync } from "@/lib/downloads";

/**
 * PLAYBACK CACHE & OFFLINE QUEUE BUFFER
 * ----------------------------------------------------------------------------
 * Solves smartphone mobile connectivity drops and hardware network stalls:
 * 1. Automatically pre-resolves upcoming YouTube video IDs and stream metadata
 *    for tracks ahead in the playback queue.
 * 2. Pre-buffers full audio blobs into an LRU IndexedDB cache so music keeps
 *    playing continuously with 0ms latency even when network connectivity drops.
 * 3. Seamlessly provides offline fallback audio when Full Track Mode encounters
 *    a network disconnection or YouTube IFrame error.
 */

const DB_NAME = "euskalsoinua-playback-cache";
const STORE_NAME = "audio_buffer";
const DB_VERSION = 1;
const MAX_BUFFERED_TRACKS = 12;

export interface BufferedAudioRecord {
  trackId: number;
  title: string;
  artist: string;
  blob: Blob;
  size: number;
  timestamp: number;
  videoId?: string | null;
  provider?: string | null;
}

// In-memory synchronous lookup maps for zero-latency retrieval
const bufferBlobUrlCache = new Map<number | string, string>();
const bufferInfoCache = new Map<number, { videoId?: string | null; provider?: string | null }>();
const activeBufferTasks = new Set<number>();

function openBufferDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "trackId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function normKey(str?: string | null): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Preloads all existing buffered audio records from IndexedDB into memory
 * object URLs so they are instantly accessible on initial track start.
 */
export async function preloadPlaybackCache(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const db = await openBufferDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const records = (req.result as BufferedAudioRecord[]) || [];
        for (const rec of records) {
          if (!rec?.trackId || !rec?.blob) continue;
          const numId = Number(rec.trackId);
          if (!bufferBlobUrlCache.has(numId)) {
            const url = URL.createObjectURL(rec.blob);
            bufferBlobUrlCache.set(numId, url);
            bufferBlobUrlCache.set(String(numId), url);
            const tk = normKey(rec.title);
            const ak = normKey(rec.artist);
            if (tk && ak) {
              bufferBlobUrlCache.set(`key:${tk}:::${ak}`, url);
            }
          }
          if (rec.videoId) {
            bufferInfoCache.set(numId, { videoId: rec.videoId, provider: rec.provider });
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {
    /* ignore initialization failure in non-supporting contexts */
  }
}

/**
 * Synchronous check whether a track is buffered in local cache or downloaded.
 */
export function isAudioBufferedSync(
  trackId: number | string,
  title?: string,
  artistName?: string,
): boolean {
  if (isDownloadedSync(trackId, title, artistName)) {
    return true;
  }
  const num = Number(trackId);
  if (!isNaN(num) && num > 0 && bufferBlobUrlCache.has(num)) {
    return true;
  }
  if (title && artistName) {
    const tk = normKey(title);
    const ak = normKey(artistName);
    if (tk && ak && bufferBlobUrlCache.has(`key:${tk}:::${ak}`)) {
      return true;
    }
  }
  return false;
}

/**
 * Synchronous retrieval of cached audio URL (checks downloaded songs first,
 * then playback buffer).
 */
export function getBufferedAudioUrlSync(
  trackId: number | string,
  title?: string,
  artistName?: string,
): string | null {
  const downloaded = getDownloadedUrlSync(trackId, title, artistName);
  if (downloaded) return downloaded;

  const num = Number(trackId);
  if (!isNaN(num) && num > 0) {
    const hit = bufferBlobUrlCache.get(num) || bufferBlobUrlCache.get(String(num));
    if (hit) return hit;
  }

  if (title && artistName) {
    const tk = normKey(title);
    const ak = normKey(artistName);
    if (tk && ak) {
      const hit = bufferBlobUrlCache.get(`key:${tk}:::${ak}`);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Async retrieval with IndexedDB fallback.
 */
export async function getBufferedAudioUrl(
  trackId: number | string,
  title?: string,
  artistName?: string,
): Promise<string | null> {
  const syncHit = getBufferedAudioUrlSync(trackId, title, artistName);
  if (syncHit) return syncHit;

  if (typeof window === "undefined") return null;

  try {
    const db = await openBufferDb();
    const numId = Number(trackId);
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(numId);
      req.onsuccess = () => {
        const rec = req.result as BufferedAudioRecord | undefined;
        if (rec?.blob) {
          const url = URL.createObjectURL(rec.blob);
          bufferBlobUrlCache.set(numId, url);
          bufferBlobUrlCache.set(String(numId), url);
          const tk = normKey(rec.title || title);
          const ak = normKey(rec.artist || artistName);
          if (tk && ak) {
            bufferBlobUrlCache.set(`key:${tk}:::${ak}`, url);
          }
          resolve(url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Returns cached stream metadata (such as resolved videoId) if pre-resolved.
 */
export function getBufferedStreamInfo(
  trackId: number,
): { videoId?: string | null; provider?: string | null } | null {
  return bufferInfoCache.get(trackId) || null;
}

/**
 * Evicts oldest buffered tracks when buffer exceeds MAX_BUFFERED_TRACKS.
 */
async function enforceLruEviction(db: IDBDatabase): Promise<void> {
  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as BufferedAudioRecord[]) || [];
      if (records.length > MAX_BUFFERED_TRACKS) {
        records.sort((a, b) => a.timestamp - b.timestamp);
        const toDeleteCount = records.length - MAX_BUFFERED_TRACKS;
        for (let i = 0; i < toDeleteCount; i++) {
          const item = records[i];
          store.delete(item.trackId);
          const url = bufferBlobUrlCache.get(item.trackId);
          if (url) {
            try {
              URL.revokeObjectURL(url);
            } catch {}
            bufferBlobUrlCache.delete(item.trackId);
            bufferBlobUrlCache.delete(String(item.trackId));
          }
        }
      }
    };
  } catch {
    /* ignore */
  }
}

/**
 * Pre-buffers an upcoming track into local cache.
 * Resolves stream metadata and downloads the audio stream in the background
 * without freezing or interfering with active playback.
 */
export async function bufferUpcomingTrack(
  track: Track,
  mode: "full" | "preview" = "full",
): Promise<boolean> {
  if (typeof window === "undefined" || !track?.id) return false;
  if (isAudioBufferedSync(track.id, track.title, track.artistName)) return true;
  if (activeBufferTasks.has(track.id)) return false;

  activeBufferTasks.add(track.id);

  try {
    // 1. Pre-resolve stream metadata
    let resolvedVideoId: string | null = track.externalId ?? null;
    let provider = mode === "full" ? "youtube" : "preview";

    try {
      const infoRes = await fetch(
        `/api/stream-info?trackId=${track.id}&mode=${mode}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (infoRes.ok) {
        const info = await infoRes.json();
        if (info.videoId) resolvedVideoId = info.videoId;
        if (info.provider) provider = info.provider;
        bufferInfoCache.set(track.id, { videoId: resolvedVideoId, provider });
      }
    } catch {
      // Continue even if metadata pre-fetch timed out
    }

    // 2. Pre-fetch audio stream blob for full offline resilience
    const audioRes = await fetch(
      `/api/stream?trackId=${track.id}&mode=${mode}`,
      { signal: AbortSignal.timeout(12000) },
    );

    if (!audioRes.ok) {
      activeBufferTasks.delete(track.id);
      return false;
    }

    const blob = await audioRes.blob();
    if (blob.size < 1000) {
      activeBufferTasks.delete(track.id);
      return false;
    }

    const db = await openBufferDb();
    const record: BufferedAudioRecord = {
      trackId: track.id,
      title: track.title,
      artist: track.artistName,
      blob,
      size: blob.size,
      timestamp: Date.now(),
      videoId: resolvedVideoId,
      provider,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const objectUrl = URL.createObjectURL(blob);
    bufferBlobUrlCache.set(track.id, objectUrl);
    bufferBlobUrlCache.set(String(track.id), objectUrl);
    const tk = normKey(track.title);
    const ak = normKey(track.artistName);
    if (tk && ak) {
      bufferBlobUrlCache.set(`key:${tk}:::${ak}`, objectUrl);
    }

    await enforceLruEviction(db);
    activeBufferTasks.delete(track.id);
    return true;
  } catch {
    activeBufferTasks.delete(track.id);
    return false;
  }
}

/**
 * Pre-buffers the next 2-3 tracks in the queue sequentially in the background.
 */
export function prebufferQueue(
  queue: Track[],
  currentIndex: number,
  mode: "full" | "preview" = "full",
): void {
  if (typeof window === "undefined" || !queue || queue.length === 0) return;
  // If user is strictly offline, do not attempt network pre-buffering
  if (!navigator.onLine || localStorage.getItem("euskalsoinua-offline-only") === "true") {
    return;
  }

  const lookAheadTracks: Track[] = [];
  for (let offset = 1; offset <= 2; offset++) {
    const idx = currentIndex + offset;
    if (idx < queue.length && queue[idx]) {
      lookAheadTracks.push(queue[idx]);
    }
  }

  if (lookAheadTracks.length === 0) return;

  // Process sequentially with slight pacing to not starve network bandwidth
  (async () => {
    for (const track of lookAheadTracks) {
      if (!isAudioBufferedSync(track.id, track.title, track.artistName)) {
        await bufferUpcomingTrack(track, mode).catch(() => {});
        // brief 300ms pause between tracks
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  })().catch(() => {});
}
