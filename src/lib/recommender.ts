import "server-only";
import { db } from "@/db";
import { tracks, artists, albums, listenEvents, settings, likedTracks, followedArtists, savedAlbums } from "@/db/schema";
import { desc, sql, eq, inArray, and } from "drizzle-orm";
import type { Recommendation, Track, Artist, UserTasteProfile } from "@/lib/types";
import { mapTrack, mapArtist } from "@/lib/mappers";

/**
 * ON-DEVICE RECOMMENDATION ENGINE
 * ----------------------------------------------------------------------------
 * Fully local & privacy-preserving: derives an affinity profile from the user's
 * listening signals (genres, artists, regions, skips, completions, repeats, and matcher swipes)
 * combined with their rich multi-attribute User Taste DNA (genres, energy, era, moods,
 * pinned artists, and regional affinity).
 */

const BASQUE_GENRES = ["euskal rock", "folk", "trikitia", "euskal pop", "punk", "euskal", "triki", "euskal folk"];

interface Affinity {
  genre: Record<string, number>;
  artist: Record<number, number>;
  artistName: Record<string, number>;
  region: Record<string, number>;
  totalEvents: number;
}

function buildAffinity(
  events: (typeof listenEvents.$inferSelect)[],
  likedTracksData: (typeof tracks.$inferSelect)[] = []
): Affinity {
  const a: Affinity = {
    genre: {},
    artist: {},
    artistName: {},
    region: {},
    totalEvents: events.length + likedTracksData.length,
  };
  
  // 1. Process explicit Liked Songs with balanced positive weights
  for (const t of likedTracksData) {
    const g = (t.genre ?? "unknown").toLowerCase();
    a.genre[g] = (a.genre[g] ?? 0) + 3.5;
    if (t.artistId) {
      a.artist[t.artistId] = Math.min((a.artist[t.artistId] ?? 0) + 3.5, 8.0);
    }
    if (t.artistName) {
      const an = t.artistName.toLowerCase();
      a.artistName[an] = (a.artistName[an] ?? 0) + 3.5;
    }
    const r = (t.region ?? "global").toLowerCase();
    a.region[r] = (a.region[r] ?? 0) + 2.0;
  }

  // 2. Process listen events
  for (const e of events) {
    const g = (e.genre ?? "unknown").toLowerCase();
    const weight = e.completed ? 2.5 : e.skipped ? -2.0 : 0.5;
    a.genre[g] = (a.genre[g] ?? 0) + weight;
    if (e.artistId) {
      a.artist[e.artistId] = (a.artist[e.artistId] ?? 0) + (e.completed ? 3.0 : e.skipped ? -2.0 : 0.5);
    }
    const r = (e.region ?? "global").toLowerCase();
    a.region[r] = (a.region[r] ?? 0) + (e.completed ? 1.2 : e.skipped ? -0.8 : 0.2);
  }
  return a;
}

function isBasqueGenre(genre: string | null): boolean {
  if (!genre) return false;
  const g = genre.toLowerCase();
  return BASQUE_GENRES.some((b) => g.includes(b));
}

interface Candidate {
  track: Track;
  artist: Artist | null;
  score: number;
  confidence: number;
  reason: string;
}

export async function getRecommendations(opts: {
  limit?: number;
  basqueBooster?: boolean;
  seedTrackId?: number | null;
  excludeTrackIds?: number[];
  discoverMode?: boolean;
  syncKey?: string;
}): Promise<Recommendation[]> {
  const limit = opts.limit ?? 24;
  const syncKey = opts.syncKey || "default";

  // 1. Load explicit user music preferences from settings
  const preferenceRows = await db
    .select()
    .from(settings)
    .where(and(eq(settings.key, "music_preferences"), eq(settings.syncKey, syncKey)));
  
  let userPrefs: UserTasteProfile = {
    genres: [],
    regions: ["eu", "global"],
    energy: "balanced",
    era: "all",
    moods: [],
    favoriteArtists: [],
    excludedGenres: [],
    basqueAffinity: 60,
  };
  
  if (preferenceRows.length > 0) {
    try {
      const parsed = JSON.parse(preferenceRows[0].value);
      userPrefs = { ...userPrefs, ...parsed };
    } catch (e) {
      console.error("Failed to parse music_preferences:", e);
    }
  }

  const preferredGenres = (userPrefs.genres || []).map((g) => g.toLowerCase());
  const preferredRegions = (userPrefs.regions || []).map((r) => r.toLowerCase());
  const favoriteArtists = (userPrefs.favoriteArtists || []).map((a) => a.toLowerCase().trim());
  const excludedGenres = (userPrefs.excludedGenres || []).map((g) => g.toLowerCase().trim());
  const basqueAffinity = typeof userPrefs.basqueAffinity === "number" ? userPrefs.basqueAffinity : 60;
  const booster = opts.basqueBooster || basqueAffinity > 70;

  // 2. Load explicit user library items: liked tracks, followed artists, saved albums
  const [likes, follows, saves] = await Promise.all([
    db.select().from(likedTracks).where(eq(likedTracks.syncKey, syncKey)),
    db.select().from(followedArtists).where(eq(followedArtists.syncKey, syncKey)),
    db.select().from(savedAlbums).where(eq(savedAlbums.syncKey, syncKey)),
  ]);

  const likedTrackIds = new Set<number>(likes.map((l: any) => l.trackId as number));
  const followedArtistIds = new Set<number>(follows.map((f: any) => f.artistId as number));
  const savedAlbumIds = new Set<number>(saves.map((s: any) => s.albumId as number));

  // Recent listening signal
  const events = await db
    .select()
    .from(listenEvents)
    .where(eq(listenEvents.syncKey, syncKey))
    .orderBy(desc(listenEvents.createdAt))
    .limit(400);

  let likedTracksDetails: (typeof tracks.$inferSelect)[] = [];
  if (likes.length > 0) {
    const likedIdsList = likes.map((l: any) => l.trackId as number).filter(Boolean);
    if (likedIdsList.length > 0) {
      likedTracksDetails = await db
        .select()
        .from(tracks)
        .where(inArray(tracks.id, likedIdsList));
    }
  }

  const affinity = buildAffinity(events, likedTracksDetails);

  // Build sets of known artists and heard tracks for personalization
  const knownArtistIds = new Set<number>();
  followedArtistIds.forEach((id) => {
    if (id) knownArtistIds.add(id);
  });
  events.forEach((e: any) => {
    if (e.artistId && e.completed) knownArtistIds.add(e.artistId);
  });

  const heardTrackIds = new Set<number>();
  likedTrackIds.forEach((id) => {
    if (id) heardTrackIds.add(id);
  });
  events.forEach((e: any) => {
    heardTrackIds.add(e.trackId);
  });

  const skippedTrackIds = new Set<number>();
  events.forEach((e: any) => {
    if (e.skipped) {
      skippedTrackIds.add(e.trackId);
    }
  });

  // Candidate pool
  const rows = await db
    .select()
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .orderBy(desc(tracks.playCount))
    .limit(400);

  const playedRecently = new Set(events.slice(0, 40).map((e: any) => e.trackId));

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const t = row.tracks;
    const ar = row.artists;
    const alb = row.albums;
    const track: Track = mapTrack(t);
    
    if (opts.seedTrackId && t.id === opts.seedTrackId) continue;
    if (opts.excludeTrackIds && opts.excludeTrackIds.includes(t.id)) continue;
    if (skippedTrackIds.has(t.id)) continue; // Disliked songs never recommended

    // Check user's excluded genres
    if (t.genre && excludedGenres.length > 0) {
      const gLower = t.genre.toLowerCase();
      if (excludedGenres.some((ex) => gLower.includes(ex) || ex.includes(gLower))) {
        continue; // Strictly filtered out based on user taste exclusion
      }
    }

    let score = 0;
    const reasons: string[] = [];

    const isHeard = heardTrackIds.has(t.id);
    const isArtistKnown = t.artistId ? knownArtistIds.has(t.artistId) : false;
    const albYear = alb?.year;
    const artistNameLower = (t.artistName || "").toLowerCase();

    // Boost pinned favorite artists
    if (favoriteArtists.length > 0 && favoriteArtists.some((fa) => artistNameLower.includes(fa) || fa.includes(artistNameLower))) {
      score += 12.0;
      reasons.unshift(`from your pinned favorite artists`);
    }

    if (opts.discoverMode) {
      // DISCOVER MODE: Focus strictly on fresh unheard music
      if (isHeard) continue;
      if (isArtistKnown) score -= 18.0;
      if (t.source !== "local" && (!albYear || albYear < 2015)) continue;

      if (t.genre) {
        const lowerGenre = t.genre.toLowerCase();
        if (affinity.genre[lowerGenre]) {
          score += affinity.genre[lowerGenre] * 1.5;
          reasons.push(`matches your genre affinity`);
        }
      }

      if (!isArtistKnown && t.genre) {
        const lowerGenre = t.genre.toLowerCase();
        const hasGenreAffinity = (affinity.genre[lowerGenre] && affinity.genre[lowerGenre] > 0) ||
                                 preferredGenres.some((g) => lowerGenre.includes(g));
        if (hasGenreAffinity) {
          score += 24.0;
          reasons.unshift(`fresh discovery in ${t.genre}`);
        }
      }

      if (t.genre) {
        const tgLower = t.genre.toLowerCase();
        const matchesGenre = preferredGenres.some(
          (g) => tgLower.includes(g) || g.includes(tgLower)
        );
        if (matchesGenre) {
          score += 14.0;
          reasons.unshift(`matches your selected genres`);
        }
      }
    } else {
      // FOR YOU: Blend top favorites with relevant unheard music
      if (affinity.genre[t.genre ?? "unknown"]) {
        score += affinity.genre[t.genre ?? "unknown"];
        reasons.push(`because you play ${t.genre ?? "this style"}`);
      }
      if (t.artistId && affinity.artist[t.artistId]) {
        score += affinity.artist[t.artistId];
        reasons.push("from an artist you listen to");
      }
      if (affinity.region[t.region ?? "global"]) {
        score += affinity.region[t.region ?? "global"];
      }

      if (likedTrackIds.has(t.id)) {
        score += 8.0;
        reasons.unshift("from your Liked Songs");
      }
      if (t.artistId && followedArtistIds.has(t.artistId)) {
        score += 6.0;
        reasons.unshift("from an artist you follow");
      }
      if (t.albumId && savedAlbumIds.has(t.albumId)) {
        score += 4.5;
        reasons.unshift("from your saved albums");
      }

      // Taste profile genre matching
      if (t.genre) {
        const tgLower = t.genre.toLowerCase();
        const matchesGenre = preferredGenres.some(
          (g) => tgLower.includes(g) || g.includes(tgLower)
        );
        if (matchesGenre) {
          score += 6.0;
          reasons.unshift(`matched with your taste genres`);
        }
      }

      // Taste profile region matching
      if (t.region) {
        const trLower = t.region.toLowerCase();
        const matchesRegion = preferredRegions.some((r) => r === trLower);
        if (matchesRegion) {
          score += 3.5;
          reasons.unshift(`matching your regional taste`);
        }
      }

      // Unheard music boost
      if (!isHeard && t.genre) {
        const lowerGenre = t.genre.toLowerCase();
        const hasGenreAffinity = (affinity.genre[lowerGenre] && affinity.genre[lowerGenre] > 0) ||
                                 preferredGenres.some((g) => lowerGenre.includes(g));
        if (hasGenreAffinity) {
          score += 7.0;
          reasons.unshift(`fresh track tailored to your taste`);
        }
      }
    }

    // Seed-track similarity boost
    if (opts.seedTrackId) {
      const seed = rows.find((r: any) => r.tracks.id === opts.seedTrackId);
      if (seed) {
        if (seed.tracks.genre && seed.tracks.genre === t.genre) {
          score += 2.0;
          reasons.push(`similar to what's playing`);
        }
        if (seed.tracks.artistId && seed.tracks.artistId === t.artistId) {
          score += 3.0;
        }
      }
    }

    // Basque Affinity Scaling
    if (basqueAffinity === 0) {
      // 0% Basque connection: prioritize international tracks
      if (t.region === "eu" || isBasqueGenre(t.genre)) {
        score *= 0.5;
      }
    } else if (basqueAffinity >= 75 || booster) {
      if (t.region === "eu") {
        score *= 2.5;
        reasons.unshift("Basque & Local pick");
      }
      if (isBasqueGenre(t.genre)) {
        score *= 1.6;
      }
    } else if (basqueAffinity >= 50) {
      if (t.region === "eu") {
        score *= 1.4;
      }
    }

    // Popularity prior
    score += Math.log10((t.playCount ?? 0) + 1) * (events.length === 0 ? 3 : 1.2);

    // Recency decay
    if (playedRecently.has(t.id)) score *= 0.15;

    // Small variety nonce
    score += Math.random() * 12.0;

    const confidence = Math.max(10, Math.min(99, Math.round(45 + score * 5)));

    candidates.push({
      track,
      artist: ar ? mapArtist(ar) : null,
      score,
      confidence,
      reason: reasons[0] ?? (opts.discoverMode ? "New discovery" : "Recommended for you"),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Enforce artist diversity
  const top: Candidate[] = [];
  const artistCounts = new Map<number | string, number>();
  const maxTracksPerArtist = opts.discoverMode ? 1 : 2;

  for (const c of candidates) {
    if (top.length >= limit) break;
    const artistKey = c.track.artistId ?? c.track.artistName;
    const count = artistCounts.get(artistKey) ?? 0;
    if (count < maxTracksPerArtist) {
      top.push(c);
      artistCounts.set(artistKey, count + 1);
    }
  }

  return top.map((c) => ({
    track: c.track,
    artist: c.artist,
    score: c.confidence,
    reason: c.reason,
  }));
}

/** Record a listen event (completed / skipped) for the recommender. */
export async function recordListenEvent(input: {
  trackId: number;
  artistId: number | null;
  genre: string | null;
  region: string | null;
  completed: boolean;
  skipped: boolean;
  listenSeconds: number;
  syncKey?: string;
}) {
  const syncKey = input.syncKey || "default";
  await db.insert(listenEvents).values({
    syncKey,
    trackId: input.trackId,
    artistId: input.artistId,
    genre: input.genre,
    region: input.region,
    completed: input.completed,
    skipped: input.skipped,
    listenSeconds: input.listenSeconds,
  });
  if (input.completed) {
    await db
      .update(tracks)
      .set({ playCount: sql`${tracks.playCount} + 1` })
      .where(eq(tracks.id, input.trackId));
  }
  return { ok: true };
}

/** Affinity profile summary for the "Taste DNA" & insights panel. */
export async function getTasteProfile(syncKey: string = "default") {
  const [events, likes, follows, preferenceRows] = await Promise.all([
    db
      .select()
      .from(listenEvents)
      .where(eq(listenEvents.syncKey, syncKey))
      .orderBy(desc(listenEvents.createdAt))
      .limit(400),
    db.select().from(likedTracks).where(eq(likedTracks.syncKey, syncKey)),
    db.select().from(followedArtists).where(eq(followedArtists.syncKey, syncKey)),
    db
      .select()
      .from(settings)
      .where(and(eq(settings.key, "music_preferences"), eq(settings.syncKey, syncKey))),
  ]);

  let userPrefs: UserTasteProfile = {
    genres: [],
    regions: ["eu", "global"],
    energy: "balanced",
    era: "all",
    moods: [],
    favoriteArtists: [],
    excludedGenres: [],
    basqueAffinity: 60,
  };

  if (preferenceRows.length > 0) {
    try {
      const parsed = JSON.parse(preferenceRows[0].value);
      userPrefs = { ...userPrefs, ...parsed };
    } catch (e) {
      console.error("Failed to parse music_preferences:", e);
    }
  }

  let likedTracksDetails: (typeof tracks.$inferSelect)[] = [];
  if (likes.length > 0) {
    const likedIds = likes.map((l: any) => l.trackId as number).filter(Boolean);
    if (likedIds.length > 0) {
      likedTracksDetails = await db.select().from(tracks).where(inArray(tracks.id, likedIds));
    }
  }

  const a = buildAffinity(events, likedTracksDetails);

  // Boost explicitly preferred genres
  for (const genre of userPrefs.genres || []) {
    const gLower = genre.toLowerCase();
    a.genre[gLower] = (a.genre[gLower] ?? 0) + 12;
  }

  const totalRawEvents = events.length + likes.length + follows.length;
  const topGenres = Object.entries(a.genre)
    .filter(([g]) => g !== "unknown" && g.trim().length > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 8)
    .map(([g, v]) => ({ genre: g, score: Math.max(1, Math.round(v)) }));

  const topRegions = Object.entries(a.region)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([r, v]) => ({ region: r, score: Math.round(v) }));

  // Generate dynamic Taste DNA Persona
  const primaryGenre = topGenres[0]?.genre || "Eclectic Music";
  const secondaryGenre = topGenres[1]?.genre || "Global Sound";
  let personaName = `${capitalize(primaryGenre)} & ${capitalize(secondaryGenre)} Explorer`;
  if (userPrefs.basqueAffinity && userPrefs.basqueAffinity >= 80) {
    personaName = `Authentic Basque & ${capitalize(primaryGenre)} Purist`;
  } else if (userPrefs.energy === "high" || userPrefs.energy === "intense") {
    personaName = `High-Energy ${capitalize(primaryGenre)} Aficionado`;
  } else if (userPrefs.energy === "chill") {
    personaName = `Mellow ${capitalize(primaryGenre)} & Ambient Seeker`;
  }

  const calibrationLevel = totalRawEvents >= 30 ? "high" : totalRawEvents >= 10 ? "medium" : "low";
  const calibrationPercent = Math.min(100, Math.round(25 + totalRawEvents * 2.5));

  return {
    topGenres,
    topRegions,
    totalEvents: totalRawEvents,
    preferences: userPrefs,
    personaName,
    calibrationLevel,
    calibrationPercent,
  };
}

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function fetchRecommendationCandidates(ids: number[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .where(inArray(tracks.id, ids));
}
