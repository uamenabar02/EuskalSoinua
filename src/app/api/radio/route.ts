import { NextResponse } from "next/server";
import { buildRadio } from "@/lib/sources/online";
import { createPlaylist, addTrackToPlaylist } from "@/lib/queries";
import { db } from "@/db";
import { tracks as tracksTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * SONG RADIO (Spotify-style)
 * ----------------------------------------------------------------------------
 * Builds a queue of tracks similar to the seed (artist catalog + related
 * artists + genre matches), then PERSISTS it as a real, browsable playlist —
 * just like Spotify's "Go to song radio". The user is navigated to that
 * playlist page and playback starts automatically.
 *
 * NOTE: This is distinct from LIVE RADIO stations (/api/radio-stations).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const trackId = Number(searchParams.get("trackId"));
  if (!trackId) {
    return NextResponse.json({ error: "trackId required" }, { status: 400 });
  }

  // Resolve the seed song title for the playlist name
  const [seedRow] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
  const seedTitle = seedRow?.title ?? "Song";

  // Build the radio track list
  const radioTracks = await buildRadio(trackId);
  if (radioTracks.length === 0) {
    return NextResponse.json({ error: "could not build radio" }, { status: 404 });
  }

  // Create a persistent playlist
  const playlist = await createPlaylist(
    `📻 Song Radio · ${seedTitle}`,
    `Generated from "${seedTitle}" — a mix of similar tracks and related artists.`,
    "radio",
  );

  // Add every track to it
  for (const t of radioTracks) {
    await addTrackToPlaylist(playlist.id, t.id);
  }

  return NextResponse.json({ playlistId: playlist.id, tracks: radioTracks, seedTitle });
}
