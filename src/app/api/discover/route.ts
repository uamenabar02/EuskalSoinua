import { NextResponse } from "next/server";
import { getRecommendations } from "@/lib/recommender";
import { ensureSeed } from "@/lib/seed";
import { db } from "@/db";
import { tracks } from "@/db/schema";
import { desc, sql } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * DISCOVER NEW SONGS
 * ----------------------------------------------------------------------------
 * Surfaces recently-catalogued / newer tracks that match the user's taste
 * profile. Combines the recommendation engine (genre/artist affinity) with a
 * strong recency bias — favouring tracks the user hasn't heard yet and that
 * are newer additions to the catalog.
 */
export async function GET() {
  await ensureSeed();

  // Get the user's affinity-weighted recommendations
  const recs = await getRecommendations({ limit: 50, basqueBooster: false });

  // Pull the newest tracks from the catalog (by createdAt, as a proxy for
  // "recently published / discovered")
  const newest = await db
    .select()
    .from(tracks)
    .orderBy(desc(tracks.createdAt))
    .limit(50);

  // Build a set of "recent" track ids (newest 40)
  const recentIds = new Set(newest.slice(0, 40).map((t: any) => t.id));

  // Score: recommendation score + recency boost for new tracks
  const scored = recs.map((r) => ({
    ...r,
    discoverScore: r.score + (recentIds.has(r.track.id) ? 30 : 0),
  }));

  // Also include genuinely new tracks that might not have high play counts
  const recTrackIds = new Set(recs.map((r) => r.track.id));
  const extraNew = newest
    .filter((t: any) => !recTrackIds.has(t.id))
    .slice(0, 10)
    .map((t: any) => ({
      track: mapTrack(t),
      artist: null,
      score: 50,
      reason: "New release",
      discoverScore: 80,
    }));

  const combined = [...scored, ...extraNew]
    .sort((a, b) => b.discoverScore - a.discoverScore)
    .slice(0, 24);

  return NextResponse.json({
    tracks: combined.map((c) => ({ ...c.track, reason: c.reason })),
  });
}
