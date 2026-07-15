import { NextResponse } from "next/server";
import { getLyrics } from "@/lib/lyrics";
import { getTrack } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackId = Number(searchParams.get("trackId"));
  if (trackId) {
    const track = await getTrack(trackId);
    if (track) {
      const lyrics = await getLyrics(track.title, track.artistName, track.duration);
      return NextResponse.json(lyrics);
    }
  }
  const track = searchParams.get("track") ?? "";
  const artist = searchParams.get("artist") ?? "";
  const duration = Number(searchParams.get("duration") ?? "0");
  const lyrics = await getLyrics(track, artist, duration);
  return NextResponse.json(lyrics);
}
