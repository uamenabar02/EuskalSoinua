"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/lib/player-context";
import {
  ShieldCheck,
  Sparkles,
  Shuffle,
  Music2,
  Server,
  Cpu,
  Disc3,
  Radio,
  Palette,
  Check,
  Waves,
  EyeOff,
} from "lucide-react";
import { clsx } from "@/lib/utils";
import { useTheme, THEMES } from "@/lib/theme-context";
import ImportPlaylistModal from "@/components/import-playlist-modal";

interface StreamingStatus {
  streamingConfigured: boolean;
  instanceList: string;
  sponsorblockBase: string;
}

export default function SettingsPage() {
  const p = usePlayer();
  const { theme, setTheme } = useTheme();
  const [status, setStatus] = useState<StreamingStatus | null>(null);
  const [eqEnabled, setEqEnabled] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-3xl mx-auto pb-16">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Settings</h1>
      <p className="text-textdim text-sm mb-8">
        Everything here runs locally on your device. No accounts, no tracking.
      </p>

      {/* Appearance / Themes */}
      <Group title="Appearance">
        <div className="px-4 py-2 flex items-center gap-2 text-textdim">
          <Palette size={18} />
          <span className="text-sm font-medium">Theme</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 pt-1">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={clsx(
                "relative flex flex-col gap-2 rounded-xl p-3 border-2 transition text-left",
                theme === t.id
                  ? "border-accent"
                  : "border-transparent hover:border-white/10",
              )}
              style={{ background: t.swatch[0] }}
            >
              {/* preview swatches */}
              <div className="flex gap-1.5">
                {t.swatch.map((c, i) => (
                  <span
                    key={i}
                    className="h-7 w-7 rounded-md border border-white/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "#fff" }}>
                <span>{t.emoji}</span> {t.name}
              </span>
              {theme === t.id ? (
                <span className="absolute top-2 right-2 grid place-items-center h-5 w-5 rounded-full bg-accent text-black">
                  <Check size={13} strokeWidth={3} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="px-4 pb-3 text-xs text-textfaint">
          Your choice is saved on this device.
        </div>
      </Group>

      {/* Recommendation */}
      <Group title="Recommendations">
        <ToggleRow
          icon={<Sparkles size={18} className="text-basque" />}
          label="Basque & Local Music Booster"
          desc="Heavily weight regional (Euskal) tags in your For You feed"
          checked={p.basqueBooster}
          onChange={p.toggleBooster}
        />
        <ToggleRow
          icon={<Shuffle size={18} className="text-textdim" />}
          label="Shuffle default"
          desc="Start playback shuffled by default"
          checked={p.shuffle}
          onChange={p.toggleShuffle}
        />
      </Group>

      {/* External Integrations */}
      <Group title="External Integrations">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Sparkles size={16} className="text-accent" /> Sync Playlists
            </h3>
            <p className="text-xs text-textdim mt-1">
              Import and synchronize playlists from Spotify, YouTube Music, Deezer, etc.
            </p>
          </div>
          <button
            onClick={() => setIsImportOpen(true)}
            className="bg-accent text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-105 transition self-start sm:self-center shrink-0"
          >
            Import Playlist
          </button>
        </div>
      </Group>

      {/* Playback */}
      <Group title="Playback">
        <ToggleRow
          icon={<Radio size={18} className="text-accent" />}
          label="Full Track mode"
          desc="Play complete songs via the official YouTube player (may include ads). Off = ad-free 30s previews."
          checked={p.fullTrackMode}
          onChange={p.toggleFullTrack}
        />
        {p.fullTrackMode ? (
          <div className="px-4 py-2 text-xs text-amber-300/80 leading-relaxed">
            {"Full songs are streamed through YouTube's official player. This is the legal way to hear complete tracks — the trade-off is that YouTube may insert ads. The on-device equalizer is disabled in this mode."}
          </div>
        ) : null}
        <ToggleRow
          icon={<ShieldCheck size={18} className="text-accent" />}
          label="SponsorBlock auto-skip"
          desc="Skip sponsor reads, intros, outros & non-music segments"
          checked={p.sponsorblockEnabled}
          onChange={p.toggleSponsorblock}
        />
        <ToggleRow
          icon={<Music2 size={18} className="text-textdim" />}
          label="Equalizer"
          desc="5-band parametric EQ via Web Audio API"
          checked={p.eqEnabled}
          onChange={() => {
            p.toggleEq();
            setEqEnabled((e) => !e);
          }}
        />
        {eqEnabled ? (
          <div className="px-4 py-2 text-xs text-textfaint">
            Open the Now Playing view → Equalizer tab to tune bands & presets.
          </div>
        ) : null}

        {/* Crossfade slider */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3 mb-2">
            <Waves size={18} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Crossfade</div>
              <div className="text-xs text-textdim">
                Smoothly overlap the end of a song with the start of the next
              </div>
            </div>
            <span className="text-sm font-bold text-accent tabular-nums shrink-0">
              {p.crossfadeSeconds === 0 ? "Off" : `${p.crossfadeSeconds}s`}
            </span>
          </div>
          <input
            type="range"
            className="slider w-full"
            min={0}
            max={12}
            step={1}
            value={p.crossfadeSeconds}
            onChange={(e) => p.setCrossfade(Number(e.target.value))}
            style={{
              background: `linear-gradient(to right, var(--accent) ${(p.crossfadeSeconds / 12) * 100}%, rgba(255,255,255,0.18) ${(p.crossfadeSeconds / 12) * 100}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] text-textfaint mt-1">
            <span>Off</span>
            <span>4s</span>
            <span>8s</span>
            <span>12s</span>
          </div>
        </div>

        <ToggleRow
          icon={<EyeOff size={18} className="text-textdim" />}
          label="Hide Music Player"
          desc="Collapse and hide the persistent bottom music player bar and controls"
          checked={p.playerHidden}
          onChange={p.togglePlayerHidden}
        />
      </Group>

      {/* Architecture / streaming status */}
      <Group title="Ad-free streaming backend">
        <Row
          icon={<Server size={18} className="text-accent" />}
          label="Audio source"
          value={
            status?.streamingConfigured
              ? "Piped / Invidious (live, ad-free)"
              : "Demo audio bank"
          }
          tone={status?.streamingConfigured ? "good" : "warn"}
        />
        <Row
          icon={<Cpu size={18} className="text-textdim" />}
          label="Proxy instances"
          value={status?.instanceList ?? "—"}
          mono
        />
        <Row
          icon={<ShieldCheck size={18} className="text-textdim" />}
          label="SponsorBlock endpoint"
          value={status?.sponsorblockBase ?? "—"}
          mono
        />
        <div className="px-4 py-3 text-xs text-textfaint leading-relaxed">
          EuskalSoinua never loads commercial ad-serving wrappers. It resolves a
          pure audio-only stream through privacy-respecting open-source proxies.
          Defaults are bundled — override via{" "}
          <code className="text-textdim">.env</code>:
          <div className="mt-1 font-mono text-[10px]">
            PIPED_API_URLS, INVIDIOUS_API_URLS, SPONSORBLOCK_API_URL
          </div>
        </div>
      </Group>

      {/* About */}
      <Group title="About">
        <div className="flex items-center gap-3 px-4 py-4">
          <div
            className="grid place-items-center h-11 w-11 rounded-lg shrink-0"
            style={{ background: "linear-gradient(135deg,#1ed760,#0ea5e9)" }}
          >
            <Disc3 size={24} className="text-black" />
          </div>
          <div>
            <div className="font-bold">EuskalSoinua</div>
            <div className="text-xs text-textdim">
              Open-source media client • 100% ad-free • Basque-first
            </div>
          </div>
        </div>
      </Group>

      <ImportPlaylistModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs uppercase tracking-widest text-textfaint mb-2 px-1">
        {title}
      </h2>
      <div className="bg-bg-soft rounded-2xl divide-y divide-white/5 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function ToggleRow({
  icon,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.03] transition text-left"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-textdim">{desc}</span>
      </span>
      <span
        className={clsx(
          "relative h-6 w-11 rounded-full transition shrink-0",
          checked ? "bg-accent" : "bg-white/15",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
            checked ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "warn";
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <span
        className={clsx(
          "text-xs text-right max-w-[55%] truncate",
          mono && "font-mono",
          tone === "good" && "text-accent",
          tone === "warn" && "text-amber-400",
          !tone && "text-textdim",
        )}
      >
        {value}
      </span>
    </div>
  );
}
