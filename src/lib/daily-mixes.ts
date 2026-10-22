import { db } from "@/db";
import {
  tracks,
  artists,
  likedTracks,
  followedArtists,
  listenEvents,
  playlists,
  playlistTracks,
} from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";
import { getExpandedUserTasteProfile } from "@/lib/taste-profile";

export interface DailyMix {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  genre: string;
  tracks: Track[];
}

// Color palettes for dynamically assigned mixes
const MIX_COLORWAYS = [
  "from-emerald-600/50 via-teal-900/40 to-black/90",
  "from-violet-600/50 via-purple-900/40 to-black/90",
  "from-amber-600/50 via-orange-900/40 to-black/90",
  "from-rose-600/50 via-red-900/40 to-black/90",
  "from-cyan-600/50 via-blue-900/40 to-black/90",
  "from-indigo-600/50 via-slate-900/40 to-black/90",
];

// Ground truth Basque artists for Basque purity matching
const BASQUE_ARTIST_NAMES = [
  "ZETAK", "Bengo", "En Tol Sarmiento", "ETS", "Bulego", "Huntza", "Izaro",
  "Gatibu", "Chill Mafia", "Dupla", "Merina Gris", "Neomak", "Berri Txarrak",
  "Zea Mays", "Su Ta Gar", "Esne Beltza", "Vendetta", "Gose", "Hesian",
  "Kepa Junkera", "Oreka TX", "Kortatu", "Hertzainak", "Negu Gorriak",
  "Streetwise", "Bizardunak", "Olaia Inziarte", "Tatta", "Belako",
  "La Txama", "Anari", "Añube", "Mikel Laboa", "Benito Lertxundi", "Skakeitan",
  "Glaukoma", "Doctor Deseo", "Itoiz", "Shinova", "Idoia", "Eñaut Elorrieta",
  "Olatz Salvador", "Brigade Loco", "Rotten XIII", "Lukiek", "Süne",
];

// Broad category definitions to cluster user listening into meaningful themes
interface ThemeCategoryDef {
  key: string;
  defaultLabel: string;
  keywords: string[];
  artistHints: string[];
}

const THEME_CATEGORIES: ThemeCategoryDef[] = [
  {
    key: "basque_sounds",
    defaultLabel: "Euskal Herriko Soinuak",
    keywords: ["euskal", "basque", "trikitia", "euskara", "euskal rock", "euskal pop", "euskal folk"],
    artistHints: BASQUE_ARTIST_NAMES,
  },
  {
    key: "hiphop_urban",
    defaultLabel: "Hip-Hop & Urban Beats",
    keywords: ["hip-hop", "rap", "trap", "drill", "urban", "r&b", "hip hop", "boom bap"],
    artistHints: ["Wiz Khalifa", "Kendrick Lamar", "Drake", "B.o.B", "Travis Scott", "Tyler, The Creator", "Kanye West", "Eminem", "J. Cole", "Post Malone"],
  },
  {
    key: "rock_alternative",
    defaultLabel: "Rock & Alternative Energy",
    keywords: ["rock", "punk", "alternative", "hard rock", "metal", "grunge", "indie rock", "post-punk"],
    artistHints: ["Berri Txarrak", "Shinova", "Zea Mays", "Su Ta Gar", "Belako", "Arctic Monkeys", "The Strokes", "Radiohead", "Foo Fighters", "Nirvana", "Muse", "Queen"],
  },
  {
    key: "acoustic_folk",
    defaultLabel: "Acoustic & Singer-Songwriter",
    keywords: ["acoustic", "folk", "singer-songwriter", "mellow", "chamber folk", "indie folk", "unplugged"],
    artistHints: ["Benito Lertxundi", "Mikel Laboa", "Izaro", "Olaia Inziarte", "Idoia", "Anari", "Bon Iver", "Ben Howard", "Passenger", "Fleet Foxes", "Sufjan Stevens"],
  },
  {
    key: "synth_electronic",
    defaultLabel: "Electronic & Synth Grooves",
    keywords: ["electronic", "synth", "dance", "house", "techno", "synth pop", "synthwave", "electropop", "club", "edm"],
    artistHints: ["Daft Punk", "Fred again..", "Merina Gris", "ZETAK", "The Weeknd", "Dupla", "Disclosure", "Avicii", "Calvin Harris"],
  },
  {
    key: "latin_flamenco",
    defaultLabel: "Latin Urban & Fusion Rhythms",
    keywords: ["latin", "reggaeton", "dembow", "flamenco", "fusion", "latin pop", "urbano", "rumba"],
    artistHints: ["Rosalía", "C. Tangana", "Quevedo", "Bad Bunny", "Aitana", "Saiko", "Bad Gyal", "Rels B", "La Txama"],
  },
  {
    key: "pop_contemporary",
    defaultLabel: "Top Chart Pop & Anthems",
    keywords: ["pop", "dance pop", "contemporary", "chart", "hits", "indie pop"],
    artistHints: ["Dua Lipa", "Billie Eilish", "Taylor Swift", "Olivia Rodrigo", "Sabrina Carpenter", "Harry Styles", "Bulego", "ETS"],
  },
];

function stringSeedHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function matchThemeCategory(track: { genre?: string | null; artistName?: string | null }): string | null {
  const normGenre = (track.genre || "").toLowerCase();
  const normArtist = (track.artistName || "").toLowerCase();

  // Check Basque first if matched
  const isBasque = BASQUE_ARTIST_NAMES.some((b) => normArtist.includes(b.toLowerCase())) ||
    normGenre.includes("euskal") || normGenre.includes("basque") || normGenre.includes("trikitia");
  if (isBasque) {
    return "basque_sounds";
  }

  for (const cat of THEME_CATEGORIES) {
    if (cat.key === "basque_sounds") continue;
    const hitArtist = cat.artistHints.some((ah) => normArtist.includes(ah.toLowerCase()));
    if (hitArtist) return cat.key;
    const hitKeyword = cat.keywords.some((k) => normGenre.includes(k));
    if (hitKeyword) return cat.key;
  }

  return null;
}

/**
 * Generates dynamic Daily Mixes adapting directly to what the user
 * has listened to in the last month / last 500 songs played.
 */
export async function generateDailyMixes(
  syncKey: string = "default",
  seedValue?: string
): Promise<DailyMix[]> {
  const seedNum = seedValue ? stringSeedHash(seedValue) : Math.floor(Date.now() / (1000 * 60 * 60 * 6));

  // 1. Gather Catalog tracks (broad pool up to 1,200 tracks)
  const allDbTracks = await db
    .select()
    .from(tracks)
    .orderBy(desc(tracks.playCount))
    .limit(1200);
  const mappedCatalog: Track[] = allDbTracks.map(mapTrack);

  // 2. Load User's listening events (last 500 events / within last 30 days)
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [recentEvents, likedRows, followedRows, userTaste] = await Promise.all([
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
    db.select({ trackId: likedTracks.trackId }).from(likedTracks).where(eq(likedTracks.syncKey, syncKey)),
    db.select({ artistId: followedArtists.artistId }).from(followedArtists).where(eq(followedArtists.syncKey, syncKey)),
    getExpandedUserTasteProfile(syncKey),
  ]);

  const likedTrackIds = new Set((likedRows as { trackId: number }[]).map((r) => r.trackId));
  const followedArtistIds = new Set((followedRows as { artistId: number }[]).map((r) => r.artistId));

  // Map track IDs to actual catalog track objects for quick lookup
  const catalogMap = new Map<number, Track>();
  mappedCatalog.forEach((t) => catalogMap.set(t.id, t));

  // Filter events: last month or top 500
  const relevantEvents = (recentEvents as Array<{
    trackId: number;
    artistId: number | null;
    genre: string | null;
    completed: boolean;
    skipped: boolean;
    listenSeconds: number;
    createdAt: Date;
  }>).filter((ev) => ev.createdAt >= oneMonthAgo || recentEvents.length <= 100);

  // 3. Cluster user recent listening activity
  interface ClusterStats {
    key: string;
    label: string;
    playCount: number;
    completionScore: number;
    recentTracks: Track[];
    artistFrequency: Map<string, number>;
    genreFrequency: Map<string, number>;
  }

  const clustersMap = new Map<string, ClusterStats>();

  // Initialize all theme categories
  for (const cat of THEME_CATEGORIES) {
    clustersMap.set(cat.key, {
      key: cat.key,
      label: cat.defaultLabel,
      playCount: 0,
      completionScore: 0,
      recentTracks: [],
      artistFrequency: new Map<string, number>(),
      genreFrequency: new Map<string, number>(),
    });
  }

  // Populate clusters from actual listened songs
  for (const ev of relevantEvents) {
    if (ev.skipped && ev.listenSeconds === 0) continue; // Skip immediate skips
    const track = catalogMap.get(ev.trackId);
    if (!track) continue;

    const themeKey = matchThemeCategory(track) || "pop_contemporary";
    const cluster = clustersMap.get(themeKey);
    if (!cluster) continue;

    cluster.playCount++;
    cluster.completionScore += ev.completed ? 3 : ev.listenSeconds > 20 ? 2 : 1;

    // Track recently played tracks in this cluster
    if (!cluster.recentTracks.some((t) => t.id === track.id)) {
      cluster.recentTracks.push(track);
    }

    // Tally artist frequency
    const art = track.artistName.trim();
    if (art) {
      cluster.artistFrequency.set(art, (cluster.artistFrequency.get(art) || 0) + 1);
    }

    // Tally genre frequency
    const g = track.genre?.trim();
    if (g) {
      cluster.genreFrequency.set(g, (cluster.genreFrequency.get(g) || 0) + 1);
    }
  }

  // 4. Rank clusters by user's actual latest engagement
  const sortedClusters = Array.from(clustersMap.values()).sort((a, b) => {
    // Primary sort: actual completion score & play count from last month / 500 plays
    if (b.completionScore !== a.completionScore) {
      return b.completionScore - a.completionScore;
    }
    return b.playCount - a.playCount;
  });

  // Pick top 4 to 6 themes for the Daily Mixes:
  // If user has strong engagement in several clusters, prioritize their active clusters!
  // If a cluster has 0 listens, adjust ranking using User Taste Profile preferred genres and favorite artists.
  const activeClusters = sortedClusters.filter((c) => c.completionScore > 0);
  const inactiveClusters = sortedClusters.filter((c) => c.completionScore === 0);

  // Score inactive clusters based on user taste preferences as fallback
  const preferredGenres = (userTaste.preferredGenres || []).map((g) => g.toLowerCase());
  const favoriteArtists = (userTaste.favoriteArtists || []).map((a) => a.toLowerCase());

  inactiveClusters.sort((a, b) => {
    const aDef = THEME_CATEGORIES.find((t) => t.key === a.key);
    const bDef = THEME_CATEGORIES.find((t) => t.key === b.key);

    let scoreA = 0;
    let scoreB = 0;

    if (aDef) {
      if (aDef.keywords.some((k) => preferredGenres.some((pg) => pg.includes(k) || k.includes(pg)))) scoreA += 5;
      if (aDef.artistHints.some((ah) => favoriteArtists.some((fa) => fa.includes(ah.toLowerCase())))) scoreA += 5;
    }
    if (bDef) {
      if (bDef.keywords.some((k) => preferredGenres.some((pg) => pg.includes(k) || k.includes(pg)))) scoreB += 5;
      if (bDef.artistHints.some((ah) => favoriteArtists.some((fa) => fa.includes(ah.toLowerCase())))) scoreB += 5;
    }

    return scoreB - scoreA;
  });

  // Combine to ensure 4 to 5 rich mixes (user active clusters first, then taste fallbacks)
  const finalMixThemes = [...activeClusters, ...inactiveClusters].slice(0, 4);

  // 5. Build each Daily Mix with tailored tracks
  const mixes: DailyMix[] = finalMixThemes.map((cluster, mixIdx) => {
    const def = THEME_CATEGORIES.find((t) => t.key === cluster.key)!;
    const mixId = `daily-mix-${mixIdx + 1}`;
    const mixTitle = `Daily Mix ${mixIdx + 1}`;
    const accentColor = MIX_COLORWAYS[mixIdx % MIX_COLORWAYS.length];

    // Find top recent anchor artists the user actually listened to in this theme
    const sortedRecentArtists = Array.from(cluster.artistFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);

    // Top recent genres
    const sortedRecentGenres = Array.from(cluster.genreFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);

    // Determine dynamic theme genre label
    let dynamicGenreLabel = def.defaultLabel;
    if (sortedRecentGenres.length > 0) {
      const topG = sortedRecentGenres[0];
      if (def.key === "basque_sounds") {
        dynamicGenreLabel = topG.toLowerCase().includes("fusion")
          ? "Basque Fusion & Urban"
          : topG.toLowerCase().includes("rock")
          ? "Euskal Rock & Punk"
          : "Euskal Herriko Soinuak";
      } else if (def.key === "hiphop_urban") {
        dynamicGenreLabel = topG.toLowerCase().includes("trap") ? "Trap & Drill Waves" : "Hip-Hop & Urban";
      } else if (def.key === "rock_alternative") {
        dynamicGenreLabel = topG.toLowerCase().includes("indie") ? "Indie Rock & Alt" : "Rock Essentials";
      } else if (def.key === "acoustic_folk") {
        dynamicGenreLabel = "Acoustic & Singer-Songwriter";
      } else if (def.key === "synth_electronic") {
        dynamicGenreLabel = "Electronic & Synth Grooves";
      } else if (def.key === "latin_flamenco") {
        dynamicGenreLabel = "Latin Vibes & Flamenco Fusion";
      } else {
        dynamicGenreLabel = topG;
      }
    }

    // Determine candidate pool for this mix
    let candidatePool = mappedCatalog;
    if (def.key === "basque_sounds") {
      candidatePool = mappedCatalog.filter((t) => {
        const art = t.artistName.toLowerCase();
        const gen = (t.genre || "").toLowerCase();
        const isBasqueArtist = BASQUE_ARTIST_NAMES.some((ba) => art.includes(ba.toLowerCase()));
        const isBasqueRegion = (t as any).region === "eu" || (t as any).language === "eu";
        const isBasqueGenre = gen.includes("euskal") || gen.includes("basque") || gen.includes("trikitia");
        return isBasqueArtist || isBasqueRegion || isBasqueGenre;
      });
    } else {
      // Filter out mismatched regional/heavy genres from other niches
      candidatePool = mappedCatalog.filter((t) => {
        const theme = matchThemeCategory(t);
        // Include if matches this theme or if user listened to this artist in this cluster
        if (theme === def.key) return true;
        if (sortedRecentArtists.some((ra) => ra.toLowerCase() === t.artistName.toLowerCase())) return true;
        return false;
      });
    }

    // If candidate pool is too small, pull loosely matching candidates
    if (candidatePool.length < 25) {
      candidatePool = mappedCatalog.filter((t) => {
        const gLow = (t.genre || "").toLowerCase();
        return def.keywords.some((k) => gLow.includes(k));
      });
    }

    // Deterministic pseudo-random float generator based on track.id, seedNum, and mixIdx
    const getTrackSeedHash = (trackId: number, salt: number = 0) => {
      let h = (trackId ^ (seedNum * 1337 + mixIdx * 997 + salt * 41)) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };

    // Separate candidate tracks into:
    // 1) familiarPool (recently played by user, liked, or from top user-played artists in this theme)
    // 2) discoveryPool (all other matching candidates in this theme)
    const familiarCandidates: { track: Track; score: number }[] = [];
    const discoveryCandidates: { track: Track; score: number }[] = [];

    for (const t of candidatePool) {
      const normArtist = t.artistName.toLowerCase().trim();
      const normGenre = (t.genre || "").toLowerCase();
      const isRecentlyListened = cluster.recentTracks.some((rt) => rt.id === t.id);
      const isLiked = likedTrackIds.has(t.id);
      const artistPlayCount = cluster.artistFrequency.get(t.artistName.trim()) || 0;

      // Base thematic score
      let themeScore = 20;
      if (def.keywords.some((k) => normGenre.includes(k))) themeScore += 25;
      if (def.artistHints.some((ah) => normArtist.includes(ah.toLowerCase()))) themeScore += 20;
      if (t.artistId && followedArtistIds.has(t.artistId)) themeScore += 15;

      // Seed-based dynamic jitter (0 to 65) ensures track rotation whenever seed or day changes!
      const randomJitter = getTrackSeedHash(t.id) * 65;

      if (isRecentlyListened || isLiked || artistPlayCount > 0) {
        let familiarityBonus = 0;
        if (isRecentlyListened) familiarityBonus += 35;
        if (isLiked) familiarityBonus += 25;
        if (artistPlayCount > 0) familiarityBonus += Math.min(artistPlayCount * 5, 20);

        familiarCandidates.push({
          track: t,
          score: themeScore + familiarityBonus + randomJitter,
        });
      } else {
        discoveryCandidates.push({
          track: t,
          score: themeScore + randomJitter,
        });
      }
    }

    // Sort both pools by their seed-jittered scores
    familiarCandidates.sort((a, b) => b.score - a.score);
    discoveryCandidates.sort((a, b) => b.score - a.score);

    // Pick up to 7 familiar tracks and up to 13 discovery tracks (total 20 tracks),
    // strictly capping each artist at max 2 tracks for high diversity!
    const MAX_PER_ARTIST = 2;
    const artistCountMap = new Map<string, number>();
    const selectedFamiliar: Track[] = [];
    const selectedDiscovery: Track[] = [];

    for (const { track } of familiarCandidates) {
      const artKey = track.artistName.toLowerCase().trim();
      const count = artistCountMap.get(artKey) || 0;
      if (count < MAX_PER_ARTIST) {
        selectedFamiliar.push(track);
        artistCountMap.set(artKey, count + 1);
      }
      if (selectedFamiliar.length >= 7) break;
    }

    for (const { track } of discoveryCandidates) {
      const artKey = track.artistName.toLowerCase().trim();
      const count = artistCountMap.get(artKey) || 0;
      if (count < MAX_PER_ARTIST) {
        selectedDiscovery.push(track);
        artistCountMap.set(artKey, count + 1);
      }
      if (selectedFamiliar.length + selectedDiscovery.length >= 20) break;
    }

    // If still under 16 tracks, fill from remaining candidates
    if (selectedFamiliar.length + selectedDiscovery.length < 16) {
      const remaining = [...familiarCandidates, ...discoveryCandidates];
      for (const { track } of remaining) {
        if (selectedFamiliar.some((t) => t.id === track.id) || selectedDiscovery.some((t) => t.id === track.id)) continue;
        const artKey = track.artistName.toLowerCase().trim();
        const count = artistCountMap.get(artKey) || 0;
        if (count < 3) {
          selectedDiscovery.push(track);
          artistCountMap.set(artKey, count + 1);
        }
        if (selectedFamiliar.length + selectedDiscovery.length >= 18) break;
      }
    }

    // Interleave familiar and discovery tracks seamlessly:
    // (Familiar, Discovery, Discovery, Familiar, Discovery, Discovery...)
    const selectedTracks: Track[] = [];
    const fQueue = [...selectedFamiliar];
    const dQueue = [...selectedDiscovery];

    while (fQueue.length > 0 || dQueue.length > 0) {
      if (fQueue.length > 0) {
        selectedTracks.push(fQueue.shift()!);
      }
      if (dQueue.length > 0) {
        selectedTracks.push(dQueue.shift()!);
      }
      if (dQueue.length > 0) {
        selectedTracks.push(dQueue.shift()!);
      }
    }

    // Dynamic subtitle: Top 3-4 distinct artists in this mix
    const uniqueArtists = Array.from(new Set(selectedTracks.map((t) => t.artistName)));
    const topArtistsList = uniqueArtists.slice(0, 4);
    const subtitle = topArtistsList.length > 0 ? `${topArtistsList.join(", ")} and more` : dynamicGenreLabel;

    // Dynamic description tailored to user's recent listening
    let description = "";
    if (sortedRecentArtists.length > 0) {
      const leadArtists = sortedRecentArtists.slice(0, 2).join(" & ");
      description = `Shaped by your recent plays of ${leadArtists}, featuring ${dynamicGenreLabel} essentials and fresh discoveries.`;
    } else {
      description = `Curated for your taste in ${dynamicGenreLabel}, featuring ${topArtistsList.slice(0, 2).join(" & ")} and related sounds.`;
    }

    return {
      id: mixId,
      title: mixTitle,
      subtitle,
      description,
      accentColor,
      genre: dynamicGenreLabel,
      tracks: selectedTracks,
    };
  });

  return mixes;
}

export async function getDailyMixById(
  mixId: string,
  syncKey: string = "default",
  seedValue?: string
): Promise<DailyMix | null> {
  const mixes = await generateDailyMixes(syncKey, seedValue);
  return mixes.find((m) => m.id === mixId) || null;
}
