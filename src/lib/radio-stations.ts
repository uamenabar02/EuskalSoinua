import "server-only";

/**
 * LIVE RADIO
 * ----------------------------------------------------------------------------
 * A curated set of verified-working live radio streams, grouped by country and
 * region, plus on-demand browsing of the free Radio Browser API
 * (radio-browser.info — a community-maintained directory of ~50k stations).
 *
 * The curated list prioritises Basque (Euskadi) and Spanish stations since
 * that's the app's focus, with a selection of international channels.
 */

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  country: string;
  countryCode: string;
  region: string;
  category: string; // e.g. "Basque", "Spain", "News", "Music", "International"
  favicon?: string | null;
  bitrate?: number;
  tags?: string[];
  curated?: boolean;
}

// ---------------------------------------------------------------------------
// Curated stations — every URL below was verified to return audio (200/206).
// ---------------------------------------------------------------------------

const CURATED: RadioStation[] = [
  // === EUSKADI / BASQUE COUNTRY ===
  {
    id: "eu-euskadi-irratia",
    name: "Euskadi Irratia",
    streamUrl: "http://mp3-eitb.stream.flumotion.com/eitb/euskadiirratia.mp3",
    country: "Euskadi",
    countryCode: "ES",
    region: "Euskadi",
    category: "Basque",
    tags: ["euskera", "news", "music", "eitb"],
    curated: true,
  },
  {
    id: "eu-gaztea",
    name: "Gaztea",
    streamUrl: "http://mp3-eitb.stream.flumotion.com/eitb/gaztea.mp3",
    country: "Euskadi",
    countryCode: "ES",
    region: "Euskadi",
    category: "Basque",
    tags: ["euskera", "music", "youth", "eitb"],
    curated: true,
  },
  {
    id: "eu-radio-euskadi",
    name: "Radio Euskadi",
    streamUrl: "http://mp3-eitb.stream.flumotion.com/eitb/radioeuskadi.mp3",
    country: "Euskadi",
    countryCode: "ES",
    region: "Euskadi",
    category: "Basque",
    tags: ["euskera", "news", "eitb"],
    curated: true,
  },
  {
    id: "eu-eitb-musika",
    name: "EITB Musika",
    streamUrl: "http://mp3-eitb.stream.flumotion.com/eitb/eitbmusika.mp3",
    country: "Euskadi",
    countryCode: "ES",
    region: "Euskadi",
    category: "Basque",
    tags: ["euskera", "music", "eitb"],
    curated: true,
  },
  {
    id: "eu-euskalerria",
    name: "Euskalerria Irratia",
    streamUrl: "http://server4.beatproducciones.com:8014/",
    country: "Euskadi",
    countryCode: "ES",
    region: "Euskadi",
    category: "Basque",
    tags: ["euskera", "music", "local"],
    curated: true,
  },

  // === SPAIN ===
  {
    id: "es-europa-fm",
    name: "Europa FM Gipuzkoa",
    streamUrl: "https://stream.zeno.fm/se76qau1hc9uv",
    country: "Euskadi",
    countryCode: "ES",
    region: "Euskadi",
    category: "Basque",
    tags: ["music", "pop", "hits"],
    curated: true,
  },
  {
    id: "es-cadena-100",
    name: "Cadena 100",
    streamUrl: "http://cadena100-streamers-mp3.flumotion.com/cope/cadena100.mp3",
    country: "España",
    countryCode: "ES",
    region: "España",
    category: "Spain",
    bitrate: 128,
    tags: ["music", "pop"],
    curated: true,
  },
  {
    id: "es-rock-fm",
    name: "Rock FM",
    streamUrl: "http://flucast31-h-cloud.flumotion.com/cope/rockfm-low.mp3",
    country: "España",
    countryCode: "ES",
    region: "España",
    category: "Spain",
    tags: ["music", "rock"],
    curated: true,
  },
  {
    id: "es-los40",
    name: "LOS40",
    streamUrl: "https://20043.live.streamtheworld.com/LOS40.mp3",
    country: "España",
    countryCode: "ES",
    region: "España",
    category: "Spain",
    bitrate: 128,
    tags: ["music", "pop", "hits"],
    curated: true,
  },
  {
    id: "es-esradio",
    name: "esRadio",
    streamUrl: "http://livestreaming.esradio.fm/stream64.mp3",
    country: "España",
    countryCode: "ES",
    region: "España",
    category: "Spain",
    bitrate: 56,
    tags: ["news", "talk"],
    curated: true,
  },

  // === FRANCE ===
  {
    id: "fr-nostalgie",
    name: "Nostalgie",
    streamUrl: "https://streaming.nrjaudio.fm/oua8a3w2dqao?origine=player",
    country: "France",
    countryCode: "FR",
    region: "France",
    category: "International",
    tags: ["music", "80s", "hits"],
    curated: true,
  },

  // === UK ===
  {
    id: "uk-bbc-radio1",
    name: "BBC Radio 1",
    streamUrl: "http://stream.live.vc.bbcmedia.co.uk/bbc_radio_one",
    country: "United Kingdom",
    countryCode: "GB",
    region: "United Kingdom",
    category: "International",
    tags: ["music", "pop"],
    curated: true,
  },
  {
    id: "uk-bbc-radio6",
    name: "BBC Radio 6 Music",
    streamUrl: "http://stream.live.vc.bbcmedia.co.uk/bbc_6music",
    country: "United Kingdom",
    countryCode: "GB",
    region: "United Kingdom",
    category: "International",
    tags: ["music", "alternative"],
    curated: true,
  },
  {
    id: "pt-m80",
    name: "M80",
    streamUrl: "https://stream-icy.bauermedia.pt/m80.mp3",
    country: "Portugal",
    countryCode: "PT",
    region: "Portugal",
    category: "International",
    tags: ["music", "80s", "hits"],
    curated: true,
  },
  {
    id: "us-radioparadise",
    name: "Radio Paradise",
    streamUrl: "http://stream-uk1.radioparadise.com/aac-320",
    country: "International",
    countryCode: "US",
    region: "International",
    category: "International",
    tags: ["music", "eclectic", "DJ mix"],
    curated: true,
  },
  {
    id: "us-somafm",
    name: "SomaFM Groove Salad",
    streamUrl: "https://ice1.somafm.com/groovesalad-256-mp3",
    country: "International",
    countryCode: "US",
    region: "International",
    category: "International",
    tags: ["music", "ambient", "chill"],
    curated: true,
  },
];

export function getCuratedStations(): RadioStation[] {
  return CURATED;
}

// ---------------------------------------------------------------------------
// Radio Browser API — browse the community directory for more stations.
// ---------------------------------------------------------------------------

const RB_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://fi1.api.radio-browser.info",
];

/** Try each server in sequence until one responds. */
async function rbFetch(path: string): Promise<RBStation[] | null> {
  for (const base of RB_SERVERS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${base}${path}`, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "EuskalSoinua/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      return (await res.json()) as RBStation[];
    } catch {
      // try next server
    }
  }
  return null;
}

interface RBStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  country: string;
  countrycode: string;
  state: string;
  tags: string;
  favicon: string;
  bitrate: number;
  codec: string;
}

/** Search the Radio Browser directory by free text (optional country filter). */
export async function searchRadioStations(
  query: string,
  country?: string,
): Promise<RadioStation[]> {
  if (!query.trim() && !country) return [];
  const params = new URLSearchParams({
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
    limit: "40",
  });
  if (country) params.set("countrycode", country);
  const path = query.trim()
    ? `/json/stations/byname/${encodeURIComponent(query)}`
    : "/json/stations/topclick/40";
  const data = await rbFetch(`${path}?${params.toString()}`);
  if (!data) return [];
  return data
    .filter((s) => s.url_resolved && s.url_resolved.startsWith("http"))
    .map((s) => ({
      id: s.stationuuid,
      name: s.name.trim() || "Unknown",
      streamUrl: s.url_resolved,
      country: s.country || "Unknown",
      countryCode: s.countrycode || "",
      region: s.state || s.country || "",
      category: "Browse",
      favicon: s.favicon || null,
      bitrate: s.bitrate || 0,
      tags: s.tags ? s.tags.split(",").filter(Boolean).slice(0, 4) : [],
    }));
}

/** Group stations by region for display. */
export function groupByRegion(stations: RadioStation[]): {
  region: string;
  stations: RadioStation[];
}[] {
  const map = new Map<string, RadioStation[]>();
  for (const s of stations) {
    const key = s.region || s.country || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return [...map.entries()].map(([region, sts]) => ({ region, stations: sts }));
}
