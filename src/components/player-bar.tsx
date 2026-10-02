"use client";

import { useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ChevronUp,
  Mic2,
  ListMusic,
  Sliders,
  ShieldCheck,
  Radio,
  EyeOff,
  Check,
} from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { useViewMode } from "@/lib/view-mode-context";
import { useIsDownloaded } from "@/lib/downloads";
import { CoverArt } from "@/components/cover";
import { ToggleButton } from "@/components/like-button";
import { ArtistLinks } from "@/components/artist-links";
import { formatTime, clsx } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function PlayerBar() {
  const p = usePlayer();
  const { viewMode, isSmartphoneView, isDesktopView } = useViewMode();
  const { t } = useTranslation();
  const c = p.current;
  const isDownloaded = useIsDownloaded(c?.id ?? 0) || p.provider === "offline" || c?.source === "local";
  const [menuOpen, setMenuOpen] = useState(false);
  const radio = p.radioStation;

  if (!c && !p.isLiveRadio) return null;

  // Display fields: track title/artist or radio station name
  const title = p.isLiveRadio && radio ? radio.name : c?.title ?? "";
  const artist = p.isLiveRadio && radio ? `${radio.category} • LIVE` : c?.artistName ?? "";
  const seed = p.isLiveRadio ? `radio-${radio?.name}` : `${c?.albumName}-${c?.artistName}`;

  const pct = p.duration ? (p.currentTime / p.duration) * 100 : 0;

  return (
    <>
      {/* mobile compact */}
      {isSmartphoneView && (
        <div
          className={clsx(
            "fixed bottom-[calc(64px+env(safe-area-inset-bottom))] inset-x-2 sm:inset-x-4 z-40 glass border border-white/10 px-3 py-2.5 rounded-2xl shadow-2xl shadow-black/50 max-w-2xl mx-auto",
            viewMode === "auto" ? "md:hidden block" : "block"
          )}
        >
          <button
            onClick={p.openNowPlaying}
            className="w-full flex items-center gap-3 cursor-pointer"
          >
            <CoverArt
              seed={seed}
              artwork={p.isLiveRadio ? null : c?.artworkUrl}
              label={title}
              rounded="rounded-xl"
              className="h-12 w-12 shrink-0 shadow-md"
            />
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-bold flex items-center gap-1.5">
                {p.isLiveRadio ? <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" /> : null}
                <span className="truncate">{title}</span>
                {isDownloaded && !p.isLiveRadio ? (
                  <span
                    className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-accent/20 text-accent shrink-0"
                    title="Downloaded (offline ready)"
                  >
                    <Check size={9} strokeWidth={3.5} />
                  </span>
                ) : null}
              </div>
              <ArtistLinks artistName={artist} primaryArtistId={c?.artistId} className="text-xs" />
            </div>
            <span
              onClick={(e) => {
                e.stopPropagation();
                p.togglePlay();
              }}
              className="grid place-items-center h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition"
            >
              {p.isPlaying ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" className="ml-0.5" />
              )}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(t("player.hidePlayer") + "?")) {
                  p.togglePlayerHidden();
                }
              }}
              className="grid place-items-center h-10 w-10 text-textdim hover:text-ink shrink-0 cursor-pointer"
              title={t("player.hidePlayer")}
            >
              <EyeOff size={18} />
            </span>
          </button>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-accent transition-all duration-200" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* desktop full */}
      {isDesktopView && (
        <div
          className={clsx(
            "fixed bottom-0 right-0 z-30 grid-cols-[1fr_2fr_1fr] items-center gap-4 glass border-t border-l border-white/10 pl-6 pr-8 sm:pr-10 md:pr-12 h-[88px]",
            viewMode === "desktop" ? "left-64 grid" : "left-0 md:left-64 hidden md:grid"
          )}
        >
        {/* now playing */}
        <div className="flex items-center gap-3 min-w-0">
          <CoverArt
            seed={seed}
            artwork={p.isLiveRadio ? null : c?.artworkUrl}
            label={title}
            rounded="rounded-md"
            className="h-14 w-14 shrink-0"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold flex items-center gap-1.5">
              {p.isLiveRadio ? <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" /> : null}
              <span className="truncate">{title}</span>
              {isDownloaded && !p.isLiveRadio ? (
                <span
                  className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-accent/20 text-accent shrink-0"
                  title="Downloaded (offline ready)"
                >
                  <Check size={10} strokeWidth={3} />
                </span>
              ) : null}
            </div>
            <ArtistLinks artistName={artist} primaryArtistId={c?.artistId} />
          </div>
          {!p.isLiveRadio && c ? (
            <ToggleButton endpoint="like" id={c.id} initial={false} size={16} className="ml-1" />
          ) : null}
        </div>

        {/* controls + progress */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-4">
            <button
              onClick={p.toggleShuffle}
              className={clsx("transition", p.shuffle ? "text-accent" : "text-textdim hover:text-ink")}
              aria-label="shuffle"
            >
              <Shuffle size={17} />
            </button>
            <button onClick={p.previous} className="text-textdim hover:text-ink" aria-label="previous">
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button
              onClick={p.togglePlay}
              className="grid place-items-center h-9 w-9 rounded-full bg-white text-black hover:scale-105 transition"
              aria-label="play/pause"
            >
              {p.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => p.next()} className="text-textdim hover:text-ink" aria-label="next">
              <SkipForward size={20} fill="currentColor" />
            </button>
            <button
              onClick={p.cycleRepeat}
              className={clsx("transition", p.repeat !== "off" ? "text-accent" : "text-textdim hover:text-ink")}
              aria-label="repeat"
            >
              {p.repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
            </button>
          </div>
          {p.isLiveRadio ? (
            <div className="flex items-center gap-2 w-full max-w-xl justify-center">
              <span className="text-xs font-bold text-red-500 uppercase tracking-wide flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Live Broadcast
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full max-w-xl">
              <span className="text-[11px] text-textfaint tabular-nums w-9 text-right">
                {formatTime(p.currentTime)}
              </span>
              <input
                type="range"
                className="slider flex-1"
                min={0}
                max={p.duration || 0}
                value={p.currentTime}
                onChange={(e) => p.seek(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, var(--accent) ${pct}%, rgba(255,255,255,0.18) ${pct}%)`,
                }}
              />
              <span className="text-[11px] text-textfaint tabular-nums w-9">
                {formatTime(p.duration)}
              </span>
            </div>
          )}
        </div>

        {/* extras */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={p.toggleFullTrack}
            title={p.fullTrackMode ? t("player.fullTrackOnNotice") : t("player.fullTrackOffNotice")}
            className={clsx(
              "grid place-items-center h-8 w-8 rounded-full transition cursor-pointer",
              p.fullTrackMode ? "text-accent bg-accent/10" : "text-textdim hover:text-ink",
            )}
          >
            <Radio size={16} />
          </button>
          <button
            onClick={p.toggleSponsorblock}
            title={t("player.sponsorblockActive")}
            className={clsx(
              "grid place-items-center h-8 w-8 rounded-full transition cursor-pointer",
              p.sponsorblockEnabled ? "text-accent bg-accent/10" : "text-textdim hover:text-ink",
            )}
          >
            <ShieldCheck size={16} />
          </button>
          <button
            onClick={p.openNowPlaying}
            title={t("player.lyrics")}
            className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink cursor-pointer"
          >
            <Mic2 size={16} />
          </button>
          <button
            onClick={p.openNowPlaying}
            title={t("player.queue")}
            className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink cursor-pointer"
          >
            <ListMusic size={16} />
          </button>
          <button
            onClick={p.openNowPlaying}
            title={t("player.equalizer")}
            className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink cursor-pointer"
          >
            <Sliders size={16} />
          </button>
          <button onClick={p.openNowPlaying} className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink cursor-pointer" title={t("player.nowPlaying")}>
            <ChevronUp size={18} />
          </button>

          {/* Dropdown button to hide the music player */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              title={t("common.options")}
              className={clsx(
                "grid place-items-center h-8 w-8 rounded-full transition cursor-pointer",
                menuOpen ? "text-accent bg-accent/10" : "text-textdim hover:text-ink"
              )}
            >
              <EyeOff size={16} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-50"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 bottom-10 z-[60] w-48 bg-panel border border-white/10 rounded-xl shadow-2xl p-1.5 animate-fade-in animate-duration-200">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      p.togglePlayerHidden();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left text-red-400 hover:bg-white/5 rounded-lg transition cursor-pointer"
                  >
                    <EyeOff size={14} />
                    <span>{t("player.hidePlayer")}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-2 mr-2 w-28 lg:w-32 shrink-0">
            <button onClick={p.toggleMute} className="text-textdim hover:text-ink cursor-pointer">
              {p.muted || p.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              className="slider flex-1 cursor-pointer"
              min={0}
              max={1}
              step={0.01}
              value={p.muted ? 0 : p.volume}
              onChange={(e) => p.setVolume(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #fff ${(p.muted ? 0 : p.volume) * 100}%, rgba(255,255,255,0.18) ${(p.muted ? 0 : p.volume) * 100}%)`,
              }}
            />
          </div>
        </div>
      </div>
    )}
  </>
  );
}
