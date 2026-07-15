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
}

/** Download a track's full audio and store it in IndexedDB. */
export async function downloadTrack(track: {
  id: number;
  title: string;
  artistName: string;
  artworkUrl?: string | null;
  duration: number;
}): Promise<void> {
  // Fetch the audio via our stream proxy (which resolves full-track or preview)
  const res = await fetch(`/api/stream?trackId=${track.id}`);
  if (!res.ok) throw new Error("fetch failed");
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
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get the blob URL for a downloaded track, or null if not downloaded. */
let blobUrlCache = new Map<number, string>();

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
      return url;
    }
  } catch {
    /* not downloaded */
  }
  return null;
}

/** Check if a track is downloaded. */
export async function isDownloaded(trackId: number): Promise<boolean> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const countReq = tx.objectStore(STORE).count(trackId);
      countReq.onsuccess = () => resolve(countReq.result > 0);
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
      req.onsuccess = () => resolve(new Set(req.result as number[]));
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
  const url = blobUrlCache.get(trackId);
  if (url) {
    URL.revokeObjectURL(url);
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

// Reset cache map on module reload (dev HMR)
if (typeof window !== "undefined") {
  blobUrlCache = new Map();
}
