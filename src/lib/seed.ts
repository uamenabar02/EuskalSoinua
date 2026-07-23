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

const SEED_MODERN: SeedArtist[] = [
  {
    name: "Bulego",
    genre: "Euskal Pop",
    region: "eu",
    language: "eu",
    listeners: 84500,
    bio: "Azkoitiko pop eta synth-pop talde garaikidea, euskal musika modernoaren ikonoetako bat.",
    tracks: [
      { title: "Suzko Erroberak", album: "Erdian Oraina", year: 2021, duration: 210 },
      { title: "Bueltan Da!", album: "Erdian Oraina", year: 2021, duration: 195 },
      { title: "Kantu Bat", album: "Aldatu Aurretik", year: 2023, duration: 204 },
      { title: "Gure Bideak", album: "Aldatu Aurretik", year: 2023, duration: 188 },
    ],
  },
  {
    name: "ZETAK",
    genre: "Electronic",
    region: "eu",
    language: "eu",
    listeners: 112000,
    bio: "Pello Reparazen proiektu elektroniko eta pop modernoa. Arbizuko soinu berritzailea.",
    tracks: [
      { title: "Zoriontasuna", album: "Zeinen Ederra Izango Den", year: 2021, duration: 208 },
      { title: "Itzulera", album: "Zeinen Ederra Izango Den", year: 2021, duration: 220 },
      { title: "Aaztiyen", album: "AAZTIYEN", year: 2023, duration: 215 },
      { title: "Zu", album: "AAZTIYEN", year: 2023, duration: 198 },
    ],
  },
  {
    name: "En Tol Sarmiento",
    genre: "Ska",
    region: "eu",
    language: "eu",
    listeners: 145000,
    bio: "Iekorako ska-pop talde arrakastatsua. Euskal Herriko jaialdi guztietako protagonista.",
    tracks: [
      { title: "Zurekin Batera", album: "Guretzat", year: 2022, duration: 205 },
      { title: "Aukera Berriak", album: "Guretzat", year: 2022, duration: 190 },
      { title: "Etxera", album: "Guretzat", year: 2022, duration: 212 },
    ],
  },
  {
    name: "Neomak",
    genre: "Folk",
    region: "eu",
    language: "eu",
    listeners: 43000,
    bio: "Zazpi emakumezko trikitilarik osatutako taldea. Elektronika eta tradizioaren fusio indartsua.",
    tracks: [
      { title: "ILARGIA", album: "Neomak", year: 2022, duration: 214 },
      { title: "Ez Lehen", album: "Neomak", year: 2022, duration: 202 },
    ],
  },
  {
    name: "Chill Mafia",
    genre: "Rap",
    region: "eu",
    language: "eu",
    listeners: 52000,
    bio: "Iruñeko kolektibo urbano errebeldea. Trap, autotune eta euskal kultura herrikoiaren nahasketa.",
    tracks: [
      { title: "Gazte Arrunta Aren Kanta", album: "Erostarbe", year: 2021, duration: 185 },
      { title: "Barkami", album: "Erostarbe", year: 2021, duration: 192 },
    ],
  },
  {
    name: "Izaro",
    genre: "Euskal Pop",
    region: "eu",
    language: "eu",
    listeners: 78000,
    bio: "Mallabiako abeslari eta konpositorea. Soinu barnekoia eta pop dotorea.",
    tracks: [
      { title: "cerodenero", album: "cerodenero", year: 2023, duration: 228 },
      { title: "Xirimiri", album: "Limones en Invierno", year: 2022, duration: 215 },
    ],
  },
  {
    name: "Merina Gris",
    genre: "Electronic",
    region: "eu",
    language: "eu",
    listeners: 39000,
    bio: "Donostiar hiru bikote anonimoren synth-pop gogorra eta ikus-entzunezko estetika zaindua.",
    tracks: [
      { title: "Bakean Utzi Arte", album: "Zerua Orain", year: 2022, duration: 210 },
      { title: "Arren Erroak", album: "Zerua Orain", year: 2022, duration: 198 },
    ],
  },
  {
    name: "Shinova",
    genre: "Indie Rock",
    region: "eu",
    language: "es",
    listeners: 320000,
    bio: "Bermeoko indie rock taldea. Zuzeneko indartsua eta kantu epiko eta emozionalak.",
    tracks: [
      { title: "La Buena Suerte", album: "La Buena Suerte", year: 2021, duration: 230 },
      { title: "Alatriste", album: "El Presente", year: 2024, duration: 218 },
    ],
  },
  {
    name: "Rosalía",
    genre: "Pop",
    region: "global",
    language: "es",
    listeners: 28000000,
    bio: "Spanish singer-songwriter known for modernizing flamenco with reggaeton and avant-pop.",
    tracks: [
      { title: "DESPECHÁ", album: "MOTOMAMI +", year: 2022, duration: 157 },
      { title: "SAOKO", album: "MOTOMAMI", year: 2022, duration: 137 },
    ],
  },
  {
    name: "Fred again..",
    genre: "Electronic",
    region: "global",
    language: "en",
    listeners: 18000000,
    bio: "British producer and DJ behind ubiquitous emotionally charged club tracks.",
    tracks: [
      { title: "Marea (We've Lost Dancing)", album: "Actual Life", year: 2021, duration: 285 },
      { title: "Adore u", album: "Actual Life 3", year: 2023, duration: 220 },
    ],
  },
  {
    name: "Dua Lipa",
    genre: "Pop",
    region: "global",
    language: "en",
    listeners: 65000000,
    bio: "Global pop superstar driving disco-infused modern pop anthems.",
    tracks: [
      { title: "Houdini", album: "Radical Optimism", year: 2024, duration: 185 },
      { title: "Dance The Night", album: "Barbie The Album", year: 2023, duration: 176 },
    ],
  },
  {
    name: "Olivia Rodrigo",
    genre: "Indie Rock",
    region: "global",
    language: "en",
    listeners: 55000000,
    bio: "Grammy-winning singer-songwriter bringing 90s alt-rock grit to modern pop.",
    tracks: [
      { title: "vampire", album: "GUTS", year: 2023, duration: 219 },
      { title: "good 4 u", album: "SOUR", year: 2021, duration: 178 },
    ],
  },
  {
    name: "Boygenius",
    genre: "Indie Folk",
    region: "global",
    language: "en",
    listeners: 4800000,
    bio: "Indie supergroup formed by Phoebe Bridgers, Julien Baker, and Lucy Dacus.",
    tracks: [
      { title: "Not Strong Enough", album: "the record", year: 2023, duration: 234 },
      { title: "Cool About It", album: "the record", year: 2023, duration: 180 },
    ],
  }
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
  if (count === 0) {
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
  }

  await ensureModernTracks();
  await ensureDefaults();
}

async function ensureModernTracks(): Promise<void> {
  let demoCursor = 10;
  for (const a of SEED_MODERN) {
    // Check if artist already exists
    const [existingArtist] = await db
      .select({ id: artists.id })
      .from(artists)
      .where(sql`lower(${artists.name}) = lower(${a.name})`)
      .limit(1);

    let artistId = existingArtist?.id;
    if (!artistId) {
      const [newArtist] = await db
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
      artistId = newArtist.id;
    }

    const albumMap = new Map<string, number>();
    for (const t of a.tracks) {
      // Check if track already exists
      const [existingTrack] = await db
        .select({ id: tracks.id })
        .from(tracks)
        .where(sql`lower(${tracks.title}) = lower(${t.title}) and ${tracks.artistId} = ${artistId}`)
        .limit(1);

      if (existingTrack) continue;

      let albumId: number | undefined = albumMap.get(t.album);
      if (!albumId) {
        const [existingAlb] = await db
          .select({ id: albums.id })
          .from(albums)
          .where(sql`lower(${albums.title}) = lower(${t.album}) and ${albums.artistId} = ${artistId}`)
          .limit(1);

        if (existingAlb) {
          albumId = existingAlb.id;
        } else {
          const [alb] = await db
            .insert(albums)
            .values({
              title: t.album,
              artistId,
              artistName: a.name,
              year: t.year,
              genre: a.genre,
              region: a.region,
              thumbnail: null,
              source: "local",
            })
            .returning({ id: albums.id });
          albumId = alb.id as number;
        }
        if (albumId) albumMap.set(t.album, albumId);
      }

      const playCount = Math.floor(Math.random() * 9000) + 1200;
      await db.insert(tracks).values({
        title: t.title,
        artistId,
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
