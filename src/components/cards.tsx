"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Play,
  Music2,
  Check,
  MoreHorizontal,
  Radio,
  ListPlus,
  ListMusic,
  Heart,
  Download,
  Loader2,
  User,
  Trash2,
  Disc3,
} from "lucide-react";
import { CoverArt } from "@/components/cover";
import { usePlayer } from "@/lib/player-context";
import { TrackMenu } from "@/components/track-row";
import { downloadTrack } from "@/lib/downloads";
import { useToast } from "@/lib/toast";
import type { Track, Artist, Album, Playlist } from "@/lib/types";
import { clsx } from "@/lib/utils";
import { ArtistLinks } from "@/components/artist-links";
import { DropdownPortal } from "@/components/dropdown-portal";

export function TrackCard({ track }: { track: Track }) {
  const { playQueue, current, isPlaying } = usePlayer();
  const isCurrent = current?.id === track.id;

  return (
    <div
      onClick={() => playQueue([track])}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          playQueue([track]);
        }
      }}
      className="group relative w-full text-left rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={`${track.albumName}-${track.artistName}`}
          artwork={track.artworkUrl}
          label={track.title}
          rounded="rounded-lg"
          className="w-full h-full shadow-md"
        />

        {/* Play hover button */}
        <span className="absolute right-2 bottom-2 grid place-items-center h-11 w-11 rounded-full bg-accent text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all z-10 pointer-events-none">
          <Play size={18} fill="currentColor" />
        </span>

        {isCurrent && isPlaying ? (
          <span className="absolute left-2 bottom-2 text-accent z-10">
            <PlayingDot />
          </span>
        ) : null}
      </div>

      {/* Metadata footer with always-accessible action menu */}
      <div className="flex items-start justify-between gap-1.5 mt-1">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate text-sm card-title">{track.title}</div>
          <ArtistLinks artistName={track.artistName} primaryArtistId={track.artistId} className="card-subtitle" />
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 -mr-1 -mt-0.5"
        >
          <TrackMenu
            track={track}
            buttonClassName="h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20 grid place-items-center transition active:scale-90 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/artist/${artist.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/artist/${artist.id}`);
        }
      }}
      className="group relative block rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={artist.name}
          label={artist.name}
          rounded="rounded-full"
          className="w-full h-full shadow-md"
        />

        {/* Triple dot action menu - always visible on mobile & desktop */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 z-20"
        >
          <ArtistCardMenu
            artist={artist}
            buttonClassName="h-8 w-8 rounded-full bg-black/60 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-md shadow-md border border-white/15 grid place-items-center transition active:scale-95 cursor-pointer"
          />
        </div>
      </div>
      <div className="font-semibold truncate text-sm text-center card-title">{artist.name}</div>
      <div className="text-textdim text-xs text-center mt-0.5 truncate card-subtitle">
        {artist.region === "eu" ? "Artista" : "Artist"}
      </div>
    </div>
  );
}

export function AlbumCard({ album, offlineBadge }: { album: Album; offlineBadge?: string }) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/album/${album.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/album/${album.id}`);
        }
      }}
      className="group relative block rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={`${album.title}-${album.artistName}`}
          label={album.title}
          rounded="rounded-lg"
          className="w-full h-full shadow-md"
        />

        {offlineBadge && (
          <span className="absolute top-2 left-2 bg-emerald-500 text-black text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-md flex items-center gap-1 z-10">
            <Check size={10} strokeWidth={3} /> {offlineBadge}
          </span>
        )}
      </div>

      {/* Metadata footer with always-accessible action menu */}
      <div className="flex items-start justify-between gap-1.5 mt-1">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate text-sm card-title">{album.title}</div>
          <ArtistLinks artistName={album.artistName || ""} primaryArtistId={album.artistId} className="card-subtitle" />
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 -mr-1 -mt-0.5"
        >
          <AlbumCardMenu
            album={album}
            buttonClassName="h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20 grid place-items-center transition active:scale-90 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

export function PlaylistCard({ playlist, offlineBadge }: { playlist: Playlist; offlineBadge?: string }) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/playlist/${playlist.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/playlist/${playlist.id}`);
        }
      }}
      className="group relative block rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50"
    >
      <div className="relative aspect-square mb-3">
        <CoverArt
          seed={playlist.coverSeed ?? playlist.name}
          label={playlist.name}
          rounded="rounded-lg"
          className="w-full h-full shadow-md"
        />

        {offlineBadge && (
          <span className="absolute top-2 left-2 bg-emerald-500 text-black text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-md flex items-center gap-1 z-10">
            <Check size={10} strokeWidth={3} /> {offlineBadge}
          </span>
        )}
      </div>

      {/* Metadata footer with always-accessible action menu */}
      <div className="flex items-start justify-between gap-1.5 mt-1">
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate text-sm card-title">{playlist.name}</div>
          <div className="text-textdim text-xs truncate mt-0.5 card-subtitle">
            {playlist.description ?? `${playlist.trackCount} tracks`}
          </div>
        </div>
        <div
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 -mr-1 -mt-0.5"
        >
          <PlaylistCardMenu
            playlist={playlist}
            buttonClassName="h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/10 active:bg-white/20 grid place-items-center transition active:scale-90 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action Menus for Album, Artist, and Playlist Cards
// ---------------------------------------------------------------------------

export function AlbumCardMenu({
  album,
  buttonClassName,
}: {
  album: Album;
  buttonClassName?: string;
}) {
  const { playQueue, playNext, addToQueue, playRadio } = usePlayer();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(album.saved ?? false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const fetchAlbumTracks = useCallback(async (): Promise<Track[]> => {
    try {
      const res = await fetch(`/api/album/${album.id}`);
      const data = await res.json();
      return data.tracks ?? [];
    } catch {
      return [];
    }
  }, [album.id]);

  const handlePlayAlbum = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    setLoading(true);
    const tracks = await fetchAlbumTracks();
    setLoading(false);
    if (tracks.length > 0) {
      playQueue(tracks, 0);
    } else {
      toast("No tracks found in album", "⚠️");
    }
  };

  const handlePlayNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    const tracks = await fetchAlbumTracks();
    if (tracks.length > 0) {
      playNext(tracks);
      toast(`Added ${tracks.length} songs to Up Next`, "🎵");
    }
  };

  const handleAddToQueue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    const tracks = await fetchAlbumTracks();
    if (tracks.length > 0) {
      addToQueue(tracks);
      toast(`Added ${tracks.length} songs to Queue`, "➕");
    }
  };

  const handleRadio = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    toast(`Building ${album.title} Radio…`, "📻");
    const playlistId = await playRadio({ albumId: album.id });
    if (playlistId) {
      toast("Album Radio ready!", "✅");
      router.push(`/playlist/${playlistId}`);
    }
  };

  const handleToggleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSaved = !saved;
    setSaved(nextSaved);
    await fetch("/api/album-save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumId: album.id, saved: nextSaved }),
    });
    toast(nextSaved ? "Saved to Your Library" : "Removed from Library", nextSaved ? "❤️" : "🗑️");
    setOpen(false);
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    toast(`Downloading album "${album.title}"…`, "⬇️");
    const tracks = await fetchAlbumTracks();
    if (tracks.length === 0) return;
    for (const t of tracks) {
      try {
        await downloadTrack(t);
      } catch {}
    }
    toast(`Album "${album.title}" downloaded offline`, "✅");
  };

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={
          buttonClassName ||
          "h-8 w-8 rounded-full bg-black/70 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-md shadow-md border border-white/15 grid place-items-center transition active:scale-95 cursor-pointer"
        }
        aria-label="album options"
      >
        <MoreHorizontal size={16} />
      </button>
      <DropdownPortal isOpen={open} onClose={() => setOpen(false)} anchorRef={ref} width={240}>
        <button
          onClick={handlePlayAlbum}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 font-medium"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="text-accent" />} Play Album
        </button>
        <button
          onClick={handlePlayNext}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <ListPlus size={14} className="text-accent" /> Play Next
        </button>
        <button
          onClick={handleAddToQueue}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <ListMusic size={14} /> Add to Queue
        </button>
        <div className="h-px bg-white/10 my-1" />
        <button
          onClick={handleRadio}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <Radio size={14} className="text-accent" /> Go to album radio
        </button>
        <button
          onClick={handleToggleSave}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <Heart size={14} className={saved ? "text-accent fill-accent" : ""} />
          {saved ? "Saved in Library" : "Save to Your Library"}
        </button>
        <button
          onClick={handleDownload}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <Download size={14} /> Download for offline
        </button>
        {album.artistName ? (
          <>
            <div className="h-px bg-white/10 my-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                router.push(album.artistId ? `/artist/${album.artistId}` : `/artist/${encodeURIComponent(album.artistName || "")}`);
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 truncate"
            >
              <User size={14} /> <span className="truncate">Go to artist: {album.artistName}</span>
            </button>
          </>
        ) : null}
      </DropdownPortal>
    </div>
  );
}

export function ArtistCardMenu({
  artist,
  buttonClassName,
}: {
  artist: Artist;
  buttonClassName?: string;
}) {
  const { playQueue, playRadio } = usePlayer();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [followed, setFollowed] = useState(artist.followed ?? false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handlePlayArtist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/artist/${artist.id}`);
      const data = await res.json();
      setLoading(false);
      if (data.tracks && data.tracks.length > 0) {
        playQueue(data.tracks, 0);
      } else {
        toast("No tracks found for artist", "⚠️");
      }
    } catch {
      setLoading(false);
    }
  };

  const handleRadio = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    toast(`Building ${artist.name} Radio…`, "📻");
    const playlistId = await playRadio({ artistId: artist.id, artistName: artist.name });
    if (playlistId) {
      toast("Artist Radio ready!", "✅");
      router.push(`/playlist/${playlistId}`);
    }
  };

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextFollowed = !followed;
    setFollowed(nextFollowed);
    await fetch("/api/follow", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artistId: artist.id, followed: nextFollowed }),
    });
    toast(nextFollowed ? `Following ${artist.name}` : `Unfollowed ${artist.name}`, nextFollowed ? "❤️" : "👤");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={
          buttonClassName ||
          "h-8 w-8 rounded-full bg-black/70 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-md shadow-md border border-white/15 grid place-items-center transition active:scale-95 cursor-pointer"
        }
        aria-label="artist options"
      >
        <MoreHorizontal size={16} />
      </button>
      <DropdownPortal isOpen={open} onClose={() => setOpen(false)} anchorRef={ref} width={240}>
        <button
          onClick={handlePlayArtist}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 font-medium"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="text-accent" />} Play Top Songs
        </button>
        <button
          onClick={handleRadio}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <Radio size={14} className="text-accent" /> Go to artist radio
        </button>
        <div className="h-px bg-white/10 my-1" />
        <button
          onClick={handleToggleFollow}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <Heart size={14} className={followed ? "text-accent fill-accent" : ""} />
          {followed ? "Following" : "Follow Artist"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
            router.push(`/artist/${artist.id}`);
          }}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <User size={14} /> View Discography
        </button>
      </DropdownPortal>
    </div>
  );
}

export function PlaylistCardMenu({
  playlist,
  buttonClassName,
}: {
  playlist: Playlist;
  buttonClassName?: string;
}) {
  const { playQueue, playNext, addToQueue } = usePlayer();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const fetchPlaylistTracks = useCallback(async (): Promise<Track[]> => {
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`);
      const data = await res.json();
      return data.tracks ?? [];
    } catch {
      return [];
    }
  }, [playlist.id]);

  const handlePlayPlaylist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    setLoading(true);
    const tracks = await fetchPlaylistTracks();
    setLoading(false);
    if (tracks.length > 0) {
      playQueue(tracks, 0);
    } else {
      toast("Playlist is empty", "⚠️");
    }
  };

  const handlePlayNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    const tracks = await fetchPlaylistTracks();
    if (tracks.length > 0) {
      playNext(tracks);
      toast(`Added ${tracks.length} songs to Up Next`, "🎵");
    }
  };

  const handleAddToQueue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    const tracks = await fetchPlaylistTracks();
    if (tracks.length > 0) {
      addToQueue(tracks);
      toast(`Added ${tracks.length} songs to Queue`, "➕");
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    toast(`Downloading playlist "${playlist.name}"…`, "⬇️");
    const tracks = await fetchPlaylistTracks();
    if (tracks.length === 0) return;
    for (const t of tracks) {
      try {
        await downloadTrack(t);
      } catch {}
    }
    toast(`Playlist "${playlist.name}" downloaded offline`, "✅");
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (!window.confirm(`Delete playlist “${playlist.name}”?`)) return;
    await fetch(`/api/playlists/${playlist.id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("playlists-changed"));
    toast("Playlist deleted", "🗑️");
  };

  const isCustomPlaylist = playlist.type !== "daily_mix" && !String(playlist.id).startsWith("daily-");

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={
          buttonClassName ||
          "h-8 w-8 rounded-full bg-black/70 hover:bg-black/90 text-white/90 hover:text-white backdrop-blur-md shadow-md border border-white/15 grid place-items-center transition active:scale-95 cursor-pointer"
        }
        aria-label="playlist options"
      >
        <MoreHorizontal size={16} />
      </button>
      <DropdownPortal isOpen={open} onClose={() => setOpen(false)} anchorRef={ref} width={240}>
        <button
          onClick={handlePlayPlaylist}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 font-medium"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="text-accent" />} Play Playlist
        </button>
        <button
          onClick={handlePlayNext}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <ListPlus size={14} className="text-accent" /> Play Next
        </button>
        <button
          onClick={handleAddToQueue}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <ListMusic size={14} /> Add to Queue
        </button>
        <div className="h-px bg-white/10 my-1" />
        <button
          onClick={handleDownload}
          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
        >
          <Download size={14} /> Download for offline
        </button>
        {isCustomPlaylist && (
          <>
            <div className="h-px bg-white/10 my-1" />
            <button
              onClick={handleDelete}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/20 text-red-400 flex items-center gap-2"
            >
              <Trash2 size={14} /> Delete Playlist
            </button>
          </>
        )}
      </DropdownPortal>
    </div>
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
