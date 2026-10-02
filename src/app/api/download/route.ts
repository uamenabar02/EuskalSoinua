import { NextRequest, NextResponse } from "next/server";
import { getTrack, setTrackExternalId } from "@/lib/queries";
import { resolveVideoIdForTrack, resolveStream, extractCoreTitle } from "@/lib/sources/streaming";
import { extractFullTrackAudioUrl, prewarmFullTrackAudioUrl } from "@/lib/sources/full-track-download";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow sufficient time for conversion and streaming

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trackId = Number(searchParams.get("trackId"));
  const allowPreview = searchParams.get("allowPreview") === "true";
  const isWarm = searchParams.get("warm") === "true";

  if (!trackId || isNaN(trackId)) {
    return NextResponse.json({ error: "Valid trackId required" }, { status: 400 });
  }

  const track = await getTrack(trackId);
  if (!track) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  let videoId = track.externalId;

  // 1. If videoId is not yet cached in DB, resolve it from YouTube
  if (!videoId) {
    try {
      const hit = await resolveVideoIdForTrack({
        artist: track.artistName,
        title: track.title,
        region: track.region,
      });
      if (hit?.videoId) {
        videoId = hit.videoId;
        setTrackExternalId(track.id, hit.videoId).catch(() => {});
      }
    } catch (e) {
      console.warn(`[DownloadAPI] Failed to resolve videoId for ${track.title}:`, e);
    }
  }

  // 1b. Fallback resolution with core title if initial resolution didn't find videoId
  if (!videoId) {
    const core = extractCoreTitle(track.title);
    if (core && core !== track.title.toLowerCase().trim()) {
      try {
        const hit = await resolveVideoIdForTrack({
          artist: track.artistName,
          title: core,
          region: track.region,
        });
        if (hit?.videoId) {
          videoId = hit.videoId;
          setTrackExternalId(track.id, hit.videoId).catch(() => {});
        }
      } catch {}
    }
  }

  // If warm mode was requested, trigger background pre-warm and return immediately
  if (isWarm) {
    if (videoId) {
      prewarmFullTrackAudioUrl(videoId);
    }
    return NextResponse.json({
      warmed: true,
      trackId: track.id,
      videoId: videoId || null,
    });
  }

  // 2. Try high-fidelity MP3 conversion first
  let fullAudioUrl: string | null = null;
  let fullContentType = "audio/mpeg";

  if (videoId) {
    try {
      fullAudioUrl = await extractFullTrackAudioUrl(videoId);
    } catch (e) {
      console.warn(`[DownloadAPI] Full track audio extraction error for ${videoId}:`, e);
    }
  }

  // 3. If MP3 converter was busy or timed out, try direct full-length audio stream from Piped/Invidious
  if (!fullAudioUrl && videoId) {
    try {
      const streamRes = await resolveStream({
        videoId,
        trackId: track.id,
        duration: track.duration,
        mode: "full",
      });
      if (
        streamRes?.url &&
        streamRes.provider !== "preview" &&
        streamRes.provider !== "demo"
      ) {
        fullAudioUrl = streamRes.url;
        if (streamRes.contentType) {
          fullContentType = streamRes.contentType;
        }
      }
    } catch (e) {
      console.warn(`[DownloadAPI] Direct stream resolution error for ${videoId}:`, e);
    }
  }

  // 4. If full track audio was resolved, stream the complete audio stream
  if (fullAudioUrl) {
    try {
      const upstream = await fetch(fullAudioUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });

      if (upstream.ok && upstream.body) {
        const respHeaders = new Headers();
        respHeaders.set("content-type", fullContentType);
        respHeaders.set("accept-ranges", "bytes");
        respHeaders.set("cache-control", "public, max-age=86400, immutable");
        respHeaders.set("x-is-full-track", "true");
        respHeaders.set("x-track-duration", String(track.duration || 0));
        respHeaders.set("x-track-title", encodeURIComponent(track.title));
        respHeaders.set("x-track-artist", encodeURIComponent(track.artistName));

        const cl = upstream.headers.get("content-length");
        if (cl) respHeaders.set("content-length", cl);

        return new Response(upstream.body, {
          status: 200,
          headers: respHeaders,
        });
      }
    } catch (e) {
      console.warn(`[DownloadAPI] Upstream fetch failed for ${fullAudioUrl}:`, e);
    }
  }

  // 5. CRITICAL: Never silently serve a 30-second preview as a successful full track download!
  // Only serve preview if client explicitly authorized allowPreview=true.
  if (allowPreview) {
    const fallbackUrl = track.previewUrlAlt || track.previewUrl;
    if (fallbackUrl) {
      try {
        const upstream = await fetch(fallbackUrl);
        if (upstream.ok && upstream.body) {
          const respHeaders = new Headers();
          respHeaders.set(
            "content-type",
            fallbackUrl.includes(".m4a") ? "audio/mp4" : "audio/mpeg",
          );
          respHeaders.set("accept-ranges", "bytes");
          respHeaders.set("x-is-full-track", "false");
          respHeaders.set("x-track-duration", String(track.duration || 30));

          const cl = upstream.headers.get("content-length");
          if (cl) respHeaders.set("content-length", cl);

          return new Response(upstream.body, {
            status: 200,
            headers: respHeaders,
          });
        }
      } catch {}
    }
  }

  // Return 503 so client knows full track is unavailable and does NOT silently save a 30s preview
  return NextResponse.json(
    {
      error: "Full track audio is currently unavailable for this song. Offline downloads require full audio tracks.",
      isFullTrack: false,
      trackId: track.id,
      title: track.title,
    },
    { status: 503 },
  );
}

