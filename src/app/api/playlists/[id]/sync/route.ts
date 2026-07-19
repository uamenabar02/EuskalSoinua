import { NextResponse } from "next/server";
import { getPlaylist, addTrackToPlaylist } from "@/lib/queries";
import { ingestOnlineTracks } from "@/lib/sources/online";
import { db } from "@/db";
import { playlistTracks, playlists } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 45; // Ingesting tracks can take some seconds

async function fetchSpotifyPlaylistTracks(playlistId: string): Promise<{ name: string; tracks: string[] } | null> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return null;
    const data = JSON.parse(match[1]);
    const entity = data.props?.pageProps?.state?.data?.entity;
    if (!entity) return null;

    const name = entity.name || entity.title || "Spotify Playlist";
    const tracks: string[] = [];
    if (entity.trackList && Array.isArray(entity.trackList)) {
      entity.trackList.forEach((t: any) => {
        if (t.title && t.subtitle) {
          tracks.push(`${t.title} - ${t.subtitle}`);
        } else if (t.title) {
          tracks.push(t.title);
        }
      });
    }
    return { name, tracks };
  } catch (err) {
    console.error("Error fetching Spotify playlist tracks:", err);
    return null;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const playlistId = Number(id);
    if (isNaN(playlistId)) {
      return NextResponse.json({ error: "Invalid playlist ID" }, { status: 400 });
    }

    // 1. Get playlist details
    const playlistData = await getPlaylist(playlistId);
    if (!playlistData) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const playlist = playlistData.playlist;
    const desc = playlist.description || "";

    // 2. Parse Spotify URL or ID
    const spotifyRegex = /(?:spotify:playlist:|open\.spotify\.com\/playlist\/)([a-zA-Z0-9]+)/;
    const match = desc.match(spotifyRegex);

    if (!match || !match[1]) {
      return NextResponse.json(
        { error: "This playlist does not have a valid Spotify playlist URL or ID inside its description." },
        { status: 400 }
      );
    }

    const spotifyId = match[1];

    // 3. Fetch latest tracks from Spotify
    const scraped = await fetchSpotifyPlaylistTracks(spotifyId);
    if (!scraped || scraped.tracks.length === 0) {
      return NextResponse.json(
        { error: "Could not fetch tracks from the origin Spotify playlist." },
        { status: 500 }
      );
    }

    const latestTracks = scraped.tracks.slice(0, 100);

    // 4. Wipe old tracks from the playlist
    await db.delete(playlistTracks).where(eq(playlistTracks.playlistId, playlistId));

    // Reset playlist trackCount
    await db
      .update(playlists)
      .set({ trackCount: 0 })
      .where(eq(playlists.id, playlistId));

    // 5. Ingest and add new tracks
    const addedTracks: any[] = [];
    await Promise.all(
      latestTracks.map(async (query) => {
        try {
          const tracks = await ingestOnlineTracks(query);
          if (tracks && tracks.length > 0) {
            const targetTrack = tracks[0];
            await addTrackToPlaylist(playlistId, targetTrack.id);
            addedTracks.push(targetTrack);
          }
        } catch (err) {
          console.error(`Failed to ingest track query during sync: "${query}"`, err);
        }
      })
    );

    return NextResponse.json({
      success: true,
      addedCount: addedTracks.length,
      tracks: addedTracks,
    });
  } catch (error: any) {
    console.error("Sync playlist failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync playlist" },
      { status: 500 }
    );
  }
}
