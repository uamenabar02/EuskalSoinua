import { db } from "@/db";
import {
  settings,
  likedTracks,
  followedArtists,
  savedAlbums,
  tracks,
  artists,
  listenEvents,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export * from "@/lib/taste-constants";
import type { UserTasteProfile, UserTastePreferences } from "@/lib/taste-constants";

/**
 * Loads the complete unified User Taste Profile from explicit settings,
 * library likes/follows/saves, and listening/swipe interactions.
 */
export async function getExpandedUserTasteProfile(syncKey: string = "default"): Promise<UserTasteProfile> {
  const [preferenceRows, likes, follows, saves, events] = await Promise.all([
    db
      .select()
      .from(settings)
      .where(and(eq(settings.key, "music_preferences"), eq(settings.syncKey, syncKey))),
    db.select().from(likedTracks).where(eq(likedTracks.syncKey, syncKey)),
    db.select().from(followedArtists).where(eq(followedArtists.syncKey, syncKey)),
    db.select().from(savedAlbums).where(eq(savedAlbums.syncKey, syncKey)),
    db
      .select()
      .from(listenEvents)
      .where(eq(listenEvents.syncKey, syncKey))
      .orderBy(desc(listenEvents.createdAt))
      .limit(300),
  ]);

  let explicitPrefs: UserTastePreferences = {};
  if (preferenceRows.length > 0 && preferenceRows[0].value) {
    try {
      explicitPrefs = JSON.parse(preferenceRows[0].value);
    } catch {
      explicitPrefs = {};
    }
  }

  const likedTrackIds = new Set<number>(likes.map((l: any) => l.trackId as number).filter(Boolean));
  const followedArtistIds = new Set<number>(follows.map((f: any) => f.artistId as number).filter(Boolean));
  const savedAlbumIds = new Set<number>(saves.map((s: any) => s.albumId as number).filter(Boolean));

  // Get followed artist names
  const followedArtistNames = new Set<string>();
  if (followedArtistIds.size > 0) {
    const artistRows = await db
      .select({ id: artists.id, name: artists.name })
      .from(artists)
      .where(inArray(artists.id, Array.from(followedArtistIds)));
    artistRows.forEach((a: any) => {
      if (a.name) followedArtistNames.add(a.name);
    });
  }

  // Combine explicit favorite artists with followed artist names
  const favoriteArtistsSet = new Set<string>(explicitPrefs.favoriteArtists || []);
  followedArtistNames.forEach((n) => favoriteArtistsSet.add(n));

  // Combine explicit preferred genres with genres extracted from liked items
  const preferredGenresSet = new Set<string>(explicitPrefs.genres || []);

  // Compute swipe history counts
  let swipeLikesCount = 0;
  let swipeDislikesCount = 0;
  const recentListenedTrackIds = new Set<number>();

  events.forEach((ev: any) => {
    if (ev.trackId) recentListenedTrackIds.add(ev.trackId);
    if (ev.completed || ev.listenSeconds > 0) {
      swipeLikesCount++;
    } else if (ev.skipped && ev.listenSeconds === 0) {
      swipeDislikesCount++;
    }
  });

  return {
    preferences: explicitPrefs,
    preferredGenres: Array.from(preferredGenresSet),
    preferredRegions: explicitPrefs.regions && explicitPrefs.regions.length > 0 ? explicitPrefs.regions : ["eu", "global"],
    favoriteArtists: Array.from(favoriteArtistsSet),
    energy: explicitPrefs.energy ?? 3,
    discoveryMode: explicitPrefs.discoveryMode || "balanced",
    eras: explicitPrefs.eras && explicitPrefs.eras.length > 0 ? explicitPrefs.eras : ["contemporary_20s", "modern_10s"],
    languagePreference: explicitPrefs.languagePreference || "multilingual",
    moods: explicitPrefs.moods || ["chill", "focus"],
    likedTrackIds,
    followedArtistIds,
    followedArtistNames,
    savedAlbumIds,
    likedTracksCount: likedTrackIds.size,
    swipeLikesCount,
    swipeDislikesCount,
    recentListenedTrackIds,
  };
}

/**
 * Formats the rich user taste profile into a concise, high-signal prompt
 * block for Gemini AI API requests across Curation, Discovery, and Playlists.
 */
export function formatTastePromptForAI(taste: UserTasteProfile): string {
  const energyLabel =
    taste.energy === 1
      ? "Level 1: Ultra Ambient, acoustic, introspective whispers, minimal beats"
      : taste.energy === 2
      ? "Level 2: Mellow, downtempo, relaxed grooves, chill rhythms"
      : taste.energy === 4
      ? "Level 4: Upbeat, driving, workout pace, energetic hooks"
      : taste.energy === 5
      ? "Level 5: Maximum voltage, blistering punk, rave drops, club intensity"
      : "Level 3: Balanced dynamic flow, steady melodic energy";

  const discoveryLabel =
    taste.discoveryMode === "comfort"
      ? "Comfort Zone (surface familiar favorites & well-known signatures)"
      : taste.discoveryMode === "adventurous"
      ? "Deep Explorer (bold, adventurous underground discoveries, emerging artists & rare B-sides)"
      : "Balanced Discovery (50/50 blend of beloved styles with fresh discoveries)";

  const languageLabel =
    taste.languagePreference === "euskara_first"
      ? "Euskara First (heavily prioritize Basque vocal tracks, lyricism and cultural artists)"
      : taste.languagePreference === "global"
      ? "Global Universal (broad international mix across all languages and continents)"
      : "Multilingual Harmony (equal celebration of Basque, Spanish, and English releases)";

  const eraDescriptions: Record<string, string> = {
    roots_70s_80s: "70s/80s Vintage Roots",
    classics_90s_00s: "90s/00s Rock & Millennium Classics",
    modern_10s: "2010s Modern Waves & Synth",
    contemporary_20s: "2020s Contemporary & Fresh Drops",
  };
  const eraText = taste.eras.map((e) => eraDescriptions[e] || e).join(", ");

  const moodDescriptions: Record<string, string> = {
    focus: "Deep Focus & Flow",
    chill: "Late Night & Chill",
    workout: "Cardio & Workout",
    road_trip: "Road Trip & Travel",
    party: "Party & Social",
    introspective: "Acoustic & Soulful",
  };
  const moodText = taste.moods.map((m) => moodDescriptions[m] || m).join(", ");

  return `
USER COMPREHENSIVE TASTE PROFILE:
- Preferred Genres: ${taste.preferredGenres.length > 0 ? taste.preferredGenres.join(", ") : "Basque Urban Pop, Euskal Rock, Indie, Electronic, Global Hip-Hop"}
- Favorite / Followed Artists: ${taste.favoriteArtists.length > 0 ? taste.favoriteArtists.slice(0, 15).join(", ") : "Bengo, ZETAK, Izaro, Belako, Tatta, Berri Txarrak, Daft Punk"}
- Energy & Tempo Vibe: ${energyLabel}
- Discovery Appetite: ${discoveryLabel}
- Cultural & Language Focus: ${languageLabel}
- Target Musical Eras: ${eraText || "Contemporary & Modern"}
- Listening Context & Moods: ${moodText || "Versatile"}
- Preferred Geographic Regions: ${taste.preferredRegions.join(", ")}
- Total Liked Songs: ${taste.likedTracksCount} | Swipe Activity: +${taste.swipeLikesCount} likes, -${taste.swipeDislikesCount} skips
`.trim();
}

/**
 * Computes an affinity multiplier for a candidate track based on the user's taste.
 */
export function calculateTrackTasteAffinity(
  track: {
    artistName?: string | null;
    genre?: string | null;
    region?: string | null;
    title?: string | null;
    year?: number | null;
  },
  taste: UserTasteProfile
): number {
  let score = 1.0;

  // Genre match bonus
  if (track.genre) {
    const trackGenre = track.genre.toLowerCase();
    for (const g of taste.preferredGenres) {
      if (trackGenre.includes(g.toLowerCase()) || g.toLowerCase().includes(trackGenre)) {
        score += 1.8;
        break;
      }
    }
  }

  // Favorite artist match bonus
  if (track.artistName) {
    const artistLower = track.artistName.toLowerCase();
    for (const fav of taste.favoriteArtists) {
      if (artistLower.includes(fav.toLowerCase()) || fav.toLowerCase().includes(artistLower)) {
        score += 2.5;
        break;
      }
    }
  }

  // Region preference match
  if (track.region && taste.preferredRegions.includes(track.region)) {
    score += 0.9;
  }

  // Era match bonus
  if (track.year) {
    const y = track.year;
    for (const era of taste.eras) {
      if (era === "contemporary_20s" && y >= 2020) score += 0.6;
      else if (era === "modern_10s" && y >= 2010 && y < 2020) score += 0.6;
      else if (era === "classics_90s_00s" && y >= 1990 && y < 2010) score += 0.6;
      else if (era === "roots_70s_80s" && y < 1990) score += 0.6;
    }
  }

  return score;
}
