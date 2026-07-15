"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Play, Pause, Heart, MoreHorizontal, Plus, Clock, Radio, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import { DownloadMenuItem } from "@/components/download-button";
import { ToggleButton } from "@/components/like-button";
import { CoverArt, EqualizerBars } from "@/components/cover";
import { formatTime, clsx } from "@/lib/utils";
import type { Track } from "@/lib/types";

export function TrackRow({
  track,
  index,
  queue,
  showCover = true,
  showAlbum = true,
  onFeedback,
  feedbackValue,
}: {
  track: Track & { liked?: boolean };
  index: number;
  queue: Track[];
  showCover?: boolean;
  showAlbum?: boolean;
  onFeedback?: (f: "like" | "dislike") => void;
  feedbackValue?: "like" | "dislike" | "discharge" | null;
}) {
  const { playQueue, togglePlay, current, isPlaying } = usePlayer();
  const isCurrent = current?.id === track.id;

  const onActivate = () => {
    if (isCurrent) togglePlay();
    else playQueue(queue, index);
  };

  const handleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, [role='button'], [aria-label='more']")) {
      return;
    }
    onActivate();
  };

  return (
    <div
      onClick={handleClick}
      className={clsx(
        "group grid items-center gap-3 rounded-lg px-2 sm:px-3 py-2 transition-colors",
        "hover:bg-white/5 grid-cols-[24px_1fr_90px] sm:grid-cols-[24px_minmax(0,4fr)_minmax(0,3fr)_minmax(100px,auto)]",
        isCurrent && "bg-white/5",
      )}
    >
      {/* index / play */}
      <div className="grid place-items-center w-6 text-textdim text-sm">
        {isCurrent && isPlaying ? (
          <span className="group-hover:hidden text-accent">
            <EqualizerBars className="h-3.5" />
          </span>
        ) : (
          <span className="group-hover:hidden">{index + 1}</span>
        )}
        <button
          onClick={onActivate}
          className="hidden group-hover:inline-flex text-ink"
          aria-label="play"
        >
          {isCurrent && isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
        </button>
      </div>

      {/* title + artist */}
      <div className="flex items-center gap-3 min-w-0">
        {showCover ? (
          <CoverArt
            seed={`${track.albumName}-${track.artistName}`}
            artwork={track.artworkUrl}
            label={track.title}
            rounded="rounded-md"
            className="h-10 w-10 shrink-0"
          />
        ) : null}
        <div className="min-w-0">
          <div
            className={clsx(
              "truncate text-sm font-medium",
              isCurrent ? "text-accent" : "text-ink",
            )}
          >
            {track.title}
          </div>
          <Link
            href={`/artist/${track.artistId ?? ""}`}
            className="truncate text-xs text-textdim hover:underline block max-w-full"
          >
            {track.artistName}
          </Link>
        </div>
      </div>

      {/* album (desktop) */}
      {showAlbum ? (
        <div className="hidden sm:block min-w-0">
          {track.albumId ? (
            <Link
              href={`/album/${track.albumId}`}
              className="truncate text-xs text-textdim hover:underline block max-w-full"
            >
              {track.albumName}
            </Link>
          ) : (
            <span className="truncate text-xs text-textdim">{track.albumName}</span>
          )}
        </div>
      ) : null}

      {/* actions */}
      <div className="flex items-center gap-1 sm:gap-2 justify-end">
        {onFeedback ? (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onFeedback("like")}
              className={clsx(
                "grid place-items-center h-7 w-7 rounded-full transition",
                feedbackValue === "like"
                  ? "bg-accent text-black"
                  : "bg-white/5 text-textdim hover:text-accent hover:bg-accent/10",
              )}
              aria-label="Like"
            >
              <ThumbsUp size={14} />
            </button>
            <button
              onClick={() => onFeedback("dislike")}
              className={clsx(
                "grid place-items-center h-7 w-7 rounded-full transition",
                feedbackValue === "dislike"
                  ? "bg-red-500 text-white"
                  : "bg-white/5 text-textdim hover:text-red-400 hover:bg-red-500/10",
              )}
              aria-label="Dislike"
            >
              <ThumbsDown size={14} />
            </button>
          </div>
        ) : null}
        <ToggleButton
          endpoint="like"
          id={track.id}
          initial={track.liked ?? false}
          className="opacity-0 group-hover:opacity-100 data-[liked]:opacity-100"
          size={16}
        />
        <span className="text-textdim text-xs tabular-nums w-9 text-right hidden sm:block">
          {formatTime(track.duration)}
        </span>
        <TrackMenu track={track} />
      </div>
    </div>
  );
}


export function TrackList({
  tracks,
  showCover = true,
  showAlbum = true,
}: {
  tracks: (Track & { liked?: boolean })[];
  showCover?: boolean;
  showAlbum?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <div
        className={clsx(
          "hidden sm:grid gap-3 px-3 pb-2 border-b border-white/5 text-xs uppercase tracking-wider text-textfaint",
          showAlbum
            ? "grid-cols-[24px_minmax(0,4fr)_minmax(0,3fr)_minmax(100px,auto)]"
            : "grid-cols-[24px_minmax(0,4fr)_minmax(100px,auto)]",
        )}
      >
        <span>#</span>
        <span>Title</span>
        {showAlbum ? <span>Album</span> : null}
        <span className="justify-self-end">
          <Clock size={14} />
        </span>
      </div>
      {tracks.map((t, i) => (
        <TrackRow
          key={`${t.id}-${i}`}
          track={t}
          index={i}
          queue={tracks}
          showCover={showCover}
          showAlbum={showAlbum}
        />
      ))}
    </div>
  );
}

function TrackMenu({ track }: { track: Track }) {
  const { playRadio } = usePlayer();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loadingRadio, setLoadingRadio] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [playlists, setPlaylists] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const loadPlaylists = async () => {
    setLoadingPlaylists(true);
    try {
      const res = await fetch("/api/playlists");
      const data = await res.json();
      setPlaylists(data.playlists ?? []);
    } catch {
      setPlaylists([]);
    } finally {
      setLoadingPlaylists(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
          loadPlaylists();
        }}
        className="grid place-items-center h-7 w-7 rounded-full text-textdim hover:text-ink hover:bg-white/10"
        aria-label="more"
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 top-8 z-50 w-56 rounded-xl bg-elevated border border-white/10 shadow-2xl p-1.5 text-sm animate-fade-up">
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-textfaint">
            Add to playlist
          </div>
          {loadingPlaylists ? (
            <div className="px-3 py-2 text-textdim text-xs flex items-center gap-2">
              <Loader2 className="animate-spin h-3.5 w-3.5" />
              <span>Loading playlists…</span>
            </div>
          ) : playlists.length === 0 ? (
            <div className="px-3 py-2 text-textdim text-xs">
              Create a playlist first in Your Library.
            </div>
          ) : (
            <div className="max-h-36 overflow-y-auto no-scrollbar">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await fetch(`/api/playlists/${p.id}/tracks`, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ trackId: track.id }),
                    });
                    window.dispatchEvent(new Event("playlists-changed"));
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 truncate"
                >
                  <Plus size={14} /> <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="h-px bg-white/10 my-1" />
          <button
            onClick={async (e) => {
              e.stopPropagation();
              setOpen(false);
              toast("Building your radio…", "📻");
              setLoadingRadio(true);
              const playlistId = await playRadio(track.id);
              setLoadingRadio(false);
              if (playlistId) {
                toast("Radio playlist ready!", "✅");
                router.push(`/playlist/${playlistId}`);
              }
            }}
            disabled={loadingRadio}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2 disabled:opacity-50"
          >
            <Radio size={14} /> {loadingRadio ? "Loading radio…" : "Go to song radio"}
          </button>
          {track.artistId ? (
            <Link
              href={`/artist/${track.artistId}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-white/10"
            >
              Go to artist
            </Link>
          ) : null}
          {track.albumId ? (
            <Link
              href={`/album/${track.albumId}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 rounded-lg hover:bg-white/10"
            >
              Go to album
            </Link>
          ) : null}
          <DownloadMenuItem track={track} />
        </div>
      ) : null}
    </div>
  );
}

// Re-export Heart so tree-shaking keeps only used icons in this module surface.
export { Heart };
