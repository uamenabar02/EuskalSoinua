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

  // In full-track mode, if we already have videoId in DB, return IMMEDIATELY with 0ms latency!
  if (mode === "full" && videoId) {
    return {
      result: {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        contentType: "audio/mp4",
        duration: track.duration || 0,
        provider: "youtube",
        sponsorblockAvailable: true,
      },
      trackId: track.id,
      title: track.title,
      artist: track.artistName,
      videoId,
      resolvedViaSearch: false,
      previewUrl,
      previewUrlAlt,
    };
  }

  // If in preview mode and we already have a preview URL, return IMMEDIATELY with 0ms latency!
  if (mode === "preview" && (previewUrl || previewUrlAlt)) {
    const streamUrl = previewUrlAlt || previewUrl!;
    return {
      result: {
        url: streamUrl,
        contentType: previewUrlAlt ? "audio/mp4" : "audio/mpeg",
        duration: track.duration || 30,
        provider: "preview",
        sponsorblockAvailable: false,
      },
      trackId: track.id,
      title: track.title,
      artist: track.artistName,
      videoId: null,
      resolvedViaSearch: false,
      previewUrl,
      previewUrlAlt,
    };
  }

  // Enrich: if this track has no real preview yet and we are in preview mode, look it up online
  if (mode === "preview" && !previewUrl && !previewUrlAlt) {
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

  // If we need videoId for full mode and it's missing:
  if (!videoId && isStreamingConfigured()) {
    if (mode === "full") {
      // In full-track mode, search YouTube directly
      const hitPromise = resolveVideoIdForTrack({
        artist: track.artistName,
        title: track.title,
        region: track.region,
      });
      const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 3500));
      const hit = await Promise.race([hitPromise, timeoutPromise]);
      if (hit?.videoId) {
        videoId = hit.videoId;
        resolvedViaSearch = true;
        setTrackExternalId(track.id, hit.videoId).catch(() => {});
        return {
          result: {
            url: `https://www.youtube.com/watch?v=${videoId}`,
            contentType: "audio/mp4",
            duration: track.duration || 0,
            provider: "youtube",
            sponsorblockAvailable: true,
          },
          trackId: track.id,
          title: track.title,
          artist: track.artistName,
          videoId,
          resolvedViaSearch: true,
          previewUrl,
          previewUrlAlt,
        };
      }
    } else {
      // In preview or default audio mode, resolve videoId asynchronously in background
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
