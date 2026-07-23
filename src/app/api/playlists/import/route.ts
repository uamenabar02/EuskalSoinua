import { NextResponse } from "next/server";
import { createPlaylist, addTrackToPlaylist } from "@/lib/queries";
import { ingestOnlineTracks } from "@/lib/sources/online";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 45; // Ingesting tracks can take some seconds

const DEFAULT_TRACKS_BY_PLATFORM: Record<string, string[]> = {
  spotify: [
    "ZETAK - Zeinen Ederra Izango Den",
    "Bulego - Kantu Bat",
    "Gatibu - Euritan Dantzan",
    "Huntza - Aldapan Gora",
    "ETS - Aukera Berriak"
  ],
  youtube: [
    "Nøgen - Alene",
    "Esne Beltza - Sueños de Color",
    "Berri Txarrak - Katedral Bat",
    "Olatz Salvador - Lokura",
    "Izaro - Erre"
  ],
  deezer: [
    "Skakeitan - Ez Hortzak Erakutsi",
    "Zea Mays - Negua Joan da Ta",
    "Ken Zazpi - Ilargia",
    "Gozategi - Nirekin"
  ],
  default: [
    "Dupla - Hamaika",
    "Sua - Ordu Orbanak",
    "Vulk - Lanbide",
    "Merina Gris - Alisios"
  ]
};

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

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const syncKey = cookieStore.get("sync_key")?.value || "default";

    const body = await request.json().catch(() => ({}));
    const { playlistName, platform, playlistUrl, customTracks } = body as {
      playlistName?: string;
      platform?: string;
      playlistUrl?: string;
      customTracks?: string; // newline or comma-separated list of track titles/artists
    };

    let trackQueries: string[] = [];
    let resolvedPlaylistName = playlistName?.trim();

    // 1. Try to scrape the playlist from Spotify if URL is provided
    if (playlistUrl && playlistUrl.trim()) {
      const spotifyRegex = /(?:spotify:playlist:|open\.spotify\.com\/playlist\/)([a-zA-Z0-9]+)/;
      const spotifyMatch = playlistUrl.match(spotifyRegex);
      
      if (spotifyMatch && spotifyMatch[1]) {
        const spotifyId = spotifyMatch[1];
        const scraped = await fetchSpotifyPlaylistTracks(spotifyId);
        if (scraped && scraped.tracks.length > 0) {
          trackQueries = scraped.tracks;
          if (!resolvedPlaylistName) {
            resolvedPlaylistName = scraped.name;
          }
        }
      }
    }

    // 2. If no tracks found from URL yet, but customTracks are provided
    if (trackQueries.length === 0 && customTracks && customTracks.trim()) {
      trackQueries = customTracks
        .split(/[\n,;]+/)
        .map(t => t.trim())
        .filter(t => t.length > 2);
    }

    // 3. Fallback to default lists if absolutely no tracks were resolved
    if (trackQueries.length === 0) {
      const platKey = (platform || "").toLowerCase();
      trackQueries = DEFAULT_TRACKS_BY_PLATFORM[platKey] || DEFAULT_TRACKS_BY_PLATFORM.default;
    }

    const name = (resolvedPlaylistName || `My ${platform || "External"} Playlist`).trim();
    
    // Create the playlist in our database
    const playlist = await createPlaylist(
      name,
      `Synced from ${platform || "external source"} (${playlistUrl || "direct import"})`,
      "user",
      syncKey
    );
    
    // Limit to max 100 tracks to support full Top 50 and larger custom playlists
    const finalQueries = trackQueries.slice(0, 100);
    const addedTracks: any[] = [];

    // Ingest tracks in parallel
    await Promise.all(
      finalQueries.map(async (query) => {
        try {
          // Search and ingest the track
          const tracks = await ingestOnlineTracks(query);
          if (tracks && tracks.length > 0) {
            // Add the first matching track to our playlist
            const targetTrack = tracks[0];
            await addTrackToPlaylist(playlist.id, targetTrack.id);
            addedTracks.push(targetTrack);
          }
        } catch (err) {
          console.error(`Failed to ingest track query: "${query}"`, err);
        }
      })
    );

    return NextResponse.json({
      success: true,
      playlist: {
        ...playlist,
        trackCount: addedTracks.length
      },
      addedCount: addedTracks.length,
      tracks: addedTracks
    });
  } catch (error: any) {
    console.error("Import playlist API failed:", error);
    return NextResponse.json(
      { error: error.message || "Failed to import playlist" },
      { status: 500 }
    );
  }
}
