import { NextResponse } from "next/server";
import { db } from "@/db";
import { tracks, artists, listenEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mapTrack, mapArtist } from "@/lib/mappers";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";

    // 1. Pull already swiped track ids
    const swipedRows = await db
      .select({ trackId: listenEvents.trackId })
      .from(listenEvents)
      .where(eq(listenEvents.syncKey, syncKey));
    const swipedIds = new Set<number>(swipedRows.map((r: any) => r.trackId));

    // 2. Pull tracks from the catalog for full variety
    const rows = await db
      .select()
      .from(tracks)
      .leftJoin(artists, eq(tracks.artistId, artists.id))
      .limit(600);

    // 3. Filter out swiped tracks
    let poolCandidates = rows.filter((r: any) => !swipedIds.has(r.tracks.id));

    // Fallback: if they swiped almost all tracks, keep some swiped ones so the swiper is not empty
    if (poolCandidates.length < 15) {
      poolCandidates = rows;
    }

    const pool = poolCandidates.map((r: any) => ({
      track: mapTrack(r.tracks),
      artist: r.artists ? mapArtist(r.artists) : null,
    }));

    // 4. Enforce extreme artist diversity: limit to at most 2 tracks per artist in the swipe pool
    const artistCounts = new Map<number | string, number>();
    const diversePool: typeof pool = [];
    for (const item of pool) {
      const artistKey = item.track.artistId ?? item.track.artistName;
      const count = artistCounts.get(artistKey) ?? 0;
      if (count < 2) {
        diversePool.push(item);
        artistCounts.set(artistKey, count + 1);
      }
    }

    // 5. Perform a proper, unbiased Fisher-Yates (Knuth) shuffle on the diverse pool
    const shuffled = [...diversePool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    return NextResponse.json({ pool: shuffled });
  } catch (error) {
    console.error("Failed to fetch swipe pool:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
