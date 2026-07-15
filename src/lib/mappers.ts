import type { Track, Artist, Album, SourceType } from "@/lib/types";

// Normalize raw DB rows (which allow nulls) into the non-null domain types used
// across the UI. Centralizing this keeps API routes + the recommender consistent.

type TrackRow = {
  id: number;
  externalId: string | null;
  source: string;
  title: string;
  artistId: number | null;
  artistName: string;
  albumId: number | null;
  albumName: string | null;
  duration: number | null;
  thumbnail: string | null;
  genre: string | null;
  region: string | null;
  language: string | null;
  demoAudio: number | null;
  isrc: string | null;
  previewUrl: string | null;
  previewUrlAlt: string | null;
  artworkUrl: string | null;
  playCount: number | null;
};

export function mapTrack(r: TrackRow): Track {
  return {
    id: r.id,
    externalId: r.externalId,
    source: r.source as SourceType,
    title: r.title,
    artistId: r.artistId,
    artistName: r.artistName,
    albumId: r.albumId,
    albumName: r.albumName,
    duration: r.duration ?? 0,
    thumbnail: r.thumbnail,
    genre: r.genre,
    region: r.region ?? "global",
    language: r.language ?? "und",
    demoAudio: r.demoAudio,
    isrc: r.isrc,
    previewUrl: r.previewUrl,
    previewUrlAlt: r.previewUrlAlt,
    artworkUrl: r.artworkUrl,
    playCount: r.playCount ?? 0,
  };
}

type ArtistRow = {
  id: number;
  externalId: string | null;
  source: string;
  name: string;
  thumbnail: string | null;
  genre: string | null;
  region: string | null;
  language: string | null;
  bio: string | null;
  monthlyListeners: number | null;
};

export function mapArtist(r: ArtistRow): Artist {
  return {
    id: r.id,
    externalId: r.externalId,
    source: r.source as SourceType,
    name: r.name,
    thumbnail: r.thumbnail,
    genre: r.genre,
    region: r.region ?? "global",
    language: r.language ?? "und",
    bio: r.bio,
    monthlyListeners: r.monthlyListeners ?? 0,
  };
}

type AlbumRow = {
  id: number;
  externalId: string | null;
  source: string;
  title: string;
  artistId: number | null;
  artistName: string | null;
  thumbnail: string | null;
  year: number | null;
  genre: string | null;
  region: string | null;
  trackCount: number | null;
};

export function mapAlbum(r: AlbumRow): Album {
  return {
    id: r.id,
    externalId: r.externalId,
    source: r.source as SourceType,
    title: r.title,
    artistId: r.artistId,
    artistName: r.artistName,
    thumbnail: r.thumbnail,
    year: r.year,
    genre: r.genre,
    region: r.region ?? "global",
    trackCount: r.trackCount ?? 0,
  };
}
