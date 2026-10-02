import { NextResponse } from "next/server";
import { buildRadio, buildArtistRadio, buildAlbumRadio } from "@/lib/sources/online";
import { createPlaylist, addTrackToPlaylist } from "@/lib/queries";
import { db } from "@/db";
import { tracks as tracksTable, artists as artistsTable, albums as albumsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * RADIO (Spotify-style)
 * ----------------------------------------------------------------------------
 * Builds a queue of tracks similar to the seed (Song, Artist, or Album),
 * enforcing that the seed author constitutes at most 50% of the total radio,
 * with the remaining 50%+ coming from related/similar artists and genres.
 * Persists as a browsable playlist in the user's library.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get("trackId") ? Number(searchParams.get("trackId")) : null;
  const artistId = searchParams.get("artistId") ? Number(searchParams.get("artistId")) : null;
  const artistNameParam = searchParams.get("artist") || null;
  const albumId = searchParams.get("albumId") ? Number(searchParams.get("albumId")) : null;

  let radioTracks: Track[] = [];
  let radioTitle = "Radio";
  let radioDesc = "A mix of similar tracks and related artists.";

  if (trackId) {
    // 1. Song Radio
    const [seedRow] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
    const seedTitle = seedRow?.title ?? "Song";
    radioTitle = `📻 Song Radio · ${seedTitle}`;
    radioDesc = `Generated from "${seedTitle}" by ${seedRow?.artistName ?? "artist"} — a mix of similar tracks and related artists.`;
    radioTracks = await buildRadio(trackId);
  } else if (artistId || artistNameParam) {
    // 2. Artist Radio
    let name = artistNameParam || "";
    if (artistId) {
      const [aRow] = await db.select().from(artistsTable).where(eq(artistsTable.id, artistId)).limit(1);
      if (aRow) name = aRow.name;
    }
    radioTitle = `📻 Artist Radio · ${name || "Artist"}`;
    radioDesc = `Featuring music by ${name || "Artist"} and similar artists.`;
    radioTracks = await buildArtistRadio(artistId || name);
  } else if (albumId) {
    // 3. Album Radio
    const [albRow] = await db.select().from(albumsTable).where(eq(albumsTable.id, albumId)).limit(1);
    const albTitle = albRow?.title ?? "Album";
    radioTitle = `📻 Album Radio · ${albTitle}`;
    radioDesc = `Inspired by "${albTitle}" by ${albRow?.artistName ?? "artist"} — similar sounds & related artists.`;
    radioTracks = await buildAlbumRadio(albumId);
  } else {
    return NextResponse.json({ error: "trackId, artistId, artist, or albumId required" }, { status: 400 });
  }

  if (radioTracks.length === 0) {
    return NextResponse.json({ error: "could not build radio" }, { status: 404 });
  }

  // Create a persistent playlist in library
  const playlist = await createPlaylist(
    radioTitle,
    radioDesc,
    "radio",
    syncKey,
  );

  // Add tracks to it
  for (const t of radioTracks) {
    await addTrackToPlaylist(playlist.id, t.id);
  }

  return NextResponse.json({
    playlistId: playlist.id,
    tracks: radioTracks,
    title: radioTitle,
  });
}
