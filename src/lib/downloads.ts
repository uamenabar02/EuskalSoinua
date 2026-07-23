"use client";

/**
 * DOWNLOADS — client-side offline audio storage via IndexedDB.
 *
 * Stores the full audio blob for a track so it can play without a network
 * connection. Each record maps trackId -> { blob, title, artist, downloadedAt }.
 */

const DB_NAME = "euskalsoinua-downloads";
const STORE = "tracks";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "trackId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
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
}

// Synchronous cache for IDs and Blob URLs to allow instant, synchronous playback
let downloadedIds = new Set<number>();
let blobUrlCache = new Map<number, string>();

/** Helper to check downloaded status synchronously */
export function isDownloadedSync(trackId: number): boolean {
  return downloadedIds.has(trackId);
}

/** Helper to get downloaded URL synchronously */
export function getDownloadedUrlSync(trackId: number): string | null {
  return blobUrlCache.get(trackId) || null;
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
}): Promise<void> {
  // Fetch the audio via our stream proxy (which resolves full-track or preview)
  const res = await fetch(`/api/stream?trackId=${track.id}&mode=full`);
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error("Full track unavailable");
    }
    throw new Error("fetch failed");
  }
  const blob = await res.blob();
  if (blob.size < 1000) throw new Error("empty audio");

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({
      trackId: track.id,
      blob,
      title: track.title,
      artist: track.artistName,
      artworkUrl: track.artworkUrl ?? null,
      duration: track.duration,
      downloadedAt: Date.now(),
      albumId: track.albumId ?? null,
      albumName: track.albumName ?? null,
    });
    tx.oncomplete = () => {
      // Add to our synchronous caches
      downloadedIds.add(track.id);
      try {
        const oldUrl = blobUrlCache.get(track.id);
        if (oldUrl) URL.revokeObjectURL(oldUrl);
      } catch {}
      const url = URL.createObjectURL(blob);
      blobUrlCache.set(track.id, url);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/** Get the blob URL for a downloaded track, or null if not downloaded. */
export async function getDownloadedUrl(trackId: number): Promise<string | null> {
  if (blobUrlCache.has(trackId)) return blobUrlCache.get(trackId)!;
  try {
    const db = await openDb();
    const rec = await new Promise<DownloadedTrack | undefined>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(trackId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
    if (rec) {
      const url = URL.createObjectURL(rec.blob);
      blobUrlCache.set(trackId, url);
      downloadedIds.add(trackId);
      return url;
    }
  } catch {
    /* not downloaded */
  }
  return null;
}

/** Check if a track is downloaded. */
export async function isDownloaded(trackId: number): Promise<boolean> {
  if (downloadedIds.has(trackId)) return true;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const countReq = tx.objectStore(STORE).count(trackId);
      countReq.onsuccess = () => {
        const hasIt = countReq.result > 0;
        if (hasIt) {
          downloadedIds.add(trackId);
        } else {
          downloadedIds.delete(trackId);
        }
        resolve(hasIt);
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
        const ids = new Set(req.result as number[]);
        downloadedIds = ids;
        resolve(ids);
      };
      req.onerror = () => resolve(new Set());
    });
  } catch {
    return new Set();
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
        const rows = (req.result as DownloadedTrack[]).map((r) => ({
          trackId: r.trackId,
          title: r.title,
          artist: r.artist,
          artworkUrl: r.artworkUrl,
          duration: r.duration,
          downloadedAt: r.downloadedAt,
          albumId: r.albumId,
          albumName: r.albumName,
        }));
        rows.sort((a, b) => b.downloadedAt - a.downloadedAt);
        resolve(rows);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/** Remove a downloaded track. */
export async function removeDownload(trackId: number): Promise<void> {
  downloadedIds.delete(trackId);
  const url = blobUrlCache.get(trackId);
  if (url) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
    blobUrlCache.delete(trackId);
  }
  const db = await openDb();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(trackId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Clear all downloaded tracks from IndexedDB and free memory. */
export async function clearAllDownloads(): Promise<void> {
  // Clear synchronous caches
  for (const url of Array.from(blobUrlCache.values())) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  downloadedIds.clear();
  blobUrlCache.clear();

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Reset cache map and pre-warm on module load in the browser
if (typeof window !== "undefined") {
  downloadedIds = new Set();
  blobUrlCache = new Map();
  getDownloadedIds().then(async (ids) => {
    // Warm up the blobUrlCache for all offline tracks asynchronously so they are instantly accessible synchronously
    for (const id of ids) {
      await getDownloadedUrl(id).catch(() => null);
    }
  });
}
