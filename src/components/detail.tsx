"use client";

import { type ReactNode } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { CoverArt } from "@/components/cover";
import type { Track } from "@/lib/types";
import { clsx } from "@/lib/utils";

export function PlayAllButton({
  tracks,
  size = "lg",
}: {
  tracks: Track[];
  size?: "lg" | "sm";
}) {
  const p = usePlayer();
  const first = tracks[0];
  const playingThis =
    first && p.current?.id === first.id && p.isPlaying;
  const dim = !first;
  return (
    <button
      disabled={dim}
      onClick={() => {
        if (playingThis) p.togglePlay();
        else p.playQueue(tracks, 0);
      }}
      className={clsx(
        "grid place-items-center rounded-full bg-accent text-black hover:scale-105 transition disabled:opacity-40",
        size === "lg" ? "h-14 w-14" : "h-10 w-10",
      )}
    >
      {playingThis ? (
        <Pause size={size === "lg" ? 26 : 20} fill="currentColor" />
      ) : (
        <Play size={size === "lg" ? 26 : 20} fill="currentColor" className="ml-0.5" />
      )}
    </button>
  );
}

export function DetailHeader({
  seed,
  title,
  subtitle,
  meta,
  coverLabel,
  coverShape = "rounded-lg",
  children,
  actions,
}: {
  seed: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  coverLabel: string;
  coverShape?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="relative px-4 sm:px-6 pt-10 pb-6">
      <div
        className="absolute inset-0 -z-10"
        style={{ backgroundImage: heroGradient(seed) }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/40 to-bg" />
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 max-w-[1600px] mx-auto">
        <CoverArt
          seed={seed}
          label={coverLabel}
          rounded={coverShape}
          className="h-40 w-40 sm:h-52 sm:w-52 shadow-2xl shrink-0"
        />
        <div className="min-w-0 text-center sm:text-left">
          {meta}
          <h1 className="text-3xl sm:text-6xl font-extrabold tracking-tight mt-2 text-balance">
            {title}
          </h1>
          {subtitle ? (
            <div className="text-textdim mt-3 text-sm sm:text-base">{subtitle}</div>
          ) : null}
          {actions ? <div className="mt-4 flex items-center gap-3 justify-center sm:justify-start">{actions}</div> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function heroGradient(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hue = h % 360;
  return `radial-gradient(130% 100% at 20% 0%, hsl(${hue} 55% 22%) 0%, #0a0a0f 75%)`;
}

export function CenterLoader() {
  return (
    <div className="grid place-items-center py-32 text-textdim">
      <Loader2 className="animate-spin-slow" />
    </div>
  );
}
