import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  primaryKey,
  index,
  real,
} from "drizzle-orm/pg-core";

/**
 * EuskalSoinua — ad-free open-source media client.
 *
 * The app is a single-user local media client. It aggregates *metadata* from
 * legal public APIs (Piped/Invidious, Spotify public metadata, Deezer) and
 * resolves a clean, ad-free audio stream on demand. It never hosts files.
 */

// ---------------------------------------------------------------------------
// Catalog (aggregated metadata, cached locally)
// ---------------------------------------------------------------------------

export const artists = pgTable("artists", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"),
  source: text("source").notNull().default("local"), // local | youtube | spotify | deezer
  name: text("name").notNull(),
  thumbnail: text("thumbnail"),
  genre: text("genre"),
  region: text("region").default("global"), // eu (Basque), es, global ...
  language: text("language").default("und"), // eu, es, en, und
  bio: text("bio"),
  monthlyListeners: integer("monthly_listeners").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const albums = pgTable("albums", {
  id: serial("id").primaryKey(),
  externalId: text("external_id"),
  source: text("source").notNull().default("local"),
  title: text("title").notNull(),
  artistId: integer("artist_id").references(() => artists.id, { onDelete: "set null" }),
  artistName: text("artist_name"),
  thumbnail: text("thumbnail"),
  year: integer("year"),
  genre: text("genre"),
  region: text("region").default("global"),
  trackCount: integer("track_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tracks = pgTable(
  "tracks",
  {
    id: serial("id").primaryKey(),
    externalId: text("external_id"),
    source: text("source").notNull().default("local"), // local | youtube | spotify | deezer
    title: text("title").notNull(),
    artistId: integer("artist_id").references(() => artists.id, { onDelete: "set null" }),
    artistName: text("artist_name").notNull(),
    albumId: integer("album_id").references(() => albums.id, { onDelete: "set null" }),
    albumName: text("album_name"),
    duration: integer("duration").default(0), // seconds
    thumbnail: text("thumbnail"),
    genre: text("genre"),
    region: text("region").default("global"),
    language: text("language").default("und"),
    // Demo tracks point at a royalty-free audio index (1..9). YouTube tracks
    // are resolved at play time via the Piped/Invidious proxy.
    demoAudio: integer("demo_audio"),
    isrc: text("isrc"),
    // Real, playable 30-second preview of the ACTUAL song (Deezer / iTunes).
    // Guarantees the audio always corresponds to the track even when YouTube
    // audio extraction is blocked — a real fallback, not a random royalty-free file.
    previewUrl: text("preview_url"),
    previewUrlAlt: text("preview_url_alt"),
    // Real album artwork (from iTunes/Deezer). Falls back to a generated gradient.
    artworkUrl: text("artwork_url"),
    playCount: integer("play_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tracks_artist_idx").on(t.artistId),
    index("tracks_album_idx").on(t.albumId),
    index("tracks_region_idx").on(t.region),
    index("tracks_source_idx").on(t.source),
    index("tracks_title_idx").on(t.title),
  ],
);

// ---------------------------------------------------------------------------
// User library
// ---------------------------------------------------------------------------

export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  syncKey: text("sync_key").notNull().default("default"),
  name: text("name").notNull(),
  description: text("description"),
  coverSeed: text("cover_seed"), // deterministic gradient seed
  trackCount: integer("track_count").default(0).notNull(),
  // "user" = manually created playlist; "radio" = auto-generated song radio
  type: text("type").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playlistTracks = pgTable(
  "playlist_tracks",
  {
    id: serial("id").primaryKey(),
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("pt_playlist_idx").on(t.playlistId, t.position),
    index("pt_track_idx").on(t.trackId),
  ],
);

export const likedTracks = pgTable(
  "liked_tracks",
  {
    syncKey: text("sync_key").notNull().default("default"),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    likedAt: timestamp("liked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.syncKey, t.trackId] })],
);

export const followedArtists = pgTable(
  "followed_artists",
  {
    syncKey: text("sync_key").notNull().default("default"),
    artistId: integer("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    followedAt: timestamp("followed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.syncKey, t.artistId] })],
);

export const savedAlbums = pgTable(
  "saved_albums",
  {
    syncKey: text("sync_key").notNull().default("default"),
    albumId: integer("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.syncKey, t.albumId] })],
);

// ---------------------------------------------------------------------------
// Recommendation signal (privacy-focused, on-device scoring)
// ---------------------------------------------------------------------------

export const listenEvents = pgTable(
  "listen_events",
  {
    id: serial("id").primaryKey(),
    syncKey: text("sync_key").notNull().default("default"),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    artistId: integer("artist_id"),
    genre: text("genre"),
    region: text("region"),
    // listened past 30s / to the end = positive signal; skipped early = negative
    completed: boolean("completed").default(false).notNull(),
    skipped: boolean("skipped").default(false).notNull(),
    listenSeconds: integer("listen_seconds").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("le_sync_track_idx").on(t.syncKey, t.trackId),
    index("le_track_idx").on(t.trackId),
    index("le_genre_idx").on(t.genre),
    index("le_region_idx").on(t.region),
  ],
);

// ---------------------------------------------------------------------------
// Key/value client settings (Basque booster toggle, eq presets, etc.)
// ---------------------------------------------------------------------------

export const settings = pgTable(
  "settings",
  {
    syncKey: text("sync_key").notNull().default("default"),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.syncKey, t.key] })],
);

// ---------------------------------------------------------------------------
// Devices utilizing a sync key
// ---------------------------------------------------------------------------

export const syncDevices = pgTable(
  "sync_devices",
  {
    syncKey: text("sync_key").notNull(),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name").notNull(),
    userAgent: text("user_agent"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.syncKey, t.deviceId] })],
);

// ---------------------------------------------------------------------------
// Equalizer presets (user-tunable)
// ---------------------------------------------------------------------------

export const eqPresets = pgTable("eq_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  // 5-band gains in dB: [60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz]
  bands: text("bands").notNull(), // JSON array
  isDefault: boolean("is_default").default(false).notNull(),
});

// ---------------------------------------------------------------------------
// Device Access Control & Admin Management
// ---------------------------------------------------------------------------

export const deviceAccessRequests = pgTable(
  "device_access_requests",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull().unique(),
    deviceName: text("device_name").notNull(),
    userName: text("user_name"),
    userEmail: text("user_email"),
    requestNote: text("request_note"),
    ipAddress: text("ip_address").notNull(),
    country: text("country"),
    city: text("city"),
    regionName: text("region_name"),
    locationCoords: text("location_coords"),
    timezone: text("timezone"),
    userAgent: text("user_agent"),
    status: text("status").notNull().default("pending"), // "pending" | "accepted" | "rejected"
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("dar_device_idx").on(t.deviceId),
    index("dar_status_idx").on(t.status),
    index("dar_ip_idx").on(t.ipAddress),
  ],
);

export const adminConfig = pgTable("admin_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
