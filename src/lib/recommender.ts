import "server-only";
import { db } from "@/db";
import { tracks, artists, albums, listenEvents, settings, likedTracks, followedArtists, savedAlbums } from "@/db/schema";
import { desc, sql, eq, inArray, and } from "drizzle-orm";
import type { Recommendation, Track, Artist } from "@/lib/types";
import { mapTrack, mapArtist } from "@/lib/mappers";

/**
 * ON-DEVICE RECOMMENDATION ENGINE
 * ----------------------------------------------------------------------------
 * Fully local & privacy-preserving: no data leaves the device. It derives an
 * affinity profile from the user's own listening events (genres, artists,
 * regions, skips, completions, repeats) and scores candidate tracks against it.
 *
 * The "Basque & Local Music Booster" multiplies the score of region='eu'
 * tracks (and Basque-flavored genres) so regional rock/folk/indie surfaces to
 * the top when enabled — directly addressing the underrepresentation of Basque
 * music in mainstream free databases.
 */

const BASQUE_GENRES = ["euskal rock", "folk", "trikitia", "euskal pop", "punk", "euskal"];

interface Affinity {
  genre: Record<string, number>;
  artist: Record<number, number>;
  region: Record<string, number>;
  totalEvents: number;
}

function buildAffinity(
  events: (typeof listenEvents.$inferSelect)[],
  likedTracksData: (typeof tracks.$inferSelect)[] = []
): Affinity {
  const a: Affinity = { genre: {}, artist: {}, region: {}, totalEvents: events.length + likedTracksData.length };
  
  // 1. Process explicit Liked Songs with strong positive weights
  for (const t of likedTracksData) {
    const g = (t.genre ?? "unknown").toLowerCase();
    a.genre[g] = (a.genre[g] ?? 0) + 5.0;
    if (t.artistId) {
      a.artist[t.artistId] = (a.artist[t.artistId] ?? 0) + 8.0;
    }
    const r = (t.region ?? "global").toLowerCase();
    a.region[r] = (a.region[r] ?? 0) + 3.0;
  }

  // 2. Process listen events
  for (const e of events) {
    const g = (e.genre ?? "unknown").toLowerCase();
    const weight = e.completed ? 2.2 : e.skipped ? -1.4 : 0.4;
    a.genre[g] = (a.genre[g] ?? 0) + weight;
    if (e.artistId) a.artist[e.artistId] = (a.artist[e.artistId] ?? 0) + (e.completed ? 3 : e.skipped ? -1.5 : 0.5);
    const r = (e.region ?? "global").toLowerCase();
    a.region[r] = (a.region[r] ?? 0) + (e.completed ? 1 : e.skipped ? -0.5 : 0.2);
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
  const booster = opts.basqueBooster ?? false;
  const syncKey = opts.syncKey || "default";

  // 1. Load explicit user music preferences from settings
  const preferenceRows = await db
    .select()
    .from(settings)
    .where(and(eq(settings.key, "music_preferences"), eq(settings.syncKey, syncKey)));
  
  let preferredGenres: string[] = [];
  let preferredRegions: string[] = [];
  
  if (preferenceRows.length > 0) {
    try {
      const prefs = JSON.parse(preferenceRows[0].value);
      preferredGenres = prefs.genres || [];
      preferredRegions = prefs.regions || [];
    } catch (e) {
      console.error("Failed to parse music_preferences:", e);
    }
  }

  // 2. Load explicit user library items: liked tracks, followed artists, saved albums
  const [likes, follows, saves] = await Promise.all([
    db.select().from(likedTracks).where(eq(likedTracks.syncKey, syncKey)),
    db.select().from(followedArtists).where(eq(followedArtists.syncKey, syncKey)),
    db.select().from(savedAlbums).where(eq(savedAlbums.syncKey, syncKey)),
  ]);

  const likedTrackIds = new Set<number>(likes.map((l: any) => l.trackId as number));
  const followedArtistIds = new Set<number>(follows.map((f: any) => f.artistId as number));
  const savedAlbumIds = new Set<number>(saves.map((s: any) => s.albumId as number));

  // Recent listening signal (cap for performance / recency bias).
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

  // Build sets of known artists and heard tracks for precise personalization
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

  // Candidate pool.
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
    if (skippedTrackIds.has(t.id)) continue; // Never recommend explicitly disliked/skipped songs

    let score = 0;
    const reasons: string[] = [];

    const isHeard = heardTrackIds.has(t.id);
    const isArtistKnown = t.artistId ? knownArtistIds.has(t.artistId) : false;

    const albYear = alb?.year;

    if (opts.discoverMode) {
      // DISCOVER NOW: Focus strictly on similar but completely UNHEARD artists/bands
      if (isHeard) {
        continue; // Skip already heard tracks entirely to guarantee discovery
      }
      if (isArtistKnown) {
        score -= 20.0; // Heavy penalty for artists they already know to force variety
      }
      // Skip older classics if they are older than 2015 (or if release year is unknown), to enforce a strictly new discography
      // Allow local seeded tracks to bypass this to ensure catalog availability
      if (t.source !== "local" && (!albYear || albYear < 2015)) {
        continue;
      }

      // Base genre/affinity matches
      if (t.genre) {
        const lowerGenre = t.genre.toLowerCase();
        if (affinity.genre[lowerGenre]) {
          score += affinity.genre[lowerGenre] * 1.5;
          reasons.push(`Similar style to your swiped/heard genres`);
        }
      }

      // Huge boost for similar but completely unheard artists
      if (!isArtistKnown && t.genre) {
        const lowerGenre = t.genre.toLowerCase();
        const hasGenreAffinity = (affinity.genre[lowerGenre] && affinity.genre[lowerGenre] > 0) ||
                                 preferredGenres.some(g => lowerGenre.includes(g.toLowerCase()));
        if (hasGenreAffinity) {
          score += 25.0; // Very high boost to highlight new talent matching their taste
          reasons.unshift(`Similar band in ${t.genre}`);
        }
      }

      // Explicit custom preference boost
      if (t.genre) {
        const tgLower = t.genre.toLowerCase();
        const matchesGenre = preferredGenres.some(
          (g) => tgLower.includes(g.toLowerCase()) || g.toLowerCase().includes(tgLower)
        );
        if (matchesGenre) {
          score += 12.0;
          reasons.unshift(`Unheard artist matching your genres`);
        }
      }

    } else {
      // FOR YOU: Blend their absolute favorites/likes with relevant unheard music
      if (affinity.genre[t.genre ?? "unknown"]) {
        score += affinity.genre[t.genre ?? "unknown"];
        reasons.push(`because you play ${t.genre ?? "this genre"}`);
      }
      if (t.artistId && affinity.artist[t.artistId]) {
        score += affinity.artist[t.artistId];
        reasons.push("from an artist you follow");
      }
      if (affinity.region[t.region ?? "global"]) {
        score += affinity.region[t.region ?? "global"];
      }

      // Liked Songs / Saved / Followed signals booster
      if (likedTrackIds.has(t.id)) {
        score += 8.0;
        reasons.unshift("from your Liked Songs");
      }
      if (t.artistId && followedArtistIds.has(t.artistId)) {
        score += 5.5;
        reasons.unshift("from an artist you follow");
      }
      if (t.albumId && savedAlbumIds.has(t.albumId)) {
        score += 4.5;
        reasons.unshift("from your saved albums");
      }

      // Custom preferences form boost
      if (t.genre) {
        const tgLower = t.genre.toLowerCase();
        const matchesGenre = preferredGenres.some(
          (g) => tgLower.includes(g.toLowerCase()) || g.toLowerCase().includes(tgLower)
        );
        if (matchesGenre) {
          score += 5.0;
          reasons.unshift(`matched with your taste preferences`);
        }
      }
      if (t.region) {
        const trLower = t.region.toLowerCase();
        const matchesRegion = preferredRegions.some((r) => r.toLowerCase() === trLower);
        if (matchesRegion) {
          score += 3.0;
          reasons.unshift(`matching preferred regions`);
        }
      }

      // Mix in completely unheard music matching user taste (around 30% weighting boost)
      if (!isHeard && t.genre) {
        const lowerGenre = t.genre.toLowerCase();
        const hasGenreAffinity = (affinity.genre[lowerGenre] && affinity.genre[lowerGenre] > 0) ||
                                 preferredGenres.some(g => lowerGenre.includes(g.toLowerCase()));
        if (hasGenreAffinity) {
          score += 6.5; // Beautiful boost to let fresh tracks bubble up in For You
          reasons.unshift(`Unheard track similar to your taste`);
        }
      }
    }

    // Seed-track similarity boost (same genre/artist as currently playing).
    if (opts.seedTrackId) {
      const seed = rows.find((r: any) => r.tracks.id === opts.seedTrackId);
      if (seed) {
        if (seed.tracks.genre && seed.tracks.genre === t.genre) {
          score += 1.5;
          reasons.push(`similar to what's playing`);
        }
        if (seed.tracks.artistId && seed.tracks.artistId === t.artistId) {
          score += 2;
        }
      }
    }

    // Basque & Local Music Booster.
    if (booster) {
      if (t.region === "eu") {
        score *= 2.6;
        reasons.unshift("Basque & Local pick");
      }
      if (isBasqueGenre(t.genre)) {
        score *= 1.5;
      }
    }

    // Popularity prior (log-scaled) + cold-start floor.
    score += Math.log10((t.playCount ?? 0) + 1) * (events.length === 0 ? 3 : 1.2);

    // Recency decay: avoid repeating tracks just played.
    if (playedRecently.has(t.id)) score *= 0.15;

    // Small random variety on reload: this ensures reloading recommendations fetches a slightly different set of songs
    score += Math.random() * 15.0;

    // Normalize into a 0..100 confidence number for the UI.
    const confidence = Math.max(5, Math.min(99, Math.round(40 + score * 6)));

    candidates.push({
      track,
      artist: ar ? mapArtist(ar) : null,
      score,
      confidence,
      reason: reasons[0] ?? (opts.discoverMode ? "New discover recommendation" : "Trending in your library"),
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Enforce strict artist diversity
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

/** Affinity profile summary for the "Your taste" panel. */
export async function getTasteProfile(syncKey: string = "default") {
  const events = await db
    .select()
    .from(listenEvents)
    .where(eq(listenEvents.syncKey, syncKey))
    .orderBy(desc(listenEvents.createdAt))
    .limit(400);
  
  // Also load explicit preferences to ensure they appear in the taste profile UI
  const preferenceRows = await db
    .select()
    .from(settings)
    .where(and(eq(settings.key, "music_preferences"), eq(settings.syncKey, syncKey)));
  
  let preferredGenres: string[] = [];
  if (preferenceRows.length > 0) {
    try {
      const prefs = JSON.parse(preferenceRows[0].value);
      preferredGenres = prefs.genres || [];
    } catch (e) {
      console.error("Failed to parse music_preferences:", e);
    }
  }

  const a = buildAffinity(events);
  
  // Boost explicitly preferred genres
  for (const genre of preferredGenres) {
    a.genre[genre.toLowerCase()] = (a.genre[genre.toLowerCase()] ?? 0) + 10;
  }

  const topGenres = Object.entries(a.genre)
    .filter(([g]) => g !== "unknown")
    .sort((x, y) => y[1] - x[1])
    .slice(0, 6)
    .map(([g, v]) => ({ genre: g, score: Math.round(v) }));
  const topRegions = Object.entries(a.region)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([r, v]) => ({ region: r, score: Math.round(v) }));
  return { topGenres, topRegions, totalEvents: a.totalEvents + preferredGenres.length };
}

export async function fetchRecommendationCandidates(ids: number[]) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .where(inArray(tracks.id, ids));
}
