import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tracks, playlists, playlistTracks } from "@/db/schema";

export async function POST(req: NextRequest) {
  try {
    const { name, description = "Imported Playlist", tracksList } = await req.json();

    if (!name || !Array.isArray(tracksList) || tracksList.length === 0) {
      return NextResponse.json({ error: "Invalid playlist data" }, { status: 400 });
    }

    // Create playlist
    const [insertedPlaylist] = await db
      .insert(playlists)
      .values({
        name,
        description,
        syncKey: "default",
        createdAt: new Date(),
      })
      .returning();

    if (!insertedPlaylist) {
      return NextResponse.json({ error: "Failed to create playlist" }, { status: 500 });
    }

    // Match tracks or insert new tracks
    const allDbTracks = await db.select().from(tracks);
    const trackRowsToInsert = [];

    for (let idx = 0; idx < tracksList.length; idx++) {
      const item = tracksList[idx];
      const title = item.title || item.name || "Untitled";
      const artistName = item.artistName || item.artist || "Unknown Artist";

      // Match existing track by title + artist
      const existing = allDbTracks.find(
        (t: any) => t.title.toLowerCase() === title.toLowerCase() && t.artistName.toLowerCase() === artistName.toLowerCase()
      );

      let targetTrackId: number;

      if (existing) {
        targetTrackId = existing.id;
      } else {
        // Create new track entry
        const [newTrack] = await db
          .insert(tracks)
          .values({
            title,
            artistName,
            albumName: item.albumName || item.album || "Imported Album",
            previewUrl: item.previewUrl || null,
            externalId: item.externalId || null,
            source: item.source || "youtube",
            duration: item.duration || 180,
          })
          .returning();

        targetTrackId = newTrack.id;
        allDbTracks.push(newTrack);
      }

      trackRowsToInsert.push({
        playlistId: insertedPlaylist.id,
        trackId: targetTrackId,
        position: idx,
      });
    }

    if (trackRowsToInsert.length > 0) {
      await db.insert(playlistTracks).values(trackRowsToInsert);
    }

    return NextResponse.json({
      success: true,
      playlistId: insertedPlaylist.id,
      count: trackRowsToInsert.length,
    });
  } catch (err) {
    console.error("Import error:", err);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
