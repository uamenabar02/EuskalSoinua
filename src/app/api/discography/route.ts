import { NextResponse } from "next/server";
import { ingestDiscography } from "@/lib/sources/online";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Fetch + ingest the COMPLETE catalog for an artist (iTunes lookup up to 200
 * songs + Deezer album tracks). Returns all tracks as catalog items.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist") ?? "";
  if (!artist.trim()) {
    return NextResponse.json({ error: "artist required" }, { status: 400 });
  }
  const tracks = await ingestDiscography(artist);
  return NextResponse.json({ artist, count: tracks.length, tracks });
}
