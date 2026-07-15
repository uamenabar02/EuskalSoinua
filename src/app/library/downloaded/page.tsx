"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePlayer } from "@/lib/player-context";
import { listDownloads, removeDownload } from "@/lib/downloads";
import { CoverArt } from "@/components/cover";
import { useToast } from "@/lib/toast";
import { Download, Play, Trash2, Loader2 } from "lucide-react";
import { formatTime, clsx } from "@/lib/utils";
import type { Track } from "@/lib/types";

interface DownloadedItem {
  trackId: number;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  duration: number;
  downloadedAt: number;
}

export default function DownloadedPage() {
  const { playQueue, current, isPlaying } = usePlayer();
  const { toast } = useToast();
  const [items, setItems] = useState<DownloadedItem[] | null>(null);

  const load = () => listDownloads().then(setItems).catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);

  if (!items)
    return (
      <div className="grid place-items-center py-32 text-textdim">
        <Loader2 className="animate-spin-slow" />
      </div>
    );

  const tracks: (Track & { liked?: boolean })[] = items.map((i) => ({
    id: i.trackId,
    externalId: null,
    source: "local",
    title: i.title,
    artistId: null,
    artistName: i.artist,
    albumId: null,
    albumName: null,
    duration: i.duration,
    thumbnail: null,
    genre: null,
    region: "global",
    language: "und",
    demoAudio: null,
    isrc: null,
    previewUrl: null,
    previewUrlAlt: null,
    artworkUrl: i.artworkUrl ?? null,
    playCount: 0,
  }));

  return (
    <div>
      <div
        className="px-4 sm:px-6 pt-10 pb-6 relative"
        style={{
          backgroundImage:
            "radial-gradient(120% 100% at 20% 0%, hsl(150 55% 20%) 0%, #0a0a0f 75%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-bg -z-10" />
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 max-w-[1600px] mx-auto">
          <div
            className="grid place-items-center h-40 w-40 sm:h-52 sm:w-52 rounded-lg shrink-0 shadow-2xl"
            style={{ background: "linear-gradient(135deg,#0f9d4f,#1ed760)" }}
          >
            <Download size={64} className="text-black/80" />
          </div>
          <div className="text-center sm:text-left">
            <span className="text-sm font-semibold uppercase tracking-wide text-textdim">
              Offline
            </span>
            <h1 className="text-3xl sm:text-6xl font-extrabold tracking-tight mt-2">
              Downloaded
            </h1>
            <p className="text-textdim mt-3 text-sm">
              {items.length} song{items.length === 1 ? "" : "s"} saved for offline playback
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        {items.length > 0 ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => playQueue(tracks, 0)}
                className="grid place-items-center h-14 w-14 rounded-full bg-accent text-black hover:scale-105 transition"
              >
                <Play size={26} fill="currentColor" className="ml-0.5" />
              </button>
              <span className="text-textdim text-sm">Plays offline — no connection needed</span>
            </div>
            <div className="flex flex-col">
              {items.map((item, i) => {
                const isCurrent = current?.id === item.trackId;
                return (
                  <div
                    key={item.trackId}
                    className={clsx(
                      "group grid items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5 transition grid-cols-[24px_1fr_auto]",
                      isCurrent && "bg-white/5",
                    )}
                  >
                    <button
                      onClick={() => playQueue(tracks, i)}
                      className="grid place-items-center w-6 text-textdim text-sm"
                    >
                      <span className="group-hover:hidden">{i + 1}</span>
                      <Play size={16} fill="currentColor" className="hidden group-hover:inline-flex text-ink" />
                    </button>
                    <div className="flex items-center gap-3 min-w-0">
                      <CoverArt
                        seed={`${item.title}-${item.artist}`}
                        artwork={item.artworkUrl}
                        label={item.title}
                        rounded="rounded-md"
                        className="h-10 w-10 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className={clsx("truncate text-sm font-medium", isCurrent ? "text-accent" : "text-ink")}>
                          {item.title}
                        </div>
                        <div className="truncate text-xs text-textdim">{item.artist}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-textfaint text-xs hidden sm:block">
                        {formatTime(item.duration)}
                      </span>
                      <button
                        onClick={async () => {
                          await removeDownload(item.trackId);
                          toast("Removed from downloads", "🗑️");
                          load();
                        }}
                        className="grid place-items-center h-7 w-7 rounded-full text-textdim hover:text-red-400 hover:bg-white/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-textdim">
            <Download size={40} className="mx-auto mb-3 text-textfaint" />
            No downloads yet.
            <div className="text-xs mt-1">
              Use the “Download” option on any song, album, or playlist to save it for offline play.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
