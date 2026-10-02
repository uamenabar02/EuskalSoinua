"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/lib/player-context";
import { useTranslation } from "@/lib/i18n";
import LanguageSelector from "@/components/language-selector";
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
  Globe,
} from "lucide-react";
import { clsx } from "@/lib/utils";
import { useTheme, THEMES } from "@/lib/theme-context";
import { useViewMode } from "@/lib/view-mode-context";
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
  const { viewMode, setViewMode } = useViewMode();
  const { t } = useTranslation();
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
      ? t("settings.unlinkConfirmCurrent")
      : t("settings.unlinkConfirmOther");
    
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
      setSyncError(t("settings.syncErrorInvalid"));
      return;
    }
    if (target === currentKey) {
      setSyncError(t("settings.syncErrorCurrent"));
      return;
    }
    if (!target.startsWith("S-") || target.length !== 8) {
      setSyncError(t("settings.syncErrorFormat"));
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
    if (!skipConfirm && !window.confirm(t("settings.resetConfirm"))) {
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
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">{t("settings.title")}</h1>
      <p className="text-textdim text-sm mb-8">
        {t("settings.subtitle")}
      </p>

      {/* Language Selector */}
      <Group title={t("settings.language")}>
        <div className="px-4 py-2 flex items-center gap-2 text-textdim">
          <Globe size={18} className="text-accent" />
          <span className="text-sm font-semibold text-white">{t("settings.language")} / Hizkuntza / Idioma</span>
        </div>
        <LanguageSelector variant="grid" />
        <div className="px-4 pb-3 text-xs text-textfaint">
          {t("settings.languageNote")}
        </div>
      </Group>

      {/* Appearance / Themes */}
      <Group title={t("settings.appearance")}>
        <div className="px-4 py-2 flex items-center gap-2 text-textdim">
          <Palette size={18} />
          <span className="text-sm font-medium">{t("settings.theme")}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 pt-1">
          {THEMES.map((tItem) => (
            <button
              key={tItem.id}
              onClick={() => setTheme(tItem.id)}
              className={clsx(
                "relative flex flex-col gap-2 rounded-xl p-3 border-2 transition text-left cursor-pointer",
                theme === tItem.id
                  ? "border-accent"
                  : "border-transparent hover:border-white/10",
              )}
              style={{ background: tItem.swatch[0] }}
            >
              {/* preview swatches */}
              <div className="flex gap-1.5">
                {tItem.swatch.map((c, i) => (
                  <span
                    key={i}
                    className="h-7 w-7 rounded-md border border-white/10"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "#fff" }}>
                <span>{tItem.emoji}</span> {tItem.name}
              </span>
              {theme === tItem.id ? (
                <span className="absolute top-2 right-2 grid place-items-center h-5 w-5 rounded-full bg-accent text-black">
                  <Check size={13} strokeWidth={3} />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="px-4 pb-3 text-xs text-textfaint">
          {t("settings.themeNote")}
        </div>
      </Group>

      {/* View Mode & Layout */}
      <Group title={t("settings.viewModeTitle")}>
        <div className="px-4 py-2 flex items-center gap-2 text-textdim">
          <Smartphone size={18} className="text-accent" />
          <span className="text-sm font-medium font-semibold text-white">{t("settings.viewModeSelector")}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 pt-1">
          <button
            onClick={() => setViewMode("auto")}
            className={clsx(
              "relative flex flex-col gap-1.5 rounded-xl p-3.5 border-2 transition text-left bg-white/5 hover:bg-white/10 cursor-pointer",
              viewMode === "auto" ? "border-accent bg-accent/10" : "border-transparent"
            )}
          >
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Laptop size={18} className="text-accent shrink-0" />
              <span>{t("settings.autoMode")}</span>
            </div>
            <p className="text-xs text-textdim leading-relaxed">
              {t("settings.autoModeDesc")}
            </p>
            {viewMode === "auto" && (
              <span className="absolute top-2.5 right-2.5 grid place-items-center h-5 w-5 rounded-full bg-accent text-black">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </button>

          <button
            onClick={() => setViewMode("smartphone")}
            className={clsx(
              "relative flex flex-col gap-1.5 rounded-xl p-3.5 border-2 transition text-left bg-white/5 hover:bg-white/10 cursor-pointer",
              viewMode === "smartphone" ? "border-accent bg-accent/10" : "border-transparent"
            )}
          >
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Smartphone size={18} className="text-accent shrink-0" />
              <span>{t("settings.smartphoneMode")}</span>
            </div>
            <p className="text-xs text-textdim leading-relaxed">
              {t("settings.smartphoneModeDesc")}
            </p>
            {viewMode === "smartphone" && (
              <span className="absolute top-2.5 right-2.5 grid place-items-center h-5 w-5 rounded-full bg-accent text-black">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </button>

          <button
            onClick={() => setViewMode("desktop")}
            className={clsx(
              "relative flex flex-col gap-1.5 rounded-xl p-3.5 border-2 transition text-left bg-white/5 hover:bg-white/10 cursor-pointer",
              viewMode === "desktop" ? "border-accent bg-accent/10" : "border-transparent"
            )}
          >
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Monitor size={18} className="text-accent shrink-0" />
              <span>{t("settings.desktopMode")}</span>
            </div>
            <p className="text-xs text-textdim leading-relaxed">
              {t("settings.desktopModeDesc")}
            </p>
            {viewMode === "desktop" && (
              <span className="absolute top-2.5 right-2.5 grid place-items-center h-5 w-5 rounded-full bg-accent text-black">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </button>
        </div>
        <div className="px-4 pb-3 text-xs text-textfaint">
          {t("settings.viewModeNote")}
        </div>
      </Group>

      {/* Recommendation */}
      <Group title={t("settings.recommendations")}>
        <ToggleRow
          icon={<Sparkles size={18} className="text-basque" />}
          label={t("settings.basqueBooster")}
          desc={t("settings.basqueBoosterDesc")}
          checked={p.basqueBooster}
          onChange={p.toggleBooster}
        />
        <ToggleRow
          icon={<Shuffle size={18} className="text-textdim" />}
          label={t("settings.shuffleDefault")}
          desc={t("settings.shuffleDefaultDesc")}
          checked={p.shuffle}
          onChange={p.toggleShuffle}
        />
      </Group>

      {/* External Integrations */}
      <Group title={t("settings.externalIntegrations")}>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Sparkles size={16} className="text-accent" /> {t("settings.syncPlaylists")}
            </h3>
            <p className="text-xs text-textdim mt-1">
              {t("settings.syncPlaylistsDesc")}
            </p>
          </div>
          <button
            onClick={() => setIsImportOpen(true)}
            className="bg-accent text-black font-bold text-xs px-4 py-2.5 rounded-full hover:scale-105 transition self-start sm:self-center shrink-0 cursor-pointer"
          >
            {t("settings.importPlaylistBtn")}
          </button>
        </div>
      </Group>

      {/* Playback */}
      <Group title={t("settings.playback")}>
        <ToggleRow
          icon={<Radio size={18} className="text-accent" />}
          label={t("settings.fullTrackMode")}
          desc={t("settings.fullTrackDesc")}
          checked={p.fullTrackMode}
          onChange={p.toggleFullTrack}
        />
        {p.fullTrackMode ? (
          <div className="px-4 py-2 text-xs text-amber-300/80 leading-relaxed">
            {t("settings.fullTrackNotice")}
          </div>
        ) : null}
        <ToggleRow
          icon={<ShieldCheck size={18} className="text-accent" />}
          label={t("settings.sponsorblockTitle")}
          desc={t("settings.sponsorblockDesc")}
          checked={p.sponsorblockEnabled}
          onChange={p.toggleSponsorblock}
        />
        <ToggleRow
          icon={<Music2 size={18} className="text-textdim" />}
          label={t("settings.equalizerTitle")}
          desc={t("settings.equalizerDesc")}
          checked={p.eqEnabled}
          onChange={() => {
            p.toggleEq();
            setEqEnabled((e) => !e);
          }}
        />
        {eqEnabled ? (
          <div className="px-4 py-2 text-xs text-textfaint">
            {t("settings.equalizerNote")}
          </div>
        ) : null}

        {/* Crossfade slider */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3 mb-2">
            <Waves size={18} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{t("settings.crossfadeTitle")}</div>
              <div className="text-xs text-textdim">
                {t("settings.crossfadeDesc")}
              </div>
            </div>
            <span className="text-sm font-bold text-accent tabular-nums shrink-0">
              {p.crossfadeSeconds === 0 ? t("settings.crossfadeOff") : `${p.crossfadeSeconds}s`}
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
            <span>{t("settings.crossfadeOff")}</span>
            <span>4s</span>
            <span>8s</span>
            <span>12s</span>
          </div>
        </div>

        <ToggleRow
          icon={<EyeOff size={18} className="text-textdim" />}
          label={t("settings.hideMusicPlayer")}
          desc={t("settings.hideMusicPlayerDesc")}
          checked={p.playerHidden}
          onChange={p.togglePlayerHidden}
        />
      </Group>

      {/* Architecture / streaming status */}
      <Group title={t("settings.streamingBackend")}>
        <Row
          icon={<Server size={18} className="text-accent" />}
          label={t("settings.audioSource")}
          value={
            status?.streamingConfigured
              ? t("settings.audioSourceLive")
              : t("settings.audioSourceDemo")
          }
          tone={status?.streamingConfigured ? "good" : "warn"}
        />
        <Row
          icon={<Cpu size={18} className="text-textdim" />}
          label={t("settings.proxyInstances")}
          value={status?.instanceList ?? "—"}
          mono
        />
        <Row
          icon={<ShieldCheck size={18} className="text-textdim" />}
          label={t("settings.sponsorblockEndpoint")}
          value={status?.sponsorblockBase ?? "—"}
          mono
        />
        <div className="px-4 py-3 text-xs text-textfaint leading-relaxed">
          {t("settings.backendNotice")}
          <div className="mt-1 font-mono text-[10px]">
            PIPED_API_URLS, INVIDIOUS_API_URLS, SPONSORBLOCK_API_URL
          </div>
        </div>
      </Group>

      {/* Multi-Device Synchronization */}
      <Group title={t("settings.deviceSync")}>
        <div className="p-4 flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Server size={16} className="text-accent" /> {t("settings.syncCodeTitle")}
            </h3>
            <p className="text-xs text-textdim mt-1 leading-relaxed">
              {t("settings.syncCodeDesc")}
            </p>
          </div>

          <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
            <span className="text-xs font-semibold text-textdim uppercase tracking-wider">{t("settings.yourCode")}</span>
            <span className="text-base font-mono font-bold text-accent select-all">{currentKey || "Loading..."}</span>
          </div>

          {/* Synchronized Devices List */}
          {devices.length > 0 && (
            <div className="mt-2 pt-4 border-t border-white/5">
              <h4 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
                <Check size={14} className="text-accent" /> {t("settings.syncDevicesCount", { count: devices.length })}
              </h4>
              <p className="text-[11px] text-textdim mb-3 leading-relaxed">
                {t("settings.syncDevicesListDesc")}
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
                                {t("common.save")}
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-white truncate">
                                {device.deviceName}
                              </span>
                              {isCurrent && (
                                <span className="text-[9px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider scale-90">
                                  {t("settings.currentDeviceBadge")}
                                </span>
                              )}
                            </div>
                          )}
                          <span className="block text-[10px] text-textdim mt-0.5">
                            {t("settings.lastActive", { date: new Date(device.lastActiveAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) })}
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
                            title={t("settings.renameDevice")}
                          >
                            <Edit2 size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => handleUnlinkDevice(device.deviceId)}
                          className="p-1.5 text-textfaint hover:text-red-400 transition rounded-lg hover:bg-white/5"
                          title={t("settings.unlinkDevice")}
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
            <h4 className="text-xs font-semibold text-white mb-2">{t("settings.connectAnotherDevice")}</h4>
            <p className="text-[11px] text-textdim mb-3 leading-relaxed">
              {t("settings.connectAnotherDesc")}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={t("settings.codePlaceholder")}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-textfaint focus:outline-none focus:border-accent/50 flex-1 font-mono uppercase"
                disabled={syncing || syncSuccess}
              />
              <button
                onClick={handleSync}
                disabled={syncing || syncSuccess || !inputKey.trim()}
                className="bg-accent hover:bg-accent/90 disabled:opacity-50 text-black font-bold text-xs px-4 py-2.5 rounded-xl transition shrink-0 cursor-pointer"
              >
                {syncing ? t("settings.syncingBtn") : syncSuccess ? t("settings.syncedBtn") : t("settings.syncDeviceBtn")}
              </button>
            </div>

            {syncError && (
              <p className="text-xs text-red-400 mt-2 font-medium">{syncError}</p>
            )}
            {syncSuccess && (
              <p className="text-xs text-accent mt-2 font-medium">{t("settings.syncSuccessMsg")}</p>
            )}
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-[11px] text-textfaint">{t("settings.separateLibrariesPrompt")}</span>
            <button
              onClick={() => handleReset(false)}
              className="text-white/40 hover:text-white/80 text-[10px] uppercase tracking-wider font-semibold hover:underline cursor-pointer"
            >
              {t("settings.generateNewCode")}
            </button>
          </div>
        </div>
      </Group>

      {/* About */}
      <Group title={t("settings.aboutTitle")}>
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
              {t("settings.aboutDesc")}
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
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/[0.03] transition text-left cursor-pointer"
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

