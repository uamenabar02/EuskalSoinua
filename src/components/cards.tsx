"use client";

import Link from "next/link";
import { Play, Music2 } from "lucide-react";
import { CoverArt } from "@/components/cover";
import { usePlayer } from "@/lib/player-context";
import type { Track, Artist, Album, Playlist } from "@/lib/types";
import { clsx } from "@/lib/utils";
import { ArtistLinks } from "@/components/artist-links";

export function TrackCard({ track }: { track: Track }) {
  const { playQueue, current, isPlaying } = usePlayer();
  const isCurrent = current?.id === track.id;
  return (
    <button
      onClick={() => playQueue([track])}
      className="group relative w-full text-left rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 cursor-pointer"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={`${track.albumName}-${track.artistName}`}
          artwork={track.artworkUrl}
          label={track.title}
          rounded="rounded-lg"
          className="w-full h-full shadow-md"
        />
        <span className="absolute right-2 bottom-2 grid place-items-center h-11 w-11 rounded-full bg-accent text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
          <Play size={18} fill="currentColor" />
        </span>
        {isCurrent && isPlaying ? (
          <span className="absolute left-2 bottom-2 text-accent">
            <PlayingDot />
          </span>
        ) : null}
      </div>
      <div className="font-semibold truncate text-sm card-title">{track.title}</div>
      <ArtistLinks artistName={track.artistName} primaryArtistId={track.artistId} className="card-subtitle" />
    </button>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link
      href={`/artist/${artist.id}`}
      className="group block rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={artist.name}
          label={artist.name}
          rounded="rounded-full"
          className="w-full h-full shadow-md"
        />
      </div>
      <div className="font-semibold truncate text-sm text-center card-title">{artist.name}</div>
      <div className="text-textdim text-xs text-center mt-0.5 truncate card-subtitle">
        {artist.region === "eu" ? "Artista" : "Artist"}
      </div>
    </Link>
  );
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link
      href={`/album/${album.id}`}
      className="group block rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={`${album.title}-${album.artistName}`}
          label={album.title}
          rounded="rounded-lg"
          className="w-full h-full shadow-md"
        />
      </div>
      <div className="font-semibold truncate text-sm card-title">{album.title}</div>
      <ArtistLinks artistName={album.artistName || ""} primaryArtistId={album.artistId} className="card-subtitle" />
    </Link>
  );
}

export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  return (
    <Link
      href={`/playlist/${playlist.id}`}
      className="group block rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={playlist.coverSeed ?? playlist.name}
          label={playlist.name}
          rounded="rounded-lg"
          className="w-full h-full shadow-md"
        />
      </div>
      <div className="font-semibold truncate text-sm card-title">{playlist.name}</div>
      <div className="text-textdim text-xs truncate mt-0.5 card-subtitle">
        {playlist.description ?? `${playlist.trackCount} tracks`}
      </div>
    </Link>
  );
}

export function PlayingDot() {
  return (
    <span className="inline-flex gap-[2px] items-end h-3.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="eq-bar h-full w-[3px]"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export function BasqueBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        className,
      )}
      style={{ background: "rgba(238,90,58,0.16)", color: "var(--basque)" }}
    >
      <Music2 size={10} /> Euskara
    </span>
  );
}
