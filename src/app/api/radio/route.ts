import { NextResponse } from "next/server";
import {
  buildRadio,
  buildArtistRadio,
  buildAlbumRadio,
  buildRadioRefill,
  getRadioMeta,
} from "@/lib/sources/online";
import { createPlaylist, addTrackToPlaylist, getPlaylist } from "@/lib/queries";
import { db } from "@/db";
import { tracks as tracksTable, artists as artistsTable, albums as albumsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * RADIO (Spotify-style)
 * ----------------------------------------------------------------------------
 * Builds a queue of tracks similar to the seed (Song, Artist, Album, or
 * Playlist), enforcing that the seed author is at most 50% of the total radio,
 * with the remaining 50%+ coming from the behavioural similarity graph.
 *
 * `?refill=1` returns a fresh batch for an existing station (dynamic refill),
 * excluding everything already played.
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
  const excludeTrackIds = (searchParams.get("exclude") || "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  // 0. Dynamic refill for an existing station: never creates a new playlist.
  if (searchParams.get("refill") === "1") {
    const seedArtist = artistNameParam || "Artist";
    const tracks = await buildRadioRefill({
      seedArtist,
      genre: searchParams.get("genre"),
      excludeTrackIds,
      count: Number(searchParams.get("count")) || 15,
      syncKey,
    });
    return NextResponse.json(
      { tracks, format: "inspiredby-mix", title: `Radio ${seedArtist}` },
      { headers: NO_STORE_HEADERS },
    );
  }

  let radioTracks: Track[] = [];
  let seedLabel = "Radio";
  let kind: "track" | "artist" | "album" | "playlist" = "artist";
  let primaryArtist = artistNameParam || "";

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

    seedLabel = pTitle;
    kind = "playlist";

    if (seedTracks.length > 0) {
      primaryArtist = seedTracks[0].artistName;
      // Pick up to 3 distinct artists from the playlist to seed related radio
      const artistPicks = Array.from(new Set(seedTracks.map((t) => t.artistName).filter(Boolean))).slice(0, 3);
      for (const aName of artistPicks) {
        const partial = await buildArtistRadio(aName, syncKey);
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
    primaryArtist = seedRow?.artistName ?? artistNameParam ?? "Artist";
    seedLabel = seedTitle;
    kind = "track";
    radioTracks = await buildRadio(trackId, syncKey);
    if (radioTracks.length === 0 && primaryArtist) {
      radioTracks = await buildArtistRadio(primaryArtist, syncKey);
    }
  } else if (artistId || artistNameParam) {
    // 3. Artist Radio
    let name = artistNameParam || "";
    if (artistId) {
      const [aRow] = await db.select().from(artistsTable).where(eq(artistsTable.id, artistId)).limit(1);
      if (aRow) name = aRow.name;
    }
    primaryArtist = name || "Artist";
    seedLabel = primaryArtist;
    kind = "artist";
    radioTracks = await buildArtistRadio(artistId || name, syncKey);
  } else if (albumId) {
    // 4. Album Radio
    const [albRow] = await db.select().from(albumsTable).where(eq(albumsTable.id, albumId)).limit(1);
    const albTitle = albRow?.title ?? "Album";
    primaryArtist = albRow?.artistName ?? artistNameParam ?? "Artist";
    seedLabel = albTitle;
    kind = "album";
    radioTracks = await buildAlbumRadio(albumId, syncKey);
    if (radioTracks.length === 0 && primaryArtist) {
      radioTracks = await buildArtistRadio(primaryArtist, syncKey);
    }
  } else {
    return NextResponse.json({ error: "trackId, artistId, artist, albumId, or playlistId required" }, { status: 400 });
  }

  // Guaranteed fallback: if radioTracks is still empty, populate from catalog
  if (radioTracks.length === 0) {
    const catalogFallback = await db.select().from(tracksTable).limit(18);
    radioTracks = catalogFallback.map(mapTrack);
  }

  const meta = await getRadioMeta({ seed: seedLabel, kind, primaryArtist, syncKey });
  const radioTitle = meta.title;
  const radioDesc = meta.description;

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

  return NextResponse.json(
    {
      playlistId: playlist.id,
      tracks: radioTracks,
      title: radioTitle,
      description: radioDesc,
      format: meta.format,
      mediaListConfig: meta.mediaListConfig,
      relatedArtists: meta.relatedArtists,
    },
    { headers: NO_STORE_HEADERS },
  );
}
