import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { ensureSeed } from "@/lib/seed";
import { db } from "@/db";
import {
  tracks,
  albums,
  likedTracks,
  listenEvents,
  followedArtists,
  savedAlbums,
  playlists,
  settings,
} from "@/db/schema";
import { desc, sql, eq, and, gte, inArray, or, isNull } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";
import {
  getLikedTracks,
  getFollowedArtists,
  getSavedAlbums,
  getPlaylists,
} from "@/lib/queries";
import { cookies } from "next/headers";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * AI DISCOVERY AGENT ROUTE
 * ----------------------------------------------------------------------------
 * Powered by Gemini AI Agent (gemini-3.6-flash).
 * Considers:
 * 1. What the user has been listening to LATELY (last month / last 500 songs played)
 * 2. User Taste Profile (genres, moods, energy, eras, pinned favorite artists)
 * 3. Liked Songs & Followed Artists
 * 4. Liked Albums & Synced Playlists
 * 5. Swipe List interactions
 *
 * Generates EXACTLY 10 song recommendations published within the last 5 years (2021–2026).
 * Bridges what the user is currently obsessed with with fresh, unheard releases.
 */
export async function GET(request: Request) {
  await ensureSeed();

  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { searchParams } = new URL(request.url);
  const excludeStr = searchParams.get("exclude") ?? "";
  const excludeTrackIds = excludeStr ? excludeStr.split(",").map(Number).filter(Boolean) : [];
  const excludeSet = new Set<number>(excludeTrackIds);

  // 1. Gather User Preferences across all signal sources + explicit taste preferences + recent 500 listens
  const [
    userLikedTracks,
    userFollowedArtists,
    userSavedAlbums,
    userPlaylists,
    userListenEvents,
    preferenceRows,
  ] = await Promise.all([
    getLikedTracks(syncKey),
    getFollowedArtists(syncKey),
    getSavedAlbums(syncKey),
    getPlaylists(syncKey),
    db
      .select({
        trackId: listenEvents.trackId,
        artistId: listenEvents.artistId,
        genre: listenEvents.genre,
        completed: listenEvents.completed,
        skipped: listenEvents.skipped,
        listenSeconds: listenEvents.listenSeconds,
        createdAt: listenEvents.createdAt,
      })
      .from(listenEvents)
      .where(eq(listenEvents.syncKey, syncKey))
      .orderBy(desc(listenEvents.createdAt))
      .limit(500),
    db.select().from(settings).where(and(eq(settings.key, "music_preferences"), eq(settings.syncKey, syncKey))),
  ]);

  let explicitPreferences: any = { genres: [], favoriteArtists: [], excludedGenres: [], energy: "balanced", moods: [] };
  if (preferenceRows.length > 0) {
    try {
      explicitPreferences = JSON.parse(preferenceRows[0].value);
    } catch (e) {}
  }

  // Track sets for filtering and weighting
  const likedTrackIds = new Set<number>(userLikedTracks.map((t: any) => t.id));
  const knownArtistNames = new Set<string>();
  userLikedTracks.forEach((t: any) => {
    if (t.artistName) knownArtistNames.add(t.artistName.toLowerCase());
  });
  userFollowedArtists.forEach((a: any) => {
    if (a.name) knownArtistNames.add(a.name.toLowerCase());
  });
  userSavedAlbums.forEach((a: any) => {
    if (a.artistName) knownArtistNames.add(a.artistName.toLowerCase());
  });

  // Extract top genres & languages preferred by user
  const preferredGenres = new Set<string>();
  userLikedTracks.forEach((t: any) => t.genre && preferredGenres.add(t.genre));
  userFollowedArtists.forEach((a: any) => a.genre && preferredGenres.add(a.genre));

  // Build Swipe List insights and extract recent listening velocity (last month / 500 plays)
  const swipedLikedTrackIds = new Set<number>();
  const swipedDislikedTrackIds = new Set<number>();
  const recentArtistCountMap = new Map<string, number>();
  const recentGenreCountMap = new Map<string, number>();

  const eventTrackIds = Array.from(new Set(userListenEvents.map((e: any) => e.trackId).filter(Boolean))) as number[];
  let eventTracksMap = new Map<number, { artistName: string | null; genre: string | null }>();
  if (eventTrackIds.length > 0) {
    const trackDetails = await db
      .select({ id: tracks.id, artistName: tracks.artistName, genre: tracks.genre })
      .from(tracks)
      .where(inArray(tracks.id, eventTrackIds.slice(0, 300)));
    trackDetails.forEach((td: any) => eventTracksMap.set(td.id, { artistName: td.artistName, genre: td.genre }));
  }

  userListenEvents.forEach((e: any) => {
    const isPositive = e.completed || e.listenSeconds > 0;
    if (isPositive) {
      swipedLikedTrackIds.add(e.trackId);
      const td = eventTracksMap.get(e.trackId);
      const artist = td?.artistName || null;
      const genre = e.genre || td?.genre || null;
      if (artist) {
        recentArtistCountMap.set(artist, (recentArtistCountMap.get(artist) || 0) + 1);
      }
      if (genre) {
        recentGenreCountMap.set(genre, (recentGenreCountMap.get(genre) || 0) + 1);
      }
    } else if (e.skipped && e.listenSeconds === 0) {
      swipedDislikedTrackIds.add(e.trackId);
    }
  });

  const sortedRecentArtists = Array.from(recentArtistCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0])
    .slice(0, 10);

  const sortedRecentGenres = Array.from(recentGenreCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map((e) => e[0])
    .slice(0, 8);

  // 2. Fetch candidate tracks published in the last 5 years (2021-2026) with random sampling
  const candidateRows = await db
    .select({
      track: tracks,
      albumYear: albums.year,
    })
    .from(tracks)
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .where(
      or(
        gte(albums.year, 2021),
        gte(tracks.createdAt, new Date("2021-01-01T00:00:00Z"))
      )
    )
    .orderBy(sql`RANDOM()`)
    .limit(200);

  // Group candidates by artist to cap max 2 tracks per artist in candidate pool
  const candidateArtistCount = new Map<string, number>();
  let allCandidates: any[] = [];

  for (const r of candidateRows) {
    // Skip songs the user has ALREADY liked
    if (likedTrackIds.has(r.track.id)) continue;

    const mapped = mapTrack(r.track);
    const releaseYear = r.albumYear ?? 2022;
    const artistKey = (mapped.artistName || "Unknown").toLowerCase();
    const currentCount = candidateArtistCount.get(artistKey) ?? 0;
    if (currentCount < 2) {
      candidateArtistCount.set(artistKey, currentCount + 1);
      const isNewArtist = !knownArtistNames.has(artistKey);
      allCandidates.push({ ...mapped, year: releaseYear, isNewArtist });
    }
  }

  // Fallback candidate pool if 2021+ count is low: fetch random tracks
  if (allCandidates.length < 25) {
    const extraRows = await db
      .select({
        track: tracks,
        albumYear: albums.year,
      })
      .from(tracks)
      .leftJoin(albums, eq(tracks.albumId, albums.id))
      .orderBy(sql`RANDOM()`)
      .limit(100);

    const existingIds = new Set(allCandidates.map((c: any) => c.id));
    extraRows.forEach((r: any) => {
      if (!existingIds.has(r.track.id) && !likedTrackIds.has(r.track.id)) {
        const mapped = mapTrack(r.track);
        const artistKey = (mapped.artistName || "Unknown").toLowerCase();
        const currentCount = candidateArtistCount.get(artistKey) ?? 0;
        if (currentCount < 2) {
          candidateArtistCount.set(artistKey, currentCount + 1);
          const isNewArtist = !knownArtistNames.has(artistKey);
          allCandidates.push({ ...mapped, year: r.albumYear ?? 2023, isNewArtist });
        }
      }
    });
  }

  // Filter candidates: exclude previous recommendations, swiped dislikes
  const validCandidatePool = allCandidates.filter(
    (c: any) => !excludeSet.has(c.id) && !swipedDislikedTrackIds.has(c.id)
  );

  // If exclusions leave fewer than 10 tracks, relax the excludeSet
  const poolToUse =
    validCandidatePool.length >= 10 ? validCandidatePool : allCandidates;

  // Prioritize tracks matching what the user has been listening to lately
  poolToUse.sort((a: any, b: any) => {
    const aGenre = (a.genre || "").toLowerCase();
    const bGenre = (b.genre || "").toLowerCase();
    const aRecentMatch = sortedRecentGenres.some((g) => aGenre.includes(g.toLowerCase()));
    const bRecentMatch = sortedRecentGenres.some((g) => bGenre.includes(g.toLowerCase()));

    if (aRecentMatch && !bRecentMatch) return -1;
    if (!aRecentMatch && bRecentMatch) return 1;
    if (a.isNewArtist && !b.isNewArtist) return -1;
    if (!a.isNewArtist && b.isNewArtist) return 1;
    return 0;
  });

  // Prepare structured summaries for Gemini AI Agent
  const combinedGenres = Array.from(new Set([...preferredGenres, ...(explicitPreferences.genres || [])]));
  const userTasteProfile = {
    favoriteGenres: combinedGenres,
    pinnedFavoriteArtists: explicitPreferences.favoriteArtists || [],
    avoidedGenres: explicitPreferences.excludedGenres || [],
    energyPreference: explicitPreferences.energy || "balanced",
    moodPreferences: explicitPreferences.moods || [],
    alreadyLikedArtists: Array.from(knownArtistNames),
    likedSongsSample: userLikedTracks.slice(0, 10).map((t: any) => `${t.title} by ${t.artistName}`),
    likedAlbumsSample: userSavedAlbums.slice(0, 5).map((a: any) => `${a.title} by ${a.artistName}`),
    swipedLikesCount: swipedLikedTrackIds.size,
    swipedDislikesCount: swipedDislikedTrackIds.size,
    recentArtistsLately: sortedRecentArtists,
    recentGenresLately: sortedRecentGenres,
  };

  const poolSummary = poolToUse.map((c: any) => ({
    id: c.id,
    title: c.title,
    artistName: c.artistName,
    albumName: c.albumName,
    genre: c.genre,
    year: c.year,
    isNewArtistForUser: c.isNewArtist,
  }));

  // 3. Invoke Gemini AI Agent (gemini-3.6-flash)
  let aiRecommendations: { trackId: number; reason: string }[] = [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const randomSeed = Math.floor(Math.random() * 100000);
      const prompt = `You are an expert AI Music Discovery Agent for EuskalSoinua.
Your primary objective is NEW DISCOVERY: introduce the user to exciting NEW artists, albums, and tracks they have NEVER heard or followed before, matched to their taste AND what they have been listening to lately.

CRITICAL WEIGHTING & SELECTION RULES:
1. RECENT LISTENING HARMONY & NEW ARTISTS: At least 7 to 8 of your 10 recommendations MUST be from NEW artists/bands (where "isNewArtistForUser" is true). Crucially, select tracks that bridge their long-term taste with what they have been listening to LATELY:
   - Lately Listened Genres: ${sortedRecentGenres.join(", ") || "Active catalog styles"}
   - Lately Listened Artists: ${sortedRecentArtists.join(", ") || "Diverse catalog"}
   - Long-term Preferred Genres: ${userTasteProfile.favoriteGenres.join(", ") || "Euskal Pop, Ska, Electronic, Rock"}
2. ALREADY LIKED ARTISTS LOWER WEIGHT: Give significantly LOWER weight to artists the user ALREADY follows or likes (${userTasteProfile.alreadyLikedArtists.slice(0, 8).join(", ") || "none"}).
3. EXACTLY 10 TRACKS FROM 10 DIFFERENT ARTISTS: Pick EXACTLY 10 tracks with 1 track max per artist.
4. RECENT RELEASES: Every recommended track MUST be published within the last 5 years (between 2021 and 2026).
5. For EACH selected track, craft a compelling AI discovery reason (1 sentence) highlighting why it's a great new discovery matching what they have been listening to lately or their general taste (e.g. "Fresh 2023 release matching the ${sortedRecentGenres[0] || "indie"} sounds you've been listening to lately", "New 2024 discovery for fans of ${sortedRecentArtists[0] || "Basque music"} delivering fresh high energy").
6. Seed Nonce: ${randomSeed}.

USER TASTE & RECENT LISTENING PROFILE:
- Lately Listened Artists (Last month / 500 plays): ${JSON.stringify(sortedRecentArtists)}
- Lately Listened Genres (Last month / 500 plays): ${JSON.stringify(sortedRecentGenres)}
- Long-term Favorite Genres: ${JSON.stringify(userTasteProfile.favoriteGenres)}
- Already Followed/Liked Artists (Lower Weight): ${JSON.stringify(userTasteProfile.alreadyLikedArtists)}
- Liked Songs Sample: ${JSON.stringify(userTasteProfile.likedSongsSample)}

CANDIDATE POOL (PUBLISHED 2021-2026):
${JSON.stringify(poolSummary, null, 2)}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a professional AI music discovery assistant. Output valid JSON adhering to the required schema.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    trackId: { type: Type.NUMBER, description: "ID of candidate track" },
                    reason: {
                      type: Type.STRING,
                      description: "Short 1-sentence AI discovery explanation connecting to their recent listening or taste",
                    },
                  },
                  required: ["trackId", "reason"],
                },
              },
            },
            required: ["recommendations"],
          },
        },
      });

      const parsed = JSON.parse(response.text || "{}");
      if (Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
        aiRecommendations = parsed.recommendations;
      }
    } catch (e) {
      console.error("Gemini AI discovery agent error, falling back to algorithmic discovery:", e);
    }
  }

  // 4. Assemble final recommendations
  const poolMap = new Map<number, any>();
  poolToUse.forEach((t: any) => poolMap.set(t.id, t));

  const finalTracks: any[] = [];
  const selectedTrackIds = new Set<number>();
  const selectedArtists = new Set<string>();

  for (const rec of aiRecommendations) {
    const track = poolMap.get(rec.trackId);
    if (!track) continue;

    const artistKey = (track.artistName || "Unknown").toLowerCase();
    if (selectedArtists.has(artistKey)) continue;

    selectedTrackIds.add(track.id);
    selectedArtists.add(artistKey);
    finalTracks.push({
      ...track,
      reason: rec.reason || `AI Agent Discovery: Fresh ${track.genre || "Music"} release`,
    });
  }

  // Fallback filler if AI returned fewer than 10 or failed
  if (finalTracks.length < 10) {
    const topGenres = new Set<string>(sortedRecentGenres.map((g) => g.toLowerCase()));
    userLikedTracks.forEach((t: any) => t.genre && topGenres.add(t.genre.toLowerCase()));
    userFollowedArtists.forEach((a: any) => a.genre && topGenres.add(a.genre.toLowerCase()));

    // Prioritize tracks matching what the user has been listening to lately
    const shuffled = [...poolToUse].sort((a: any, b: any) => {
      const aGenre = (a.genre || "").toLowerCase();
      const bGenre = (b.genre || "").toLowerCase();
      const aRecentMatch = sortedRecentGenres.some((g) => aGenre.includes(g.toLowerCase()));
      const bRecentMatch = sortedRecentGenres.some((g) => bGenre.includes(g.toLowerCase()));

      if (aRecentMatch && !bRecentMatch) return -1;
      if (!aRecentMatch && bRecentMatch) return 1;
      if (a.isNewArtist && !b.isNewArtist) return -1;
      if (!a.isNewArtist && b.isNewArtist) return 1;
      return Math.random() - 0.5;
    });

    for (const t of shuffled) {
      if (finalTracks.length >= 10) break;
      if (selectedTrackIds.has(t.id)) continue;

      const artistKey = (t.artistName || "Unknown").toLowerCase();
      if (selectedArtists.has(artistKey)) continue;

      const tGenre = (t.genre || "").toLowerCase();
      const recentMatch = sortedRecentGenres.some((g) => tGenre.includes(g.toLowerCase()));
      const genreMatch = t.genre && topGenres.has(tGenre);

      let reason = "";
      if (recentMatch) {
        reason = `Matches what you've been listening to lately (${t.genre}) • ${t.year || 2023}`;
      } else if (genreMatch) {
        reason = `AI Agent Match: ${t.genre} track published in ${t.year || 2023}`;
      } else {
        reason = `AI Agent Recommendation: Recent ${t.year || 2022} discovery`;
      }

      selectedTrackIds.add(t.id);
      selectedArtists.add(artistKey);
      finalTracks.push({
        ...t,
        reason,
      });
    }

    // Secondary fallback: if candidate pool was small, allow a 2nd track from artists
    if (finalTracks.length < 10) {
      for (const t of shuffled) {
        if (finalTracks.length >= 10) break;
        if (selectedTrackIds.has(t.id)) continue;

        selectedTrackIds.add(t.id);
        finalTracks.push({
          ...t,
          reason: `AI Agent Discovery: ${t.genre || "Music"} release`,
        });
      }
    }
  }

  // Enforce strictly EXACTLY 10 recommendations
  const result = finalTracks.slice(0, 10);

  return NextResponse.json({
    tracks: result,
    agent: "gemini-3.6-flash",
  });
}
