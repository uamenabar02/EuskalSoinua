"use client";

import { useState, useCallback, useEffect } from "react";
import { Download, Check, Loader2, Trash2 } from "lucide-react";
import {
  downloadTrack,
  prewarmTrackDownload,
  removeDownload,
  useIsDownloaded,
  useDownloadedTrackIds,
} from "@/lib/downloads";
import { useToast } from "@/lib/toast";
import { clsx } from "@/lib/utils";
import type { Track } from "@/lib/types";

/** Single-track download toggle for the track row "..." menu. */
export function DownloadMenuItem({ track }: { track: Track }) {
  const { toast } = useToast();
  const isDown = useIsDownloaded(track.id);
  const [downloading, setDownloading] = useState(false);

  const onPrewarm = useCallback(() => {
    if (!isDown) prewarmTrackDownload(track.id);
  }, [track.id, isDown]);

  const handle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (downloading) return;
      if (isDown) {
        await removeDownload(track.id);
        toast("Removed from downloads", "🗑️");
        return;
      }
      setDownloading(true);
      toast("Downloading full track…", "⬇️");
      try {
        const res = await downloadTrack(track);
        setDownloading(false);
        const mb = res.fileSize ? ` (${(res.fileSize / (1024 * 1024)).toFixed(1)} MB)` : "";
        toast(`Saved Full Track offline${mb}`, "✅");
      } catch (err: any) {
        setDownloading(false);
        if (err.message && err.message.includes("Full track unavailable")) {
          toast("Full track audio unavailable for this song", "⚠️");
        } else {
          toast("Download failed", "⚠️");
        }
      }
    },
    [track, isDown, downloading, toast],
  );

  return (
    <button
      onClick={handle}
      onMouseEnter={onPrewarm}
      onTouchStart={onPrewarm}
      className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
    >
      {downloading ? (
        <Loader2 size={14} className="animate-spin-slow" />
      ) : isDown ? (
        <Check size={14} className="text-accent" />
      ) : (
        <Download size={14} />
      )}
      {isDown ? "Downloaded (remove)" : "Download for offline"}
    </button>
  );
}

/** Inline download badge for albums/playlists — downloads all tracks with concurrency. */
export function DownloadAllButton({
  tracks,
  size = 18,
}: {
  tracks: Track[];
  size?: number;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const downloadedIds = useDownloadedTrackIds();

  const downloadedCount = tracks.filter((t) => downloadedIds.has(t.id)).length;
  const isAllDownloaded = tracks.length > 0 && downloadedCount === tracks.length;

  const onPrewarmAll = useCallback(() => {
    tracks.slice(0, 5).forEach((t) => {
      if (!downloadedIds.has(t.id)) prewarmTrackDownload(t.id);
    });
  }, [tracks, downloadedIds]);

  const handle = useCallback(async () => {
    if (downloading) return;
    if (isAllDownloaded) {
      toast("All songs in this collection are already downloaded", "✅");
      return;
    }
    setDownloading(true);
    const toDownload = tracks.filter((t) => !downloadedIds.has(t.id));
    toast(`Downloading ${toDownload.length} songs for offline listening…`, "⬇️");
    
    let done = 0;
    let fullDone = 0;
    let unavailable = 0;

    // Download with concurrency limit of 3 for fast batch downloads
    const CONCURRENCY = 3;
    const queue = [...toDownload];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const t = queue.shift();
        if (!t) break;
        try {
          const res = await downloadTrack(t);
          done++;
          if (res.isFullTrack) fullDone++;
        } catch (err: any) {
          if (err.message === "Full track unavailable") {
            unavailable++;
          }
        }
      }
    });

    await Promise.all(workers);
    setDownloading(false);
    if (unavailable > 0 && done === 0) {
      toast(`Failed: Full tracks unavailable`, "⚠️");
    } else if (unavailable > 0) {
      toast(`Downloaded ${done}/${tracks.length} (${fullDone} full, ${unavailable} unavailable)`, "⚠️");
    } else {
      toast(`All ${tracks.length} songs downloaded (${fullDone} full tracks)`, "✅");
    }
  }, [tracks, downloading, isAllDownloaded, downloadedIds, toast]);

  return (
    <button
      onClick={handle}
      onMouseEnter={onPrewarmAll}
      onTouchStart={onPrewarmAll}
      disabled={downloading}
      title={
        isAllDownloaded
          ? "All tracks downloaded on device (offline ready)"
          : downloadedCount > 0
          ? `Download all (${downloadedCount}/${tracks.length} saved)`
          : "Download all for offline listening"
      }
      className={clsx(
        "grid place-items-center h-11 w-11 rounded-full transition",
        isAllDownloaded
          ? "bg-accent/20 text-accent border border-accent/40 hover:bg-accent/30"
          : "bg-white/10 hover:bg-white/20 text-ink",
        downloading && "opacity-50",
      )}
    >
      {downloading ? (
        <Loader2 size={size} className="animate-spin-slow" />
      ) : isAllDownloaded ? (
        <Check size={size} strokeWidth={2.5} className="text-accent" />
      ) : (
        <Download size={size} />
      )}
    </button>
  );
}
