import { NextResponse } from "next/server";
import { buildRadio, buildArtistRadio, buildAlbumRadio } from "@/lib/sources/online";
import { createPlaylist, addTrackToPlaylist, getPlaylist } from "@/lib/queries";
import { db } from "@/db";
import { tracks as tracksTable, artists as artistsTable, albums as albumsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * RADIO (Spotify-style)
 * ----------------------------------------------------------------------------
 * Builds a queue of tracks similar to the seed (Song, Artist, Album, or Playlist),
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
  const playlistIdParam = searchParams.get("playlistId") || null;

  let radioTracks: Track[] = [];
  let radioTitle = "Radio";
  let radioDesc = "A mix of similar tracks and related artists.";

  if (playlistIdParam) {
    // 1. Playlist Radio
    const numId = Number(playlistIdParam);
    let seedTracks: Track[] = [];
    let pTitle = "Playlist";

    if (!isNaN(numId)) {
      const detail = await getPlaylist(numId, syncKey);
      if (detail) {
        pTitle = detail.playlist.name;
        seedTracks = detail.tracks;
      }
    }

    radioTitle = `📻 Playlist Radio · ${pTitle}`;
    radioDesc = `Radio mix inspired by "${pTitle}" with similar songs and related artists.`;

    if (seedTracks.length > 0) {
      // Pick up to 3 distinct artists from the playlist to seed related radio
      const artistPicks = Array.from(new Set(seedTracks.map((t) => t.artistName).filter(Boolean))).slice(0, 3);
      for (const aName of artistPicks) {
        const partial = await buildArtistRadio(aName);
        for (const pt of partial) {
          if (!radioTracks.some((rt) => rt.id === pt.id)) {
            radioTracks.push(pt);
          }
          if (radioTracks.length >= 18) break;
        }
        if (radioTracks.length >= 18) break;
      }
    }
  } else if (trackId) {
    // 2. Song Radio
    const [seedRow] = await db.select().from(tracksTable).where(eq(tracksTable.id, trackId)).limit(1);
    const seedTitle = seedRow?.title ?? "Song";
    const seedArtist = seedRow?.artistName ?? artistNameParam ?? "Artist";
    radioTitle = `📻 Song Radio · ${seedTitle}`;
    radioDesc = `Generated from "${seedTitle}" by ${seedArtist} — a mix of similar tracks and related artists.`;
    radioTracks = await buildRadio(trackId);
    if (radioTracks.length === 0 && seedArtist) {
      radioTracks = await buildArtistRadio(seedArtist);
    }
  } else if (artistId || artistNameParam) {
    // 3. Artist Radio
    let name = artistNameParam || "";
    if (artistId) {
      const [aRow] = await db.select().from(artistsTable).where(eq(artistsTable.id, artistId)).limit(1);
      if (aRow) name = aRow.name;
    }
    radioTitle = `📻 Artist Radio · ${name || "Artist"}`;
    radioDesc = `Featuring music by ${name || "Artist"} and similar artists.`;
    radioTracks = await buildArtistRadio(artistId || name);
  } else if (albumId) {
    // 4. Album Radio
    const [albRow] = await db.select().from(albumsTable).where(eq(albumsTable.id, albumId)).limit(1);
    const albTitle = albRow?.title ?? "Album";
    const albArtist = albRow?.artistName ?? artistNameParam ?? "Artist";
    radioTitle = `📻 Album Radio · ${albTitle}`;
    radioDesc = `Inspired by "${albTitle}" by ${albArtist} — similar sounds & related artists.`;
    radioTracks = await buildAlbumRadio(albumId);
    if (radioTracks.length === 0 && albArtist) {
      radioTracks = await buildArtistRadio(albArtist);
    }
  } else {
    return NextResponse.json({ error: "trackId, artistId, artist, albumId, or playlistId required" }, { status: 400 });
  }

  // Guaranteed fallback: if radioTracks is still empty, populate from catalog
  if (radioTracks.length === 0) {
    const catalogFallback = await db.select().from(tracksTable).limit(18);
    radioTracks = catalogFallback.map(mapTrack);
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
    if (t.id && t.id > 0) {
      await addTrackToPlaylist(playlist.id, t.id).catch(() => {});
    }
  }

  return NextResponse.json({
    playlistId: playlist.id,
    tracks: radioTracks,
    title: radioTitle,
  });
}
