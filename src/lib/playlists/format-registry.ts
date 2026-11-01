/**
 * PLAYLIST FORMAT REGISTRY
 * ----------------------------------------------------------------------------
 * Mirrors the playlist vocabulary observed in Spotify's client (Pathfinder
 * `home` payload): every generated playlist carries a stable `format`, a
 * `mediaListConfig`-style template, a refresh cadence and a "made for" marker.
 *
 * Keeping the vocabulary in one place means the API, the shelf builder and the
 * UI all speak the same language, and new formats slot in without touching
 * call sites.
 */

export type PlaylistFormat =
  | "daily-mix"
  | "discover-weekly"
  | "release-radar"
  | "on-repeat"
  | "repeat-rewind"
  | "topic-mix"
  | "artist-seed-mix"
  | "car-mix"
  | "inspiredby-mix";

export type RefreshCadence = "daily" | "weekly";

export interface FormatDefinition {
  format: PlaylistFormat;
  /** Observed Spotify template, e.g. `dailymix:default_v41`. */
  mediaListConfig: string | null;
  refresh: RefreshCadence;
  /** Personalized ("made for <user>") playlist vs editorial/global. */
  madeFor: boolean;
  titleTemplate: string;
}

export const FORMAT_REGISTRY: Record<PlaylistFormat, FormatDefinition> = {
  "daily-mix": {
    format: "daily-mix",
    mediaListConfig: "dailymix:default_v41",
    refresh: "daily",
    madeFor: true,
    titleTemplate: "Daily Mix {index}",
  },
  "discover-weekly": {
    format: "discover-weekly",
    mediaListConfig: null,
    refresh: "weekly",
    madeFor: true,
    titleTemplate: "Discover Weekly",
  },
  "release-radar": {
    format: "release-radar",
    mediaListConfig: null,
    refresh: "weekly",
    madeFor: true,
    titleTemplate: "Release Radar",
  },
  "on-repeat": {
    format: "on-repeat",
    mediaListConfig: null,
    refresh: "daily",
    madeFor: true,
    titleTemplate: "On Repeat",
  },
  "repeat-rewind": {
    format: "repeat-rewind",
    mediaListConfig: null,
    refresh: "daily",
    madeFor: true,
    titleTemplate: "Repeat Rewind",
  },
  "topic-mix": {
    format: "topic-mix",
    mediaListConfig: "topic-mix-genre-decade:default_v21",
    refresh: "weekly",
    madeFor: true,
    titleTemplate: "{genre} Mix",
  },
  "artist-seed-mix": {
    format: "artist-seed-mix",
    mediaListConfig: "artist-seed-mix:default_v27",
    refresh: "weekly",
    madeFor: true,
    titleTemplate: "Mix of {artist}",
  },
  "car-mix": {
    format: "car-mix",
    mediaListConfig: null,
    refresh: "weekly",
    madeFor: true,
    titleTemplate: "Daily Drive",
  },
  "inspiredby-mix": {
    format: "inspiredby-mix",
    mediaListConfig: "track-radio-inspiredby:default_v29",
    refresh: "daily",
    madeFor: true,
    titleTemplate: "Radio {seed}",
  },
};

export interface FormatContext {
  index?: number;
  seed?: string;
  artist?: string;
  genre?: string;
  /** Top artists in the generated mix, used for the description. */
  artists?: string[];
}

const MAX_DESCRIPTION_ARTISTS = 3;

/** Human title for a format (English, matches the observed Spotify copy). */
export function buildFormatTitle(format: PlaylistFormat, ctx: FormatContext = {}): string {
  const def = FORMAT_REGISTRY[format];
  return def.titleTemplate
    .replace("{index}", String(ctx.index ?? 1))
    .replace("{seed}", ctx.seed ?? "")
    .replace("{artist}", ctx.artist ?? "")
    .replace("{genre}", ctx.genre ?? "")
    .trim();
}

/** "With A, B, C and more" — Spotify's radio/daily-mix description shape. */
export function buildArtistsDescription(artists: string[], prefix = "With"): string {
  const unique = Array.from(new Set(artists.map((a) => a.trim()).filter(Boolean)));
  if (unique.length === 0) return "";
  const top = unique.slice(0, MAX_DESCRIPTION_ARTISTS);
  if (unique.length <= 1) return `${prefix} ${top[0]}`;
  if (unique.length === 2) return `${prefix} ${top[0]} and ${top[1]}`;
  if (unique.length > MAX_DESCRIPTION_ARTISTS) {
    // Spotify's shape for 4+: "With A, B, C and more".
    return `${prefix} ${top.join(", ")} and more`;
  }
  return `${prefix} ${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
}

export function buildFormatDescription(
  format: PlaylistFormat,
  ctx: FormatContext = {},
): string {
  const artists = buildArtistsDescription(ctx.artists ?? [], "With");
  switch (format) {
    case "daily-mix":
      return artists ? `${artists} and more` : "A mix of favourites and new finds.";
    case "inspiredby-mix":
      return artists || "A station built from this seed.";
    case "discover-weekly":
      return "New music picked for you. Refreshes every Monday.";
    case "release-radar":
      return "The latest releases from artists you follow and love.";
    case "on-repeat":
      return "The songs you have had on repeat lately.";
    case "repeat-rewind":
      return "Old favourites worth another spin.";
    case "topic-mix":
      return ctx.genre ? `A deep dive into ${ctx.genre}.` : "A deep dive into one sound.";
    case "artist-seed-mix":
      return artists || (ctx.artist ? `Built around ${ctx.artist} and similar artists.` : "");
    case "car-mix":
      return "Upbeat, driving-friendly tracks for the road.";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Stable IDs
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const FORMAT_PREFIXES: Array<{ prefix: string; format: PlaylistFormat }> = [
  { prefix: "daily-mix-", format: "daily-mix" },
  { prefix: "discover-weekly", format: "discover-weekly" },
  { prefix: "release-radar", format: "release-radar" },
  { prefix: "on-repeat", format: "on-repeat" },
  { prefix: "repeat-rewind", format: "repeat-rewind" },
  { prefix: "topic-mix-", format: "topic-mix" },
  { prefix: "artist-mix-", format: "artist-seed-mix" },
  { prefix: "car-mix", format: "car-mix" },
];

/** Builds the routing id used by `/playlist/[id]` and the generated API. */
export function generatedPlaylistId(
  format: PlaylistFormat,
  opts: { index?: number; slug?: string } = {},
): string {
  switch (format) {
    case "daily-mix":
      return `daily-mix-${opts.index ?? 1}`;
    case "discover-weekly":
      return "discover-weekly";
    case "release-radar":
      return "release-radar";
    case "on-repeat":
      return "on-repeat";
    case "repeat-rewind":
      return "repeat-rewind";
    case "car-mix":
      return "car-mix";
    case "topic-mix":
      return `topic-mix-${slugify(opts.slug ?? "mix")}`;
    case "artist-seed-mix":
      return `artist-mix-${slugify(opts.slug ?? "artist")}`;
    case "inspiredby-mix":
      return `radio-${slugify(opts.slug ?? "seed")}`;
    default:
      return "generated";
  }
}

export interface ParsedPlaylistId {
  format: PlaylistFormat;
  index?: number;
  slug?: string;
}

/** Parses a generated playlist id, or returns null for real DB playlists. */
export function parseGeneratedPlaylistId(id: string): ParsedPlaylistId | null {
  for (const { prefix, format } of FORMAT_PREFIXES) {
    if (id === prefix.replace(/-$/, "") || id.startsWith(prefix)) {
      const rest = id.slice(prefix.length);
      if (format === "daily-mix") {
        const index = Number(rest);
        return { format, index: Number.isFinite(index) && index > 0 ? index : 1 };
      }
      if (prefix.endsWith("-")) {
        return { format, slug: rest };
      }
      return { format };
    }
  }
  return null;
}

export function isGeneratedPlaylistId(id: string): boolean {
  return parseGeneratedPlaylistId(id) !== null;
}

// ---------------------------------------------------------------------------
// Refresh windows (deterministic seeds)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Stable per-day key, e.g. `daily:2026-10-31`. */
export function refreshSeed(refresh: RefreshCadence, now: Date = new Date()): string {
  const iso = now.toISOString();
  if (refresh === "daily") return `daily:${iso.slice(0, 10)}`;
  // ISO week anchor (Monday) so the seed flips weekly, like Discover Weekly.
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  return `weekly:${monday.toISOString().slice(0, 10)}`;
}

/** Start of the refresh window, used to bound "new releases" etc. */
export function refreshWindowStart(refresh: RefreshCadence, now: Date = new Date()): Date {
  if (refresh === "daily") return new Date(now.getTime() - DAY_MS);
  return new Date(now.getTime() - 7 * DAY_MS);
}
