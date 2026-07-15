import "server-only";
import { db } from "@/db";
import { artists, albums, tracks, eqPresets, playlists } from "@/db/schema";
import { sql } from "drizzle-orm";

/**
 * SEED CATALOG
 * ----------------------------------------------------------------------------
 * Curated metadata for the local media client. Because Basque music is
 * underrepresented in mainstream free databases, we prioritize official Basque
 * artists (region='eu', language='eu') alongside a general catalog. Every track
 * points at royalty-free demo audio so playback always works; when a Piped /
 * Invidious instance is configured these rows resolve live ad-free streams too.
 */

interface SeedTrack {
  title: string;
  album: string;
  year: number;
  duration: number;
}
interface SeedArtist {
  name: string;
  genre: string;
  region: string;
  language: string;
  listeners: number;
  bio: string;
  tracks: SeedTrack[];
}

const SEED: SeedArtist[] = [
  {
    name: "Berri Txarrak",
    genre: "Euskal Rock",
    region: "eu",
    language: "eu",
    listeners: 184230,
    bio: "Legendaria euskal rock alternatiboko taldea Nafarroako Lakuntzatik. Rock energeia eta poesiaren arteko fusioa.",
    tracks: [
      { title: "Denak Ez Du Balio", album: "Denak Ez Du Balio", year: 2017, duration: 218 },
      { title: "Hondarrea", album: "Infrakultura", year: 2014, duration: 245 },
      { title: "Oreka", album: "Sakonak Sakonera", year: 2011, duration: 232 },
      { title: "Euli Goxoa", album: "Bizi Bizi", year: 2017, duration: 201 },
    ],
  },
  {
    name: "Huntza",
    genre: "Folk",
    region: "eu",
    language: "eu",
    listeners: 96540,
    bio: "Bergarako trikitia eta pop folk modernoa. 'Aldapan Gora' euskal musikaren fenomenoa bihurtu zen.",
    tracks: [
      { title: "Aldapan Gora", album: "Aldapan Gora", year: 2017, duration: 198 },
      { title: "Balearen Biziak", album: "Egun Dizdiratsu Bat", year: 2020, duration: 223 },
      { title: "Harri Orri Ar", album: "Aldapan Gora", year: 2017, duration: 176 },
    ],
  },
  {
    name: "Oreka TX",
    genre: "Folk",
    region: "eu",
    language: "eu",
    listeners: 41200,
    bio: "Txalaparta tradizionala musika garaikidearekin nahasten duten aitzindariak. Soinu tresna unikoen egoera.",
    tracks: [
      { title: "Nömadak Tx", album: "Nömadak Tx", year: 2006, duration: 267 },
      { title: "Kukai", album: "Quercus Endorphina", year: 2013, duration: 312 },
    ],
  },
  {
    name: "Kepa Junkera",
    genre: "Trikitia",
    region: "eu",
    language: "eu",
    listeners: 78900,
    bio: "Trikitilari maisua eta Grammy irabazlea. Euskal herritar musika tradizionalaren enbaxadorea munduan.",
    tracks: [
      { title: "Barkamena", album: "Kalejira Alaiak", year: 1994, duration: 254 },
      { title: "Haurtxo Txiki", album: "Lau Eskuetara", year: 2008, duration: 233 },
    ],
  },
  {
    name: "Gatibu",
    genre: "Euskal Rock",
    region: "eu",
    language: "eu",
    listeners: 132100,
    bio: "Gernikako rock taldea, euskara erruz erabiltzen duena. 'Bang Bang' ezagun bihurtu zen belaunaldi osoentzat.",
    tracks: [
      { title: "Bang Bang", album: "Zoramena", year: 2010, duration: 211 },
      { title: "Euritan Dantzan", album: "Aske Maitte, Aske Bizi", year: 2014, duration: 198 },
      { title: "Loreak", album: "Zoramena", year: 2010, duration: 224 },
    ],
  },
  {
    name: "Esne Beltza",
    genre: "Reggae",
    region: "eu",
    language: "eu",
    listeners: 53700,
    bio: "Iruñeko reggae eta ska taldea. Euskal kultura eta Karibeko erritmoak nahasten ditu.",
    tracks: [
      { title: "Esne Beltza", album: "Esne Beltza", year: 2009, duration: 240 },
      { title: "Bidea", album: "Egin Dut Egin", year: 2013, duration: 219 },
    ],
  },
  {
    name: "Zea Mays",
    genre: "Euskal Rock",
    region: "eu",
    language: "eu",
    listeners: 61500,
    bio: "Gipuzkoako rock alternatiboa. Energia zuzeneko emanaldiengatik ezagunak.",
    tracks: [
      { title: "Larraun", album: "Atea", year: 2012, duration: 207 },
      { title: "Bizi Gara", album: "Harro", year: 2017, duration: 195 },
    ],
  },
  {
    name: "Vendetta",
    genre: "Punk",
    region: "eu",
    language: "eu",
    listeners: 47300,
    bio: "Iruñeko punk-rock taldea. Erlijio eta gizarte gaiei buruzko letra sarkorrak.",
    tracks: [
      { title: "Pake Lasterketa", album: "Pake Lasterketa", year: 2005, duration: 167 },
      { title: "Zer Gara", album: "Mundu Bat Berria", year: 2010, duration: 181 },
    ],
  },
  {
    name: "Gose",
    genre: "Electronic",
    region: "eu",
    language: "eu",
    listeners: 31800,
    bio: "Bilboko elektronika eta folk taldea. Soinu esperimentalak euskal sustraietatik.",
    tracks: [
      { title: "Itotzen", album: "Gose", year: 2011, duration: 298 },
    ],
  },
  {
    name: "Mikel Erentxun",
    genre: "Euskal Pop",
    region: "eu",
    language: "es",
    listeners: 110400,
    bio: "Duncan Dhuko abeslari ohiak egindako pop karrerak arrakasta handia lortu zuen bi hizkuntzetan.",
    tracks: [
      { title: "La Orilla de Carla", album: "El Abrazo del Erizo", year: 1995, duration: 256 },
      { title: "Saldremos a la Lluvia", album: "El Abrazo del Erizo", year: 1995, duration: 241 },
    ],
  },
  {
    name: "Su Ta Gar",
    genre: "Euskal Rock",
    region: "eu",
    language: "eu",
    listeners: 58900,
    bio: "Legazpiko heavy rock taldea. 'Euskal Herriko rock gogorra' definitu dutenak.",
    tracks: [
      { title: "Bidé", album: "Hegemonia", year: 2008, duration: 234 },
    ],
  },
  {
    name: "Hesian",
    genre: "Rap",
    region: "eu",
    language: "eu",
    listeners: 29400,
    bio: "Euskal hip-hop aitzindariak. Letra sozialki konprometituak erritmo gogorren gainean.",
    tracks: [
      { title: "Etorkizuna", album: "Euskal Herria", year: 2016, duration: 213 },
    ],
  },
  // --- General catalog (global, for recommendation contrast) ---
  {
    name: "Tame Impala",
    genre: "Psychedelic Rock",
    region: "global",
    language: "en",
    listeners: 9120000,
    bio: "Kevin Parkeren proiektu psikodelikoa. Rock eta funk fusio modernoa.",
    tracks: [
      { title: "The Less I Know the Better", album: "Currents", year: 2015, duration: 233 },
      { title: "Borderline", album: "The Slow Rush", year: 2020, duration: 237 },
      { title: "Let It Happen", album: "Currents", year: 2015, duration: 468 },
    ],
  },
  {
    name: "Khruangbin",
    genre: "Funk",
    region: "global",
    language: "und",
    listeners: 3870000,
    bio: "Texasko hirukotea soinu tropikal eta psikodelikoarekin. Funk globaletik inspiratua.",
    tracks: [
      { title: "Texas Sun", album: "Texas Sun", year: 2020, duration: 257 },
      { title: "White Gloves", album: "The Universe Smiles Upon You", year: 2015, duration: 213 },
    ],
  },
  {
    name: "Bon Iver",
    genre: "Indie Folk",
    region: "global",
    language: "en",
    listeners: 6240000,
    bio: "Justin Vernonen proiektua, ahots falsetto eta paisaia soinu epelak.",
    tracks: [
      { title: "Holocene", album: "Bon Iver", year: 2011, duration: 336 },
      { title: "Skinny Love", album: "For Emma, Forever Ago", year: 2007, duration: 238 },
    ],
  },
  {
    name: "Daft Punk",
    genre: "Electronic",
    region: "global",
    language: "und",
    listeners: 14200000,
    bio: "Frantziako elektronika bikoa. House eta diskoaren ikonoak.",
    tracks: [
      { title: "Get Lucky", album: "Random Access Memories", year: 2013, duration: 369 },
      { title: "Instant Crush", album: "Random Access Memories", year: 2013, duration: 337 },
    ],
  },
  {
    name: "Fleetwood Mac",
    genre: "Rock",
    region: "global",
    language: "en",
    listeners: 11300000,
    bio: "Britainiar-amerikar rock talde ikonikoa. 'Rumours' historiako albumik salduenetakoa.",
    tracks: [
      { title: "Dreams", album: "Rumours", year: 1977, duration: 257 },
      { title: "The Chain", album: "Rumours", year: 1977, duration: 276 },
    ],
  },
];

const EQ_PRESETS = [
  { name: "Flat", bands: [0, 0, 0, 0, 0], isDefault: true },
  { name: "Bass Boost", bands: [7, 4, 1, 0, 0], isDefault: false },
  { name: "Vocal", bands: [-2, 2, 5, 4, 1], isDefault: false },
  { name: "Treble", bands: [-1, -1, 1, 4, 7], isDefault: false },
  { name: "Live Concert", bands: [4, 2, -1, 2, 3], isDefault: false },
];

let seedPromise: Promise<void> | null = null;

export async function ensureSeed(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = runSeed();
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const existing = await db.select({ c: sql<number>`count(*)::int` }).from(tracks);
  const count = existing[0]?.c ?? 0;
  if (count > 0) {
    await ensureDefaults();
    return;
  }

  let demoCursor = 1;
  for (const a of SEED) {
    const [artistRow] = await db
      .insert(artists)
      .values({
        name: a.name,
        genre: a.genre,
        region: a.region,
        language: a.language,
        bio: a.bio,
        monthlyListeners: a.listeners,
        source: "local",
      })
      .returning({ id: artists.id });

    // Group tracks by album for album rows.
    const albumMap = new Map<string, number>();
    for (const t of a.tracks) {
      let albumId = albumMap.get(t.album);
      if (!albumId) {
        const [alb] = await db
          .insert(albums)
          .values({
            title: t.album,
            artistId: artistRow.id,
            artistName: a.name,
            year: t.year,
            genre: a.genre,
            region: a.region,
            thumbnail: null,
            source: "local",
          })
          .returning({ id: albums.id });
        albumId = alb.id as number;
        albumMap.set(t.album, albumId);
      }
      const playCount = Math.floor(Math.random() * 9000) + 200;
      await db.insert(tracks).values({
        title: t.title,
        artistId: artistRow.id,
        artistName: a.name,
        albumId,
        albumName: t.album,
        duration: t.duration,
        genre: a.genre,
        region: a.region,
        language: a.language,
        demoAudio: ((demoCursor - 1) % 9) + 1,
        playCount,
        source: "local",
      });
      demoCursor++;
    }
  }

  await ensureDefaults();
}

async function ensureDefaults(): Promise<void> {
  const presetCount = await db.select({ c: sql<number>`count(*)::int` }).from(eqPresets);
  if ((presetCount[0]?.c ?? 0) === 0) {
    for (const p of EQ_PRESETS) {
      await db.insert(eqPresets).values({
        name: p.name,
        bands: JSON.stringify(p.bands),
        isDefault: p.isDefault,
      });
    }
  }
  const playlistCount = await db.select({ c: sql`count(*)::int` }).from(playlists);
  if ((playlistCount[0]?.c ?? 0) === 0) {
    await db.insert(playlists).values([
      { name: "Euskal Gaueko Bidaia", description: "Basque late-night listening", coverSeed: "euskal-gaua" },
      { name: "Energia Goizean", description: "Morning motivation rock", coverSeed: "goiza" },
    ]);
  }
}
