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
}

export interface Playlist {
  id: number;
  name: string;
  description: string | null;
  coverSeed: string | null;
  trackCount: number;
  type?: string;
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
  contentType: string;
  duration: number;
  provider: "piped" | "invidious" | "lbry" | "preview" | "demo";
  sponsorblockAvailable: boolean;
}

export interface Recommendation {
  track: Track;
  artist?: Artist | null;
  score: number;
  reason: string;
}
