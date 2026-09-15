import { NextResponse } from "next/server";
import { resolveTrackForPlayback } from "@/lib/playback";
import { db } from "@/db";
import { tracks } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Lightweight metadata probe (no audio body). Resolves + caches the YouTube
 * videoId and reports which audio provider won, so the UI can honestly show
 * whether a live ad-free stream or a royalty-free fallback is playing.
 * Supports single trackId or batched trackIds (comma-separated).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackIdsParam = searchParams.get("trackIds");

  if (trackIdsParam) {
    const ids = trackIdsParam
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0)
      .slice(0, 50);

    if (ids.length === 0) {
      return NextResponse.json({ items: {} });
    }

    const rows = await db.select().from(tracks).where(inArray(tracks.id, ids));
    const items: Record<number, { provider: string; videoId: string | null }> = {};
    for (const r of rows) {
      if (r.externalId) {
        items[r.id] = { provider: "youtube", videoId: r.externalId };
      } else if (r.previewUrlAlt || r.previewUrl) {
        items[r.id] = { provider: "preview", videoId: null };
      } else {
        items[r.id] = { provider: "demo", videoId: null };
      }
    }
    return NextResponse.json({ items });
  }

  const trackId = Number(searchParams.get("trackId"));
  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }
  const modeParam = (searchParams.get("mode") as "full" | "preview" | null) || "full";
  const resolution = await resolveTrackForPlayback(trackId, modeParam);
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
