import "server-only";
import { db } from "@/db";
import { artists, albums, tracks, eqPresets, playlists } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { BASQUE_DISAMBIGUATION, isValidMatchForArtist } from "@/lib/sources/online";

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
      { title: "Denak Ez Du Balio", album: "Ikasten", year: 1999, duration: 218 },
      { title: "Oreka", album: "Libre ©", year: 2003, duration: 232 },
      { title: "Maravillas", album: "Payola", year: 2009, duration: 225 },
      { title: "Jaio.Musika.Hil", album: "Jaio.Musika.Hil", year: 2005, duration: 210 },
      { title: "Lemak, Aingurak", album: "Haria", year: 2011, duration: 205 },
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
      { title: "Aldapan Gora", album: "Ertzetatik", year: 2016, duration: 198 },
      { title: "Buruz Behera", album: "Xilema", year: 2018, duration: 228 },
      { title: "Lasai, Lasai", album: "Xilema", year: 2018, duration: 215 },
      { title: "Promesetan", album: "Xilema", year: 2018, duration: 210 },
      { title: "Deabruak Gara", album: "Xilema", year: 2018, duration: 205 },
      { title: "Iñundik Iñora", album: "Ertzetatik", year: 2016, duration: 212 },
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
      { title: "Bok-Espok", album: "Bilbao 00:00h", year: 1998, duration: 254 },
      { title: "Marea Gora", album: "Kemen", year: 1997, duration: 233 },
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
      { title: "Bang Bang", album: "Zoramena", year: 2002, duration: 211 },
      { title: "Euritan Dantzan", album: "Euritan Dantzan", year: 2014, duration: 198 },
      { title: "Musturrek Sartunde", album: "Zoramena", year: 2002, duration: 224 },
      { title: "Aske Maitte, Aske Bizi", album: "Euritan Dantzan", year: 2014, duration: 215 },
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
      { title: "Bozgorailuetatik", album: "Made in Euskal Herria", year: 2008, duration: 240 },
      { title: "Gogoak", album: "Noa", year: 2010, duration: 219 },
      { title: "Pasodoble", album: "Esna", year: 2015, duration: 210 },
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
      { title: "Negua Joan Da Ta", album: "Era", year: 2010, duration: 207 },
      { title: "Elektrizitatea", album: "Elektrizitatea", year: 2000, duration: 195 },
      { title: "Kukutza III", album: "Era", year: 2010, duration: 215 },
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
      { title: "Pao Pao Pao", album: "13", year: 2014, duration: 205 },
      { title: "Begitara Begira", album: "Vendetta", year: 2009, duration: 215 },
      { title: "Egunero", album: "Vendetta", year: 2009, duration: 198 },
      { title: "Udarako Gau Luzeak", album: "Atzo, Gaur eta Bihar", year: 2012, duration: 210 },
      { title: "Le Souvenir", album: "Atzo, Gaur eta Bihar", year: 2012, duration: 220 },
      { title: "Ilunpetan", album: "13", year: 2014, duration: 225 },
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
      { title: "Eutsi", album: "Gose II", year: 2007, duration: 240 },
      { title: "Kasting", album: "Gose III", year: 2008, duration: 225 },
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
      { title: "A Un Minuto De Ti", album: "Naufragios", year: 1992, duration: 236 },
      { title: "Mañana", album: "El Abrazo del Erizo", year: 1995, duration: 241 },
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
      { title: "Jo Ta Ke", album: "Jaiotze Basatia", year: 1991, duration: 210 },
      { title: "Mari", album: "Jaiotze Basatia", year: 1991, duration: 245 },
      { title: "David Eta Goliath", album: "Homo Sapiens?", year: 1999, duration: 230 },
    ],
  },
  {
    name: "Hesian",
    genre: "Punk Rock",
    region: "eu",
    language: "eu",
    listeners: 29400,
    bio: "Sakanako punk-rock eta melodiko taldea. Letra sozialki konprometituak erritmo indartsuen gainean.",
    tracks: [
      { title: "Behar Zaitut", album: "Hitzetik", year: 2013, duration: 215 },
      { title: "Guregatik", album: "Hesian", year: 2011, duration: 220 },
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
    name: "Dupla",
    genre: "Euskal Pop / Urban",
    region: "eu",
    language: "eu",
    listeners: 64000,
    bio: "Aguraingo musika talde urbano eta elektronikoa. Tradizioa eta soinu moderno digitalak uztartzen dituzte.",
    tracks: [
      { title: "30's", album: "De Un Pueblo Llamado Agurain", year: 2024, duration: 197 },
      { title: "Ongi Etorri", album: "De Un Pueblo Llamado Agurain", year: 2024, duration: 163 },
      { title: "Tirikitrauki", album: "De Un Pueblo Llamado Agurain", year: 2024, duration: 185 },
      { title: "Hamen", album: "Folklorea", year: 2019, duration: 198 },
      { title: "Nahidudana", album: "Nahidudana", year: 2021, duration: 215 },
      { title: "Beldurrik ez", album: "Folklorea", year: 2019, duration: 204 },
      { title: "Otsaportillo", album: "De Un Pueblo Llamado Agurain", year: 2024, duration: 190 },
      { title: "Dantzatzera at!", album: "Folklorea", year: 2019, duration: 210 },
      { title: "Ezer ez da berdina", album: "De Agurain a Kontrazaharra", year: 2022, duration: 192 },
      { title: "Gure zakarra", album: "De Agurain a Kontrazaharra", year: 2022, duration: 180 },
    ],
  },
  {
    name: "Bengo",
    genre: "Euskal Pop / Urban",
    region: "eu",
    language: "eu",
    listeners: 52000,
    bio: "Oiartzungo abeslari eta ekoizle gaztea. Melodia harrapatzaileak eta urban pop soinu berritzaileak.",
    tracks: [
      { title: "Denbora", album: "453", year: 2022, duration: 205 },
      { title: "Orain", album: "Bizitzak", year: 2023, duration: 195 },
      { title: "Bizi", album: "453", year: 2022, duration: 212 },
      { title: "Gogoan", album: "BIDEAN", year: 2024, duration: 188 },
      { title: "Txatxarrak", album: "Bizitzak", year: 2023, duration: 201 },
      { title: "Zortzi", album: "453", year: 2022, duration: 190 },
      { title: "Sayonara", album: "Bizitzak", year: 2023, duration: 185 },
      { title: "Baimenik gabe", album: "BIDEAN", year: 2024, duration: 198 },
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
let isSeeded = false;

export async function ensureSeed(): Promise<void> {
  if (isSeeded) return;
  if (seedPromise) return seedPromise;
  seedPromise = runSeed().then(() => {
    isSeeded = true;
  });
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

  await purgeHallucinatedAndMismatchedTracks();
  await ensureSeedTracks();
  await ensureModernTracks();
  await ensureGroundTruthCatalog();
  await ensureDefaults();
  await cleanupDisambiguatedTracks();
}

async function ensureSeedTracks(): Promise<void> {
  try {
    for (const a of SEED) {
      let [artistRow] = await db
        .select({ id: artists.id })
        .from(artists)
        .where(sql`lower(${artists.name}) = lower(${a.name})`)
        .limit(1);

      if (!artistRow) {
        const [inserted] = await db
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
        artistRow = inserted;
      }

      for (const t of a.tracks) {
        const [existingTrack] = await db
          .select({ id: tracks.id })
          .from(tracks)
          .where(sql`lower(${tracks.title}) = lower(${t.title}) and ${tracks.artistId} = ${artistRow.id}`)
          .limit(1);

        if (!existingTrack) {
          let [albumRow] = await db
            .select({ id: albums.id })
            .from(albums)
            .where(sql`lower(${albums.title}) = lower(${t.album}) and ${albums.artistId} = ${artistRow.id}`)
            .limit(1);

          if (!albumRow) {
            const [insertedAlb] = await db
              .insert(albums)
              .values({
                title: t.album,
                artistId: artistRow.id,
                artistName: a.name,
                year: t.year,
                genre: a.genre,
                region: a.region,
                source: "local",
              })
              .returning({ id: albums.id });
            albumRow = insertedAlb;
          }

          await db.insert(tracks).values({
            title: t.title,
            artistId: artistRow.id,
            artistName: a.name,
            albumId: albumRow.id,
            albumName: t.album,
            duration: t.duration,
            genre: a.genre,
            region: a.region,
            language: a.language,
            source: "local",
            playCount: Math.floor(Math.random() * 8000) + 1500,
          });
        }
      }
    }
  } catch (e) {
    console.error("ensureSeedTracks error:", e);
  }
}

async function purgeHallucinatedAndMismatchedTracks(): Promise<void> {
  try {
    const invalidTitles = [
      "harri orri ar",
      "balearen biziak",
      "dmt",
      "dtm",
      "pake lasterketa",
      "zer gara",
      "hondarrea",
      "euli goxoa",
      "larraun",
      "bizi gara",
      "bidé",
      "bide",
      "etorkizuna",
      "barkamena",
      "haurtxo txiki",
      "loreak",
      "bidea",
      "itotzen",
    ];

    for (const title of invalidTitles) {
      await db.delete(tracks).where(sql`lower(${tracks.title}) = ${title}`);
    }

    // Also purge French rap tracks ingested under Vendetta
    const frenchVendettaKeywords = [
      "requiem",
      "mieux qu'hier",
      "étoile",
      "etoile",
      "bec âne",
      "bec ane",
      "merci",
      "addict",
      "sierra leone",
      "les démons",
      "les demons",
      "shayo",
      "broski",
      "formidable",
      "making off",
      "hotshot",
      "r.r",
      "8014",
      "ia",
      "here you come again",
    ];
    for (const kw of frenchVendettaKeywords) {
      await db.delete(tracks).where(
        sql`lower(${tracks.artistName}) = 'vendetta' and (lower(${tracks.title}) like ${'%' + kw + '%'} or lower(${tracks.albumName}) like ${'%' + kw + '%'})`
      );
      await db.delete(albums).where(
        sql`lower(${albums.artistName}) = 'vendetta' and lower(${albums.title}) like ${'%' + kw + '%'}`
      );
    }
  } catch (err) {
    console.error("purgeHallucinatedAndMismatchedTracks error:", err);
  }
}

async function cleanupDisambiguatedTracks(): Promise<void> {
  try {
    for (const [key] of Object.entries(BASQUE_DISAMBIGUATION)) {
      const artistRows = await db
        .select({ id: artists.id, name: artists.name })
        .from(artists)
        .where(sql`lower(${artists.name}) = ${key}`);

      for (const aRow of artistRows) {
        const trackRows = await db
          .select({ id: tracks.id, title: tracks.title, albumName: tracks.albumName, genre: tracks.genre })
          .from(tracks)
          .where(eq(tracks.artistId, aRow.id));

        for (const t of trackRows) {
          if (!isValidMatchForArtist(aRow.name, { title: t.title, album: t.albumName, genre: t.genre })) {
            await db.delete(tracks).where(eq(tracks.id, t.id));
          }
        }

        const albumRows = await db
          .select({ id: albums.id, title: albums.title, genre: albums.genre })
          .from(albums)
          .where(eq(albums.artistId, aRow.id));

        for (const alb of albumRows) {
          if (!isValidMatchForArtist(aRow.name, { title: alb.title, album: alb.title, genre: alb.genre })) {
            await db.delete(albums).where(eq(albums.id, alb.id));
          }
        }
      }

      // Also clean up by artistName string
      const looseTracks = await db
        .select({ id: tracks.id, title: tracks.title, albumName: tracks.albumName, genre: tracks.genre, artistName: tracks.artistName })
        .from(tracks)
        .where(sql`lower(${tracks.artistName}) = ${key}`);

      for (const t of looseTracks) {
        if (!isValidMatchForArtist(key, { title: t.title, album: t.albumName, genre: t.genre })) {
          await db.delete(tracks).where(eq(tracks.id, t.id));
        }
      }
    }
  } catch {
    // Ignore if cleanup fails on seed
  }
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

export const GROUND_TRUTH_DATA = [
  {
    artist: "Bengo",
    genre: "Basque Urban Pop",
    region: "eu",
    language: "eu",
    bio: "Oiartzungo abeslari eta ekoizle gaztea. Melodia harrapatzaileak eta urban pop soinu berritzaileak.",
    tracks: [
      {
        title: "Galdu Gattezen",
        album: "Bizitzak",
        year: 2023,
        duration: 195,
        externalId: "ghNA8wTrSmI",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/18/cd/25/18cd25a7-eaa8-3282-a17d-28bb24a4c831/mzaf_15492999691862970648.plus.aac.p.m4a",
      },
      {
        title: "Beldurrik Gabe",
        album: "Bizitzak",
        year: 2023,
        duration: 185,
        externalId: "x1ECsx6lbwE",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/02/a5/22/02a5228a-a312-bfec-8014-257acd0e5f28/mzaf_8749929553842873852.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "ZETAK",
    genre: "Basque Synth Pop",
    region: "eu",
    language: "eu",
    bio: "Pello Reparazen proiektu elektroniko eta pop modernoa. Arbizuko soinu berritzailea.",
    tracks: [
      {
        title: "Zeinen Ederra Izango Den",
        album: "Zeinen Ederra Izango Den",
        year: 2020,
        duration: 220,
        externalId: "4phtwVJqSuw",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview114/v4/ba/ef/1d/baef1dc9-cbeb-5935-ac83-2f7e77666b47/mzaf_2043386368707079735.plus.aac.p.m4a",
      },
      {
        title: "Itzulera",
        album: "Zeinen Ederra Izango Den",
        year: 2022,
        duration: 220,
        externalId: "ZErUMnB7aMk",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/a0/5e/23/a05e2353-43ac-f0ef-3d3c-774df9af14f1/mzaf_9891321263478634825.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "La Txama",
    genre: "Basque Fusion",
    region: "eu",
    language: "eu",
    bio: "Basque fusion and urban pop-rock band.",
    tracks: [
      {
        title: "Musa 13",
        album: "Musa 13",
        year: 2023,
        duration: 215,
        externalId: "KdkZM4rzRSA",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview122/v4/97/49/63/974963c6-dc15-a699-519f-23f06c5f3433/mzaf_13987627347685713636.plus.aac.p.m4a",
      },
      {
        title: "Fusilaren Hotsa",
        album: "Musa 13",
        year: 2023,
        duration: 205,
        externalId: "9gBPu-BU0jQ",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/cf/a6/8d/cfa68dba-e006-110f-bbee-533332ca9363/mzaf_3275564627724789443.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Izaro",
    genre: "Basque Indie Pop",
    region: "eu",
    language: "eu",
    bio: "Mallabiako abeslari eta konpositorea. Soinu barnekoia eta pop dotorea.",
    tracks: [
      {
        title: "Aske Maitte",
        album: "Limones en Invierno",
        year: 2020,
        duration: 240,
        externalId: "hnwYJzZyqzk",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/ae/77/97/ae77977e-212a-0889-8136-426dc00585e9/mzaf_13385617291043792300.plus.aac.p.m4a",
      },
      {
        title: "Oso Blanco",
        album: "om",
        year: 2016,
        duration: 210,
        externalId: "Ir6LtvAKBqY",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/af/83/69/af83699a-dbcc-d8f9-dd6f-79f5be8e0356/mzaf_13491605586197966985.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Anari",
    genre: "Basque Alt Rock",
    region: "eu",
    language: "eu",
    bio: "Azkoitiko kantautorea eta euskal rock alternatiboaren erreferente nagusietakoa.",
    tracks: [
      {
        title: "Efemerideak",
        album: "Epilogo Bat",
        year: 2016,
        duration: 235,
        externalId: "fao20vtn8cA",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/2c/39/44/2c3944b3-ee65-36ce-590e-0ac02257d2ed/mzaf_14942995138019367593.plus.aac.p.m4a",
      },
      {
        title: "Orfidentalak",
        album: "Habiak",
        year: 2000,
        duration: 250,
        externalId: "6XiiX5aFTFM",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/3f/22/08/3f220857-55e4-323c-740b-037e1007371a/mzaf_5868505665825816210.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Streetwise",
    genre: "Basque Street Punk",
    region: "eu",
    language: "eu",
    bio: "Iruñeko street punk eta Oi! talde boteretsua.",
    tracks: [
      {
        title: "Txantxangorria",
        album: "Datorrena",
        year: 2022,
        duration: 190,
        externalId: "n-9RN_E7L1k",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/58/b0/ca/58b0caaa-19c1-3f7e-3525-df44956ba943/mzaf_11699123269940345631.plus.aac.p.m4a",
      },
      {
        title: "Izatea Baino",
        album: "Datorrena",
        year: 2022,
        duration: 185,
        externalId: "ZlZQAxqx2gE",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ad/bd/30/adbd30fa-7e11-9fc4-ee31-3e7afd0071ab/mzaf_1621266349327819936.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Bizardunak",
    genre: "Basque Folk Punk",
    region: "eu",
    language: "eu",
    bio: "Nafarroako folk punk erradikala eta euskal kantu tradizionalen interpretazio kementsuak.",
    tracks: [
      {
        title: "Nazi de Fresa",
        album: "Bizardunak",
        year: 2009,
        duration: 180,
        externalId: "0zI2goqPXLw",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/0e/3b/d1/0e3bd1df-bb37-81ca-baa4-bc26b5609471/mzaf_1363825328113959105.plus.aac.p.m4a",
      },
      {
        title: "Shane McGowan's Basque Paddys",
        album: "En Zugzwang",
        year: 2010,
        duration: 210,
        externalId: "98if3xXYNaQ",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/7d/66/70/7d6670eb-fbce-7187-4ea4-d72e1196972a/mzaf_17469467063648011767.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Olaia Inziarte",
    genre: "Basque Indie",
    region: "eu",
    language: "eu",
    bio: "Oronoztarra, pop ilun eta intimoaren egile berritzailea.",
    tracks: [
      {
        title: "Denbora Lehen Orain",
        album: "Lehengo Lepotikan Burua",
        year: 2022,
        duration: 205,
        externalId: "bFeGyEIvJqw",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/32/7c/fe/327cfeea-0ef8-0ca5-b16f-9c600ff682fa/mzaf_4092370951689205369.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Tatta",
    genre: "Basque Urban/Trap",
    region: "eu",
    language: "eu",
    bio: "Arrasateko rap eta trap abeslaria, euskal eszena urbano berriaren buru.",
    tracks: [
      {
        title: "Muxutxo Bana",
        album: "Martin",
        year: 2024,
        duration: 175,
        externalId: "4zpjzjJSZNk",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/01/78/2e/01782eef-f187-a20c-585f-04f261c9631d/mzaf_9971338142441165059.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Belako",
    genre: "Basque Post-Punk",
    region: "eu",
    language: "eu",
    bio: "Mungiako post-punk eta rock alternatiboko talde txalotua.",
    tracks: [
      {
        title: "Render Me Numb",
        album: "Render Me Numb, Trivial Violence",
        year: 2018,
        duration: 220,
        externalId: "JD-IK47W3ok",
        previewUrlAlt: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview125/v4/94/a1/75/94a17593-4112-0182-2911-acceffdc25ef/mzaf_3513018776870479321.plus.aac.p.m4a",
      },
    ],
  },
  {
    artist: "Huntza",
    genre: "Folk",
    region: "eu",
    language: "eu",
    bio: "Bergarako trikitia eta pop folk modernoa. 'Aldapan Gora' euskal musikaren fenomeno handia bihurtu zen.",
    tracks: [
      {
        title: "Aldapan Gora",
        album: "Ertzetatik",
        year: 2016,
        duration: 198,
        externalId: "ONsp-SMT6is",
      },
      {
        title: "Buruz Behera",
        album: "Xilema",
        year: 2018,
        duration: 228,
        externalId: "-oYevoMY2TM",
      },
      {
        title: "Lasai, Lasai",
        album: "Xilema",
        year: 2018,
        duration: 215,
        externalId: "0e4L2fDszc8",
      },
      {
        title: "Promesetan",
        album: "Xilema",
        year: 2018,
        duration: 210,
        externalId: "m2Tf_N4153k",
      },
      {
        title: "Deabruak Gara",
        album: "Xilema",
        year: 2018,
        duration: 205,
        externalId: "YJ8-WpW3v8I",
      },
    ],
  },
  {
    artist: "Dupla",
    genre: "Euskal Pop / Urban",
    region: "eu",
    language: "eu",
    bio: "Aguraingo musika talde urbano eta elektronikoa. Tradizioa eta soinu moderno digitalak uztartzen dituzte.",
    tracks: [
      {
        title: "30's",
        album: "De Un Pueblo Llamado Agurain",
        year: 2024,
        duration: 197,
        externalId: "OnR6rHG2GuU",
      },
      {
        title: "Ongi Etorri",
        album: "De Un Pueblo Llamado Agurain",
        year: 2024,
        duration: 163,
        externalId: "m7PrpkZcqm8",
      },
      {
        title: "Tirikitrauki",
        album: "De Un Pueblo Llamado Agurain",
        year: 2024,
        duration: 185,
        externalId: "73VqjTVxEmk",
      },
      {
        title: "Hamen",
        album: "Folklorea",
        year: 2019,
        duration: 198,
        externalId: "fB8N0cZ9fHQ",
      },
      {
        title: "Nahidudana",
        album: "Nahidudana",
        year: 2021,
        duration: 215,
        externalId: "L7c5mC_t0_U",
      },
      {
        title: "Beldurrik ez",
        album: "Folklorea",
        year: 2019,
        duration: 204,
        externalId: "LWH6h3-fbM8",
      },
    ],
  },
  {
    artist: "Vendetta",
    genre: "Punk",
    region: "eu",
    language: "eu",
    bio: "Iruñeko ska, rock eta punk taldea. Euskal musika eszenako talde ezagunenetako bat.",
    tracks: [
      {
        title: "Pao Pao Pao",
        album: "13",
        year: 2014,
        duration: 205,
        externalId: "4L9R1Ym-zZg",
      },
      {
        title: "Begitara Begira",
        album: "Vendetta",
        year: 2009,
        duration: 215,
        externalId: "WdI7gD0b4rI",
      },
      {
        title: "Egunero",
        album: "Vendetta",
        year: 2009,
        duration: 198,
        externalId: "5y3l_P09t0M",
      },
      {
        title: "Udarako Gau Luzeak",
        album: "Atzo, Gaur eta Bihar",
        year: 2012,
        duration: 210,
        externalId: "G_s0CgR1RkU",
      },
      {
        title: "Le Souvenir",
        album: "Atzo, Gaur eta Bihar",
        year: 2012,
        duration: 220,
        externalId: "mD5lT8f1E0s",
      },
    ],
  },
  {
    artist: "Gartxot",
    genre: "Basque Indie Pop",
    region: "eu",
    language: "eu",
    bio: "Gartxot Unsain Letona donostiar musikariaren proiektu pertsonala.",
    tracks: [
      {
        title: "Donostia",
        album: "Gartxot",
        year: 2023,
        duration: 195,
        externalId: "6X_K8q24YvE",
      },
    ],
  },
];

export async function ensureGroundTruthCatalog(): Promise<void> {
  try {
    for (const item of GROUND_TRUTH_DATA) {
      // 1. Find or create artist
      const existingArtists = await db
        .select({ id: artists.id, name: artists.name })
        .from(artists)
        .where(sql`lower(${artists.name}) = lower(${item.artist})`);

      let artistId = existingArtists[0]?.id;
      if (!artistId) {
        const [inserted] = await db
          .insert(artists)
          .values({
            name: item.artist,
            genre: item.genre,
            region: item.region,
            language: item.language,
            bio: item.bio,
            monthlyListeners: 65000,
            source: "local",
          })
          .returning({ id: artists.id });
        artistId = inserted.id;
      } else {
        await db
          .update(artists)
          .set({
            genre: item.genre,
            region: item.region,
            language: item.language,
            bio: item.bio,
          })
          .where(eq(artists.id, artistId));
      }

      // 2. Process each track
      for (const t of item.tracks) {
        // Album
        const existingAlbums = await db
          .select({ id: albums.id })
          .from(albums)
          .where(sql`lower(${albums.title}) = lower(${t.album}) and ${albums.artistId} = ${artistId}`);

        let albumId = existingAlbums[0]?.id;
        if (!albumId) {
          const [insertedAlb] = await db
            .insert(albums)
            .values({
              title: t.album,
              artistId,
              artistName: item.artist,
              year: t.year,
              genre: item.genre,
              region: item.region,
              source: "local",
            })
            .returning({ id: albums.id });
          albumId = insertedAlb.id;
        }

        // Track: match by title and artistId OR artistName
        const existingTracks = await db
          .select({ id: tracks.id, externalId: tracks.externalId })
          .from(tracks)
          .where(
            sql`lower(${tracks.title}) = lower(${t.title}) and (${tracks.artistId} = ${artistId} or lower(${tracks.artistName}) = lower(${item.artist}))`
          );

        if (existingTracks.length > 0) {
          for (const ex of existingTracks) {
            await db
              .update(tracks)
              .set({
                artistId,
                artistName: item.artist,
                albumId,
                albumName: t.album,
                duration: t.duration,
                externalId: t.externalId,
                previewUrlAlt: (t as { previewUrlAlt?: string }).previewUrlAlt ?? null,
                source: "youtube",
                genre: item.genre,
                region: item.region,
                language: item.language,
              })
              .where(eq(tracks.id, ex.id));
          }
        } else {
          await db.insert(tracks).values({
            title: t.title,
            artistId,
            artistName: item.artist,
            albumId,
            albumName: t.album,
            duration: t.duration,
            genre: item.genre,
            region: item.region,
            language: item.language,
            externalId: t.externalId,
            previewUrlAlt: (t as { previewUrlAlt?: string }).previewUrlAlt ?? null,
            source: "youtube",
            playCount: 4500,
          });
        }

        // Also backfill any collaborative or duplicate track variants (e.g. feat / remix)
        await db
          .update(tracks)
          .set({
            externalId: t.externalId,
            previewUrlAlt: (t as { previewUrlAlt?: string }).previewUrlAlt ?? null,
            source: "youtube",
          })
          .where(
            sql`lower(${tracks.title}) = lower(${t.title}) and lower(${tracks.artistName}) like lower(${'%' + item.artist + '%'}) and (${tracks.externalId} is null or ${tracks.externalId} = '' or ${tracks.previewUrlAlt} is null)`
          );
      }
    }
  } catch (err) {
    console.error("ensureGroundTruthCatalog error:", err);
  }
}

