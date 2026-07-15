import "server-only";
import { db } from "@/db";
import { tracks, artists, listenEvents, settings, likedTracks, followedArtists, savedAlbums } from "@/db/schema";
import { desc, sql, eq, inArray } from "drizzle-orm";
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

function buildAffinity(events: (typeof listenEvents.$inferSelect)[]): Affinity {
  const a: Affinity = { genre: {}, artist: {}, region: {}, totalEvents: events.length };
  for (const e of events) {
    const g = e.genre ?? "unknown";
    const weight = e.completed ? 2.2 : e.skipped ? -1.4 : 0.4;
    a.genre[g] = (a.genre[g] ?? 0) + weight;
    if (e.artistId) a.artist[e.artistId] = (a.artist[e.artistId] ?? 0) + (e.completed ? 3 : e.skipped ? -1.5 : 0.5);
    const r = e.region ?? "global";
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
}): Promise<Recommendation[]> {
  const limit = opts.limit ?? 24;
  const booster = opts.basqueBooster ?? false;

  // 1. Load explicit user music preferences from settings
  const preferenceRows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "music_preferences"));
  
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
    db.select().from(likedTracks),
    db.select().from(followedArtists),
    db.select().from(savedAlbums),
  ]);

  const likedTrackIds = new Set(likes.map((l: any) => l.trackId));
  const followedArtistIds = new Set(follows.map((f: any) => f.artistId));
  const savedAlbumIds = new Set(saves.map((s: any) => s.albumId));

  // Recent listening signal (cap for performance / recency bias).
  const events = await db
    .select()
    .from(listenEvents)
    .orderBy(desc(listenEvents.createdAt))
    .limit(400);
  const affinity = buildAffinity(events);

  // Candidate pool.
  const rows = await db
    .select()
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .orderBy(desc(tracks.playCount))
    .limit(400);

  const playedRecently = new Set(events.slice(0, 40).map((e: any) => e.trackId));

  const candidates: Candidate[] = [];
  for (const row of rows) {
    const t = row.tracks;
    const ar = row.artists;
    const track: Track = mapTrack(t);
    if (opts.seedTrackId && t.id === opts.seedTrackId) continue;

    let score = 0;
    const reasons: string[] = [];

    // Affinity contributions.
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
      score += 6.0;
      reasons.unshift("from your Liked Songs");
    }
    if (t.artistId && followedArtistIds.has(t.artistId)) {
      score += 4.5;
      reasons.unshift("from an artist you follow");
    }
    if (t.albumId && savedAlbumIds.has(t.albumId)) {
      score += 3.5;
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
      reason: reasons[0] ?? "Trending in your library",
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, limit);

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
}) {
  await db.insert(listenEvents).values({
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
export async function getTasteProfile() {
  const events = await db
    .select()
    .from(listenEvents)
    .orderBy(desc(listenEvents.createdAt))
    .limit(400);
  
  // Also load explicit preferences to ensure they appear in the taste profile UI
  const preferenceRows = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "music_preferences"));
  
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
