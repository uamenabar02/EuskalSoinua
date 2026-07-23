import { resolveTrackForPlayback } from "@/lib/playback";
import { resolveStream, clearStreamMemo, configuredInstances } from "@/lib/sources/streaming";
import { clearTrackPreview } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getProxyCandidates(originalUrl: string, invidiousInstances: string[]): string[] {
  try {
    const u = new URL(originalUrl);
    if (u.hostname.endsWith("googlevideo.com")) {
      const candidates: string[] = [];
      for (const instance of invidiousInstances) {
        try {
          const instUrl = new URL(instance);
          const copy = new URL(originalUrl);
          copy.protocol = instUrl.protocol;
          copy.host = instUrl.host;
          copy.searchParams.set("local", "true");
          candidates.push(copy.toString());
        } catch {}
      }
      return candidates;
    }
  } catch {}
  return [];
}

/**
 * Stream a resolved, ad-free, audio-only stream through our own origin.
 *
 * Resolution cascade (so playback NEVER dead-ends on an expired preview token):
 *   1. Try the resolved primary URL (prefers stable iTunes CDN), then the
 *      other preview URL, in reliability order — WITHOUT clearing anything.
 *   2. If all cached URLs fail, clear the stale cache, re-resolve with a FRESH
 *      online lookup, and retry.
 *   3. Final fallback: a distinct royalty-free track per catalog id.
 *
 * Range requests are forwarded so seeking still works.
 */
async function tryFetch(url: string, headers: Record<string, string>): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers });
    if (r.ok || r.status === 206) return r;
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackId = Number(searchParams.get("trackId"));
  const mode = searchParams.get("mode") as "full" | "preview" | null;
  if (!trackId) {
    return new Response(JSON.stringify({ error: "trackId required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const resolution = await resolveTrackForPlayback(trackId, mode || undefined);
  if (!resolution) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const jsonParam = searchParams.get("json");
  if (jsonParam === "1") {
    return new Response(JSON.stringify({
      trackId: resolution.trackId,
      title: resolution.title,
      artist: resolution.artist,
      videoId: resolution.videoId,
      previewUrl: resolution.previewUrl,
      previewUrlAlt: resolution.previewUrlAlt,
    }), {
      headers: { "content-type": "application/json" },
    });
  }

  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {};
  if (range) upstreamHeaders.range = range;

  // Build candidate list based on mode to prioritize correctly
  let candidates: string[] = [];
  if (mode === "preview") {
    candidates = [
      resolution.previewUrlAlt, // iTunes — stable CDN
      resolution.result.url,    // resolved stream URL
      resolution.previewUrl,    // Deezer — token
    ].filter((u): u is string => !!u);
  } else if (mode === "full") {
    // Try full stream URLs first
    if (resolution.result.provider === "piped" || resolution.result.provider === "invidious" || resolution.result.provider === "lbry") {
      const { invidious: invidiousInstances } = configuredInstances();
      const orig = resolution.result.originalUrl || resolution.result.url;
      const proxyCandidates = getProxyCandidates(orig, invidiousInstances);
      candidates = [
        resolution.result.url,
        ...proxyCandidates,
        orig,
      ].filter((u): u is string => !!u);
    } else {
      candidates = [];
    }
    // Fall back to actual track previews if full-track YouTube-extractors are rate-limited or offline
    candidates = [
      ...candidates,
      resolution.previewUrlAlt, // iTunes preview (M4A)
      resolution.previewUrl,    // Deezer preview (MP3)
    ].filter((u): u is string => !!u);
  } else {
    candidates = [
      resolution.result.url,    // full stream URL (e.g. YouTube/Piped)
      resolution.previewUrlAlt, // iTunes fallback
      resolution.previewUrl,    // Deezer fallback
    ].filter((u): u is string => !!u);
  }
  // Deduplicate candidates list
  candidates = candidates.filter((u, i, arr) => arr.indexOf(u) === i);

  // 1) try cached candidates
  let upstream: Response | null = null;
  let provider = resolution.result.provider;
  let finalUrl = "";
  for (const url of candidates) {
    upstream = await tryFetch(url, upstreamHeaders);
    if (upstream) {
      finalUrl = url;
      if (url === resolution.previewUrl || url === resolution.previewUrlAlt) {
        provider = "preview";
      }
      break;
    }
  }

  // 2) all cached URLs failed (e.g. expired token) -> refresh with a fresh lookup
  if (!upstream && resolution.result.provider !== "demo") {
    clearStreamMemo(trackId);
    await clearTrackPreview(trackId).catch(() => {});
    const refreshed = await resolveTrackForPlayback(trackId, mode || undefined);
    if (refreshed) {
      let freshCandidates: string[] = [];
      if (mode === "full") {
        if (refreshed.result.provider === "piped" || refreshed.result.provider === "invidious" || refreshed.result.provider === "lbry") {
          const { invidious: invidiousInstances } = configuredInstances();
          const orig = refreshed.result.originalUrl || refreshed.result.url;
          const proxyCandidates = getProxyCandidates(orig, invidiousInstances);
          freshCandidates = [
            refreshed.result.url,
            ...proxyCandidates,
            orig,
          ].filter((u): u is string => !!u);
        } else {
          freshCandidates = [];
        }
        // Fall back to actual track previews if full-track YouTube-extractors are rate-limited or offline
        freshCandidates = [
          ...freshCandidates,
          refreshed.previewUrlAlt, // iTunes preview (M4A)
          refreshed.previewUrl,    // Deezer preview (MP3)
        ].filter((u): u is string => !!u);
      } else {
        freshCandidates = [refreshed.previewUrlAlt, refreshed.previewUrl].filter((u): u is string => !!u);
      }

      for (const url of freshCandidates) {
        upstream = await tryFetch(url, upstreamHeaders);
        if (upstream) {
          finalUrl = url;
          provider = refreshed.result.provider;
          if (url === refreshed.previewUrl || url === refreshed.previewUrlAlt) {
            provider = "preview";
          }
          break;
        }
      }
    }
  }

  // 3) distinct royalty-free fallback (always works) - only if NOT full-track mode
  if (!upstream && mode !== "full") {
    const fb = await resolveStream({ videoId: null, trackId, duration: 0 });
    upstream = await tryFetch(fb.url, upstreamHeaders);
    provider = fb.provider;
    if (upstream) {
      finalUrl = fb.url;
    }
  }

  if (!upstream || !upstream.body) {
    return new Response("upstream unavailable", { status: 503 });
  }

  const respHeaders = new Headers();
  let contentType = resolution.result.contentType;
  if (finalUrl) {
    if (finalUrl.includes(".mp3") || finalUrl.includes("deezer")) {
      contentType = "audio/mpeg";
    } else if (finalUrl.includes(".m4a") || finalUrl.includes("apple") || finalUrl.includes("itunes")) {
      contentType = "audio/mp4";
    }
  }
  respHeaders.set("content-type", contentType);
  respHeaders.set("accept-ranges", "bytes");
  const cl = upstream.headers.get("content-length");
  if (cl) respHeaders.set("content-length", cl);
  const cr = upstream.headers.get("content-range");
  if (cr) respHeaders.set("content-range", cr);
  respHeaders.set("cache-control", "no-store");
  respHeaders.set("x-stream-provider", provider);
  respHeaders.set("x-stream-title", encodeURIComponent(resolution.title));

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}
