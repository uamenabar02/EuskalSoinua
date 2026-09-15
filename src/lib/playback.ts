import "server-only";
import { resolveStream, resolveVideoIdForTrack, isStreamingConfigured } from "@/lib/sources/streaming";
import { enrichTrackPreview } from "@/lib/sources/online";
import { getTrack, setTrackExternalId } from "@/lib/queries";
import type { StreamResult } from "@/lib/types";

export interface PlaybackResolution {
  result: StreamResult;
  trackId: number;
  title: string;
  artist: string;
  videoId: string | null;
  resolvedViaSearch: boolean;
  previewUrl: string | null;
  previewUrlAlt: string | null;
}

/**
 * Full per-track playback resolution, shared by the stream proxy and the info
 * probe so they stay consistent and never double the proxy work (resolveStream
 * is memoized). Returns the provider so the UI can honestly indicate whether a
 * real live stream was obtained or a royalty-free fallback is playing.
 */
export async function resolveTrackForPlayback(trackId: number, mode?: "full" | "preview"): Promise<PlaybackResolution | null> {
  const track = await getTrack(trackId);
  if (!track) return null;

  let videoId = track.externalId;
  let previewUrl = track.previewUrl;
  let previewUrlAlt = track.previewUrlAlt;
  let resolvedViaSearch = false;

  // Enrich: if this track has no real preview yet, look it up online so the
  // ACTUAL song plays (instead of an unrelated royalty-free file).
  if (!previewUrl && !previewUrlAlt) {
    const enriched = await enrichTrackPreview({
      trackId: track.id,
      title: track.title,
      artist: track.artistName,
      isrc: track.isrc,
    }).catch(() => null);
    if (enriched) {
      previewUrl = enriched.previewUrl;
      previewUrlAlt = enriched.previewUrlAlt;
    }
  }

  // If we already have a direct preview URL and mode is NOT "full",
  // we DO NOT wait for slow external video searches. We can stream immediately!
  // If videoId is not yet present, resolve it in background so it doesn't block playback.
  if (!videoId && isStreamingConfigured()) {
    if (mode === "full") {
      // In full-track mode, we strictly need videoId; cap timeout to 2.5s so it never hangs
      const hitPromise = resolveVideoIdForTrack({
        artist: track.artistName,
        title: track.title,
        region: track.region,
      });
      const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 2500));
      const hit = await Promise.race([hitPromise, timeoutPromise]);
      if (hit?.videoId) {
        videoId = hit.videoId;
        resolvedViaSearch = true;
        setTrackExternalId(track.id, hit.videoId).catch(() => {});
      }
    } else {
      // In preview or default audio mode, resolve videoId asynchronously in background
      // without blocking the immediate start of the audio stream.
      resolveVideoIdForTrack({
        artist: track.artistName,
        title: track.title,
        region: track.region,
      })
        .then((hit) => {
          if (hit?.videoId) {
            setTrackExternalId(track.id, hit.videoId).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }

  // Force resolution depending on mode
  let finalVideoId = videoId;
  if (mode === "preview") {
    // If we want a preview and we actually have a preview URL, we bypass videoId (YouTube)
    // to guarantee we play the fast, ad-free, 30s preview first.
    // If we don't have a preview URL, we still allow videoId as a fallback.
    if (previewUrl || previewUrlAlt) {
      finalVideoId = null;
    }
  }

  const result = await resolveStream({
    videoId: finalVideoId,
    trackId: track.id,
    duration: track.duration,
    previewUrl,
    previewUrlAlt,
    mode,
  });
  return {
    result,
    trackId: track.id,
    title: track.title,
    artist: track.artistName,
    videoId: finalVideoId,
    resolvedViaSearch,
    previewUrl,
    previewUrlAlt,
  };
}
