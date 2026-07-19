import { resolveTrackForPlayback } from "@/lib/playback";
import { resolveStream, clearStreamMemo } from "@/lib/sources/streaming";
import { clearTrackPreview } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  for (const url of candidates) {
    upstream = await tryFetch(url, upstreamHeaders);
    if (upstream) break;
  }

  // 2) all cached URLs failed (e.g. expired token) -> refresh with a fresh lookup
  if (!upstream && resolution.result.provider !== "demo") {
    clearStreamMemo(trackId);
    await clearTrackPreview(trackId).catch(() => {});
    const refreshed = await resolveTrackForPlayback(trackId);
    if (refreshed) {
      const freshCandidates = [refreshed.previewUrlAlt, refreshed.previewUrl].filter(
        (u): u is string => !!u,
      );
      for (const url of freshCandidates) {
        upstream = await tryFetch(url, upstreamHeaders);
        if (upstream) {
          provider = "preview";
          break;
        }
      }
    }
  }

  // 3) distinct royalty-free fallback (always works)
  if (!upstream) {
    const fb = await resolveStream({ videoId: null, trackId, duration: 0 });
    upstream = await tryFetch(fb.url, upstreamHeaders);
    provider = fb.provider;
  }

  if (!upstream || !upstream.body) {
    return new Response("upstream unavailable", { status: 502 });
  }

  const respHeaders = new Headers();
  respHeaders.set("content-type", resolution.result.contentType);
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
