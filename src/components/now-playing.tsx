"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Mic2,
  ListMusic,
  Sliders,
  Heart,
  ShieldCheck,
  Sparkles,
  Radio,
  Disc3,
  Music4,
  Timer,
  Trash2,
  ArrowUp,
  ArrowDown,
  Gauge,
  Share2,
  Wand2,
  Info,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/toast";
import { usePlayer } from "@/lib/player-context";
import { CoverArt } from "@/components/cover";
import { formatTime, clsx } from "@/lib/utils";
import type { LyricLine } from "@/lib/types";

type Tab = "player" | "lyrics" | "queue" | "eq";

const EQ_LABELS = ["60", "230", "910", "3.6k", "14k"];

export function NowPlaying() {
  const p = usePlayer();
  const [tab, setTab] = useState<Tab>("player");
  if (!p.current || !p.nowPlayingOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col animate-slide-up">
      {/* dynamic gradient backdrop */}
      <div className="absolute inset-0 -z-10" style={backdrop(p.current.albumName, p.current.artistName)} />
      <div className="absolute inset-0 -z-10 bg-black/45" />

      {/* header */}
      <div className="flex items-center justify-between px-4 pt-4 sm:pt-6 pb-2">
        <button
          onClick={p.closeNowPlaying}
          className="grid place-items-center h-10 w-10 rounded-full glass"
          aria-label="close"
        >
          <ChevronDown size={22} />
        </button>
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-widest text-white/70">
            Playing from
          </div>
          <div className="text-sm font-semibold truncate max-w-[60vw]">
            {p.current.albumName ?? "EuskalSoinua"}
          </div>
        </div>
        <button
          onClick={() => setTab(tab === "queue" ? "player" : "queue")}
          className={clsx(
            "grid place-items-center h-10 w-10 rounded-full glass",
            tab === "queue" && "text-accent",
          )}
        >
          <ListMusic size={20} />
        </button>
      </div>

      {/* tabs */}
      <div className="flex items-center justify-center gap-1 px-4 pb-2">
        <TabBtn icon={Mic2} label="Lyrics" active={tab === "lyrics"} onClick={() => setTab("lyrics")} />
        <TabBtn icon={ListMusic} label="Queue" active={tab === "queue"} onClick={() => setTab("queue")} />
        <TabBtn icon={Sliders} label="Equalizer" active={tab === "eq"} onClick={() => setTab("eq")} />
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6">
        {tab === "player" ? <PlayerTab /> : null}
        {tab === "lyrics" ? <LyricsTab /> : null}
        {tab === "queue" ? <QueueTab /> : null}
        {tab === "eq" ? <EqTab /> : null}
      </div>
    </div>
  );
}

function TabBtn({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Mic2;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition",
        active ? "bg-white text-black" : "glass text-white/80",
      )}
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function backdrop(album: string | null, artist: string) {
  const seed = `${album}-${artist}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hue = h % 360;
  return {
    backgroundImage: `radial-gradient(120% 80% at 50% 0%, hsl(${hue} 70% 30%) 0%, #0a0a0f 70%)`,
  } as React.CSSProperties;
}

function PlayerTab() {
  const p = usePlayer();
  const { toast } = useToast();
  const router = useRouter();
  const c = p.current!;
  const pct = p.duration ? (p.currentTime / p.duration) * 100 : 0;
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-full">
      <div
        className="flex-1 flex items-center justify-center py-2"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          if (!touch.current) return;
          const dx = e.changedTouches[0].clientX - touch.current.x;
          const dy = e.changedTouches[0].clientY - touch.current.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
            if (dx < 0) p.next();
            else p.previous();
          } else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) {
            p.closeNowPlaying();
          }
          touch.current = null;
        }}
      >
        <div className="relative w-full max-w-sm aspect-square">
          <CoverArt
            seed={`${c.albumName}-${c.artistName}`}
            artwork={c.artworkUrl}
            label={c.title}
            rounded="rounded-2xl"
            className="w-full h-full shadow-2xl"
            showInitials
          />
          {p.buffering ? (
            <div className="absolute inset-0 grid place-items-center bg-black/40 rounded-2xl">
              <div className="h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" />
            </div>
          ) : null}
        </div>
      </div>

      {/* meta */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-xl font-bold truncate">{c.title}</div>
          <div className="text-white/70 truncate">{c.artistName}</div>
        </div>
        <button
          onClick={async () => {
            toast("Building your radio…", "📻");
            const playlistId = await p.playRadio(c.id);
            if (playlistId) {
              toast("Radio playlist ready!", "✅");
              p.closeNowPlaying();
              router.push(`/playlist/${playlistId}`);
            }
          }}
          title="Go to song radio"
          className="grid place-items-center h-10 w-10 shrink-0 text-white/80 hover:text-white"
        >
          <Radio size={20} />
        </button>
        <button
          onClick={() => fetch("/api/like", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trackId: c.id }) })}
          className="grid place-items-center h-10 w-10 shrink-0"
        >
          <Heart size={22} />
        </button>
      </div>

      {/* progress */}
      <input
        type="range"
        className="slider w-full"
        min={0}
        max={p.duration || 0}
        value={p.currentTime}
        onChange={(e) => p.seek(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, #fff ${pct}%, rgba(255,255,255,0.25) ${pct}%)`,
        }}
      />
      <div className="flex justify-between text-[11px] text-white/60 tabular-nums mt-1">
        <span>{formatTime(p.currentTime)}</span>
        <span>{formatTime(p.duration)}</span>
      </div>

      {/* controls */}
      <div className="flex items-center justify-between mt-4 mb-2">
        <button
          onClick={p.toggleShuffle}
          className={p.shuffle ? "text-accent" : "text-white/80"}
        >
          <Shuffle size={22} />
        </button>
        <button onClick={p.previous} className="text-white active:scale-90 transition">
          <SkipBack size={34} fill="currentColor" />
        </button>
        <button
          onClick={p.togglePlay}
          className="grid place-items-center h-16 w-16 rounded-full bg-white text-black active:scale-95 transition"
        >
          {p.isPlaying ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" className="ml-1" />}
        </button>
        <button onClick={() => p.next()} className="text-white active:scale-90 transition">
          <SkipForward size={34} fill="currentColor" />
        </button>
        <button
          onClick={p.cycleRepeat}
          className={p.repeat !== "off" ? "text-accent" : "text-white/80"}
        >
          {p.repeat === "one" ? <Repeat1 size={22} /> : <Repeat size={22} />}
        </button>
      </div>

      {/* Sleep timer row */}
      <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
        {p.sleepTimerMinutes ? (
          <button
            onClick={p.cancelSleepTimer}
            className="flex items-center gap-1.5 rounded-full bg-amber-400/15 text-amber-300 px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
          >
            <Timer size={12} /> Sleep timer: {p.sleepTimerMinutes}m · tap to cancel
          </button>
        ) : (
          [15, 30, 45, 60].map((m) => (
            <button
              key={m}
              onClick={() => p.setSleepTimer(m)}
              className="flex items-center gap-1 rounded-full glass text-white/70 hover:text-white px-3 py-1 text-[11px] font-semibold transition"
            >
              <Timer size={12} /> {m}m
            </button>
          ))
        )}
      </div>

      {/* Speed control row */}
      <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
        <span className="text-[11px] text-white/50 flex items-center gap-1 font-medium mr-1">
          <Gauge size={12} /> Speed:
        </span>
        {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
          <button
            key={rate}
            onClick={() => p.setPlaybackRate(rate)}
            className={clsx(
              "px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition",
              (p.playbackRate || 1.0) === rate
                ? "bg-accent text-black font-bold"
                : "glass text-white/70 hover:text-white"
            )}
          >
            {rate}x
          </button>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 mt-3">
        {p.engine === "youtube" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            <Radio size={11} /> Full song · YouTube
          </span>
        ) : p.provider === "piped" || p.provider === "invidious" || p.provider === "lbry" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            <Radio size={11} /> Full ad-free stream
          </span>
        ) : p.provider === "preview" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/15 text-sky-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            <Music4 size={11} /> 30s preview of this song
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 text-amber-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            <Disc3 size={11} /> Royalty-free preview
          </span>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 mt-2 text-[11px] text-white/50">
        <ShieldCheck size={13} className={p.sponsorblockEnabled ? "text-accent" : ""} />
        SponsorBlock {p.sponsorblockEnabled ? "on" : "off"}
        {p.segments.length > 0 ? ` • ${p.segments.length} segments` : ""}
        {p.activeSegment ? (
          <span className="text-basque font-semibold"> • skipping {p.activeSegment.category}</span>
        ) : null}
      </div>
    </div>
  );
}

function LyricsTab() {
  const p = usePlayer();
  const activeRef = useRef<HTMLDivElement>(null);
  const lines = p.lyrics;
  const synced = lines.some((l) => l.time >= 0);

  const activeIndex = synced
    ? (() => {
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].time >= 0 && lines[i].time <= p.currentTime) idx = i;
        }
        return idx;
      })()
    : -1;

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  if (p.lyricsLoading) {
    return <div className="text-center text-white/60 py-20">Loading lyrics…</div>;
  }
  if (lines.length === 0) {
    return <div className="text-center text-white/60 py-20">No lyrics found.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto pb-32">
      {!synced ? (
        <div className="text-center text-white/40 text-xs mb-4">Unsynced lyrics</div>
      ) : null}
      <div className="space-y-4 text-center">
        {lines.map((l, i) => (
          <div
            key={i}
            ref={i === activeIndex ? activeRef : undefined}
            className={clsx(
              "transition-all duration-300 text-lg sm:text-2xl font-semibold leading-snug",
              i === activeIndex
                ? "text-white scale-[1.02]"
                : "text-white/30",
            )}
          >
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueTab() {
  const p = usePlayer();
  const { toast } = useToast();
  const upcoming = p.queue.slice(p.index + 1);
  const history = p.queue.slice(Math.max(0, p.index - 3), p.index);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-2 mt-2">
        <div className="text-xs uppercase tracking-widest text-white/40">Now playing</div>
      </div>
      <QueueRow line={p.current} active />

      <div className="flex items-center justify-between mt-6 mb-3">
        <div className="text-xs uppercase tracking-widest text-white/40">
          Up Next ({upcoming.length})
        </div>
        {upcoming.length > 0 ? (
          <button
            onClick={() => {
              p.clearQueue();
              toast("Upcoming queue cleared", "🧹");
            }}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-semibold transition"
          >
            <Trash2 size={13} /> Clear
          </button>
        ) : null}
      </div>

      {upcoming.length > 0 ? (
        <div className="space-y-1">
          {upcoming.map((t, i) => {
            const actualIndex = p.index + 1 + i;
            return (
              <div
                key={`${t.id}-${actualIndex}`}
                className="flex items-center justify-between gap-2 p-1 rounded-xl hover:bg-white/5 group"
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => p.playQueue(p.queue, actualIndex)}
                >
                  <QueueRow line={t} />
                </div>
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                  <button
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.reorderQueue(actualIndex, actualIndex - 1);
                    }}
                    className="p-1.5 rounded-lg glass text-white/70 hover:text-white disabled:opacity-30"
                    title="Move Up"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    disabled={i === upcoming.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.reorderQueue(actualIndex, actualIndex + 1);
                    }}
                    className="p-1.5 rounded-lg glass text-white/70 hover:text-white disabled:opacity-30"
                    title="Move Down"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      p.removeFromQueue(actualIndex);
                      toast("Removed from queue", "🗑️");
                    }}
                    className="p-1.5 rounded-lg glass text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    title="Remove from queue"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-xs text-white/50 glass rounded-xl">
          Queue is empty. Select "Add to Queue" or "Play Next" on any track!
        </div>
      )}

      {history.length ? (
        <>
          <div className="text-xs uppercase tracking-widest text-white/40 mb-2 mt-6">Played</div>
          {history.map((t) => (
            <QueueRow key={t.id} line={t} dim />
          ))}
        </>
      ) : null}
    </div>
  );
}

function QueueRow({
  line,
  active,
  dim,
}: {
  line: { id: number; title: string; artistName: string; albumName: string | null } | null;
  active?: boolean;
  dim?: boolean;
}) {
  if (!line) return null;
  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer",
        dim && "opacity-50",
      )}
    >
      <CoverArt
        seed={`${line.albumName}-${line.artistName}`}
        label={line.title}
        rounded="rounded-md"
        className="h-10 w-10 shrink-0"
      />
      <div className="min-w-0">
        <div className={clsx("truncate text-sm font-medium", active ? "text-accent" : "text-white")}>
          {line.title}
        </div>
        <div className="truncate text-xs text-white/50">{line.artistName}</div>
      </div>
    </div>
  );
}

function EqTab() {
  const p = usePlayer();
  const [presets, setPresets] = useState<{ id: number; name: string; bands: number[]; isDefault: boolean }[]>([]);
  useEffect(() => {
    fetch("/api/eq-presets")
      .then((r) => r.json())
      .then(setPresets)
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-5 mt-2">
        <h3 className="text-lg font-bold">Equalizer</h3>
        <button
          onClick={p.toggleEq}
          className={clsx(
            "px-4 py-1.5 rounded-full text-xs font-bold transition",
            p.eqEnabled ? "bg-accent text-black" : "glass text-white/70",
          )}
        >
          {p.eqEnabled ? "ON" : "OFF"}
        </button>
      </div>

      <div className="flex items-end justify-between gap-2 h-56 glass rounded-2xl p-5">
        {EQ_LABELS.map((label, i) => (
          <div key={label} className="flex flex-col items-center gap-2 flex-1 h-full">
            <span className="text-[10px] text-white/40 tabular-nums">
              {p.eqBands[i] > 0 ? `+${p.eqBands[i]}` : p.eqBands[i]}
            </span>
            <input
              type="range"
              className="slider"
              style={{ writingMode: "vertical-lr", direction: "rtl", height: "100%" }}
              min={-12}
              max={12}
              step={1}
              value={p.eqBands[i]}
              onChange={(e) => p.setEqBand(i, Number(e.target.value))}
            />
            <span className="text-[10px] text-white/50">{label}</span>
          </div>
        ))}
      </div>

      <div className="text-[11px] text-white/40 mt-2 mb-4 text-center">dB • 5-band parametric</div>

      <div className="flex flex-wrap gap-2 justify-center">
        {presets.map((pr) => (
          <button
            key={pr.id}
            onClick={() => p.applyEqBands(pr.bands)}
            className={clsx(
              "px-4 py-2 rounded-full text-xs font-semibold transition border",
              p.eqBands.join() === pr.bands.join()
                ? "border-accent text-accent bg-accent/10"
                : "border-white/10 text-white/70 hover:bg-white/5",
            )}
          >
            {pr.name}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-6 glass rounded-xl p-3 text-xs text-white/60">
        <Sparkles size={14} className="text-basque" />
        Tip: the equalizer runs through the Web Audio API on your device. Nothing is sent anywhere.
      </div>
    </div>
  );
}
