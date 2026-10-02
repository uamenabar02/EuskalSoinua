export interface UserTastePreferences {
  genres?: string[];
  regions?: string[];
  favoriteArtists?: string[];
  energy?: number; // 1 = Acoustic/Ambient, 2 = Mellow/Chill, 3 = Balanced, 4 = Upbeat/Driving, 5 = High Voltage/Club
  discoveryMode?: "comfort" | "balanced" | "adventurous";
  eras?: string[]; // "roots_70s_80s" | "classics_90s_00s" | "modern_10s" | "contemporary_20s"
  languagePreference?: "global" | "multilingual" | "euskara_first";
  moods?: string[]; // "focus" | "chill" | "workout" | "road_trip" | "party" | "introspective"
}

export interface UserTasteProfile {
  preferences: UserTastePreferences;
  preferredGenres: string[];
  preferredRegions: string[];
  favoriteArtists: string[];
  energy: number;
  discoveryMode: "comfort" | "balanced" | "adventurous";
  eras: string[];
  languagePreference: "global" | "multilingual" | "euskara_first";
  moods: string[];
  likedTrackIds: Set<number>;
  followedArtistIds: Set<number>;
  followedArtistNames: Set<string>;
  savedAlbumIds: Set<number>;
  likedTracksCount: number;
  swipeLikesCount: number;
  swipeDislikesCount: number;
  recentListenedTrackIds: Set<number>;
}

export interface GenreOption {
  id: string;
  label: string;
  category: "basque" | "urban" | "electronic" | "rock_punk" | "indie" | "pop" | "folk_global" | "jazz_soul" | "cinematic";
  categoryLabel: string;
  badge?: string;
  description?: string;
}

export const CURATED_GENRE_OPTIONS: GenreOption[] = [
  // 1. Basque & Regional
  { id: "Basque Urban Pop", label: "Basque Urban Pop", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Bengo, ZETAK & modern melodic Basque hooks" },
  { id: "Basque Synth Pop", label: "Basque Synth Pop", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Electronic pop and synthesizers in Basque" },
  { id: "Basque Urban/Trap", label: "Basque Urban / Trap", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Tatta, contemporary Basque trap and autotune flow" },
  { id: "Basque Indie Pop", label: "Basque Indie Pop", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Izaro, intimate songwriting and lush vocal arrangements" },
  { id: "Basque Indie", label: "Basque Indie", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Olaia Inziarte & experimental regional indie" },
  { id: "Basque Alt Rock", label: "Basque Alt Rock", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Anari & deep poetic Basque alternative rock" },
  { id: "Basque Street Punk", label: "Basque Street Punk", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Streetwise & heavy Iruñea streetpunk anthems" },
  { id: "Basque Folk Punk", label: "Basque Folk Punk", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Bizardunak & energetic folk-punk accordion drives" },
  { id: "Basque Post-Punk", label: "Basque Post-Punk", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Belako & hypnotic guitar-driven post-punk" },
  { id: "Basque Fusion", label: "Basque Fusion", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "La Txama & Latin/Basque rhythmic crossover" },
  { id: "Euskal Rock", label: "Euskal Rock Erradikala", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Berri Txarrak, Kortatu, Gatibu & legendary rock" },
  { id: "Trikitia", label: "Trikitixa & Folk", category: "basque", categoryLabel: "Basque & Regional", badge: "Euskara", description: "Kepa Junkera, Huntza & modern accordion melodies" },

  // 2. Urban, Hip-Hop & Trap (Global)
  { id: "Hip-Hop", label: "Hip-Hop & Rap", category: "urban", categoryLabel: "Urban & Hip-Hop", badge: "Global", description: "Classic beats, conscious rap and lyrical storytelling" },
  { id: "Trap", label: "Trap & Drill", category: "urban", categoryLabel: "Urban & Hip-Hop", badge: "Global", description: "Heavy 808s, rolling hi-hats and modern urban flow" },
  { id: "R&B / Soul", label: "R&B & Neo-Soul", category: "urban", categoryLabel: "Urban & Hip-Hop", badge: "Global", description: "Velvet vocals, contemporary grooves and smooth hooks" },
  { id: "Afrobeats", label: "Afrobeats & Dancehall", category: "urban", categoryLabel: "Urban & Hip-Hop", badge: "Global", description: "West African rhythms, syncopated bounce and feel-good heat" },
  { id: "Latin Urban", label: "Latin Urban & Reggaeton", category: "urban", categoryLabel: "Urban & Hip-Hop", badge: "Global", description: "Rosalía, Bad Bunny, dembow rhythms and tropical urban vibes" },

  // 3. Electronic & Dance (Global)
  { id: "Electronic", label: "Electronic & House", category: "electronic", categoryLabel: "Electronic & Dance", badge: "Global", description: "Daft Punk, four-on-the-floor, club anthems and deep grooves" },
  { id: "Techno", label: "Techno & Minimal", category: "electronic", categoryLabel: "Electronic & Dance", badge: "Global", description: "Hypnotic synth loops, driving kick drums and warehouse energy" },
  { id: "Synthwave", label: "Synthwave & Retro Electro", category: "electronic", categoryLabel: "Electronic & Dance", badge: "Global", description: "80s retro-futuristic synthesizers and neon night drives" },
  { id: "Ambient", label: "Ambient & Downtempo", category: "electronic", categoryLabel: "Electronic & Dance", badge: "Global", description: "Atmospheric textures, soundscapes and meditation spaces" },
  { id: "Drum & Bass", label: "Drum & Bass / Jungle", category: "electronic", categoryLabel: "Electronic & Dance", badge: "Global", description: "High-tempo breakbeats, reese basslines and underground energy" },

  // 4. Indie & Alternative (Global)
  { id: "Indie Rock", label: "Indie Rock", category: "indie", categoryLabel: "Indie & Alternative", badge: "Global", description: "Arctic Monkeys, Radiohead, chiming guitars and memorable melodies" },
  { id: "Post-Punk", label: "Post-Punk & Darkwave", category: "indie", categoryLabel: "Indie & Alternative", badge: "Global", description: "The Cure, brooding basslines, angular guitars and gothic cool" },
  { id: "Shoegaze", label: "Shoegaze & Dream Pop", category: "indie", categoryLabel: "Indie & Alternative", badge: "Global", description: "Walls of fuzz, reverb-drenched vocals and ethereal harmonies" },
  { id: "Alt Rock", label: "90s / 00s Alternative Rock", category: "indie", categoryLabel: "Indie & Alternative", badge: "Global", description: "Grunge dynamics, loud-quiet-loud transitions and anthemic hooks" },

  // 5. Rock, Punk & Metal (Global)
  { id: "Classic Rock", label: "Classic Rock", category: "rock_punk", categoryLabel: "Rock & Punk", badge: "Global", description: "Vintage guitar riffs, stadium solos and blues-rock roots" },
  { id: "Punk", label: "Punk Rock & Hardcore", category: "rock_punk", categoryLabel: "Rock & Punk", badge: "Global", description: "Raw three-chord energy, rebel anthems and fast-paced grit" },
  { id: "Metal", label: "Heavy Metal & Progressive", category: "rock_punk", categoryLabel: "Rock & Punk", badge: "Global", description: "Distorted power riffs, double-bass drumming and technical shredding" },

  // 6. Pop & Modern (Global)
  { id: "Pop", label: "Global Pop & Dance Pop", category: "pop", categoryLabel: "Pop & Modern", badge: "Global", description: "Dua Lipa, Billie Eilish, infectious hooks and crystal-clear production" },
  { id: "Electropop", label: "Electropop & Hyperpop", category: "pop", categoryLabel: "Pop & Modern", badge: "Global", description: "Maximalist synths, glitchy vocals and high-speed pop energy" },

  // 7. Folk, Global Roots & Acoustic
  { id: "Folk", label: "Acoustic & Singer-Songwriter", category: "folk_global", categoryLabel: "Folk & Acoustic", badge: "Global", description: "Organic guitars, intimate storytelling, strings and pure emotion" },
  { id: "Flamenco / Fusion", label: "Flamenco & Mediterranean", category: "folk_global", categoryLabel: "Folk & Acoustic", badge: "Global", description: "Spanish guitar passion, palmas and contemporary fusion" },
  { id: "Reggae", label: "Reggae & Dub", category: "folk_global", categoryLabel: "Folk & Acoustic", badge: "Global", description: "Warm offbeat skanks, heavy basslines and roots vibrations" },

  // 8. Jazz, Soul & Lo-Fi
  { id: "Jazz", label: "Jazz & Blues", category: "jazz_soul", categoryLabel: "Jazz & Lo-Fi", badge: "Global", description: "Improvisation, brass solos, swing feel and smoky late-night tone" },
  { id: "Lo-Fi", label: "Lo-Fi & Study Beats", category: "jazz_soul", categoryLabel: "Jazz & Lo-Fi", badge: "Global", description: "Dusty vinyl crackle, mellow piano chords and chill relaxation" },
  { id: "Funk", label: "Funk & Disco Groove", category: "jazz_soul", categoryLabel: "Jazz & Lo-Fi", badge: "Global", description: "Slap bass, syncopated horns and irresistible dancefloor rhythm" },

  // 9. Classical & Cinematic
  { id: "Classical", label: "Modern Classical & Piano", category: "cinematic", categoryLabel: "Cinematic & Strings", badge: "Global", description: "Ludovico Einaudi, neoclassical piano, orchestral arrangements and focus" },
  { id: "Cinematic", label: "Soundtrack & Cinematic Scores", category: "cinematic", categoryLabel: "Cinematic & Strings", badge: "Global", description: "Hans Zimmer style epic builds, sweeping brass and narrative tension" },
];

export const CURATED_ARTIST_PICKS = [
  // Ground Truth Basque Artists (Definition of Done)
  { name: "Bengo", genre: "Basque Urban Pop", isBasque: true, tag: "Urban Pop" },
  { name: "ZETAK", genre: "Basque Synth Pop", isBasque: true, tag: "Synth Pop" },
  { name: "Izaro", genre: "Basque Indie Pop", isBasque: true, tag: "Indie Pop" },
  { name: "Tatta", genre: "Basque Urban/Trap", isBasque: true, tag: "Urban Trap" },
  { name: "Belako", genre: "Basque Post-Punk", isBasque: true, tag: "Post-Punk" },
  { name: "La Txama", genre: "Basque Fusion", isBasque: true, tag: "Fusion" },
  { name: "Anari", genre: "Basque Alt Rock", isBasque: true, tag: "Alt Rock" },
  { name: "Streetwise", genre: "Basque Street Punk", isBasque: true, tag: "Street Punk" },
  { name: "Bizardunak", genre: "Basque Folk Punk", isBasque: true, tag: "Folk Punk" },
  { name: "Olaia Inziarte", genre: "Basque Indie", isBasque: true, tag: "Indie" },
  // Celebrated Basque Icons
  { name: "Berri Txarrak", genre: "Euskal Rock", isBasque: true, tag: "Rock" },
  { name: "Gatibu", genre: "Euskal Rock", isBasque: true, tag: "Rock" },
  { name: "Kortatu", genre: "Ska Punk", isBasque: true, tag: "Punk" },
  { name: "Huntza", genre: "Folk", isBasque: true, tag: "Folk" },
  { name: "ETS", genre: "Euskal Pop", isBasque: true, tag: "Pop" },
  { name: "Bulego", genre: "Euskal Pop", isBasque: true, tag: "Pop" },
  // Universal Global Icons
  { name: "Daft Punk", genre: "Electronic", isBasque: false, tag: "Electronic" },
  { name: "The Cure", genre: "Post-Punk", isBasque: false, tag: "Post-Punk" },
  { name: "Radiohead", genre: "Alt Rock", isBasque: false, tag: "Alt Rock" },
  { name: "Billie Eilish", genre: "Pop", isBasque: false, tag: "Pop" },
  { name: "Kendrick Lamar", genre: "Hip-Hop", isBasque: false, tag: "Hip-Hop" },
  { name: "Rosalía", genre: "Latin Urban", isBasque: false, tag: "Urban" },
  { name: "Arctic Monkeys", genre: "Indie Rock", isBasque: false, tag: "Indie" },
  { name: "Gorillaz", genre: "Alternative", isBasque: false, tag: "Alternative" },
  { name: "Fred again..", genre: "Electronic", isBasque: false, tag: "House" },
  { name: "Dua Lipa", genre: "Pop", isBasque: false, tag: "Dance Pop" },
  { name: "Tyler, The Creator", genre: "Hip-Hop", isBasque: false, tag: "Hip-Hop" },
  { name: "Tame Impala", genre: "Psychedelic Pop", isBasque: false, tag: "Psychedelic" },
  { name: "Bad Bunny", genre: "Latin Urban", isBasque: false, tag: "Reggaeton" },
  { name: "Khruangbin", genre: "Psychedelic Funk", isBasque: false, tag: "Funk / Groove" },
  { name: "Massive Attack", genre: "Trip-Hop", isBasque: false, tag: "Trip-Hop" },
  { name: "Bon Iver", genre: "Indie Folk", isBasque: false, tag: "Acoustic" },
];

export const CURATED_MOODS = [
  { id: "focus", label: "Deep Focus & Study", icon: "🧠", description: "Steady rhythms, instrumental depth and low distraction" },
  { id: "chill", label: "Chill & Late Night", icon: "🌙", description: "Smooth downtempo, mellow melodies and relaxing vibes" },
  { id: "workout", label: "Cardio & Workout", icon: "⚡", description: "High-bpm drivers, heavy kicks and energizing anthems" },
  { id: "road_trip", label: "Road Trip & Travel", icon: "🚗", description: "Sing-along choruses, dynamic transitions and open road spirit" },
  { id: "party", label: "Social & Party", icon: "🎉", description: "Dancefloor favorites, upbeat grooves and crowd pleasers" },
  { id: "introspective", label: "Soulful & Acoustic", icon: "🕯️", description: "Emotional lyrics, raw acoustic performances and intimate warmth" },
];

export const CURATED_ERAS = [
  { id: "roots_70s_80s", label: "70s & 80s Roots", icon: "📻", subtitle: "Analog vintage, rock radicals & golden pioneers" },
  { id: "classics_90s_00s", label: "90s & 00s Anthems", icon: "📼", subtitle: "Alt-rock boom, grunge, ska-punk & millennium classics" },
  { id: "modern_10s", label: "2010s Modern Waves", icon: "💿", subtitle: "Indie pop explosion, synthwave & streaming era sounds" },
  { id: "contemporary_20s", label: "2020s Fresh Drops", icon: "✨", subtitle: "Cutting-edge urban pop, trap, hyperpop & fresh viral releases" },
];

export const CURATED_REGIONS = [
  { id: "eu", name: "Basque Country (Euskal Herria)", flag: "🔴⚪🟢", description: "Basque urban, rock, trikitixa & regional language culture" },
  { id: "global", name: "Global & International", flag: "🌐", description: "Worldwide streaming hits, UK/US charts, international indie" },
  { id: "es", name: "Iberian & Spanish Scene", flag: "🇪🇸", description: "Indie español, flamenco fusion, Latin crossover" },
  { id: "latam", name: "Latin America & Caribbean", flag: "🌎", description: "Reggaeton, dembow, cumbia and Latin alternative" },
  { id: "uk", name: "United Kingdom & Ireland", flag: "🇬🇧", description: "Britpop, UK drill, drum & bass and post-punk heritage" },
  { id: "us", name: "North America (US & Canada)", flag: "🇺🇸", description: "Hip-hop, R&B, modern pop and US alternative" },
];
