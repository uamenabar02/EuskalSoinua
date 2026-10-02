import "server-only";

interface FullTrackCacheEntry {
  url: string;
  expires: number;
}

const FULL_TRACK_CACHE = new Map<string, FullTrackCacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours cache
const ACTIVE_CONVERSIONS = new Map<string, Promise<string | null>>();

const CONVERTER_INSTANCES = [
  "https://p.savenow.to",
  "https://p.lbserver.xyz",
  "https://loader.to",
];

async function pollConversionInstance(
  base: string,
  id: string,
  signal?: AbortSignal
): Promise<string | null> {
  const progressUrl = `${base}/api/progress?id=${encodeURIComponent(id)}`;
  const maxAttempts = 25; // 25 attempts * 350ms = ~8.7s max per instance

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) return null;
    await new Promise((r) => setTimeout(r, 350));
    if (signal?.aborted) return null;

    try {
      const pController = new AbortController();
      const pTimer = setTimeout(() => pController.abort(), 2500);
      const pRes = await fetch(progressUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://loader.to/",
          Accept: "application/json",
        },
        signal: pController.signal,
      });
      clearTimeout(pTimer);

      if (!pRes.ok) continue;
      const pData = await pRes.json().catch(() => null);
      if (!pData) continue;

      if (pData.download_url && typeof pData.download_url === "string") {
        return pData.download_url;
      }

      if (pData.success === -1 || pData.error) {
        return null;
      }
    } catch {
      // Continue polling unless timed out
    }
  }
  return null;
}

async function requestInstanceConversion(
  base: string,
  ytUrl: string,
  format: string = "mp3"
): Promise<string | null> {
  try {
    const initUrl = `${base}/api/v2/download?button=1&format=${format}&url=${encodeURIComponent(ytUrl)}`;
    const controller = new AbortController();
    const initTimer = setTimeout(() => controller.abort(), 4000);

    const initRes = await fetch(initUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://loader.to/",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(initTimer);

    if (!initRes.ok) return null;
    const data = await initRes.json().catch(() => null);
    if (!data?.id) return null;

    return await pollConversionInstance(base, data.id);
  } catch {
    return null;
  }
}

/**
 * Extracts a high-quality, full-length audio stream (MP3) for any YouTube video.
 * Uses parallel multi-instance dispatch and high-frequency 350ms polling for ~3-5 second downloads.
 */
export async function extractFullTrackAudioUrl(videoId: string): Promise<string | null> {
  if (!videoId || videoId.length < 5) return null;

  // 1. Check in-memory cache
  const cached = FULL_TRACK_CACHE.get(videoId);
  if (cached && Date.now() < cached.expires) {
    return cached.url;
  }

  // 2. Reuse ongoing conversion if one is already in-flight for this videoId
  const inFlight = ACTIVE_CONVERSIONS.get(videoId);
  if (inFlight) {
    return inFlight;
  }

  const conversionPromise = (async () => {
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Launch parallel conversion requests across all healthy converter endpoints concurrently
    const tasks = CONVERTER_INSTANCES.map((base) =>
      requestInstanceConversion(base, ytUrl, "mp3")
    );

    // Race the tasks to grab the first successfully completed download URL
    const winner = await new Promise<string | null>((resolve) => {
      let settled = 0;
      const total = tasks.length;
      for (const t of tasks) {
        t.then((url) => {
          if (url) {
            resolve(url);
          } else {
            settled++;
            if (settled >= total) resolve(null);
          }
        }).catch(() => {
          settled++;
          if (settled >= total) resolve(null);
        });
      }
    });

    if (winner) {
      FULL_TRACK_CACHE.set(videoId, {
        url: winner,
        expires: Date.now() + CACHE_TTL_MS,
      });
      return winner;
    }

    return null;
  })();

  ACTIVE_CONVERSIONS.set(videoId, conversionPromise);
  try {
    const result = await conversionPromise;
    return result;
  } finally {
    ACTIVE_CONVERSIONS.delete(videoId);
  }
}

/**
 * Pre-warms the full track audio conversion in the background.
 */
export function prewarmFullTrackAudioUrl(videoId: string): void {
  if (!videoId || videoId.length < 5) return;
  const cached = FULL_TRACK_CACHE.get(videoId);
  if (cached && Date.now() < cached.expires) return;
  extractFullTrackAudioUrl(videoId).catch(() => {});
}

