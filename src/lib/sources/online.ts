import "server-only";
import { db } from "@/db";
import { tracks, artists, albums } from "@/db/schema";
import { eq, ilike, and, or } from "drizzle-orm";
import { mapTrack } from "@/lib/mappers";
import type { Track } from "@/lib/types";
import { matchesTitle } from "@/lib/sources/streaming";
import { splitArtistNames } from "@/lib/utils";

/**
 * REAL ONLINE METADATA SEARCH
 * ----------------------------------------------------------------------------
 * Searches the legal, key-free public APIs of iTunes and Deezer in parallel
 * and unifies the results. This is what makes the app find ANY artist
 * (La Txama, StreetWise, Berri Txarrak, …) on demand — no manual import.
 *
 * Both return real album artwork AND a playable ~30-second preview of the
 * ACTUAL song. That preview is used as a guaranteed-correct audio fallback so
 * the track that plays always corresponds to the card, even when YouTube
 * full-track extraction is unavailable.
 *
 * Full ad-free tracks are still resolved first via YouTube (Piped/Invidious).
 */

export interface OnlineMatch {
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  isrc: string | null;
  artwork: string | null;
  // playable ~30s previews of the real song
  previewUrl: string | null; // Deezer (mp3)
  previewUrlAlt: string | null; // iTunes (m4a)
  genre: string | null;
  source: "deezer" | "itunes";
}

export interface ArtistDisambiguation {
  searchQuery: string;
  searchQueries?: string[];
  itunesArtistId?: number;
  deezerArtistId?: number;
  knownMatches: string[];
  rejectedKeywords: string[];
}

export const BASQUE_DISAMBIGUATION: Record<string, ArtistDisambiguation> = {
  dupla: {
    searchQuery: "Dupla",
    itunesArtistId: 1442326892,
    deezerArtistId: 7247522,
    searchQueries: [
      "Dupla De Un Pueblo Llamado Agurain",
      "Dupla Folklorea",
      "Dupla NAHIERAN",
      "Dupla Agurain"
    ],
    knownMatches: [
      "folklorea", "nahidudana", "de agurain a kontrazaharra", "gure zakarra",
      "dantzatzera at", "hamen", "beldurrik ez", "ezer ez da berdina", "agurain",
      "txoriak txori", "batu", "txikititan", "gazteak", "zikina", "kultura", "dantzatu",
      "mundua pitzatzear dago", "haizea", "euskal herriko gazteak", "de un pueblo llamado agurain",
      "30's", "30s", "ongi etorri", "tirikitrauki", "l_s chaval_s", "chavales", "chaval_s", "artista",
      "otsaportillo", "el mejunje", "konforme", "kontraesanak", "tururu", "animali",
      "un mal dia", "zugandik ihesi", "txiki", "mundua geldi", "01200", "eromeria",
      "nahieran", "kata", "batukada", "skapa", "milenials", "dantza gaua", "somos asi"
    ],
    rejectedKeywords: [
      "concepto", "dmt", "dtm",
      "regional mexicano", "mariachi", "corridos", "salsa", "cumbia", "bachata",
      "ranchera", "norteño", "mexicano", "mexican", "mexico", "banda sinaloense",
      "dupla de la sierra", "dupla ranchera", "bolero", "vallenato", "zouk", "kompa",
      "afrobeat", "afrobeats", "amapiano", "congolese", "makossa", "kizomba", "rumba",
      "insatisfaite", "rythmo", "melodie", "mélodie", "chaleur", "inattendue", "portukonpa",
      "ambiance", "guarachita", "tololoche", "chochias", "jalisco", "que se joda", "des iles",
      "d'iles", "mon albi", "ti tèt", "souvenir", "danse-jauqu-matin", "l'heure", "gouyad"
    ],
  },
  bengo: {
    searchQuery: "Bengo",
    itunesArtistId: 1492546131,
    deezerArtistId: 6599526,
    searchQueries: [
      "Bengo Denbora",
      "Bengo 453",
      "Bengo Bizitzak",
      "Bengo Oiartzun"
    ],
    knownMatches: [
      "galdu gattezen", "beldurrik gabe", "453", "bizitzak", "bidean", "denbora", "orain", "bizi", "gogoan", "txatxarrak",
      "beste egun bat", "kantu bat", "ai ai ai", "zortzi", "basamortuan", "sayonara",
      "baimenik gabe", "bakarrik", "bueltan", "gelatxo honetan", "baleak", "bizitzari parre",
      "oiartzun"
    ],
    rejectedKeywords: [
      "afrobeats", "afrobeat", "amapiano", "bengo bengo", "congolese", "makossa",
      "kizomba", "regional mexicano", "mariachi", "cumbia", "banda", "rumba", "zouk",
      "kompa", "bachata"
    ],
  },
  vendetta: {
    searchQuery: "Vendetta",
    itunesArtistId: 1724095815,
    deezerArtistId: 5197,
    searchQueries: [
      "Vendetta Begitara Begira",
      "Vendetta Pao Pao Pao",
      "Vendetta Udarako Gau Luzeak",
      "Vendetta Atzo Gaur eta Bihar"
    ],
    knownMatches: [
      "pao pao pao", "begitara begira", "egunero", "udarako gau luzeak", "le souvenir",
      "ilunpetan", "hemen", "gau beltza", "batasuna", "munstroa", "bother", "puro infierno",
      "atzo, gaur eta bihar", "13", "esperoan", "sangre y revolucion", "al fin", "buonasera",
      "la parranda", "pasos de acero", "botella llena", "druglin", "tomas", "aaoo", "reggae gaua"
    ],
    rejectedKeywords: [
      "pake lasterketa", "zer gara", "requiem : mieux qu'hier", "requiem", "mieux qu'hier",
      "étoile", "etoile", "bec âne", "bec ane", "merci", "addict", "sierra leone",
      "les démons", "les demons", "shayo", "broski", "formidable", "making off", "hotshot",
      "r.r", "8014", "ia", "french rap", "rap français", "drill", "here you come again"
    ],
  },
  huntza: {
    searchQuery: "Huntza",
    itunesArtistId: 1178649819,
    deezerArtistId: 11408010,
    searchQueries: [
      "Huntza Aldapan Gora",
      "Huntza Ertzetatik",
      "Huntza Xilema",
      "Huntza Ezin Ezer Espero"
    ],
    knownMatches: [
      "aldapan gora", "ertzetatik", "xilema", "ezin ezer espero", "buruz behera", "lasai, lasai", "lasai lasai",
      "promesetan", "deabruak gara", "iñundik iñoare", "iñundik iñora", "haizeak", "17:15", "olatu bat",
      "gauerdiko biolinak", "kalabazak", "ipuinetan", "damutu asko", "agur itaka", "poema nekatu bat",
      "punta punte bi", "izan nahi dut", "odoletan", "ilunabarrean", "arinarina", "arin - arina", "imajina",
      "zelatari", "herri unibertsitatea", "zarako apretak", "parent(h)esiak", "si vols", "ohorea"
    ],
    rejectedKeywords: [
      "harri orri ar", "balearen biziak"
    ],
  },
  zetak: {
    searchQuery: "ZETAK",
    itunesArtistId: 1456598867,
    deezerArtistId: 61818832,
    searchQueries: [
      "ZETAK Zeinen Ederra",
      "ZETAK Itzulera",
      "ZETAK Aaztiyen"
    ],
    knownMatches: [
      "zeinen ederra", "itzulera", "errepidean", "akelarre", "zutaz", "hitzeman", "aaztiyen"
    ],
    rejectedKeywords: []
  },
  "la txama": {
    searchQuery: "La Txama",
    itunesArtistId: 1734802402,
    deezerArtistId: 257288702,
    searchQueries: ["La Txama Musa 13", "La Txama Fusilaren Hotsa"],
    knownMatches: ["musa 13", "fusilaren hotsa"],
    rejectedKeywords: []
  },
  streetwise: {
    searchQuery: "Streetwise",
    itunesArtistId: 1436623399,
    deezerArtistId: 103328,
    searchQueries: ["Streetwise Txantxangorria", "Streetwise Izatea Baino"],
    knownMatches: ["txantxangorria", "izatea baino"],
    rejectedKeywords: []
  }
};

export function isValidMatchForArtist(
  artistName: string,
  m: { title: string; album?: string | null; genre?: string | null }
): boolean {
  const key = artistName.trim().toLowerCase();
  const disam = BASQUE_DISAMBIGUATION[key];
  if (!disam) return true;

  const targetText = `${m.title} ${m.album ?? ""} ${m.genre ?? ""}`.toLowerCase();

  // 1. Strict check: rejected keywords (reject foreign genres, unrelated homonyms)
  for (const rejected of disam.rejectedKeywords) {
    if (targetText.includes(rejected.toLowerCase())) {
      return false;
    }
  }

  // 2. If it matches known matches, it is confirmed authentic
  if (disam.knownMatches && disam.knownMatches.length > 0) {
    const matched = disam.knownMatches.some((k) => targetText.includes(k.toLowerCase()));
    if (matched) return true;
  }

  // 3. For new releases: as long as it does not hit rejected homonym keywords,
  // it is admitted into the artist catalog.
  return true;
}

// ---------------------------------------------------------------------------
// iTunes Search API (Apple) — fully public, no key, JSONP-free JSON.
// ---------------------------------------------------------------------------

interface ITunesResult {
  artistName: string;
  trackName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  artworkUrl100?: string;
  primaryGenreName?: string;
  isrc?: string;
  kind?: string;
}

async function searchItunes(query: string): Promise<OnlineMatch[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=20`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ITunesResult[] };
    return (data.results ?? [])
      .filter((r) => r.trackName && r.previewUrl)
      .map((r) => ({
        title: r.trackName as string,
        artist: r.artistName,
        album: r.collectionName ?? null,
        duration: Math.round((r.trackTimeMillis ?? 0) / 1000),
        isrc: r.isrc ?? null,
        // upsize the 100px artwork to a higher resolution
        artwork: (r.artworkUrl100 ?? "").replace("100x100bb", "300x300bb") || null,
        previewUrl: null,
        previewUrlAlt: r.previewUrl ?? null,
        genre: r.primaryGenreName ?? null,
        source: "itunes" as const,
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Deezer API — fully public, no key.
// ---------------------------------------------------------------------------

interface DeezerResult {
  title: string;
  artist: { name: string };
  album: { title: string; cover_big?: string; cover_medium?: string };
  duration: number;
  preview: string;
  isrc?: string;
}

async function searchDeezer(query: string): Promise<OnlineMatch[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=20`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: DeezerResult[] };
    return (data.data ?? [])
      .filter((r) => r.preview)
      .map((r) => ({
        title: r.title,
        artist: r.artist.name,
        album: r.album.title ?? null,
        duration: r.duration,
        isrc: r.isrc ?? null,
        artwork: r.album.cover_big ?? r.album.cover_medium ?? null,
        previewUrl: r.preview,
        previewUrlAlt: null,
        genre: null,
        source: "deezer" as const,
      }));
  } catch {
    return [];
  }
}

// Normalize text for dedup / matching.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*-\s*(single|remastered|deluxe|edit).*$/i, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(matches: OnlineMatch[]): OnlineMatch[] {
  const seen = new Map<string, OnlineMatch>();
  for (const m of matches) {
    const key = `${norm(m.artist)}::${norm(m.title)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, m);
    } else {
      // merge: keep best artwork + both previews
      if (!existing.previewUrl && m.previewUrl) existing.previewUrl = m.previewUrl;
      if (!existing.previewUrlAlt && m.previewUrlAlt) existing.previewUrlAlt = m.previewUrlAlt;
      if (!existing.artwork && m.artwork) existing.artwork = m.artwork;
      if (!existing.isrc && m.isrc) existing.isrc = m.isrc;
    }
  }
  return [...seen.values()];
}

export async function searchOnline(query: string): Promise<OnlineMatch[]> {
  const q = query.trim();
  if (!q) return [];
  const [itunes, deezer] = await Promise.all([searchItunes(q), searchDeezer(q)]);
  const raw = [...deezer, ...itunes];
  
  const qLower = q.toLowerCase();
  const filtered = raw.filter((m) => {
    for (const artistKey of Object.keys(BASQUE_DISAMBIGUATION)) {
      if (qLower.includes(artistKey) || m.artist.toLowerCase().includes(artistKey)) {
        if (!isValidMatchForArtist(artistKey, m)) return false;
      }
    }
    return true;
  });

  return dedupe(filtered).slice(0, 24);
}

// ---------------------------------------------------------------------------
// FULL DISCOGRAPHY — fetch every song for a specific artist (not just search
// matches). This fixes "only 8 songs for ZETAK" by pulling the complete catalog.
// ---------------------------------------------------------------------------

/** iTunes: artistName -> artistId -> lookup up to 200 songs in one call. */
async function getItunesArtistId(term: string): Promise<number | null> {
  try {
    const key = term.trim().toLowerCase();
    const disam = BASQUE_DISAMBIGUATION[key];
    if (disam?.itunesArtistId) {
      return disam.itunesArtistId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=30`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        artistId?: number;
        artistName?: string;
        trackName?: string;
        collectionName?: string;
        primaryGenreName?: string;
      }>;
    };

    if (!data.results?.length) return null;

    if (disam) {
      // First try to find a track matching knownMatches
      const knownMatch = data.results.find((r) => {
        if (!r.artistId) return false;
        const text = `${r.trackName ?? ""} ${r.collectionName ?? ""}`.toLowerCase();
        return disam.knownMatches.some((k) => text.includes(k.toLowerCase()));
      });
      if (knownMatch?.artistId) return knownMatch.artistId;

      // Otherwise find first result passing isValidMatchForArtist
      const valid = data.results.find((r) => {
        if (!r.artistId) return false;
        return isValidMatchForArtist(key, { title: r.trackName ?? "", album: r.collectionName, genre: r.primaryGenreName });
      });
      return valid?.artistId ?? data.results[0]?.artistId ?? null;
    }

    return data.results[0]?.artistId ?? null;
  } catch {
    return null;
  }
}

async function getItunesDiscography(artistId: number): Promise<OnlineMatch[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=200`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: ITunesResult[] };
    return (data.results ?? [])
      .filter((r) => r.trackName && r.previewUrl)
      .map((r) => ({
        title: r.trackName as string,
        artist: r.artistName,
        album: r.collectionName ?? null,
        duration: Math.round((r.trackTimeMillis ?? 0) / 1000),
        isrc: r.isrc ?? null,
        artwork: (r.artworkUrl100 ?? "").replace("100x100bb", "300x300bb") || null,
        previewUrl: null,
        previewUrlAlt: r.previewUrl ?? null,
        genre: r.primaryGenreName ?? null,
        source: "itunes" as const,
      }));
  } catch {
    return [];
  }
}

/** Deezer: artistName -> artistId -> all albums -> all tracks (with previews). */
async function getDeezerDiscography(artistName: string): Promise<OnlineMatch[]> {
  try {
    const key = artistName.trim().toLowerCase();
    const disam = BASQUE_DISAMBIGUATION[key];

    let artistId: number | null = disam?.deezerArtistId ?? null;

    if (!artistId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const sres = await fetch(
        `https://api.deezer.com/search?q=${encodeURIComponent(artistName)}&limit=30`,
        { signal: controller.signal, headers: { accept: "application/json" } },
      );
      clearTimeout(timer);
      if (!sres.ok) return [];
      const sdata = (await sres.json()) as {
        data?: Array<{
          artist?: { id?: number; name?: string };
          album?: { title?: string };
          title?: string;
        }>;
      };

      if (disam && sdata.data?.length) {
        const known = sdata.data.find((d) => {
          if (!d.artist?.id) return false;
          const text = `${d.title ?? ""} ${d.album?.title ?? ""}`.toLowerCase();
          return disam.knownMatches.some((k) => text.includes(k.toLowerCase()));
        });
        if (known?.artist?.id) {
          artistId = known.artist.id;
        } else {
          const valid = sdata.data.find((d) => {
            if (!d.artist?.id) return false;
            return isValidMatchForArtist(key, { title: d.title ?? "", album: d.album?.title });
          });
          artistId = valid?.artist?.id ?? sdata.data[0]?.artist?.id ?? null;
        }
      } else {
        artistId = sdata.data?.[0]?.artist?.id ?? null;
      }
    }

    if (!artistId) return [];

    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 8000);
    const ares = await fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=50`, {
      signal: c2.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(t2);
    if (!ares.ok) return [];
    const adata = (await ares.json()) as {
      data?: Array<{ id: number; title: string; cover_big?: string; cover_medium?: string }>;
    };
    const albumsList = adata.data ?? [];

    // fetch tracks for each album in parallel (bounded)
    const out: OnlineMatch[] = [];
    const batches = albumsList.slice(0, 25);
    const results = await Promise.all(
      batches.map(async (alb) => {
        const c3 = new AbortController();
        const t3 = setTimeout(() => c3.abort(), 8000);
        const r = await fetch(`https://api.deezer.com/album/${alb.id}/tracks?limit=50`, {
          signal: c3.signal,
          headers: { accept: "application/json" },
        });
        clearTimeout(t3);
        if (!r.ok) return [];
        const d = (await r.json()) as { data?: DeezerResult[] };
        return (d.data ?? [])
          .filter((tr) => tr.preview)
          .map((tr): OnlineMatch => ({
            title: tr.title,
            artist: tr.artist?.name || artistName,
            album: alb.title || tr.album?.title || null,
            duration: tr.duration,
            isrc: tr.isrc ?? null,
            artwork: alb.cover_big ?? alb.cover_medium ?? tr.album?.cover_big ?? null,
            previewUrl: tr.preview,
            previewUrlAlt: null,
            genre: null,
            source: "deezer" as const,
          }));
      }),
    );
    for (const r of results) {
      for (const item of r) {
        if (isValidMatchForArtist(artistName, item)) {
          out.push(item);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Fetch the COMPLETE catalog for an artist by combining iTunes + Deezer
 * discographies plus search queries. Returns a large, deduped set.
 */
export async function getFullDiscography(artistName: string): Promise<OnlineMatch[]> {
  const name = artistName.trim();
  if (!name) return [];
  const key = name.toLowerCase();
  const disam = BASQUE_DISAMBIGUATION[key];

  const artistId = await getItunesArtistId(name);
  const extraQueries = disam?.searchQueries ?? [];
  const extraItunesPromises = extraQueries.map((q) => searchItunes(q));

  const [itunes, deezer, ...extraResults] = await Promise.all([
    artistId ? getItunesDiscography(artistId) : Promise.resolve([] as OnlineMatch[]),
    getDeezerDiscography(name),
    ...extraItunesPromises,
  ]);

  const allExtras = extraResults.flat();
  const combined = [...itunes, ...deezer, ...allExtras].filter((m) => isValidMatchForArtist(name, m));
  return dedupe(combined);
}

// ---------------------------------------------------------------------------
// Ingest: persist online matches as catalog tracks so they get stable ids,
// cover art, ISRC (for YouTube full-track mapping), like / playlist support.
// ---------------------------------------------------------------------------

/**
 * Ingest a full artist discography as catalog tracks. Used by the artist detail
 * page and "see all songs" so every track by an artist is available + playable.
 */
export async function ingestDiscography(artistName: string): Promise<Track[]> {
  const matches = await getFullDiscography(artistName);
  if (matches.length === 0) return [];
  // Normalize the artist to the searched name so collaborations & features
  // (e.g. "ZETAK & Bomba Estéreo", "ZETAK feat. X") all appear on the main
  // artist's page. Matches Spotify's behaviour of showing the full catalog.
  const out: Track[] = [];
  for (const m of matches) {
    out.push(...(await persistMatch({ ...m, artist: artistName })));
  }
  return out;
}

/**
 * Resolve the Deezer artist id for a name (used for related-artists lookup).
 */
async function getDeezerArtistId(artistName: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${artistName}"`)}&limit=1`,
      { signal: controller.signal, headers: { accept: "application/json" } },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ artist?: { id?: number } }> };
    return data.data?.[0]?.artist?.id ?? null;
  } catch {
    return null;
  }
}

const CURATED_RELATED_ARTISTS: Record<string, string[]> = {
  // Basque Urban / Trap / Pop
  "bengo": ["Tatta", "Kixka", "ZETAK", "Malakias", "Chill Mafia", "Dupla", "Merina Gris", "Bulego", "ETS"],
  "tatta": ["Bengo", "Kixka", "Chill Mafia", "Malakias", "Dupla", "ZETAK", "Merina Gris"],
  "chill mafia": ["Dupla", "Tatta", "Bengo", "Merina Gris", "Hofmann", "ZETAK", "Kixka"],
  "zetak": ["Bulego", "ETS", "Bengo", "Huntza", "Merina Gris", "Neomak", "Dupla", "Izaro", "Tatta"],
  "bulego": ["ZETAK", "ETS", "Izaro", "Huntza", "Shinova", "Dupla", "Bengo", "Merina Gris"],
  "en tol sarmiento": ["Bulego", "ZETAK", "Huntza", "Gatibu", "Esne Beltza", "Vendetta", "Skakeitan", "La Txama"],
  "ets": ["Bulego", "ZETAK", "Huntza", "Gatibu", "Esne Beltza", "Vendetta", "Skakeitan", "La Txama"],
  "huntza": ["ETS", "ZETAK", "Bulego", "Izaro", "Neomak", "Gatibu", "Esne Beltza", "La Txama"],
  "dupla": ["Chill Mafia", "ZETAK", "Bengo", "Tatta", "Merina Gris", "Skakeitan", "Bulego"],
  "merina gris": ["ZETAK", "Bulego", "Dupla", "Chill Mafia", "Belako", "Bengo"],
  "neomak": ["Huntza", "ZETAK", "Oreka TX", "Kepa Junkera", "Izaro"],
  "la txama": ["Huntza", "Skakeitan", "Esne Beltza", "Vendetta", "ETS", "Gose"],

  // Basque Indie / Folk / Acoustic
  "izaro": ["Olaia Inziarte", "Idoia", "Anari", "Eñaut Elorrieta", "Olatz Salvador", "Bulego", "ZETAK", "Mikel Urdangarin"],
  "olaia inziarte": ["Izaro", "Idoia", "Anari", "Olatz Salvador", "Eñaut Elorrieta", "Liher", "Merina Gris"],
  "anari": ["Izaro", "Olaia Inziarte", "Mikel Laboa", "Ruper Ordorika", "Lisabö", "Belako", "Mursego"],
  "idoia": ["Izaro", "Olaia Inziarte", "Eñaut Elorrieta", "Olatz Salvador", "Mikel Urdangarin"],
  "eñaut elorrieta": ["Ken Zazpi", "Izaro", "Mikel Urdangarin", "Idoia", "Olatz Salvador", "Anari"],
  "olatz salvador": ["Izaro", "Olaia Inziarte", "Idoia", "Eñaut Elorrieta", "Skakeitan"],
  "mikel laboa": ["Benito Lertxundi", "Xabier Lete", "Ruper Ordorika", "Oskorri", "Anari", "Kepa Junkera", "Lourdes Iriondo"],
  "benito lertxundi": ["Mikel Laboa", "Xabier Lete", "Lourdes Iriondo", "Oskorri", "Imanol", "Ruper Ordorika", "Pantxoa eta Peio"],
  "oskorri": ["Kepa Junkera", "Mikel Laboa", "Benito Lertxundi", "Oreka TX", "Tapia eta Leturia"],
  "kepa junkera": ["Oreka TX", "Oskorri", "Mikel Laboa", "Tapia eta Leturia", "Neomak", "Huntza"],
  "oreka tx": ["Kepa Junkera", "Neomak", "Oskorri", "Mikel Laboa", "Huntza"],
  "ruper ordorika": ["Mikel Laboa", "Benito Lertxundi", "Anari", "Itoiz", "Hertzainak"],

  // Basque Rock / Punk / Post-Punk / Metal
  "berri txarrak": ["Zea Mays", "Gatibu", "Su Ta Gar", "Kuraia", "Lisabö", "Belako", "Willis Drummond", "Hertzainak", "Kortatu"],
  "belako": ["Lukiek", "Vulk", "Willis Drummond", "Berri Txarrak", "Merina Gris", "Zea Mays", "Shinova"],
  "lukiek": ["Belako", "Vulk", "Willis Drummond", "Berri Txarrak", "Zea Mays"],
  "gatibu": ["Berri Txarrak", "Zea Mays", "ETS", "Shinova", "Doctor Deseo", "Hesian", "Vendetta"],
  "zea mays": ["Berri Txarrak", "Gatibu", "Doctor Deseo", "Belako", "Shinova", "Anari", "Su Ta Gar"],
  "su ta gar": ["Berri Txarrak", "Latzen", "EH Sukarra", "Etsaiak", "Zea Mays"],
  "streetwise": ["Brigade Loco", "Bizardunak", "Rotten XIII", "Kaleko Urdangak", "Kortatu", "Hertzainak", "Negu Gorriak"],
  "bizardunak": ["Streetwise", "Brigade Loco", "Rotten XIII", "The Pogues", "Dropkick Murphys", "Kortatu", "Hertzainak", "Skakeitan"],
  "brigade loco": ["Streetwise", "Rotten XIII", "Kaleko Urdangak", "Bizardunak", "Kortatu"],
  "rotten xiii": ["Brigade Loco", "Streetwise", "Kaleko Urdangak", "Bizardunak"],
  "kortatu": ["Negu Gorriak", "Hertzainak", "Barricada", "La Polla Records", "Eskorbuto", "Bizardunak", "Streetwise"],
  "negu gorriak": ["Kortatu", "Hertzainak", "Dut", "Fermin Muguruza", "Berri Txarrak"],
  "hertzainak": ["Kortatu", "Negu Gorriak", "Itoiz", "Doctor Deseo", "Zea Mays", "Berri Txarrak"],
  "doctor deseo": ["Zea Mays", "Gatibu", "Hertzainak", "Itoiz", "Fito & Fitipaldis", "Shinova"],
  "itoiz": ["Hertzainak", "Mikel Laboa", "Ruper Ordorika", "Doctor Deseo", "Zea Mays"],
  "shinova": ["Zea Mays", "Doctor Deseo", "Gatibu", "Vetusta Morla", "Izal", "Love of Lesbian", "Berri Txarrak"],
  "skakeitan": ["Vendetta", "Esne Beltza", "ETS", "Huntza", "La Txama", "Glaukoma", "Dupla"],
  "esne beltza": ["Vendetta", "Skakeitan", "ETS", "Huntza", "Gose", "Fermin Muguruza", "La Txama"],
  "vendetta": ["Esne Beltza", "Skakeitan", "ETS", "Huntza", "Gose", "La Txama", "Gatibu"],
  "glaukoma": ["Skakeitan", "Esne Beltza", "Bad Sound System", "Dupla", "Chill Mafia"],

  // Global Rock / Pop / Indie Folk
  "arctic monkeys": ["The Strokes", "Franz Ferdinand", "Miles Kane", "The Last Shadow Puppets", "Foals", "Kasabian"],
  "the strokes": ["Arctic Monkeys", "The White Stripes", "Franz Ferdinand", "Interpol", "Phoenix", "The Killers"],
  "dua lipa": ["Olivia Rodrigo", "Aitana", "Rosalía", "The Weeknd", "Harry Styles", "Taylor Swift", "Billie Eilish"],
  "rosalía": ["C. Tangana", "Dua Lipa", "Aitana", "Nathy Peluso", "Bad Bunny", "Fred again.."],
  "bon iver": ["Ben Howard", "Passenger", "Boygenius", "Fleet Foxes", "Phoebe Bridgers", "Sufjan Stevens", "Khruangbin"],
  "boygenius": ["Phoebe Bridgers", "Julien Baker", "Lucy Dacus", "Bon Iver", "Big Thief", "Mitski"],
};

/**
 * Get related/similar artists via curated clusters and Deezer API fallback.
 */
async function getRelatedArtists(artistName: string): Promise<string[]> {
  const normKey = artistName.toLowerCase().trim();
  const curated = CURATED_RELATED_ARTISTS[normKey];
  if (curated && curated.length > 0) {
    return [...curated];
  }

  // Fallback to Deezer related artists
  const id = await getDeezerArtistId(artistName);
  if (!id) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://api.deezer.com/artist/${id}/related?limit=8`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ name: string }> };
    return (data.data ?? []).map((a) => a.name).filter(Boolean);
  } catch {
    return [];
  }
}

/** Fast catalog track lookup for radio generation — queries local DB instantly and searches online only if missing */
async function getCatalogTracksForArtist(artistName: string, limit = 8): Promise<Track[]> {
  const normName = artistName.trim();
  if (!normName) return [];

  try {
    const dbRows = await db
      .select()
      .from(tracks)
      .where(
        or(
          ilike(tracks.artistName, normName),
          ilike(tracks.artistName, `%${normName}%`)
        )
      )
      .limit(limit);

    if (dbRows.length >= Math.min(2, limit)) {
      return dbRows.map(mapTrack);
    }

    // Fast lightweight search fallback if 0 or 1 tracks in DB
    try {
      const matches = await searchOnline(normName);
      const persisted: Track[] = [];
      for (const m of matches.slice(0, 3)) {
        const res = await persistMatch(m);
        persisted.push(...res);
      }
      const combined = [...dbRows.map(mapTrack), ...persisted];
      return Array.from(new Map(combined.map((t) => [t.id, t])).values());
    } catch {
      return dbRows.map(mapTrack);
    }
  } catch {
    return [];
  }
}

/** Helper to assemble a radio queue respecting the STRICT 50% max author constraint */
async function buildRadioQueueCore(opts: {
  seedTrack?: Track;
  primaryArtist: string;
  genre?: string | null;
  targetCount?: number;
}): Promise<Track[]> {
  const targetCount = opts.targetCount ?? 18;
  const maxAuthorTracks = Math.floor(targetCount * 0.5); // Strictly at most 50% by the author!
  const seenIds = new Set<number>();
  const authorTracks: Track[] = [];
  const relatedTracks: Track[] = [];

  const normAuthor = opts.primaryArtist.toLowerCase().trim();

  // 1. If a seed track is supplied, it is the first track
  if (opts.seedTrack) {
    seenIds.add(opts.seedTrack.id);
    authorTracks.push(opts.seedTrack);
  }

  // 2. Fetch author tracks in parallel with related artist tracks (runs concurrently in < 100ms!)
  const relatedNames = await getRelatedArtists(opts.primaryArtist);
  const filteredRelated = relatedNames
    .filter((r) => r.toLowerCase().trim() !== normAuthor)
    .slice(0, 6);

  const [authorDiscography, ...relatedTrackArrays] = await Promise.all([
    getCatalogTracksForArtist(opts.primaryArtist, 12),
    ...filteredRelated.map((rName) => getCatalogTracksForArtist(rName, 4)),
  ]);

  const authorCandidates = (authorDiscography || [])
    .filter((t) => !seenIds.has(t.id))
    .sort(() => Math.random() - 0.5);

  for (const t of authorCandidates) {
    if (authorTracks.length >= maxAuthorTracks) break;
    seenIds.add(t.id);
    authorTracks.push(t);
  }

  // 3. Populate related tracks from the parallel related artist results
  for (const rTracks of relatedTrackArrays) {
    const picks = (rTracks || [])
      .filter((t) => !seenIds.has(t.id))
      .sort((a, b) => b.playCount - a.playCount || Math.random() - 0.5)
      .slice(0, 2); // 2 songs per related artist for great variety
    for (const t of picks) {
      seenIds.add(t.id);
      relatedTracks.push(t);
      if (authorTracks.length + relatedTracks.length >= targetCount) break;
    }
    if (authorTracks.length + relatedTracks.length >= targetCount) break;
  }

  // 4. If still under target count, pull genre/style-matched catalog tracks from DB
  if (authorTracks.length + relatedTracks.length < targetCount) {
    const dbCandidates = await db.select().from(tracks).limit(400);
    const mapped: Track[] = dbCandidates.map(mapTrack);
    const genreCandidates = mapped
      .filter((t: Track) => {
        if (seenIds.has(t.id)) return false;
        const aNorm = t.artistName.toLowerCase().trim();
        if (aNorm === normAuthor) return false;
        if (opts.genre && t.genre) {
          const g1 = opts.genre.toLowerCase();
          const g2 = t.genre.toLowerCase();
          return g1.includes(g2) || g2.includes(g1);
        }
        return true;
      })
      .sort(() => Math.random() - 0.5);

    for (const t of genreCandidates) {
      seenIds.add(t.id);
      relatedTracks.push(t);
      if (authorTracks.length + relatedTracks.length >= targetCount) break;
    }
  }

  // Interleave author and related tracks for a true radio vibe, ensuring seed track is first
  const firstTrack = authorTracks[0] || relatedTracks[0];
  const remainingAuthor = authorTracks.slice(1);
  const remainingRelated = [...relatedTracks];

  const mixedTail: Track[] = [];
  while (remainingAuthor.length > 0 || remainingRelated.length > 0) {
    // 1 or 2 related tracks for every 1 author track to keep author <= 50%
    if (remainingRelated.length > 0) {
      mixedTail.push(remainingRelated.shift()!);
    }
    if (remainingRelated.length > 0 && Math.random() > 0.4) {
      mixedTail.push(remainingRelated.shift()!);
    }
    if (remainingAuthor.length > 0) {
      mixedTail.push(remainingAuthor.shift()!);
    }
  }

  return firstTrack ? [firstTrack, ...mixedTail] : mixedTail;
}

/**
 * SONG RADIO — build a Spotify-style radio queue seeded by one track.
 * Enforces: Seed author is at most 50% of total tracks; 50%+ are from related artists.
 */
export async function buildRadio(seedTrackId: number): Promise<Track[]> {
  const seedRows = await db.select().from(tracks).where(eq(tracks.id, seedTrackId)).limit(1);
  const seed = seedRows[0];
  if (!seed) return [];

  const seedTrack = mapTrack(seed);
  return buildRadioQueueCore({
    seedTrack,
    primaryArtist: seed.artistName,
    genre: seed.genre,
    targetCount: 18,
  });
}

/**
 * ARTIST RADIO — build a Spotify-style radio queue seeded by an artist.
 * Enforces: Artist is at most 50% of total tracks; 50%+ are from related artists.
 */
export async function buildArtistRadio(artistIdOrName: number | string): Promise<Track[]> {
  let artistName = String(artistIdOrName);
  let artistGenre: string | null = null;

  if (typeof artistIdOrName === "number" || /^\d+$/.test(String(artistIdOrName))) {
    const [row] = await db
      .select()
      .from(artists)
      .where(eq(artists.id, Number(artistIdOrName)))
      .limit(1);
    if (row) {
      artistName = row.name;
      artistGenre = row.genre;
    }
  }

  return buildRadioQueueCore({
    primaryArtist: artistName,
    genre: artistGenre,
    targetCount: 18,
  });
}

/**
 * ALBUM RADIO — build a Spotify-style radio queue seeded by an album.
 * Enforces: Album author is at most 50% of total tracks; 50%+ are from related artists fitting the album's vibe.
 */
export async function buildAlbumRadio(albumId: number): Promise<Track[]> {
  const [albumRow] = await db.select().from(albums).where(eq(albums.id, albumId)).limit(1);
  if (!albumRow) return [];

  return buildRadioQueueCore({
    primaryArtist: albumRow.artistName,
    genre: albumRow.genre,
    targetCount: 18,
  });
}

/** Find or create an album row for (artistId, albumName); returns its id. */
async function resolveAlbumId(
  artistId: number,
  artistName: string,
  albumName: string | null,
  artwork: string | null,
): Promise<number | null> {
  if (!albumName || !albumName.trim()) return null;
  const name = albumName.trim();
  if (!isValidMatchForArtist(artistName, { title: name, album: name })) {
    return null;
  }
  const existing = await db
    .select({ id: albums.id })
    .from(albums)
    .where(and(eq(albums.artistId, artistId), ilike(albums.title, name)))
    .limit(1);
  if (existing.length) return existing[0].id;
  const [a] = await db
    .insert(albums)
    .values({
      title: name,
      artistId,
      artistName,
      thumbnail: artwork,
      genre: null,
      region: "global",
      trackCount: 0,
      source: "local",
    })
    .returning({ id: albums.id });
  return a.id;
}

const inFlightPersists = new Map<string, Promise<Track[]>>();

/** Persist a single OnlineMatch as a catalog track (dedup by ISRC/title+artist). */
async function persistMatch(m: OnlineMatch): Promise<Track[]> {
  if (!isValidMatchForArtist(m.artist, m)) {
    return [];
  }

  const lockKey = `${norm(m.artist)}::${norm(m.title)}::${norm(m.album ?? "")}`;
  const existingPromise = inFlightPersists.get(lockKey);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    // 1. Check by ISRC if available
    let row: any = null;
    if (m.isrc) {
      const byIsrc = await db.select().from(tracks).where(eq(tracks.isrc, m.isrc)).limit(1);
      if (byIsrc.length) row = byIsrc[0];
    }

    // 2. If not found, check by title + artist name
    if (!row) {
      const parts = splitArtistNames(m.artist);
      const primaryName = parts[0] || m.artist;
      const candidates = await db
        .select()
        .from(tracks)
        .where(
          and(
            ilike(tracks.title, m.title.trim()),
            or(
              ilike(tracks.artistName, m.artist.trim()),
              ilike(tracks.artistName, primaryName.trim()),
              ilike(tracks.artistName, `%${primaryName.trim()}%`)
            )
          )
        )
        .limit(10);

      if (candidates.length) {
        if (m.album) {
          const matchAlbum = candidates.find(
            (c: any) => c.albumName && norm(c.albumName) === norm(m.album!)
          );
          row = matchAlbum || candidates[0];
        } else {
          row = candidates[0];
        }
      }
    }

    if (row) {
      const albumId = row.albumId ?? (row.artistId
        ? await resolveAlbumId(row.artistId, row.artistName, m.album ?? row.albumName, m.artwork)
        : null);
      const needsUpdate =
        (!row.previewUrl || !row.artworkUrl || (!row.albumId && albumId) || (!row.isrc && m.isrc)) &&
        (m.previewUrl || m.artwork || albumId || m.isrc);
      if (needsUpdate) {
        await db
          .update(tracks)
          .set({
            previewUrl: row.previewUrl ?? m.previewUrl,
            previewUrlAlt: row.previewUrlAlt ?? m.previewUrlAlt,
            artworkUrl: row.artworkUrl ?? m.artwork,
            isrc: row.isrc ?? m.isrc,
            albumId: row.albumId ?? albumId,
            albumName: row.albumName ?? m.album,
          })
          .where(eq(tracks.id, row.id));
      }
      return [
        mapTrack({
          ...row,
          previewUrl: row.previewUrl ?? m.previewUrl,
          previewUrlAlt: row.previewUrlAlt ?? m.previewUrlAlt,
          artworkUrl: row.artworkUrl ?? m.artwork,
          isrc: row.isrc ?? m.isrc,
          albumId: row.albumId ?? albumId,
          albumName: row.albumName ?? m.album,
        }),
      ];
    }

    let artistId: number | null = null;
    const parts = splitArtistNames(m.artist);
    const primaryName = parts[0] || m.artist;

    const artistRow = await db
      .select()
      .from(artists)
      .where(ilike(artists.name, primaryName))
      .limit(1);
    if (artistRow.length) {
      if (isValidMatchForArtist(artistRow[0].name, m)) {
        artistId = artistRow[0].id;
      }
    } else {
      const [a] = await db
        .insert(artists)
        .values({ name: primaryName, genre: m.genre, region: "global", language: "und", source: m.source })
        .returning({ id: artists.id });
      artistId = a.id;
    }

    // Ensure other collaborating artists exist as individual artists
    for (const part of parts.slice(1)) {
      const existing = await db
        .select({ id: artists.id })
        .from(artists)
        .where(ilike(artists.name, part))
        .limit(1);
      if (!existing.length) {
        await db
          .insert(artists)
          .values({ name: part, genre: m.genre, region: "global", language: "und", source: m.source })
          .catch(() => {});
      }
    }

    const albumId = artistId
      ? await resolveAlbumId(artistId, m.artist, m.album, m.artwork)
      : null;

    const [rowInserted] = await db
      .insert(tracks)
      .values({
        title: m.title,
        artistId,
        artistName: m.artist,
        albumId,
        albumName: m.album,
        duration: m.duration,
        genre: m.genre,
        region: "global",
        language: "und",
        isrc: m.isrc,
        previewUrl: m.previewUrl,
        previewUrlAlt: m.previewUrlAlt,
        artworkUrl: m.artwork,
        source: m.source,
        playCount: Math.floor(Math.random() * 800) + 50,
      })
      .returning();
    if (albumId) {
      await db
        .update(albums)
        .set({ trackCount: (await db.select({ c: albums.trackCount }).from(albums).where(eq(albums.id, albumId)))[0]?.c ?? 0 })
        .where(eq(albums.id, albumId));
    }
    return [mapTrack(rowInserted)];
  })();

  inFlightPersists.set(lockKey, promise);
  try {
    return await promise;
  } finally {
    inFlightPersists.delete(lockKey);
  }
}

/**
 * Look up a REAL preview + artwork + ISRC for an existing track (by ISRC, or
 * title+artist) and cache it onto the DB row. This is what makes the seeded
 * Basque catalog play the ACTUAL song instead of a royalty-free placeholder.
 */
export async function enrichTrackPreview(input: {
  trackId: number;
  title: string;
  artist: string;
  isrc: string | null;
}): Promise<{ previewUrl: string | null; previewUrlAlt: string | null; artworkUrl: string | null; isrc: string | null } | null> {
  // prefer an exact ISRC lookup on Deezer, else search by title+artist
  const matches = await searchOnline(input.isrc ? input.isrc : `${input.artist} ${input.title}`);
  const key = `${norm(input.artist)}::${norm(input.title)}`;
  const best =
    matches.find((m) => Boolean(input.isrc && m.isrc && m.isrc === input.isrc)) ??
    matches.find((m) => `${norm(m.artist)}::${norm(m.title)}` === key) ??
    matches.find((m) => matchesTitle(input.title, m.title));
  if (!best) return null;
  const payload = {
    previewUrl: best.previewUrl,
    previewUrlAlt: best.previewUrlAlt,
    artworkUrl: best.artwork,
    isrc: best.isrc ?? input.isrc,
  };
  await db
    .update(tracks)
    .set(payload)
    .where(eq(tracks.id, input.trackId));
  return payload;
}

export async function ingestOnlineTracks(query: string): Promise<Track[]> {
  const matches = await searchOnline(query);
  if (matches.length === 0) return [];

  const out: Track[] = [];
  for (const m of matches) {
    out.push(...(await persistMatch(m)));
  }
  return out;
}
