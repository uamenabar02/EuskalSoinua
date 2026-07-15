import { NextResponse } from "next/server";
import { resolveTrackForPlayback } from "@/lib/playback";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Lightweight metadata probe (no audio body). Resolves + caches the YouTube
 * videoId and reports which audio provider won, so the UI can honestly show
 * whether a live ad-free stream or a royalty-free fallback is playing.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackId = Number(searchParams.get("trackId"));
  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }
  const resolution = await resolveTrackForPlayback(trackId);
  if (!resolution) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    trackId: resolution.trackId,
    provider: resolution.result.provider,
    sponsorblockAvailable: resolution.result.sponsorblockAvailable,
    videoId: resolution.videoId,
    resolvedViaSearch: resolution.resolvedViaSearch,
    title: resolution.title,
    artist: resolution.artist,
    isLive: resolution.result.provider !== "demo",
  });
}
