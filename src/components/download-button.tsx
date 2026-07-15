"use client";

import { useState, useCallback, useEffect } from "react";
import { Download, Check, Loader2, Trash2 } from "lucide-react";
import {
  downloadTrack,
  isDownloaded,
  removeDownload,
} from "@/lib/downloads";
import { useToast } from "@/lib/toast";
import { clsx } from "@/lib/utils";
import type { Track } from "@/lib/types";

/** Single-track download toggle for the track row "..." menu. */
export function DownloadMenuItem({ track }: { track: Track }) {
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "downloading" | "downloaded">("idle");

  useEffect(() => {
    isDownloaded(track.id).then((d) => setState(d ? "downloaded" : "idle"));
  }, [track.id]);

  const handle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (state === "downloading") return;
      if (state === "downloaded") {
        await removeDownload(track.id);
        setState("idle");
        toast("Removed from downloads", "🗑️");
        return;
      }
      setState("downloading");
      toast("Downloading…", "⬇️");
      try {
        await downloadTrack(track);
        setState("downloaded");
        toast("Downloaded for offline play", "✅");
      } catch {
        setState("idle");
        toast("Download failed", "⚠️");
      }
    },
    [track, state, toast],
  );

  return (
    <button
      onClick={handle}
      className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 flex items-center gap-2"
    >
      {state === "downloading" ? (
        <Loader2 size={14} className="animate-spin-slow" />
      ) : state === "downloaded" ? (
        <Check size={14} className="text-accent" />
      ) : (
        <Download size={14} />
      )}
      {state === "downloaded" ? "Downloaded (remove)" : "Download"}
    </button>
  );
}

/** Inline download badge for albums/playlists — downloads all tracks. */
export function DownloadAllButton({
  tracks,
  size = 18,
}: {
  tracks: Track[];
  size?: number;
}) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handle = useCallback(async () => {
    setDownloading(true);
    toast(`Downloading ${tracks.length} songs…`, "⬇️");
    let done = 0;
    for (const t of tracks) {
      try {
        await downloadTrack(t);
        done++;
      } catch {
        /* skip failed */
      }
    }
    setDownloading(false);
    toast(`Downloaded ${done}/${tracks.length} songs`, "✅");
  }, [tracks, toast]);

  return (
    <button
      onClick={handle}
      disabled={downloading}
      title="Download all for offline"
      className={clsx(
        "grid place-items-center h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 transition",
        downloading && "opacity-50",
      )}
    >
      {downloading ? (
        <Loader2 size={size} className="animate-spin-slow" />
      ) : (
        <Download size={size} />
      )}
    </button>
  );
}
