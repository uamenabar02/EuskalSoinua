"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { DownloadAllButton } from "@/components/download-button";
import { Trash2, RotateCw, Radio, Sparkles } from "lucide-react";
import type { Track, Playlist } from "@/lib/types";
import { useToast } from "@/lib/toast";
import { useTranslation } from "@/lib/i18n";
import { usePlayer } from "@/lib/player-context";

interface Data {
  playlist: Playlist;
  tracks: (Track & { liked?: boolean })[];
}

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const p = usePlayer();
  const [loadingRadio, setLoadingRadio] = useState(false);
  const [reloadingRadio, setReloadingRadio] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const load = (pid: string, fresh = false, explicitSeed?: string) => {
    let url = `/api/playlists/${pid}`;
    if (pid.startsWith("daily-") && typeof window !== "undefined") {
      const activeSeed =
        explicitSeed ||
        new URLSearchParams(window.location.search).get("seed") ||
        localStorage.getItem("euskalsoinua_daily_mix_seed");
      if (activeSeed) url += `?seed=${encodeURIComponent(activeSeed)}`;
    }

    return fetch(url, { cache: fresh ? "no-store" : "default" })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((resData) => {
        setData(resData);
        try {
          localStorage.setItem(`euskalsoinua-playlist-cache-${pid}`, JSON.stringify(resData));
        } catch (e) {}
      })
      .catch(() => {
        if (fresh) return;
        try {
          const cached = localStorage.getItem(`euskalsoinua-playlist-cache-${pid}`);
          if (cached) {
            setData(JSON.parse(cached));
            setError(false);
          } else {
            setError(true);
          }
        } catch (e) {
          setError(true);
        }
      });
  };

  useEffect(() => {
    if (!id) return;
    load(id);
  }, [id]);

  const reloadRadio = async () => {
    if (!id || reloadingRadio) return;
    setReloadingRadio(true);
    toast("Reloading radio with fresh tracks…", "📻");
    try {
      const res = await fetch(`/api/playlists/${id}/reload-radio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const resData = await res.json();
      if (res.ok && resData.ok && resData.tracks) {
        setData({ playlist: resData.playlist, tracks: resData.tracks });
        try {
          localStorage.setItem(`euskalsoinua-playlist-cache-${id}`, JSON.stringify(resData));
        } catch (e) {}
        toast("Radio reloaded with new tracks!", "✅");
      } else {
        toast(resData.error || "Failed to reload radio", "⚠️");
      }
    } catch {
      toast("Error reloading radio", "❌");
    } finally {
      setReloadingRadio(false);
    }
  };

  const refreshDailyMix = async () => {
    if (!id || reloadingRadio) return;
    setReloadingRadio(true);
    toast("Refreshing Daily Mix variety…", "🔀");
    const freshSeed = `mix_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    try {
      localStorage.setItem("euskalsoinua_daily_mix_seed", freshSeed);
    } catch (e) {}
    await load(id, true, freshSeed);
    setReloadingRadio(false);
    toast("Daily Mix updated!", "✅");
  };

  const syncPlaylist = async () => {
    if (!id || syncing) return;
    setSyncing(true);
    toast("Syncing playlist with origin platform…", "🔄");
    try {
      const res = await fetch(`/api/playlists/${id}/sync`, { method: "POST" });
      const resData = await res.json();
      if (res.ok && resData.success) {
        await load(id, true);
        window.dispatchEvent(new Event("playlists-changed"));
        toast(`Playlist synced successfully! Loaded ${resData.addedCount} tracks.`, "✅");
      } else {
        toast(resData.error || "Failed to sync playlist", "❌");
      }
    } catch (err) {
      toast("Error syncing playlist", "❌");
    } finally {
      setSyncing(false);
    }
  };

  const removePlaylist = async () => {
    if (!data) return;
    if (!window.confirm(`Delete playlist “${data.playlist.name}”?`)) return;
    await fetch(`/api/playlists/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("playlists-changed"));
    router.push("/library");
  };

  if (error)
    return <div className="grid place-items-center py-32 text-textdim text-sm">{t("playlist.notFound")}</div>;
  if (!data) return <CenterLoader />;

  const { playlist, tracks } = data;
  const isDailyMix = playlist.type === ("daily_mix" as any) || String(id || "").startsWith("daily-");
  const isRadio =
    !isDailyMix &&
    (playlist.type === "radio" ||
      playlist.name.includes("📻") ||
      playlist.name.toLowerCase().includes("radio"));
  const isSyncedPlaylist =
    !isDailyMix &&
    !isRadio &&
    (playlist.description?.toLowerCase().includes("synced") ||
      playlist.description?.toLowerCase().includes("spotify.com") ||
      playlist.description?.toLowerCase().includes("playlist"));

  return (
    <div>
      <DetailHeader
        seed={playlist.coverSeed ?? playlist.name}
        coverLabel={playlist.name}
        meta={
          isDailyMix ? (
            <span className="text-xs font-bold uppercase tracking-wider text-accent px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20">
              {t("home.dailyMix")}
            </span>
          ) : isRadio ? (
            <span className="text-xs font-bold uppercase tracking-wider text-accent px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 flex items-center gap-1">
              <Radio size={12} /> {t("nav.radio")}
            </span>
          ) : (
            <span className="text-sm font-semibold text-textdim">{t("common.playlist")}</span>
          )
        }
        title={playlist.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 justify-center sm:justify-start">
            <span>{tracks.length} {tracks.length === 1 ? t("common.songSingular") : t("common.songs")}</span>
            {playlist.description ? (
              <>
                <span>•</span>
                <span>{playlist.description}</span>
              </>
            ) : null}
          </span>
        }
        actions={
          <>
            <PlayAllButton tracks={tracks} />

            {/* Reload Radio button right next to Play button */}
            {isRadio && (
              <button
                type="button"
                onClick={reloadRadio}
                disabled={reloadingRadio}
                className="flex items-center gap-2 h-11 px-5 rounded-full bg-accent/15 hover:bg-accent/25 active:bg-accent/35 text-accent border border-accent/30 font-semibold text-sm transition cursor-pointer touch-manipulation disabled:opacity-50"
                title="Reload this radio playlist with fresh track recommendations"
              >
                <RotateCw size={15} className={reloadingRadio ? "animate-spin text-accent" : ""} />
                <span>{reloadingRadio ? "Reloading…" : "Reload Radio"}</span>
              </button>
            )}

            {/* Update Daily Mix button right next to Play button */}
            {isDailyMix && (
              <button
                type="button"
                onClick={refreshDailyMix}
                disabled={reloadingRadio}
                className="flex items-center gap-2 h-11 px-5 rounded-full bg-accent/15 hover:bg-accent/25 active:bg-accent/35 text-accent border border-accent/30 font-semibold text-sm transition cursor-pointer touch-manipulation disabled:opacity-50"
                title="Update this Daily Mix with fresh track variety"
              >
                <RotateCw size={15} className={reloadingRadio ? "animate-spin text-accent" : ""} />
                <span>{reloadingRadio ? "Updating…" : "Update Mix"}</span>
              </button>
            )}

            <DownloadAllButton tracks={tracks} />

            {!isRadio && !isDailyMix && (
              <button
                type="button"
                onClick={async () => {
                  if (!id) return;
                  toast("Building playlist radio…", "📻");
                  setLoadingRadio(true);
                  const plId = await p.playRadio({ playlistId: id });
                  setLoadingRadio(false);
                  if (plId) {
                    toast("Playlist Radio ready!", "✅");
                    router.push(`/playlist/${plId}`);
                  } else {
                    toast("Could not build radio", "⚠️");
                  }
                }}
                disabled={loadingRadio}
                className="flex items-center gap-2 h-11 px-5 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-ink font-semibold text-sm transition cursor-pointer touch-manipulation disabled:opacity-50"
                title="Generate radio based on this playlist"
              >
                <Radio size={16} className={loadingRadio ? "animate-pulse text-accent" : ""} />
                <span>{loadingRadio ? "Loading radio…" : "Playlist Radio"}</span>
              </button>
            )}

            {isSyncedPlaylist && (
              <button
                type="button"
                onClick={syncPlaylist}
                disabled={syncing}
                className="flex items-center gap-1.5 h-11 px-5 rounded-full bg-accent hover:bg-accent/80 text-black font-extrabold text-xs transition disabled:opacity-50 cursor-pointer touch-manipulation"
                title="Sync playlist with origin platform"
              >
                <RotateCw size={14} className={syncing ? "animate-spin" : ""} />
                <span>{syncing ? t("playlist.syncing") : t("playlist.syncNow")}</span>
              </button>
            )}

            {!isDailyMix && (
              <button
                type="button"
                onClick={removePlaylist}
                className="grid place-items-center h-11 w-11 rounded-full bg-white/10 hover:bg-red-500/20 text-textdim hover:text-red-400 transition cursor-pointer touch-manipulation"
                aria-label="delete playlist"
              >
                <Trash2 size={18} />
              </button>
            )}
          </>
        }
      />

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        {tracks.length ? (
          <TrackList tracks={tracks} showAlbum />
        ) : (
          <div className="text-center py-20 text-textdim">
            {t("playlist.empty")}
            <div className="text-xs mt-1">
              {t("playlist.emptySub")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
