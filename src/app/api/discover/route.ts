import { NextResponse } from "next/server";
import { getRecommendations } from "@/lib/recommender";
import { ensureSeed } from "@/lib/seed";
import { db } from "@/db";
import { tracks, likedTracks, listenEvents } from "@/db/schema";
import { desc, sql, eq, and } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";
import { cookies } from "next/headers";

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
export async function GET(request: Request) {
  await ensureSeed();

  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { searchParams } = new URL(request.url);
  const excludeStr = searchParams.get("exclude") ?? "";
  const excludeTrackIds = excludeStr ? excludeStr.split(",").map(Number) : [];
  const excludeSet = new Set(excludeTrackIds);

  // Get the user's affinity-weighted recommendations in discover mode
  const recs = await getRecommendations({ limit: 50, basqueBooster: false, excludeTrackIds, discoverMode: true, syncKey });

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

  // Retrieve user's explicit likes and history to filter out already heard/liked songs
  const [likesRows, eventsRows] = await Promise.all([
    db.select().from(likedTracks).where(eq(likedTracks.syncKey, syncKey)),
    db.select().from(listenEvents).where(eq(listenEvents.syncKey, syncKey)),
  ]);

  const heardTrackIds = new Set<number>();
  likesRows.forEach((l: any) => heardTrackIds.add(l.trackId));
  eventsRows.forEach((e: any) => heardTrackIds.add(e.trackId));

  let combined = [...scored, ...extraNew]
    .filter((c) => !excludeSet.has(c.track.id) && !heardTrackIds.has(c.track.id))
    .sort((a, b) => b.discoverScore - a.discoverScore);

  // Fallback: If excluding tracks leaves us with fewer than 4 tracks, let's relax the heard/liked exclusion!
  if (combined.length < 4) {
    combined = [...scored, ...extraNew]
      .filter((c) => !excludeSet.has(c.track.id))
      .sort((a, b) => b.discoverScore - a.discoverScore);
  }

  // Fallback 2: If we still have fewer than 4 tracks, let's relax the custom exclusion as well!
  if (combined.length < 4) {
    combined = [...scored, ...extraNew]
      .sort((a, b) => b.discoverScore - a.discoverScore);
  }

  // Enforce strict artist diversity: maximum 1 track per artist (band)
  const finalFiltered: typeof combined = [];
  const artistCounts = new Map<number | string, number>();

  for (const c of combined) {
    const artistKey = c.track.artistId ?? c.track.artistName;
    const count = artistCounts.get(artistKey) ?? 0;
    if (count < 1) {
      finalFiltered.push(c);
      artistCounts.set(artistKey, count + 1);
    }
  }

  let combinedResult = finalFiltered;

  // If we have fewer than 12 tracks, fill up with unheard local tracks from different artists to guarantee strict diversity
  if (combinedResult.length < 12) {
    const allLocalTracks = await db
      .select()
      .from(tracks)
      .where(eq(tracks.source, "local"));

    // Shuffle for variety on reload
    const shuffledLocal = allLocalTracks.sort(() => Math.random() - 0.5);

    for (const t of shuffledLocal) {
      if (combinedResult.length >= 24) break;
      if (heardTrackIds.has(t.id) || excludeSet.has(t.id)) continue;

      const artistKey = t.artistId ?? t.artistName;
      if (!artistCounts.has(artistKey)) {
        combinedResult.push({
          track: mapTrack(t),
          artist: null,
          score: 40,
          reason: "Featured artist from your region",
          discoverScore: 60,
        });
        artistCounts.set(artistKey, 1);
      }
    }
  }

  // Absolute fallback: if we still have fewer than 4 tracks (highly unlikely), allow a second track per artist
  if (combinedResult.length < 4) {
    for (const c of combined) {
      if (combinedResult.length >= 24) break;
      const artistKey = c.track.artistId ?? c.track.artistName;
      const count = artistCounts.get(artistKey) ?? 0;
      if (count < 2) {
        // Only push if it's not already in combinedResult
        if (!combinedResult.some((r) => r.track.id === c.track.id)) {
          combinedResult.push(c);
          artistCounts.set(artistKey, count + 1);
        }
      }
    }
  }

  const finalTracks = combinedResult.slice(0, 24);

  return NextResponse.json({
    tracks: finalTracks.map((c) => ({ ...c.track, reason: c.reason })),
  });
}
