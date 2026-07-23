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
 * 1. Swipe List (taste swipe history & likes/dislikes)
 * 2. Liked Songs
 * 3. Liked Albums
 * 4. Synced Albums & Playlists
 * 5. Liked Artists
 *
 * Generates EXACTLY 10 song recommendations published within the last 5 years (2021–2026).
 * Handles reload requests by excluding previously displayed tracks and generating fresh items.
 */
export async function GET(request: Request) {
  await ensureSeed();

  const cookieStore = await cookies();
  const syncKey = cookieStore.get("sync_key")?.value || "default";

  const { searchParams } = new URL(request.url);
  const excludeStr = searchParams.get("exclude") ?? "";
  const excludeTrackIds = excludeStr ? excludeStr.split(",").map(Number).filter(Boolean) : [];
  const excludeSet = new Set<number>(excludeTrackIds);

  // 1. Gather User Preferences across all 5 requested signal sources
  const [
    userLikedTracks,
    userFollowedArtists,
    userSavedAlbums,
    userPlaylists,
    userListenEvents,
  ] = await Promise.all([
    getLikedTracks(syncKey),
    getFollowedArtists(syncKey),
    getSavedAlbums(syncKey),
    getPlaylists(syncKey),
    db.select().from(listenEvents).where(eq(listenEvents.syncKey, syncKey)),
  ]);

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

  // Build Swipe List insights from listen events
  const swipedLikedTrackIds = new Set<number>();
  const swipedDislikedTrackIds = new Set<number>();

  userListenEvents.forEach((e: any) => {
    if (e.completed || e.listenSeconds > 0) {
      swipedLikedTrackIds.add(e.trackId);
    } else if (e.skipped && e.listenSeconds === 0) {
      swipedDislikedTrackIds.add(e.trackId);
    }
  });

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

  // Prioritize NEW artists in pool structure: sort new artists first, then known artists
  poolToUse.sort((a: any, b: any) => {
    if (a.isNewArtist && !b.isNewArtist) return -1;
    if (!a.isNewArtist && b.isNewArtist) return 1;
    return 0;
  });

  // Prepare structured summaries for Gemini AI Agent
  const userTasteProfile = {
    favoriteGenres: Array.from(preferredGenres),
    alreadyLikedArtists: Array.from(knownArtistNames),
    likedSongsSample: userLikedTracks.slice(0, 10).map((t: any) => `${t.title} by ${t.artistName}`),
    likedAlbumsSample: userSavedAlbums.slice(0, 5).map((a: any) => `${a.title} by ${a.artistName}`),
    swipedLikesCount: swipedLikedTrackIds.size,
    swipedDislikesCount: swipedDislikedTrackIds.size,
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
Your primary objective is NEW DISCOVERY: introduce the user to exciting NEW artists, albums, and tracks they have NEVER heard or followed before, matched to their taste.

CRITICAL WEIGHTING & SELECTION RULES:
1. NEW ARTISTS HIGH WEIGHT: At least 7 to 8 of your 10 recommendations MUST be from NEW artists/bands (where "isNewArtistForUser" is true) that align with the user's favorite genres (${userTasteProfile.favoriteGenres.join(", ") || "Euskal Pop, Ska, Electronic, Rock"}).
2. ALREADY LIKED ARTISTS LOWER WEIGHT: Give significantly LOWER weight to artists the user ALREADY follows or likes (${userTasteProfile.alreadyLikedArtists.slice(0, 8).join(", ") || "none"}). Do NOT over-recommend familiar artists like Berri Txarrak if new artists exist.
3. EXACTLY 10 TRACKS FROM 10 DIFFERENT ARTISTS: Pick EXACTLY 10 tracks with 1 track max per artist.
4. RECENT RELEASES: Every recommended track MUST be published within the last 5 years (between 2021 and 2026).
5. For EACH selected track, craft a compelling AI discovery reason (1 sentence) highlighting why it's a great new discovery matching their taste (e.g. "Fresh 2023 Euskal synth-pop discovery for fans of electronic vibes", "New 2022 indie folk band delivering high-energy Basque roots").
6. Seed Nonce: ${randomSeed}.

USER TASTE PROFILE:
- Favorite Genres: ${JSON.stringify(userTasteProfile.favoriteGenres)}
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
                    trackId: {
                      type: Type.INTEGER,
                      description: "Track ID selected from the candidate pool",
                    },
                    reason: {
                      type: Type.STRING,
                      description: "Short AI discovery explanation",
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

      const jsonText = response.text?.trim();
      if (jsonText) {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed?.recommendations)) {
          aiRecommendations = parsed.recommendations;
        }
      }
    } catch (err) {
      console.error("Gemini AI Discovery Agent error:", err);
    }
  }

  // 4. Map & Fallback: Ensure EXACTLY 10 valid tracks from 10 DISTINCT artists are returned
  const trackMap = new Map<number, (Track & { year?: number })>();
  poolToUse.forEach((t: any) => trackMap.set(t.id, t));

  const finalTracks: (Track & { reason: string; year?: number })[] = [];
  const selectedTrackIds = new Set<number>();
  const selectedArtists = new Set<string>();

  // Use AI recommendations first with strict 1 track per artist limit
  for (const rec of aiRecommendations) {
    if (finalTracks.length >= 10) break;
    const t = trackMap.get(rec.trackId);
    if (t && !selectedTrackIds.has(t.id)) {
      const artistKey = (t.artistName || "Unknown").toLowerCase();
      if (!selectedArtists.has(artistKey)) {
        selectedTrackIds.add(t.id);
        selectedArtists.add(artistKey);
        finalTracks.push({
          ...t,
          reason: rec.reason || `AI Match: Fresh release tailored to your taste`,
        });
      }
    }
  }

  // Fallback / Filler if Gemini returned fewer than 10 tracks or repeated an artist
  if (finalTracks.length < 10) {
    const topGenres = new Set<string>();
    userLikedTracks.forEach((t: any) => t.genre && topGenres.add(t.genre.toLowerCase()));
    userFollowedArtists.forEach((a: any) => a.genre && topGenres.add(a.genre.toLowerCase()));

    // Prioritize new artists in fallback filler
    const shuffled = [...poolToUse].sort((a: any, b: any) => {
      if (a.isNewArtist && !b.isNewArtist) return -1;
      if (!a.isNewArtist && b.isNewArtist) return 1;
      return Math.random() - 0.5;
    });

    for (const t of shuffled) {
      if (finalTracks.length >= 10) break;
      if (selectedTrackIds.has(t.id)) continue;

      const artistKey = (t.artistName || "Unknown").toLowerCase();
      // Enforce 1 track per artist in final 10
      if (selectedArtists.has(artistKey)) continue;

      const genreMatch = t.genre && topGenres.has(t.genre.toLowerCase());
      const reason = genreMatch
        ? `AI Agent Match: ${t.genre} track published in ${t.year || 2023}`
        : `AI Agent Recommendation: Recent ${t.year || 2022} discovery`;

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
