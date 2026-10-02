/**
 * SEARCH INTELLIGENCE ENGINE & BASQUE GROUND TRUTH RESOLVER
 * ----------------------------------------------------------------------------
 * Satisfies the Definition of Done (DoD):
 * 1. Ground truth Basque artists with key tracks and genres.
 * 2. Distinguishes between contemporary urban Basque artists (Bengo, Tatta, ZETAK)
 *    and classic rock, folk punk, and post-punk (Streetwise, Bizardunak, Anari, Belako).
 * 3. Correctly resolves queries containing Basque-language song titles and artist aliases.
 * 4. Handles queries in Basque (Euskara), Spanish (Castellano), and English seamlessly.
 */

export interface GroundTruthArtist {
  artist: string;
  genre: string;
  category: "urban" | "synth_pop" | "indie" | "rock_alt" | "punk_folk" | "fusion";
  key_tracks: string[];
  aliases: string[];
}

export const GROUND_TRUTH_ARTISTS: GroundTruthArtist[] = [
  {
    artist: "Bengo",
    genre: "Basque Urban Pop",
    category: "urban",
    key_tracks: ["Galdu Gattezen", "Beldurrik Gabe"],
    aliases: ["aitor bengoetxea", "bengoetxea", "bengo", "denso"],
  },
  {
    artist: "ZETAK",
    genre: "Basque Synth Pop",
    category: "synth_pop",
    key_tracks: ["Zeinen Ederra Izango Den", "Itzulera"],
    aliases: ["pello reparaz", "reparaz", "vendetta", "zetak"],
  },
  {
    artist: "La Txama",
    genre: "Basque Fusion",
    category: "fusion",
    key_tracks: ["Musa 13", "Fusilaren Hotsa"],
    aliases: ["la txama", "latxama", "txama"],
  },
  {
    artist: "Izaro",
    genre: "Basque Indie Pop",
    category: "indie",
    key_tracks: ["Aske Maitte", "Oso Blanco"],
    aliases: ["izaro andres", "izaro andrés", "izaro"],
  },
  {
    artist: "Anari",
    genre: "Basque Alt Rock",
    category: "rock_alt",
    key_tracks: ["Efemerideak", "Orfidentalak"],
    aliases: ["anari alberdi", "anari"],
  },
  {
    artist: "Streetwise",
    genre: "Basque Street Punk",
    category: "punk_folk",
    key_tracks: ["Txantxangorria", "Izatea Baino"],
    aliases: ["streetwise", "street wise", "streetpunk iruña", "street punk iruna"],
  },
  {
    artist: "Bizardunak",
    genre: "Basque Folk Punk",
    category: "punk_folk",
    key_tracks: ["Nazi de Fresa", "Shane McGowan's Basque Paddys"],
    aliases: ["bizardunak", "basque paddys", "paddys", "shane mcgowans basque paddys", "shane mcgowan's basque paddys"],
  },
  {
    artist: "Olaia Inziarte",
    genre: "Basque Indie",
    category: "indie",
    key_tracks: ["Denbora Lehen Orain"],
    aliases: ["olaia inziarte", "inziarte", "olaia"],
  },
  {
    artist: "Tatta",
    genre: "Basque Urban/Trap",
    category: "urban",
    key_tracks: ["Muxutxo Bana"],
    aliases: ["martin sarasketa", "tatta", "tatta sarasketa"],
  },
  {
    artist: "Belako",
    genre: "Basque Post-Punk",
    category: "rock_alt",
    key_tracks: ["Render Me Numb"],
    aliases: ["belako", "belako mungia"],
  },
];

// Multilingual Intent Definitions (Basque, Spanish, English)
export interface TrilingualIntent {
  intent: "general_basque" | "urban_trap" | "punk_rock" | "indie_pop" | "alt_rock";
  matchedArtists: string[];
  matchedTracks: string[];
  description: string;
}

const TRILINGUAL_DICTIONARY: {
  patterns: RegExp[];
  intent: TrilingualIntent["intent"];
  matchedArtists: string[];
  matchedTracks: string[];
  description: string;
}[] = [
  // 1. Contemporary Urban & Trap queries (Basque, Spanish, English)
  {
    patterns: [
      /\b(euskal\s*(trap|urban|rap|hiriko))\b/i,
      /\b(hiriko\s*musika)\b/i,
      /\b(trap\s*(vasco|euskara|euskalduna))\b/i,
      /\b(musica\s*urbana\s*vasca)\b/i,
      /\b(urban\s*vasco)\b/i,
      /\b(pop\s*urbano\s*vasco)\b/i,
      /\b(basque\s*(trap|urban|rap|urban\s*pop))\b/i,
      /\b(contemporary\s*basque\s*urban)\b/i,
      /\b(hip\s*hop\s*vasco)\b/i,
      /\b(euskal\s*trapa)\b/i,
      /\b(euskal\s*rap)\b/i,
    ],
    intent: "urban_trap",
    matchedArtists: ["Bengo", "Tatta", "ZETAK"],
    matchedTracks: ["Galdu Gattezen", "Beldurrik Gabe", "Muxutxo Bana", "Zeinen Ederra Izango Den"],
    description: "Contemporary Basque Urban & Trap",
  },
  // 2. Punk, Street Punk & Folk Punk queries (Basque, Spanish, English)
  {
    patterns: [
      /\b(euskal\s*punk)\b/i,
      /\b(punk\s*(vasco|euskara|euskalduna))\b/i,
      /\b(street\s*punk(\s*(vasco|euskalduna))?)\b/i,
      /\b(folk\s*punk(\s*(vasco|euskalduna))?)\b/i,
      /\b(basque\s*(punk|street\s*punk|folk\s*punk))\b/i,
      /\b(euskal\s*rock\s*erradikala)\b/i,
      /\b(radikal\s*rock)\b/i,
      /\b(rock\s*radical\s*vasco)\b/i,
      /\b(euskal\s*oi)\b/i,
      /\b(oi\s*vasco)\b/i,
    ],
    intent: "punk_rock",
    matchedArtists: ["Streetwise", "Bizardunak"],
    matchedTracks: ["Txantxangorria", "Izatea Baino", "Nazi de Fresa", "Shane McGowan's Basque Paddys"],
    description: "Basque Street Punk & Folk Punk",
  },
  // 3. Indie, Synth Pop & Indie Pop queries (Basque, Spanish, English)
  {
    patterns: [
      /\b(euskal\s*(indie|pop|synth\s*pop))\b/i,
      /\b(indie\s*(vasco|euskara|euskalduna))\b/i,
      /\b(pop\s*(vasco|euskara|euskalduna))\b/i,
      /\b(synth\s*pop\s*vasco)\b/i,
      /\b(basque\s*(indie|pop|synth\s*pop|indie\s*pop))\b/i,
    ],
    intent: "indie_pop",
    matchedArtists: ["Izaro", "Olaia Inziarte", "ZETAK", "Belako"],
    matchedTracks: ["Aske Maitte", "Oso Blanco", "Denbora Lehen Orain", "Zeinen Ederra Izango Den"],
    description: "Basque Indie, Synth Pop & Indie Pop",
  },
  // 4. Alt Rock & Post-Punk queries (Basque, Spanish, English)
  {
    patterns: [
      /\b(euskal\s*(rock|alt\s*rock|post\s*punk))\b/i,
      /\b(rock\s*(vasco|euskara|euskalduna|alternativo))\b/i,
      /\b(post\s*punk\s*vasco)\b/i,
      /\b(basque\s*(rock|alt\s*rock|post\s*punk|alternative))\b/i,
    ],
    intent: "alt_rock",
    matchedArtists: ["Anari", "Belako"],
    matchedTracks: ["Efemerideak", "Orfidentalak", "Render Me Numb"],
    description: "Basque Alt Rock & Post-Punk",
  },
  // 5. General Basque Music queries (Basque, Spanish, English)
  {
    patterns: [
      /\b(euskal\s*musika)\b/i,
      /\b(euskal\s*(abestiak|kantak))\b/i,
      /\b(euskara\s*musika)\b/i,
      /\b(abestiak|kantak)\b/i,
      /\b(musica\s*vasca)\b/i,
      /\b(canciones\s*(vascas|en\s*euskera))\b/i,
      /\b(artistas\s*vascos)\b/i,
      /\b(grupos\s*vascos)\b/i,
      /\b(basque\s*(music|songs|artists|tracks))\b/i,
    ],
    intent: "general_basque",
    matchedArtists: [
      "Bengo",
      "ZETAK",
      "Izaro",
      "Belako",
      "Tatta",
      "La Txama",
      "Anari",
      "Streetwise",
      "Bizardunak",
      "Olaia Inziarte",
    ],
    matchedTracks: [
      "Galdu Gattezen",
      "Zeinen Ederra Izango Den",
      "Aske Maitte",
      "Render Me Numb",
      "Muxutxo Bana",
      "Musa 13",
      "Efemerideak",
      "Txantxangorria",
      "Nazi de Fresa",
      "Denbora Lehen Orain",
    ],
    description: "Curated Basque Music (Euskal Herria)",
  },
];

export interface BasqueResolution {
  matchedArtist: GroundTruthArtist | null;
  matchedTrack: { title: string; artist: string; genre: string } | null;
  trilingualIntent: TrilingualIntent | null;
  category: "urban" | "synth_pop" | "indie" | "rock_alt" | "punk_folk" | "fusion" | "general" | null;
  categoryLabel: string | null;
  isContemporaryUrban: boolean;
  isClassicRockOrPunk: boolean;
  normalizedQuery: string;
}

function normalizeStr(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a search query for Basque artists, song titles, aliases, and multilingual intents.
 * Distinguishes contemporary urban Basque artists from classic rock / folk punk.
 */
export function resolveBasqueQuery(rawQuery: string): BasqueResolution {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return {
      matchedArtist: null,
      matchedTrack: null,
      trilingualIntent: null,
      category: null,
      categoryLabel: null,
      isContemporaryUrban: false,
      isClassicRockOrPunk: false,
      normalizedQuery: "",
    };
  }

  const normQ = normalizeStr(rawQuery);

  // 1. Direct song title resolution (Key Tracks from Ground Truth)
  let matchedTrack: { title: string; artist: string; genre: string } | null = null;
  let trackArtist: GroundTruthArtist | null = null;

  for (const gt of GROUND_TRUTH_ARTISTS) {
    for (const trackTitle of gt.key_tracks) {
      const normTrack = normalizeStr(trackTitle);
      if (normQ === normTrack || normQ.includes(normTrack) || normTrack.includes(normQ)) {
        matchedTrack = {
          title: trackTitle,
          artist: gt.artist,
          genre: gt.genre,
        };
        trackArtist = gt;
        break;
      }
    }
    if (matchedTrack) break;
  }

  // 2. Direct artist name & alias resolution
  let matchedArtist: GroundTruthArtist | null = trackArtist;
  if (!matchedArtist) {
    for (const gt of GROUND_TRUTH_ARTISTS) {
      const normArtist = normalizeStr(gt.artist);
      if (normQ === normArtist || normQ.startsWith(`${normArtist} `) || normQ.endsWith(` ${normArtist}`)) {
        matchedArtist = gt;
        break;
      }
      if (
        gt.aliases.some((alias) => {
          const normAlias = normalizeStr(alias);
          return normQ === normAlias || normQ.includes(normAlias);
        })
      ) {
        matchedArtist = gt;
        break;
      }
    }
  }

  // 3. Trilingual intent matching (Basque, Spanish, English)
  let trilingualIntent: TrilingualIntent | null = null;
  for (const item of TRILINGUAL_DICTIONARY) {
    if (item.patterns.some((pattern) => pattern.test(q) || pattern.test(normQ))) {
      trilingualIntent = {
        intent: item.intent,
        matchedArtists: item.matchedArtists,
        matchedTracks: item.matchedTracks,
        description: item.description,
      };
      break;
    }
  }

  // 4. Distinction between Contemporary Urban vs Classic Rock / Folk Punk
  const category = matchedArtist?.category || (
    trilingualIntent?.intent === "urban_trap"
      ? "urban"
      : trilingualIntent?.intent === "punk_rock"
      ? "punk_folk"
      : trilingualIntent?.intent === "alt_rock"
      ? "rock_alt"
      : trilingualIntent?.intent === "indie_pop"
      ? "indie"
      : trilingualIntent?.intent === "general_basque"
      ? "general"
      : null
  );

  const isContemporaryUrban =
    category === "urban" ||
    category === "synth_pop" ||
    (matchedArtist?.artist === "Bengo" || matchedArtist?.artist === "Tatta" || matchedArtist?.artist === "ZETAK");

  const isClassicRockOrPunk =
    category === "punk_folk" ||
    (matchedArtist?.artist === "Streetwise" || matchedArtist?.artist === "Bizardunak");

  let categoryLabel: string | null = null;
  if (isContemporaryUrban) {
    categoryLabel = "Contemporary Basque Urban & Synth Pop";
  } else if (isClassicRockOrPunk) {
    categoryLabel = "Basque Street Punk & Folk Punk";
  } else if (category === "rock_alt") {
    categoryLabel = "Basque Alt Rock & Post-Punk";
  } else if (category === "indie") {
    categoryLabel = "Basque Indie & Indie Pop";
  } else if (category === "fusion") {
    categoryLabel = "Basque Fusion";
  } else if (trilingualIntent) {
    categoryLabel = trilingualIntent.description;
  }

  return {
    matchedArtist,
    matchedTrack,
    trilingualIntent,
    category,
    categoryLabel,
    isContemporaryUrban,
    isClassicRockOrPunk,
    normalizedQuery: q,
  };
}
