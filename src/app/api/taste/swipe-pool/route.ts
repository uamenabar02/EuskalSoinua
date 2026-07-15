import { NextResponse } from "next/server";
import { db } from "@/db";
import { tracks, artists } from "@/db/schema";
import { eq } from "drizzle-orm";
import { mapTrack, mapArtist } from "@/lib/mappers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Pull a diverse pool of tracks from the catalog
    const rows = await db
      .select()
      .from(tracks)
      .leftJoin(artists, eq(tracks.artistId, artists.id))
      .limit(80);

    const pool = rows.map((r: any) => ({
      track: mapTrack(r.tracks),
      artist: r.artists ? mapArtist(r.artists) : null,
    }));

    // Shuffle the pool randomly so every load feels fresh
    const shuffled = pool.sort(() => Math.random() - 0.5);

    return NextResponse.json({ pool: shuffled });
  } catch (error) {
    console.error("Failed to fetch swipe pool:", error);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
