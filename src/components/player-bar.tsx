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
} from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { CoverArt } from "@/components/cover";
import { ToggleButton } from "@/components/like-button";
import { formatTime, clsx } from "@/lib/utils";

export function PlayerBar() {
  const p = usePlayer();
  const c = p.current;
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
      <div className="md:hidden fixed bottom-[calc(60px+env(safe-area-inset-bottom))] inset-x-2 z-40 glass border border-white/10 px-3 py-2 rounded-xl shadow-lg shadow-black/40">
        <button
          onClick={p.openNowPlaying}
          className="w-full flex items-center gap-3"
        >
          <CoverArt
            seed={seed}
            artwork={p.isLiveRadio ? null : c?.artworkUrl}
            label={title}
            rounded="rounded-md"
            className="h-11 w-11 shrink-0"
          />
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-semibold flex items-center gap-1.5">
              {p.isLiveRadio ? <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse shrink-0" /> : null}
              {title}
            </div>
            <div className="truncate text-xs text-textdim">{artist}</div>
          </div>
          <span
            onClick={(e) => {
              e.stopPropagation();
              p.togglePlay();
            }}
            className="grid place-items-center h-9 w-9"
          >
            {p.isPlaying ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" />
            )}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("Hide the music player? You can restore it from settings or the sidebar.")) {
                p.togglePlayerHidden();
              }
            }}
            className="grid place-items-center h-9 w-9 text-textdim hover:text-ink shrink-0"
            title="Hide player"
          >
            <EyeOff size={18} />
          </span>
        </button>
        <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* desktop full */}
      <div className="hidden md:grid fixed bottom-0 inset-x-0 z-30 grid-cols-[1fr_2fr_1fr] items-center gap-4 glass border-t border-white/10 px-4 h-[88px]">
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
              {title}
            </div>
            <div className="truncate text-xs text-textdim">{artist}</div>
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
            title={p.fullTrackMode ? "Full Track mode ON (full songs, may include ads)" : "Full Track mode OFF (ad-free previews)"}
            className={clsx(
              "grid place-items-center h-8 w-8 rounded-full transition",
              p.fullTrackMode ? "text-accent bg-accent/10" : "text-textdim hover:text-ink",
            )}
          >
            <Radio size={16} />
          </button>
          <button
            onClick={p.toggleSponsorblock}
            title="SponsorBlock auto-skip"
            className={clsx(
              "grid place-items-center h-8 w-8 rounded-full transition",
              p.sponsorblockEnabled ? "text-accent bg-accent/10" : "text-textdim hover:text-ink",
            )}
          >
            <ShieldCheck size={16} />
          </button>
          <button
            onClick={p.openNowPlaying}
            title="Lyrics"
            className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink"
          >
            <Mic2 size={16} />
          </button>
          <button
            onClick={p.openNowPlaying}
            title="Queue"
            className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink"
          >
            <ListMusic size={16} />
          </button>
          <button
            onClick={p.openNowPlaying}
            title="Equalizer"
            className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink"
          >
            <Sliders size={16} />
          </button>
          <button onClick={p.openNowPlaying} className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-ink" title="Expand View">
            <ChevronUp size={18} />
          </button>

          {/* Dropdown button to hide the music player */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              title="Player options"
              className={clsx(
                "grid place-items-center h-8 w-8 rounded-full transition",
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
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-left text-red-400 hover:bg-white/5 rounded-lg transition"
                  >
                    <EyeOff size={14} />
                    <span>Hide Music Player</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-1 w-28">
            <button onClick={p.toggleMute} className="text-textdim hover:text-ink">
              {p.muted || p.volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              className="slider flex-1"
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
    </>
  );
}
