import "server-only";
import { db } from "@/db";
import {
  tracks,
  artists,
  albums,
  likedTracks,
  followedArtists,
  savedAlbums,
  playlistTracks,
  playlists,
  eqPresets,
} from "@/db/schema";
import {
  eq,
  desc,
  ilike,
  or,
  sql,
  asc,
  inArray,
  and,
} from "drizzle-orm";
import { mapTrack, mapArtist, mapAlbum } from "@/lib/mappers";
import type { Track, Artist, Album } from "@/lib/types";

export async function isLiked(trackId: number, syncKey: string = "default"): Promise<boolean> {
  const r = await db
    .select()
    .from(likedTracks)
    .where(and(eq(likedTracks.trackId, trackId), eq(likedTracks.syncKey, syncKey)))
    .limit(1);
  return r.length > 0;
}

export async function likedIds(syncKey: string = "default"): Promise<Set<number>> {
  const rows = await db.select().from(likedTracks).where(eq(likedTracks.syncKey, syncKey));
  return new Set(rows.map((r: any) => r.trackId));
}

export async function followedIds(syncKey: string = "default"): Promise<Set<number>> {
  const rows = await db.select().from(followedArtists).where(eq(followedArtists.syncKey, syncKey));
  return new Set(rows.map((r: any) => r.artistId));
}

export async function savedAlbumIds(syncKey: string = "default"): Promise<Set<number>> {
  const rows = await db.select().from(savedAlbums).where(eq(savedAlbums.syncKey, syncKey));
  return new Set(rows.map((r: any) => r.albumId));
}

export async function getTrack(id: number): Promise<Track | null> {
  const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  return row ? mapTrack(row) : null;
}

export async function getTrackWithLike(id: number, syncKey: string = "default"): Promise<(Track & { liked: boolean }) | null> {
  const t = await getTrack(id);
  if (!t) return null;
  return { ...t, liked: await isLiked(id, syncKey) };
}

/** Cache a resolved YouTube videoId onto a track so we never re-search it. */
export async function setTrackExternalId(trackId: number, externalId: string) {
  await db
    .update(tracks)
    .set({ externalId, source: "youtube" })
    .where(eq(tracks.id, trackId));
}

/** Clear a track's cached preview URLs (e.g. when a Deezer token expired). */
export async function clearTrackPreview(trackId: number) {
  await db
    .update(tracks)
    .set({ previewUrl: null, previewUrlAlt: null })
    .where(eq(tracks.id, trackId));
}

import { GoogleGenAI, Type } from "@google/genai";

async function curateWithGemini<T extends { id: number }>(
  items: T[],
  sectionName: string,
  userTaste: { genres: string[]; artists: string[]; likedCount: number },
  userInteractedSet: Set<number>,
  seed?: string
): Promise<T[]> {
  if (items.length <= 10) return items;

  const randomSeed = seed || `${Date.now()}_${Math.random()}`;
  // Shuffle full candidate list
  const shuffledCandidates = [...items].sort(() => Math.random() - 0.5);
  // Pick a fresh slice of 35 candidates for Gemini to curate
  const poolToUse = shuffledCandidates.slice(0, 35);

  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const poolSummary = poolToUse.map((item: any) => ({
        id: item.id,
        title: item.title || item.name || "Untitled",
        artist: item.artistName || item.name || "Unknown Artist",
        genre: item.genre || "Music",
        isLikedByUser: userInteractedSet.has(item.id),
      }));

      const prompt = `You are an AI Music Curation Agent for EuskalSoinua.
Your mission is to curate and select EXACTLY 10 items from the CANDIDATE POOL for the section "${sectionName}".

USER TASTE PROFILE:
- Preferred Genres: ${JSON.stringify(userTaste.genres)}
- Favorite Artists: ${JSON.stringify(userTaste.artists)}
- Total Liked Items: ${userTaste.likedCount}

CRITICAL VARIETY & DISCOVERY RULES:
1. FRESH VARIETY: You MUST choose a DIFFERENT set and ordering of 10 items every time (Seed Nonce: ${randomSeed}). Do NOT repeat the exact same top items as previous runs.
2. UNLIKED DISCOVERY REQUIREMENT: At least 5 to 7 of your 10 selected items MUST be items that the user HAS NOT explicitly liked/followed yet (where 'isLikedByUser' = false), but closely match their musical taste (matching preferred genres/styles/vibe).
3. ARTIST DIVERSITY: Choose MAX 1 item per artist/band.
4. Output EXACTLY 10 item IDs in order of recommendation.

CANDIDATE POOL:
${JSON.stringify(poolSummary, null, 2)}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          temperature: 1.0,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              selectedIds: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: "Array of exactly 10 selected candidate IDs in order of recommendation",
              },
            },
            required: ["selectedIds"],
          },
        },
      });

      const jsonText = response.text ?? "{}";
      const parsed = JSON.parse(jsonText);
      const selectedIds: number[] = parsed.selectedIds || [];

      const itemMap = new Map<number, T>();
      poolToUse.forEach((it) => itemMap.set(it.id, it));

      const curated: T[] = [];
      const usedIds = new Set<number>();

      for (const id of selectedIds) {
        const found = itemMap.get(id);
        if (found && !usedIds.has(id)) {
          usedIds.add(id);
          curated.push(found);
        }
      }

      if (curated.length >= 10) {
        return curated.slice(0, 10);
      }

      // Fill remaining from poolToUse if Gemini selected fewer than 10
      for (const it of poolToUse) {
        if (!usedIds.has(it.id)) {
          usedIds.add(it.id);
          curated.push(it);
          if (curated.length >= 10) break;
        }
      }
      return curated.slice(0, 10);
    } catch (e) {
      console.error(`Gemini curation error for section ${sectionName}:`, e);
    }
  }

  // Fallback: shuffle and return
  return poolToUse.slice(0, 10);
}

export async function getHomeSections(syncKey: string = "default", requestedSection?: string, seed?: string) {
  const [liked, followed, saved] = await Promise.all([
    likedIds(syncKey),
    followedIds(syncKey),
    savedAlbumIds(syncKey),
  ]);

  // Extract taste signals
  const [userLikedTracks, userFollowedArtists, userSavedAlbums] = await Promise.all([
    db
      .select({ genre: tracks.genre, artistName: tracks.artistName })
      .from(likedTracks)
      .innerJoin(tracks, eq(likedTracks.trackId, tracks.id))
      .where(eq(likedTracks.syncKey, syncKey)),
    db
      .select({ genre: artists.genre, name: artists.name })
      .from(followedArtists)
      .innerJoin(artists, eq(followedArtists.artistId, artists.id))
      .where(eq(followedArtists.syncKey, syncKey)),
    db
      .select({ genre: albums.genre, artistName: albums.artistName })
      .from(savedAlbums)
      .innerJoin(albums, eq(savedAlbums.albumId, albums.id))
      .where(eq(savedAlbums.syncKey, syncKey)),
  ]);

  const preferredGenres = new Set<string>();
  const preferredArtists = new Set<string>();

  userLikedTracks.forEach((t: any) => {
    if (t.genre) preferredGenres.add(t.genre.toLowerCase());
    if (t.artistName) preferredArtists.add(t.artistName.toLowerCase());
  });
  userFollowedArtists.forEach((a: any) => {
    if (a.genre) preferredGenres.add(a.genre.toLowerCase());
    if (a.name) preferredArtists.add(a.name.toLowerCase());
  });
  userSavedAlbums.forEach((alb: any) => {
    if (alb.genre) preferredGenres.add(alb.genre.toLowerCase());
    if (alb.artistName) preferredArtists.add(alb.artistName.toLowerCase());
  });

  const tasteProfile = {
    genres: Array.from(preferredGenres),
    artists: Array.from(preferredArtists),
    likedCount: userLikedTracks.length,
  };

  const getTrending = async () => {
    const rows = await db.select().from(tracks).orderBy(sql`RANDOM()`).limit(80);
    const mapped = rows.map(mapTrack);
    const curated = await curateWithGemini(mapped, "Trending now", tasteProfile, liked, seed);
    return curated.map((t: any) => ({ ...t, liked: liked.has(t.id) }));
  };

  const getBasqueHighlights = async () => {
    const rows = await db.select().from(tracks).where(eq(tracks.region, "eu")).orderBy(sql`RANDOM()`).limit(80);
    const mapped = rows.map(mapTrack);
    const curated = await curateWithGemini(mapped, "Basque highlights", tasteProfile, liked, seed);
    return curated.map((t: any) => ({ ...t, liked: liked.has(t.id) }));
  };

  const getTopArtists = async () => {
    const rows = await db.select().from(artists).orderBy(sql`RANDOM()`).limit(60);
    const mapped = rows.map(mapArtist);
    const curated = await curateWithGemini(mapped, "Top artists", tasteProfile, followed, seed);
    return curated.map((a: any) => ({ ...a, followed: followed.has(a.id) }));
  };

  const getBasqueArtists = async () => {
    const rows = await db.select().from(artists).where(eq(artists.region, "eu")).orderBy(sql`RANDOM()`).limit(60);
    const mapped = rows.map(mapArtist);
    const curated = await curateWithGemini(mapped, "Basque artists", tasteProfile, followed, seed);
    return curated.map((a: any) => ({ ...a, followed: followed.has(a.id) }));
  };

  const getNewReleases = async () => {
    const rows = await db.select().from(albums).orderBy(sql`RANDOM()`).limit(60);
    const mapped = rows.map(mapAlbum);
    const curated = await curateWithGemini(mapped, "New & notable albums", tasteProfile, saved, seed);
    return curated.map((a: any) => ({ ...a, saved: saved.has(a.id) }));
  };

  if (requestedSection === "trending") {
    return { section: "trending", items: await getTrending() };
  }
  if (requestedSection === "basqueHighlights") {
    return { section: "basqueHighlights", items: await getBasqueHighlights() };
  }
  if (requestedSection === "topArtists") {
    return { section: "topArtists", items: await getTopArtists() };
  }
  if (requestedSection === "basqueArtists") {
    return { section: "basqueArtists", items: await getBasqueArtists() };
  }
  if (requestedSection === "newReleases") {
    return { section: "newReleases", items: await getNewReleases() };
  }

  const [trending, basqueHighlights, topArtists, newReleases, basqueArtists] = await Promise.all([
    getTrending(),
    getBasqueHighlights(),
    getTopArtists(),
    getNewReleases(),
    getBasqueArtists(),
  ]);

  return {
    trending,
    basqueHighlights,
    topArtists,
    newReleases,
    basqueArtists,
  };
}

export async function searchCatalog(q: string) {
  const term = `%${q.trim()}%`;
  const [liked, followed, saved] = await Promise.all([
    likedIds(),
    followedIds(),
    savedAlbumIds(),
  ]);

  const trackRows = await db
    .select()
    .from(tracks)
    .where(
      or(ilike(tracks.title, term), ilike(tracks.artistName, term)),
    )
    .orderBy(desc(tracks.playCount))
    .limit(25);

  const artistRows = await db
    .select()
    .from(artists)
    .where(or(ilike(artists.name, term), ilike(artists.genre, term)))
    .orderBy(desc(artists.monthlyListeners))
    .limit(12);

  const albumRows = await db
    .select()
    .from(albums)
    .where(or(ilike(albums.title, term), ilike(albums.artistName, term)))
    .orderBy(desc(albums.year))
    .limit(12);

  return {
    tracks: trackRows.map((t: any) => ({ ...mapTrack(t), liked: liked.has(t.id) })),
    artists: artistRows.map((a: any) => ({ ...mapArtist(a), followed: followed.has(a.id) })),
    albums: albumRows.map((a: any) => ({ ...mapAlbum(a), saved: saved.has(a.id) })),
  };
}

export async function getArtist(id: number) {
  const [row] = await db.select().from(artists).where(eq(artists.id, id)).limit(1);
  if (!row) return null;
  const followedSet = await followedIds();
  const trackRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.artistId, id))
    .orderBy(desc(tracks.playCount));
  const likedSet = await likedIds();
  const albumRows = await db
    .select()
    .from(albums)
    .where(eq(albums.artistId, id))
    .orderBy(desc(albums.year));
  const savedSet = await savedAlbumIds();
  return {
    artist: { ...mapArtist(row), followed: followedSet.has(row.id) },
    tracks: trackRows.map((t: any) => ({ ...mapTrack(t), liked: likedSet.has(t.id) })),
    albums: albumRows.map((a: any) => ({ ...mapAlbum(a), saved: savedSet.has(a.id) })),
  };
}

export async function getAlbum(id: number) {
  const [row] = await db.select().from(albums).where(eq(albums.id, id)).limit(1);
  if (!row) return null;
  const savedSet = await savedAlbumIds();
  const likedSet = await likedIds();
  const trackRows = await db
    .select()
    .from(tracks)
    .where(eq(tracks.albumId, id))
    .orderBy(asc(tracks.id));
  return {
    album: { ...mapAlbum(row), saved: savedSet.has(row.id) },
    tracks: trackRows.map((t: any) => ({ ...mapTrack(t), liked: likedSet.has(t.id) })),
  };
}

export async function getLikedTracks(syncKey: string = "default") {
  const likedSet = await likedIds(syncKey);
  if (likedSet.size === 0) return [];
  const rows = await db
    .select()
    .from(tracks)
    .where(inArray(tracks.id, [...likedSet]))
    .orderBy(desc(tracks.playCount));
  return rows.map((t: any) => ({ ...mapTrack(t), liked: true }));
}

export async function getPlaylists(syncKey: string = "default") {
  return db
    .select()
    .from(playlists)
    .where(and(eq(playlists.type, "user"), eq(playlists.syncKey, syncKey)))
    .orderBy(desc(playlists.createdAt));
}

export async function getRadioPlaylists(syncKey: string = "default") {
  return db
    .select()
    .from(playlists)
    .where(and(eq(playlists.type, "radio"), eq(playlists.syncKey, syncKey)))
    .orderBy(desc(playlists.createdAt));
}

export async function getPlaylist(id: number, syncKey: string = "default") {
  const [pl] = await db.select().from(playlists).where(eq(playlists.id, id)).limit(1);
  if (!pl) return null;
  const likedSet = await likedIds(syncKey);
  const joins = await db
    .select()
    .from(playlistTracks)
    .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
    .where(eq(playlistTracks.playlistId, id))
    .orderBy(asc(playlistTracks.position));
  return {
    playlist: pl,
    tracks: joins.map((j: any) => ({ ...mapTrack(j.tracks), liked: likedSet.has(j.tracks.id) })),
  };
}

export async function getFollowedArtists(syncKey: string = "default") {
  const followedSet = await followedIds(syncKey);
  if (followedSet.size === 0) return [];
  const rows = await db
    .select()
    .from(artists)
    .where(inArray(artists.id, [...followedSet]))
    .orderBy(desc(artists.monthlyListeners));
  return rows.map((a: any) => ({ ...mapArtist(a), followed: true }));
}

export async function getSavedAlbums(syncKey: string = "default") {
  const savedSet = await savedAlbumIds(syncKey);
  if (savedSet.size === 0) return [];
  const rows = await db
    .select()
    .from(albums)
    .where(inArray(albums.id, [...savedSet]))
    .orderBy(desc(albums.year));
  return rows.map((a: any) => ({ ...mapAlbum(a), saved: true }));
}

// ---- mutations ----

export async function setLikeState(trackId: number, liked: boolean, syncKey: string = "default"): Promise<void> {
  if (liked) {
    const already = await isLiked(trackId, syncKey);
    if (!already) {
      await db.insert(likedTracks).values({ syncKey, trackId }).catch(() => {});
    }
  } else {
    await db.delete(likedTracks).where(and(eq(likedTracks.trackId, trackId), eq(likedTracks.syncKey, syncKey))).catch(() => {});
  }
}

export async function toggleLike(trackId: number, syncKey: string = "default"): Promise<boolean> {
  if (await isLiked(trackId, syncKey)) {
    await db.delete(likedTracks).where(and(eq(likedTracks.trackId, trackId), eq(likedTracks.syncKey, syncKey)));
    return false;
  }
  await db.insert(likedTracks).values({ syncKey, trackId });
  return true;
}

export async function toggleFollow(artistId: number, syncKey: string = "default"): Promise<boolean> {
  const existing = await db
    .select()
    .from(followedArtists)
    .where(and(eq(followedArtists.artistId, artistId), eq(followedArtists.syncKey, syncKey)))
    .limit(1);
  if (existing.length) {
    await db.delete(followedArtists).where(and(eq(followedArtists.artistId, artistId), eq(followedArtists.syncKey, syncKey)));
    return false;
  }
  await db.insert(followedArtists).values({ syncKey, artistId });
  return true;
}

export async function toggleSaveAlbum(albumId: number, syncKey: string = "default"): Promise<boolean> {
  const existing = await db
    .select()
    .from(savedAlbums)
    .where(and(eq(savedAlbums.albumId, albumId), eq(savedAlbums.syncKey, syncKey)))
    .limit(1);
  if (existing.length) {
    await db.delete(savedAlbums).where(and(eq(savedAlbums.albumId, albumId), eq(savedAlbums.syncKey, syncKey)));
    return false;
  }
  await db.insert(savedAlbums).values({ syncKey, albumId });
  return true;
}

export async function createPlaylist(name: string, description?: string, type: string = "user", syncKey: string = "default") {
  const [row] = await db
    .insert(playlists)
    .values({
      syncKey,
      name,
      description,
      type,
      coverSeed: `${name}-${Date.now()}`,
    })
    .returning();
  await db
    .update(playlists)
    .set({ coverSeed: `${name}-${row.id}` })
    .where(eq(playlists.id, row.id));
  return row;
}

export async function addTrackToPlaylist(playlistId: number, trackId: number) {
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId));
  const position = rows[0]?.c ?? 0;
  await db.insert(playlistTracks).values({ playlistId, trackId, position });
  await db
    .update(playlists)
    .set({ trackCount: sql`${playlists.trackCount} + 1` })
    .where(eq(playlists.id, playlistId));
  return { position };
}

export async function removeTrackFromPlaylist(playlistId: number, trackId: number) {
  await db
    .delete(playlistTracks)
    .where(
      and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.trackId, trackId)),
    );
  await db
    .update(playlists)
    .set({ trackCount: sql`greatest(${playlists.trackCount} - 1, 0)` })
    .where(eq(playlists.id, playlistId));
}

export async function getEqPresets() {
  return db.select().from(eqPresets).orderBy(asc(eqPresets.id));
}
