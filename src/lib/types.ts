// Shared domain types for EuskalSoinua.

export type SourceType = "local" | "youtube" | "spotify" | "deezer";

export interface Track {
  id: number;
  externalId: string | null;
  source: SourceType;
  title: string;
  artistId: number | null;
  artistName: string;
  albumId: number | null;
  albumName: string | null;
  duration: number;
  thumbnail: string | null;
  genre: string | null;
  region: string;
  language: string;
  demoAudio: number | null;
  isrc: string | null;
  previewUrl: string | null;
  previewUrlAlt: string | null;
  artworkUrl: string | null;
  playCount: number;
}

export interface Artist {
  id: number;
  externalId: string | null;
  source: SourceType;
  name: string;
  thumbnail: string | null;
  genre: string | null;
  region: string;
  language: string;
  bio: string | null;
  monthlyListeners: number;
  followed?: boolean;
}

export interface Album {
  id: number;
  externalId: string | null;
  source: SourceType;
  title: string;
  artistId: number | null;
  artistName: string | null;
  thumbnail: string | null;
  year: number | null;
  genre: string | null;
  region: string;
  trackCount: number;
  saved?: boolean;
  trackIds?: number[];
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  coverSeed: string | null;
  trackCount: number;
  type?: string;
  trackIds?: number[];
}

export interface LyricLine {
  time: number; // seconds, -1 = unsynced
  text: string;
}

export interface SponsorSegment {
  start: number;
  end: number;
  category: string;
}

export interface StreamResult {
  url: string;
  originalUrl?: string;
  contentType: string;
  duration: number;
  provider: "youtube" | "piped" | "invidious" | "lbry" | "preview" | "demo";
  sponsorblockAvailable: boolean;
}

export interface Recommendation {
  track: Track;
  artist?: Artist | null;
  score: number;
  reason: string;
}

export interface UserTasteProfile {
  genres: string[];
  regions: string[];
  energy?: "chill" | "balanced" | "high" | "intense";
  era?: "all" | "modern" | "2010s" | "2000s" | "90s80s";
  moods?: string[];
  vocalPreference?: "any" | "vocal" | "instrumental";
  discoveryBias?: "balanced" | "familiar" | "deep_cuts";
  favoriteArtists?: string[];
  excludedGenres?: string[];
  languagePreferences?: string[];
  basqueAffinity?: number; // 0 to 100
}
