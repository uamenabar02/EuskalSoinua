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
  Trash2,
  Edit2,
  Laptop,
  Smartphone,
  Monitor,
} from "lucide-react";
import { clsx } from "@/lib/utils";
import { useTheme, THEMES } from "@/lib/theme-context";
import ImportPlaylistModal from "@/components/import-playlist-modal";

interface StreamingStatus {
  streamingConfigured: boolean;
  instanceList: string;
  sponsorblockBase: string;
}

function setCookie(name: string, value: string) {
  if (typeof document !== "undefined") {
    document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Strict`;
  }
}

export default function SettingsPage() {
  const p = usePlayer();
  const { theme, setTheme } = useTheme();
  const [status, setStatus] = useState<StreamingStatus | null>(null);
  const [eqEnabled, setEqEnabled] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [currentKey, setCurrentKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("euskalsoinua-sync-key") || "";
      } catch (e) {}
    }
    return "";
  });
  const [inputKey, setInputKey] = useState<string>("");
  const [syncError, setSyncError] = useState<string>("");
  const [syncSuccess, setSyncSuccess] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);

  interface Device {
    deviceId: string;
    deviceName: string;
    lastActiveAt: string;
    userAgent?: string;
  }

  const [devices, setDevices] = useState<Device[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string>("");
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");

  const handleRenameDevice = async (deviceId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", deviceId, name: newName.trim() }),
      });
      if (res.ok) {
        setDevices(prev =>
          prev.map(d => (d.deviceId === deviceId ? { ...d, deviceName: newName.trim() } : d))
        );
        setEditingDeviceId(null);

        if (deviceId === currentDeviceId) {
          try {
            localStorage.setItem("euskalsoinua-device-name", newName.trim());
          } catch (e) {}
          setCookie("device_name", encodeURIComponent(newName.trim()));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUnlinkDevice = async (deviceId: string) => {
    const isCurrent = deviceId === currentDeviceId;
    const msg = isCurrent
      ? "Are you sure you want to unlink this current device? It will be removed from the list of synchronized devices, and you will need to reconnect it later."
      : "Are you sure you want to unlink this device? Its connection to this Sync Code will be forgotten.";
    
    if (!window.confirm(msg)) return;

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlink", deviceId }),
      });
      if (res.ok) {
        setDevices(prev => prev.filter(d => d.deviceId !== deviceId));
        
        if (isCurrent) {
          handleReset(true);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getDeviceIcon = (name: string, ua?: string) => {
    const lower = (ua || name || "").toLowerCase();
    if (lower.includes("phone") || lower.includes("android") || lower.includes("ios") || lower.includes("iphone") || lower.includes("mobile")) {
      return <Smartphone size={16} className="text-accent" />;
    }
    if (lower.includes("mac") || lower.includes("win") || lower.includes("linux") || lower.includes("desktop") || lower.includes("chrome") || lower.includes("safari") || lower.includes("firefox")) {
      return <Monitor size={16} className="text-accent" />;
    }
    return <Laptop size={16} className="text-accent" />;
  };

  const handleSync = async () => {
    const target = inputKey.trim().toUpperCase();
    if (!target) {
      setSyncError("Please enter a valid Device Sync Code.");
      return;
    }
    if (target === currentKey) {
      setSyncError("This is already your current Device Sync Code.");
      return;
    }
    if (!target.startsWith("S-") || target.length !== 8) {
      setSyncError("Invalid Sync Code format. It should look like 'S-XXXXXX'.");
      return;
    }

    setSyncError("");
    setSyncing(true);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "merge", fromKey: currentKey, toKey: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setSyncError(data.error || "Failed to synchronize device libraries.");
        setSyncing(false);
        return;
      }

      // Success! Update local storage & cookie, and reload!
      try {
        localStorage.setItem("euskalsoinua-sync-key", target);
      } catch (e) {}
      setCookie("sync_key", target);
      setSyncSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setSyncError("Network error. Please try again.");
      setSyncing(false);
    }
  };

  const handleReset = async (skipConfirm: boolean = false) => {
    if (!skipConfirm && !window.confirm("Are you sure you want to desynchronize this device and generate a new Sync Code? This device will keep its current library, liked songs, and playlists, but future changes won't affect the other devices.")) {
      return;
    }
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const target = `S-${code}`;

    const oldKey = currentKey || "default";
    const deviceId = currentDeviceId || "";
    let deviceName = "Browser Device";
    try {
      deviceName = localStorage.getItem("euskalsoinua-device-name") || "Browser Device";
    } catch (e) {}
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

    // Clone the old library onto the new key so that they keep all their liked songs, playlists, etc.
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clone",
          fromKey: oldKey,
          toKey: target,
          deviceId,
          deviceName,
          userAgent,
        }),
      });
    } catch (err) {
      console.error("Failed to clone database during reset:", err);
    }

    try {
      localStorage.setItem("euskalsoinua-sync-key", target);
    } catch (e) {}
    setCookie("sync_key", target);
    window.location.reload();
  };

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});

    fetch("/api/sync")
      .then((r) => r.json())
      .then((data) => {
        if (data.devices) {
          setDevices(data.devices);
        }
        if (data.currentDeviceId) {
          setCurrentDeviceId(data.currentDeviceId);
        }
      })
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

      {/* Multi-Device Synchronization */}
      <Group title="Device Synchronization">
        <div className="p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Server size={16} className="text-accent" /> Device Sync Code
            </h3>
            <p className="text-xs text-textdim mt-1 leading-relaxed">
              Every device connected to EuskalSoinua is completely separate by default. Your library, liked songs, playlists, and taste profile are stored under your unique Device Sync Code.
            </p>
          </div>

          <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-textdim uppercase tracking-wider">Your Code:</span>
            <span className="text-base font-mono font-bold text-accent select-all">{currentKey || "Loading..."}</span>
          </div>

          {/* Synchronized Devices List */}
          {devices.length > 0 && (
            <div className="mt-2 pt-4 border-t border-white/5">
              <h4 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
                <Check size={14} className="text-accent" /> Synchronized Devices ({devices.length})
              </h4>
              <p className="text-[11px] text-textdim mb-3 leading-relaxed">
                The following devices are currently synchronized with this Sync Code. They share your entire library, taste profile, and active history in real-time.
              </p>
              
              <div className="flex flex-col gap-2">
                {devices.map((device) => {
                  const isCurrent = device.deviceId === currentDeviceId;
                  const isEditing = editingDeviceId === device.deviceId;

                  return (
                    <div
                      key={device.deviceId}
                      className="flex items-center justify-between gap-3 bg-white/[0.02] border border-white/5 rounded-xl px-3.5 py-2.5 hover:bg-white/[0.04] transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="shrink-0">
                          {getDeviceIcon(device.deviceName, device.userAgent)}
                        </div>
                        
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <div className="flex gap-2 max-w-xs">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameDevice(device.deviceId, editName);
                                  if (e.key === "Escape") setEditingDeviceId(null);
                                }}
                              />
                              <button
                                onClick={() => handleRenameDevice(device.deviceId, editName)}
                                className="bg-accent text-black text-[10px] font-bold px-2 py-1 rounded hover:bg-accent/90"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-white truncate">
                                {device.deviceName}
                              </span>
                              {isCurrent && (
                                <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider scale-90">
                                  Current
                                </span>
                              )}
                            </div>
                          )}
                          <span className="block text-[10px] text-textdim mt-0.5">
                            Last active: {new Date(device.lastActiveAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isEditing && (
                          <button
                            onClick={() => {
                              setEditingDeviceId(device.deviceId);
                              setEditName(device.deviceName);
                            }}
                            className="p-1.5 text-textfaint hover:text-white transition rounded-lg hover:bg-white/5"
                            title="Rename device"
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleUnlinkDevice(device.deviceId)}
                          className="p-1.5 text-textfaint hover:text-red-400 transition rounded-lg hover:bg-white/5"
                          title={isCurrent ? "Unlink this device (generate new code)" : "Disconnect this device"}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-white/5">
            <h4 className="text-xs font-semibold text-white mb-2">Connect to Another Device</h4>
            <p className="text-[11px] text-textdim mb-3 leading-relaxed">
              Enter the Device Sync Code of the device you want to synchronize with. This will link this device and merge all your music preferences, likes, and playlists.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. S-A4B7D2"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-textfaint focus:outline-none focus:border-accent/50 flex-1 font-mono uppercase"
                disabled={syncing || syncSuccess}
              />
              <button
                onClick={handleSync}
                disabled={syncing || syncSuccess || !inputKey.trim()}
                className="bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition shrink-0"
              >
                {syncing ? "Syncing..." : syncSuccess ? "Synced!" : "Sync Device"}
              </button>
            </div>

            {syncError && (
              <p className="text-xs text-red-400 mt-2 font-medium">{syncError}</p>
            )}
            {syncSuccess && (
              <p className="text-xs text-accent mt-2 font-medium">Successfully synchronized! Reloading page...</p>
            )}
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-[11px] text-textfaint">Want separate libraries on this device?</span>
            <button
              onClick={() => handleReset(false)}
              className="text-white/40 hover:text-white/80 text-[10px] uppercase tracking-wider font-semibold hover:underline"
            >
              Generate New Code
            </button>
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
