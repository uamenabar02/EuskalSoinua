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
import { eq, desc, sql } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";

export interface DailyMix {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  genre: string;
  tracks: Track[];
}

// Known Basque artists to guarantee strict purity for Mix 1
const BASQUE_ARTISTS = [
  "ZETAK",
  "Bengo",
  "En Tol Sarmiento",
  "ETS",
  "Bulego",
  "Huntza",
  "Izaro",
  "Gatibu",
  "Chill Mafia",
  "Dupla",
  "Merina Gris",
  "Neomak",
  "Berri Txarrak",
  "Zea Mays",
  "Su Ta Gar",
  "Esne Beltza",
  "Vendetta",
  "Gose",
  "Hesian",
  "Kepa Junkera",
  "Oreka TX",
  "Kortatu",
  "Hertzainak",
  "Negu Gorriak",
  "Streetwise",
  "Bizardunak",
  "Olaia Inziarte",
  "Tatta",
  "Belako",
  "La Txama",
  "Anari",
  "Mikel Laboa",
  "Benito Lertxundi",
  "Skakeitan",
  "Glaukoma",
  "Doctor Deseo",
  "Itoiz",
  "Shinova",
  "Idoia",
  "Eñaut Elorrieta",
  "Olatz Salvador",
  "Brigade Loco",
  "Rotten XIII",
  "Lukiek",
];

export const DAILY_MIX_DEFINITIONS = [
  {
    id: "daily-mix-1",
    title: "Daily Mix 1",
    genreLabel: "Euskal Herriko Soinuak",
    accentColor: "from-emerald-600/50 via-teal-900/40 to-black/90",
    pillColor: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    description: "Authentic Basque pop, rock, trikitia & modern urban anthems.",
    strictBasqueOnly: true,
    targetArtists: [
      "ZETAK",
      "Bengo",
      "En Tol Sarmiento",
      "ETS",
      "Bulego",
      "Huntza",
      "Izaro",
      "Gatibu",
      "Tatta",
      "Dupla",
      "Merina Gris",
      "Neomak",
      "Chill Mafia",
      "Berri Txarrak",
      "Zea Mays",
      "Su Ta Gar",
      "Esne Beltza",
      "Vendetta",
      "Skakeitan",
      "Olaia Inziarte",
      "La Txama",
      "Glaukoma",
    ],
    targetKeywords: ["euskal", "basque", "trikitia", "euskara", "euskal rock", "euskal pop", "euskal folk"],
    excludedArtists: [],
  },
  {
    id: "daily-mix-2",
    title: "Daily Mix 2",
    genreLabel: "Rock & Alternative",
    accentColor: "from-amber-600/50 via-orange-900/40 to-black/90",
    pillColor: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    description: "Driving guitars, indie rock essentials, and hard-hitting alternative anthems.",
    strictBasqueOnly: false,
    targetArtists: [
      "Berri Txarrak",
      "Shinova",
      "Zea Mays",
      "Su Ta Gar",
      "Belako",
      "Lukiek",
      "Doctor Deseo",
      "Hertzainak",
      "Kortatu",
      "Streetwise",
      "Bizardunak",
      "Arctic Monkeys",
      "The Strokes",
      "Tame Impala",
      "Muse",
      "Foo Fighters",
      "Radiohead",
      "Nirvana",
      "Queen",
      "Red Hot Chili Peppers",
    ],
    targetKeywords: ["rock", "punk", "alternative", "hard rock", "metal", "grunge", "indie rock", "post-punk"],
    excludedArtists: ["Benito Lertxundi", "Mikel Laboa", "Dua Lipa", "Olivia Rodrigo"],
  },
  {
    id: "daily-mix-3",
    title: "Daily Mix 3",
    genreLabel: "Top Hits & Synth Pop",
    accentColor: "from-violet-600/50 via-purple-900/40 to-black/90",
    pillColor: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    description: "Modern chart-toppers, vibrant synth pop, dance, and energetic electronic grooves.",
    strictBasqueOnly: false,
    targetArtists: [
      "ZETAK",
      "Bengo",
      "Bulego",
      "Merina Gris",
      "Tatta",
      "Dupla",
      "Dua Lipa",
      "Rosalía",
      "The Weeknd",
      "Daft Punk",
      "Fred again..",
      "Olivia Rodrigo",
      "Harry Styles",
      "Aitana",
      "C. Tangana",
      "Billie Eilish",
      "Taylor Swift",
      "Coldplay",
    ],
    targetKeywords: ["pop", "dance", "synth pop", "electronic", "synth", "house", "chart", "hits", "urban"],
    excludedArtists: ["Benito Lertxundi", "Su Ta Gar", "Berri Txarrak", "Mikel Laboa", "Oskorri"],
  },
  {
    id: "daily-mix-4",
    title: "Daily Mix 4",
    genreLabel: "Indie Folk & Acoustic",
    accentColor: "from-rose-600/50 via-red-900/40 to-black/90",
    pillColor: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    description: "Warm acoustic strings, intimate vocals, and soothing indie songwriting.",
    strictBasqueOnly: false,
    targetArtists: [
      "Izaro",
      "Olaia Inziarte",
      "Idoia",
      "Anari",
      "Eñaut Elorrieta",
      "Olatz Salvador",
      "Bon Iver",
      "Ben Howard",
      "Passenger",
      "Boygenius",
      "Khruangbin",
      "Phoebe Bridgers",
      "Sufjan Stevens",
      "Fleet Foxes",
      "Vance Joy",
    ],
    targetKeywords: ["indie folk", "acoustic", "singer-songwriter", "indie acoustic", "mellow", "chamber folk"],
    // Exclude traditional/world folk ensembles or classic rock/heavy folk to avoid theme dilution
    excludedArtists: ["Folk & Rackare", "Benito Lertxundi", "Su Ta Gar", "Kortatu", "Nirvana", "Dua Lipa"],
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

export async function generateDailyMixes(
  syncKey: string = "default",
  seedValue?: string
): Promise<DailyMix[]> {
  const seedNum = seedValue ? stringSeedHash(seedValue) : Math.floor(Date.now() / (1000 * 60 * 60 * 12)); // Changes at least twice a day or on manual refresh

  // 1. Gather all local catalog tracks
  const allDbTracks = await db.select().from(tracks).limit(1000);
  const mappedCatalog: Track[] = allDbTracks.map(mapTrack);

  // 2. Gather user personal signals
  const listenedRows = await db
    .select({ trackId: listenEvents.trackId, count: sql<number>`COUNT(${listenEvents.id})::int` })
    .from(listenEvents)
    .where(eq(listenEvents.syncKey, syncKey))
    .groupBy(listenEvents.trackId)
    .orderBy(desc(sql`COUNT(${listenEvents.id})`))
    .limit(100);
  const listenedTrackIds = new Set((listenedRows as { trackId: number }[]).map((r) => r.trackId));

  const likedRows = await db
    .select({ trackId: likedTracks.trackId })
    .from(likedTracks)
    .where(eq(likedTracks.syncKey, syncKey));
  const likedTrackIds = new Set((likedRows as { trackId: number }[]).map((r) => r.trackId));

  const followedRows = await db
    .select({ artistId: followedArtists.artistId })
    .from(followedArtists)
    .where(eq(followedArtists.syncKey, syncKey));
  const followedArtistIds = new Set((followedRows as { artistId: number }[]).map((r) => r.artistId));

  const userPlaylistTrackRows = await db
    .select({ trackId: playlistTracks.trackId })
    .from(playlistTracks)
    .innerJoin(playlists, eq(playlistTracks.playlistId, playlists.id))
    .where(eq(playlists.syncKey, syncKey))
    .limit(150);
  const playlistTrackIds = new Set((userPlaylistTrackRows as { trackId: number }[]).map((r) => r.trackId));

  // Build each daily mix
  const mixes: DailyMix[] = DAILY_MIX_DEFINITIONS.map((def, mixIndex) => {
    // Determine candidate pool
    let candidatePool = mappedCatalog;

    if (def.strictBasqueOnly) {
      // Mix 1: ONLY Basque artists and Basque language songs!
      candidatePool = mappedCatalog.filter((t) => {
        const artist = t.artistName.toLowerCase();
        const isBasqueArtist = BASQUE_ARTISTS.some((ba) => artist.includes(ba.toLowerCase()));
        const isBasqueLang = (t as any).language === "eu" || (t as any).region === "eu";
        const isBasqueGenre =
          (t.genre || "").toLowerCase().includes("euskal") ||
          (t.genre || "").toLowerCase().includes("basque") ||
          (t.genre || "").toLowerCase().includes("trikitia");
        return isBasqueArtist || isBasqueLang || isBasqueGenre;
      });
    }

    // Exclude forbidden artists from this theme
    if (def.excludedArtists && def.excludedArtists.length > 0) {
      candidatePool = candidatePool.filter((t) => {
        const aLow = t.artistName.toLowerCase();
        return !def.excludedArtists.some((ex) => aLow.includes(ex.toLowerCase()));
      });
    }

    // Score tracks in candidate pool
    const scored = candidatePool.map((t) => {
      let score = 0;
      const normArtist = t.artistName.toLowerCase();
      const normTitle = t.title.toLowerCase();
      const normGenre = (t.genre || "").toLowerCase();

      // Direct target artist match (+60)
      const targetArtistHit = def.targetArtists.some((a) => normArtist.includes(a.toLowerCase()));
      if (targetArtistHit) {
        score += 60;
      }

      // Target keyword match (+30)
      if (def.targetKeywords.some((k) => normGenre.includes(k) || normTitle.includes(k))) {
        score += 30;
      }

      // User affinity signals
      if (likedTrackIds.has(t.id)) score += 35;
      if (listenedTrackIds.has(t.id)) score += 30;
      if (playlistTrackIds.has(t.id)) score += 20;
      if (t.artistId && followedArtistIds.has(t.artistId)) score += 25;

      // Seed-based dynamic pseudo-random offset for variety on refresh/update
      // Uses the passed seedNum + track id + mix index
      const dynamicRandom = ((t.id * 37 + seedNum * 13 + mixIndex * 101) % 43);
      score += dynamicRandom;

      return { track: t, score, isTarget: targetArtistHit };
    });

    // Sort descending by score
    const sortedCandidates = scored
      .filter((s) => s.score > 25 || s.isTarget)
      .sort((a, b) => b.score - a.score);

    // ARTIST VARIETY CAP: Maximum 2 tracks per artist per Daily Mix!
    const MAX_TRACKS_PER_ARTIST = 2;
    const artistCountMap = new Map<string, number>();
    const selectedTracks: Track[] = [];

    for (const { track } of sortedCandidates) {
      const artKey = track.artistName.toLowerCase().trim();
      const currentCount = artistCountMap.get(artKey) || 0;
      if (currentCount < MAX_TRACKS_PER_ARTIST) {
        selectedTracks.push(track);
        artistCountMap.set(artKey, currentCount + 1);
      }
      if (selectedTracks.length >= 18) break;
    }

    // If still under 14 tracks, relax to 3 tracks per artist from target pool
    if (selectedTracks.length < 14) {
      for (const { track } of sortedCandidates) {
        if (selectedTracks.some((s) => s.id === track.id)) continue;
        const artKey = track.artistName.toLowerCase().trim();
        const currentCount = artistCountMap.get(artKey) || 0;
        if (currentCount < 3) {
          selectedTracks.push(track);
          artistCountMap.set(artKey, currentCount + 1);
        }
        if (selectedTracks.length >= 16) break;
      }
    }

    // Dynamic subtitle based on unique top artists in this mix
    const uniqueArtists = Array.from(new Set(selectedTracks.map((t) => t.artistName)));
    const topArtistsList = uniqueArtists.slice(0, 4);
    const subtitle = topArtistsList.length > 0 ? `${topArtistsList.join(", ")} and more` : def.genreLabel;

    return {
      id: def.id,
      title: def.title,
      subtitle,
      description: def.description,
      accentColor: def.accentColor,
      genre: def.genreLabel,
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
