import { NextResponse } from "next/server";
import { db } from "@/db";
import { playlists, playlistTracks, tracks as tracksTable, albums as albumsTable } from "@/db/schema";
import { eq, and, asc, ilike } from "drizzle-orm";
import { cookies } from "next/headers";
import { buildRadio, buildArtistRadio, buildAlbumRadio } from "@/lib/sources/online";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";
    const { id } = await params;
    const numId = Number(id);

    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
    }

    const [pl] = await db
      .select()
      .from(playlists)
      .where(and(eq(playlists.id, numId), eq(playlists.syncKey, syncKey)))
      .limit(1);

    if (!pl) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const title = pl.name || "";
    let newRadioTracks: Track[] = [];

    if (title.includes("Artist Radio ·")) {
      const artistName = title.split("Artist Radio ·")[1]?.trim();
      if (artistName) {
        newRadioTracks = await buildArtistRadio(artistName);
      }
    } else if (title.includes("Song Radio ·")) {
      const songTitle = title.split("Song Radio ·")[1]?.trim();
      if (songTitle) {
        const [tr] = await db
          .select()
          .from(tracksTable)
          .where(ilike(tracksTable.title, songTitle))
          .limit(1);
        if (tr) {
          newRadioTracks = await buildRadio(tr.id);
          if (newRadioTracks.length === 0 && tr.artistName) {
            newRadioTracks = await buildArtistRadio(tr.artistName);
          }
        } else {
          newRadioTracks = await buildArtistRadio(songTitle);
        }
      }
    } else if (title.includes("Album Radio ·")) {
      const albumTitle = title.split("Album Radio ·")[1]?.trim();
      if (albumTitle) {
        const [alb] = await db
          .select()
          .from(albumsTable)
          .where(ilike(albumsTable.title, albumTitle))
          .limit(1);
        if (alb) {
          newRadioTracks = await buildAlbumRadio(alb.id);
          if (newRadioTracks.length === 0 && alb.artistName) {
            newRadioTracks = await buildArtistRadio(alb.artistName);
          }
        } else {
          newRadioTracks = await buildArtistRadio(albumTitle);
        }
      }
    } else {
      // Playlist radio or generic: inspect existing tracks in this playlist
      const existing = await db
        .select()
        .from(playlistTracks)
        .innerJoin(tracksTable, eq(playlistTracks.trackId, tracksTable.id))
        .where(eq(playlistTracks.playlistId, numId))
        .limit(10);

      const artistPicks: string[] = [];
      for (const item of existing as any[]) {
        const aName = item.tracks?.artistName;
        if (typeof aName === "string" && aName.trim() && !artistPicks.includes(aName)) {
          artistPicks.push(aName);
        }
      }
      for (const aName of artistPicks.slice(0, 3)) {
        const partial = await buildArtistRadio(aName);
        for (const pt of partial) {
          if (!newRadioTracks.some((rt) => rt.id === pt.id)) {
            newRadioTracks.push(pt);
          }
          if (newRadioTracks.length >= 20) break;
        }
        if (newRadioTracks.length >= 20) break;
      }
    }

    // Safety fallback
    if (newRadioTracks.length === 0) {
      const fallbackRows = await db
        .select()
        .from(tracksTable)
        .limit(18);
      newRadioTracks = fallbackRows.sort(() => Math.random() - 0.5).map(mapTrack);
    }

    // Replace playlist tracks
    await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, numId));

    let pos = 0;
    for (const t of newRadioTracks) {
      if (t.id && t.id > 0) {
        await db.insert(playlistTracks).values({
          playlistId: numId,
          trackId: t.id,
          position: pos++,
        }).catch(() => {});
      }
    }

    await db
      .update(playlists)
      .set({ trackCount: pos })
      .where(eq(playlists.id, numId));

    return NextResponse.json({
      ok: true,
      playlist: {
        ...pl,
        trackCount: pos,
      },
      tracks: newRadioTracks,
    });
  } catch (err) {
    console.error("Error reloading radio playlist:", err);
    return NextResponse.json({ error: "Failed to reload radio" }, { status: 500 });
  }
}
