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
    ],
    targetKeywords: ["euskal", "basque", "trikitia", "euskara", "folk", "rock"],
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
      "Tame Impala",
      "Fleetwood Mac",
      "Arctic Monkeys",
      "Nirvana",
      "Queen",
      "Red Hot Chili Peppers",
      "The Strokes",
      "Muse",
      "Foo Fighters",
      "Radiohead",
      "Belako",
      "Doctor Deseo",
    ],
    targetKeywords: ["rock", "punk", "alternative", "hard rock", "metal", "grunge", "indie rock"],
  },
  {
    id: "daily-mix-3",
    title: "Daily Mix 3",
    genreLabel: "Top Hits & Pop Vibes",
    accentColor: "from-violet-600/50 via-purple-900/40 to-black/90",
    pillColor: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    description: "Modern chart-toppers, dance pop, and energetic electronic grooves.",
    strictBasqueOnly: false,
    targetArtists: [
      "Dua Lipa",
      "Rosalía",
      "Olivia Rodrigo",
      "Fred again..",
      "Daft Punk",
      "The Weeknd",
      "Harry Styles",
      "Aitana",
      "Coldplay",
      "Bulego",
      "ZETAK",
      "Billie Eilish",
      "C. Tangana",
      "Taylor Swift",
    ],
    targetKeywords: ["pop", "dance", "electronic", "synth", "house", "chart", "hits"],
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
      "Bon Iver",
      "Khruangbin",
      "Izaro",
      "Boygenius",
      "Oreka TX",
      "Kepa Junkera",
      "Mikel Laboa",
      "Anari",
      "Ben Howard",
      "Ed Sheeran",
      "Passenger",
      "Olaia Inziarte",
      "Benito Lertxundi",
      "Ruper Ordorika",
    ],
    targetKeywords: ["folk", "acoustic", "indie", "chill", "mellow", "singer-songwriter", "trikitia"],
  },
];

export async function generateDailyMixes(syncKey: string = "default"): Promise<DailyMix[]> {
  // 1. Gather all local catalog tracks
  const allDbTracks = await db.select().from(tracks).limit(800);
  const mappedCatalog: Track[] = allDbTracks.map(mapTrack);

  // 2. Gather user personal signals
  const listenedRows = await db
    .select({ trackId: listenEvents.trackId, count: sql<number>`COUNT(${listenEvents.id})::int` })
    .from(listenEvents)
    .where(eq(listenEvents.syncKey, syncKey))
    .groupBy(listenEvents.trackId)
    .orderBy(desc(sql`COUNT(${listenEvents.id})`))
    .limit(80);
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
    .limit(100);
  const playlistTrackIds = new Set((userPlaylistTrackRows as { trackId: number }[]).map((r) => r.trackId));

  // Build each daily mix
  const mixes: DailyMix[] = DAILY_MIX_DEFINITIONS.map((def) => {
    // Determine candidate pool
    let candidatePool = mappedCatalog;
    if (def.strictBasqueOnly) {
      // Mix 1: ONLY Basque artists and Basque language songs!
      candidatePool = mappedCatalog.filter((t) => {
        const artist = t.artistName.toLowerCase();
        const isBasqueArtist = BASQUE_ARTISTS.some((ba) => artist.includes(ba.toLowerCase()));
        const isBasqueLang = (t as any).language === "eu" || (t as any).region === "eu";
        const isBasqueGenre = (t.genre || "").toLowerCase().includes("euskal") || (t.genre || "").toLowerCase().includes("basque");
        return isBasqueArtist || isBasqueLang || isBasqueGenre;
      });
    }

    // Score tracks in candidate pool
    const scored = candidatePool.map((t) => {
      let score = 0;
      const normArtist = t.artistName.toLowerCase();
      const normTitle = t.title.toLowerCase();
      const normGenre = (t.genre || "").toLowerCase();

      // Target artist match (+50)
      if (def.targetArtists.some((a) => normArtist.includes(a.toLowerCase()))) {
        score += 50;
      }

      // Target keyword match (+25)
      if (def.targetKeywords.some((k) => normGenre.includes(k) || normTitle.includes(k) || normArtist.includes(k))) {
        score += 25;
      }

      // User affinity signals
      if (likedTrackIds.has(t.id)) score += 35;
      if (listenedTrackIds.has(t.id)) score += 30;
      if (playlistTrackIds.has(t.id)) score += 20;
      if (t.artistId && followedArtistIds.has(t.artistId)) score += 15;

      // Small deterministic pseudo-random seed to keep tracks refreshed
      const seed = (t.id * 19 + def.id.charCodeAt(def.id.length - 1)) % 10;
      score += seed;

      return { track: t, score };
    });

    // Sort descending by score
    let selected = scored
      .filter((s) => s.score > 20)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.track);

    // If still short, pull from candidate pool matching the cluster's artists/keywords
    if (selected.length < 12) {
      const remainingCandidates = candidatePool.filter((t) => !selected.some((s) => s.id === t.id));
      const backupFiltered = remainingCandidates.filter((t) => {
        const artist = t.artistName.toLowerCase();
        const genre = (t.genre || "").toLowerCase();
        return (
          def.targetArtists.some((a) => artist.includes(a.toLowerCase())) ||
          def.targetKeywords.some((k) => genre.includes(k))
        );
      });
      selected = [...selected, ...backupFiltered.slice(0, 15 - selected.length)];
    }

    // Guarantee at least 10 tracks, max 20
    const finalTracks = selected.slice(0, 18);

    // Dynamic subtitle based on unique artists
    const uniqueArtists = Array.from(new Set(finalTracks.map((t) => t.artistName)));
    const top3 = uniqueArtists.slice(0, 3);
    const subtitle = top3.length > 0 ? `${top3.join(", ")} and more` : def.genreLabel;

    return {
      id: def.id,
      title: def.title,
      subtitle,
      description: def.description,
      accentColor: def.accentColor,
      genre: def.genreLabel,
      tracks: finalTracks,
    };
  });

  return mixes;
}

export async function getDailyMixById(mixId: string, syncKey: string = "default"): Promise<DailyMix | null> {
  const mixes = await generateDailyMixes(syncKey);
  return mixes.find((m) => m.id === mixId) || null;
}
