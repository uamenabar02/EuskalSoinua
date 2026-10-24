"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Play, Pause, Heart, MoreHorizontal, Plus, Clock, Radio, Loader2, ThumbsUp, ThumbsDown, Sparkles, ListPlus, ListMusic, Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import { DownloadMenuItem } from "@/components/download-button";
import { useIsDownloaded } from "@/lib/downloads";
import { AiTrackInsightModal } from "@/components/ai-track-insight-modal";
import { ToggleButton } from "@/components/like-button";
import { CoverArt, EqualizerBars } from "@/components/cover";
import { formatTime, clsx } from "@/lib/utils";
import type { Track } from "@/lib/types";
import { ArtistLinks, splitArtistNames } from "@/components/artist-links";
import { DropdownPortal } from "@/components/dropdown-portal";

export function TrackRow({
  track,
  index,
  queue,
  showCover = true,
  showAlbum = true,
  onFeedback,
  feedbackValue,
  onRemove,
}: {
  track: Track & { liked?: boolean };
  index: number;
  queue: Track[];
  showCover?: boolean;
  showAlbum?: boolean;
  onFeedback?: (f: "like" | "dislike") => void;
  feedbackValue?: "like" | "dislike" | "discharge" | null;
  onRemove?: (track: Track) => void;
}) {
  const { playQueue, togglePlay, current, isPlaying } = usePlayer();
  const isCurrent = current?.id === track.id;
  const isDownloaded = useIsDownloaded(track.id);

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
        "group grid items-center gap-2 sm:gap-3 rounded-xl px-2 sm:px-3 py-2 sm:py-2.5 transition-colors cursor-pointer w-full track-row-grid",
        "hover:bg-white/5 grid-cols-[24px_1fr_auto] sm:grid-cols-[24px_minmax(0,4fr)_minmax(0,3fr)_minmax(100px,auto)]",
        isCurrent && "bg-white/5",
      )}
    >
      {/* index / play */}
      <div className="grid place-items-center w-6 text-textdim text-xs sm:text-sm">
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
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
        {showCover ? (
          <CoverArt
            seed={`${track.albumName}-${track.artistName}`}
            artwork={track.artworkUrl}
            label={track.title}
            rounded="rounded-lg"
            className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 shadow-sm"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={clsx(
                "truncate text-sm sm:text-base font-semibold leading-tight",
                isCurrent ? "text-accent" : "text-ink",
              )}
            >
              {track.title}
            </span>
            {isDownloaded && (
              <span
                className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-accent/20 text-accent shrink-0"
                title="Downloaded on device (offline ready)"
                aria-label="Downloaded"
              >
                <Check size={11} strokeWidth={3} />
              </span>
            )}
          </div>
          <ArtistLinks artistName={track.artistName} primaryArtistId={track.artistId} className="text-xs sm:text-sm" />
          {(track as any).reason ? (
            <div className="text-[11px] text-accent/90 truncate flex items-center gap-1 mt-0.5 font-medium non-critical-detail">
              <Sparkles size={11} className="shrink-0 text-accent" />
              <span className="truncate">{(track as any).reason}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* album (desktop) */}
      {showAlbum ? (
        <div className="hidden sm:block min-w-0 track-row-album">
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
        {onRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(track);
            }}
            title="Remove & blacklist track"
            aria-label="Remove track"
            className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10 transition text-textdim hidden sm:grid place-items-center cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
        <span className="text-textdim text-xs tabular-nums w-9 text-right hidden sm:block">
          {formatTime(track.duration)}
        </span>
        <TrackMenu track={track} onRemove={onRemove} />
      </div>
    </div>
  );
}


export function TrackList({
  tracks,
  showCover = true,
  showAlbum = true,
  onRemove,
}: {
  tracks: (Track & { liked?: boolean })[];
  showCover?: boolean;
  showAlbum?: boolean;
  onRemove?: (track: Track) => void;
}) {
  return (
    <div className="flex flex-col w-full">
      <div
        className={clsx(
          "hidden sm:grid gap-3 px-3 pb-2 border-b border-white/5 text-xs uppercase tracking-wider text-textfaint track-list-header",
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
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

export function TrackMenu({
  track,
  buttonClassName,
  onRemove,
}: {
  track: Track;
  buttonClassName?: string;
  onRemove?: (track: Track) => void;
}) {
  const { playRadio, playNext, addToQueue } = usePlayer();
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showInsight, setShowInsight] = useState(false);
  const [loadingRadio, setLoadingRadio] = useState(false);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [playlists, setPlaylists] = useState<{ id: number; name: string }[]>([]);

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
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
          loadPlaylists();
        }}
        className={clsx(
          buttonClassName ||
            "grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink hover:bg-white/10 active:bg-white/20 cursor-pointer touch-manipulation",
        )}
        aria-label="more"
      >
        <MoreHorizontal size={16} />
      </button>
      <DropdownPortal isOpen={open} onClose={() => setOpen(false)} anchorRef={ref} width={240}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
            setShowInsight(true);
          }}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center gap-2 text-accent font-semibold cursor-pointer touch-manipulation min-h-[40px]"
        >
          <Sparkles size={14} /> AI Track Insight
        </button>
        <div className="h-px bg-white/10 my-1" />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            playNext(track);
            toast("Added to Up Next", "🎵");
            setOpen(false);
          }}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center gap-2 cursor-pointer touch-manipulation min-h-[40px]"
        >
          <ListPlus size={14} className="text-accent" /> Play Next
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            addToQueue(track);
            toast("Added to Queue", "➕");
            setOpen(false);
          }}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center gap-2 cursor-pointer touch-manipulation min-h-[40px]"
        >
          <ListMusic size={14} /> Add to Queue
        </button>
        <div className="h-px bg-white/10 my-1" />
        <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-textfaint font-bold">
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
                type="button"
                key={p.id}
                onClick={async (e) => {
                  e.stopPropagation();
                  await fetch(`/api/playlists/${p.id}/tracks`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ trackId: track.id }),
                  });
                  window.dispatchEvent(new Event("playlists-changed"));
                  toast(`Added to "${p.name}"`, "✅");
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center gap-2 truncate cursor-pointer touch-manipulation min-h-[38px]"
              >
                <Plus size={14} className="shrink-0" /> <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="h-px bg-white/10 my-1" />
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            setOpen(false);
            toast("Building your radio…", "📻");
            setLoadingRadio(true);
            const playlistId = await playRadio({ trackId: track.id, artistName: track.artistName });
            setLoadingRadio(false);
            if (playlistId) {
              toast("Radio playlist ready!", "✅");
              router.push(`/playlist/${playlistId}`);
            } else {
              toast("Could not create radio", "⚠️");
            }
          }}
          disabled={loadingRadio}
          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer touch-manipulation min-h-[40px]"
        >
          <Radio size={14} /> {loadingRadio ? "Loading radio…" : "Go to song radio"}
        </button>
        {splitArtistNames(track.artistName).map((artistPart, idx) => {
          const href = idx === 0 && track.artistId ? `/artist/${track.artistId}` : `/artist/${encodeURIComponent(artistPart)}`;
          return (
            <Link
              key={`${artistPart}-${idx}`}
              href={href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 truncate cursor-pointer touch-manipulation min-h-[40px] flex items-center"
            >
              Go to artist: {artistPart}
            </Link>
          );
        })}
        {track.albumId ? (
          <Link
            href={`/album/${track.albumId}`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 rounded-lg hover:bg-white/10 active:bg-white/20 cursor-pointer touch-manipulation min-h-[40px] flex items-center"
          >
            Go to album
          </Link>
        ) : null}
        <DownloadMenuItem track={track} />
        {onRemove ? (
          <>
            <div className="h-px bg-white/10 my-1" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onRemove(track);
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-red-500/15 active:bg-red-500/25 text-red-400 font-medium flex items-center gap-2 cursor-pointer touch-manipulation min-h-[40px]"
            >
              <Trash2 size={14} /> Remove & Blacklist
            </button>
          </>
        ) : null}
      </DropdownPortal>

      <AiTrackInsightModal track={track} isOpen={showInsight} onClose={() => setShowInsight(false)} />
    </div>
  );
}

// Re-export Heart so tree-shaking keeps only used icons in this module surface.
export { Heart };
