"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePlayer } from "@/lib/player-context";
import { listDownloads, removeDownload, clearAllDownloads, preloadDownloadedUrls, downloadTrack } from "@/lib/downloads";
import { CoverArt } from "@/components/cover";
import { useToast } from "@/lib/toast";
import { useTranslation } from "@/lib/i18n";
import { Download, Play, Trash2, Loader2, Disc, Music, Library, Check, Sparkles, ArrowLeft, ExternalLink } from "lucide-react";
import { formatTime, clsx } from "@/lib/utils";
import type { Track, Playlist } from "@/lib/types";

interface DownloadedItem {
  trackId: number;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  duration: number;
  downloadedAt: number;
  albumId?: number | null;
  albumName?: string | null;
  isFullTrack?: boolean;
  fileSize?: number;
}

export default function DownloadedPage() {
  const { playQueue, current } = usePlayer();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [items, setItems] = useState<DownloadedItem[] | null>(null);
  const [activeTab, setActiveTab] = useState<"songs" | "albums" | "playlists">("songs");
  const [upgradingIds, setUpgradingIds] = useState<Set<number>>(new Set());
  const [isUpgradingAll, setIsUpgradingAll] = useState(false);
  const [cachedPlaylists] = useState<Playlist[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const cachedLibStr = localStorage.getItem("euskalsoinua-library-cache");
      if (cachedLibStr) {
        const cachedLib = JSON.parse(cachedLibStr);
        if (cachedLib && Array.isArray(cachedLib.playlists)) {
          return cachedLib.playlists;
        }
      }
    } catch (e) {}
    return [];
  });

  const load = () => {
    preloadDownloadedUrls().catch(() => {});
    return listDownloads().then(setItems).catch(() => setItems([]));
  };

  useEffect(() => {
    preloadDownloadedUrls().then(() => load()).catch(() => load());
  }, []);

  const handleUpgrade = async (item: DownloadedItem) => {
    if (upgradingIds.has(item.trackId)) return;
    setUpgradingIds((prev) => new Set(prev).add(item.trackId));
    toast(`${t("library.upgradeToFull")}: "${item.title}"…`, "⬇️");
    try {
      const res = await downloadTrack({
        id: item.trackId,
        title: item.title,
        artistName: item.artist,
        duration: item.duration,
        artworkUrl: item.artworkUrl,
        albumId: item.albumId,
        albumName: item.albumName,
      });
      if (res.isFullTrack) {
        const mb = (res.fileSize / (1024 * 1024)).toFixed(1);
        toast(`"${item.title}" (${mb} MB)`, "✅");
      } else {
        toast(`"${item.title}"`, "✅");
      }
      await load();
    } catch (e: any) {
      toast(`Error: "${item.title}"`, "⚠️");
    } finally {
      setUpgradingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.trackId);
        return next;
      });
    }
  };

  const handleUpgradeAll = async () => {
    if (!items || items.length === 0 || isUpgradingAll) return;
    const toUpgrade = items.filter((i) => !i.isFullTrack);
    if (toUpgrade.length === 0) {
      toast(t("library.allTracksFull"), "✅");
      return;
    }
    setIsUpgradingAll(true);
    toast(t("library.upgradingAll"), "⬇️");
    let upgradedCount = 0;
    for (const item of toUpgrade) {
      setUpgradingIds((prev) => new Set(prev).add(item.trackId));
      try {
        const res = await downloadTrack({
          id: item.trackId,
          title: item.title,
          artistName: item.artist,
          duration: item.duration,
          artworkUrl: item.artworkUrl,
          albumId: item.albumId,
          albumName: item.albumName,
        });
        if (res.isFullTrack) upgradedCount++;
      } catch {}
      setUpgradingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.trackId);
        return next;
      });
    }
    setIsUpgradingAll(false);
    toast(`${upgradedCount}/${toUpgrade.length}`, "✅");
    await load();
  };

  const tracks: (Track & { liked?: boolean })[] = (items || []).map((i) => ({
    id: i.trackId,
    externalId: null,
    source: "local",
    title: i.title,
    artistId: null,
    artistName: i.artist,
    albumId: i.albumId ?? null,
    albumName: i.albumName ?? null,
    duration: i.duration,
    thumbnail: null,
    genre: null,
    region: "global",
    language: "und",
    demoAudio: null,
    isrc: null,
    previewUrl: null,
    previewUrlAlt: null,
    artworkUrl: i.artworkUrl ?? null,
    playCount: 0,
  }));

  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null);

  // Group downloaded tracks into albums
  const albumGroups = new Map<string, {
    key: string;
    albumId: number | null;
    albumName: string;
    artistName: string;
    artworkUrl: string | null;
    tracks: Track[];
    items: DownloadedItem[];
  }>();

  (items || []).forEach((item, index) => {
    const albumName = item.albumName || "Downloaded Songs";
    const key = `${albumName}:::${item.artist}`;
    if (!albumGroups.has(key)) {
      albumGroups.set(key, {
        key,
        albumId: item.albumId ?? null,
        albumName,
        artistName: item.artist,
        artworkUrl: item.artworkUrl ?? null,
        tracks: [],
        items: [],
      });
    }
    const trackObj = tracks[index];
    if (trackObj) {
      albumGroups.get(key)!.tracks.push(trackObj);
      albumGroups.get(key)!.items.push(item);
    }
  });

  const downloadedAlbums = Array.from(albumGroups.values()).map(group => ({
    key: group.key,
    id: group.albumId || 0,
    title: group.albumName,
    artistName: group.artistName,
    thumbnail: group.artworkUrl,
    tracks: group.tracks,
    items: group.items,
    trackCount: group.tracks.length,
  }));

  const activeSelectedAlbum = selectedAlbumKey ? albumGroups.get(selectedAlbumKey) : null;

  const downloadedPlaylists = (items && items.length > 0)
    ? cachedPlaylists.map(pl => {
        let tracksInPlaylist: Track[] = [];
        try {
          const cachedPlStr = localStorage.getItem(`euskalsoinua-playlist-cache-${pl.id}`);
          if (cachedPlStr) {
            const cachedPl = JSON.parse(cachedPlStr);
            if (cachedPl && Array.isArray(cachedPl.tracks)) {
              tracksInPlaylist = cachedPl.tracks;
            }
          }
        } catch (e) {}

        const downloadedTracks = tracksInPlaylist.filter(t => 
          items.some(item => item.trackId === t.id)
        );

        return {
          playlist: pl,
          tracks: downloadedTracks,
          totalCount: tracksInPlaylist.length || pl.trackCount,
          downloadedCount: downloadedTracks.length,
        };
      }).filter(p => p.downloadedCount > 0)
    : [];

  if (!items)
    return (
      <div className="grid place-items-center py-32 text-textdim">
        <Loader2 className="animate-spin-slow" />
      </div>
    );

  return (
    <div>
      <div
        className="px-4 sm:px-6 pt-10 pb-6 relative"
        style={{
          backgroundImage:
            "radial-gradient(120% 100% at 20% 0%, hsl(150 55% 15%) 0%, #0a0a0f 75%)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-bg -z-10" />
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 max-w-[1600px] mx-auto">
          <div
            className="grid place-items-center h-40 w-40 sm:h-52 sm:w-52 rounded-lg shrink-0 shadow-2xl animate-fade-in"
            style={{ background: "linear-gradient(135deg,#0f9d4f,#1ed760)" }}
          >
            <Download size={64} className="text-black/80" />
          </div>
          <div className="text-center sm:text-left">
            <span className="text-sm font-semibold uppercase tracking-wide text-textdim">
              {t("library.offlineReadyBadge")}
            </span>
            <h1 className="text-3xl sm:text-6xl font-extrabold tracking-tight mt-2">
              {t("library.downloadedMusic")}
            </h1>
            <p className="text-textdim mt-3 text-sm">
              {t("library.storedLocally", { count: items.length })} ({items.filter((i) => i.isFullTrack).length} {t("player.fullTrackMode")})
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        {items.length > 0 ? (
          <>
            {/* Quick Actions and Tab Selector */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 pb-6 border-b border-white/5">
              <div className="flex flex-wrap items-center gap-4 justify-between w-full lg:w-auto">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => playQueue(tracks, 0)}
                    className="grid place-items-center h-14 w-14 rounded-full bg-accent text-black hover:scale-105 transition shadow-md shrink-0 cursor-pointer"
                    title={t("home.playMix")}
                  >
                    <Play size={26} fill="currentColor" className="ml-0.5" />
                  </button>
                  <div>
                    <div className="font-semibold text-sm">{t("home.playMix")}</div>
                    <span className="text-textdim text-xs">{t("library.downloadedSubtitle")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {items.some((i) => !i.isFullTrack) && (
                    <button
                      onClick={handleUpgradeAll}
                      disabled={isUpgradingAll}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-accent hover:text-black bg-accent/10 hover:bg-accent rounded-full border border-accent/30 transition-all shrink-0 cursor-pointer disabled:opacity-50"
                      title={t("library.upgradeToFull")}
                    >
                      {isUpgradingAll ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      <span>
                        {t("library.upgradeToFull")} ({items.filter((i) => !i.isFullTrack).length})
                      </span>
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      if (confirm(t("library.clearDownloadsConfirm"))) {
                        await clearAllDownloads();
                        toast(t("library.clearDownloads"), "🗑️");
                        load();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 rounded-full border border-red-500/10 hover:border-red-500/20 transition-all shrink-0 cursor-pointer"
                    title={t("library.clearDownloads")}
                  >
                    <Trash2 size={14} />
                    <span>{t("library.clearDownloads")}</span>
                  </button>
                </div>
              </div>

              {/* Tab Selector */}
              <div className="flex bg-white/5 p-1 rounded-full self-start sm:self-auto shrink-0 border border-white/5">
                <button
                  onClick={() => setActiveTab("songs")}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer",
                    activeTab === "songs" ? "bg-accent text-black shadow-sm" : "text-textdim hover:text-white"
                  )}
                >
                  <Music size={14} />
                  <span>{t("library.songsTab")} ({items.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab("albums")}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer",
                    activeTab === "albums" ? "bg-accent text-black shadow-sm" : "text-textdim hover:text-white"
                  )}
                >
                  <Disc size={14} />
                  <span>{t("library.albumsTab")} ({downloadedAlbums.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab("playlists")}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer",
                    activeTab === "playlists" ? "bg-accent text-black shadow-sm" : "text-textdim hover:text-white"
                  )}
                >
                  <Library size={14} />
                  <span>{t("library.playlistsTab")} ({downloadedPlaylists.length})</span>
                </button>
              </div>
            </div>

            {/* Songs Tab */}
            {activeTab === "songs" && (
              <div className="flex flex-col gap-1">
                {items.map((item, i) => {
                  const isCurrent = current?.id === item.trackId;
                  return (
                    <div
                      key={item.trackId}
                      className={clsx(
                        "group grid items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5 transition grid-cols-[24px_1fr_auto]",
                        isCurrent && "bg-white/5",
                      )}
                    >
                      <button
                        onClick={() => playQueue(tracks, i)}
                        className="grid place-items-center w-6 text-textdim text-sm cursor-pointer"
                      >
                        <span className="group-hover:hidden">{i + 1}</span>
                        <Play size={16} fill="currentColor" className="hidden group-hover:inline-flex text-ink animate-scale-in" />
                      </button>
                      <div className="flex items-center gap-3 min-w-0">
                        <CoverArt
                          seed={`${item.title}-${item.artist}`}
                          artwork={item.artworkUrl}
                          label={item.title}
                          rounded="rounded-md"
                          className="h-10 w-10 shrink-0 shadow-sm"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={clsx("truncate text-sm font-medium", isCurrent ? "text-accent font-semibold" : "text-ink")}>
                              {item.title}
                            </span>
                            <span
                              className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-accent/20 text-accent shrink-0"
                              title={t("library.offlineReadyBadge")}
                            >
                              <Check size={11} strokeWidth={3} />
                            </span>
                          </div>
                          <div className="truncate text-xs text-textdim flex items-center gap-1">
                            <span>{item.artist}</span>
                            {item.albumName && (
                              <>
                                <span className="text-textfaint">•</span>
                                <span className="truncate text-textfaint max-w-[150px]">{item.albumName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.isFullTrack ? (
                          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                            {t("player.fullTrackMode")}
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpgrade(item);
                            }}
                            disabled={upgradingIds.has(item.trackId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition cursor-pointer disabled:opacity-50"
                            title={t("library.upgradeToFull")}
                          >
                            {upgradingIds.has(item.trackId) ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Download size={11} />
                            )}
                            <span>{t("common.edit")}</span>
                          </button>
                        )}
                        {item.fileSize ? (
                          <span className="text-textfaint text-[11px] hidden md:block">
                            {(item.fileSize / (1024 * 1024)).toFixed(1)} MB
                          </span>
                        ) : null}
                        <span className="text-textfaint text-xs hidden sm:block">
                          {formatTime(item.duration)}
                        </span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await removeDownload(item.trackId);
                            toast(t("common.delete"), "🗑️");
                            load();
                          }}
                          className="grid place-items-center h-7 w-7 rounded-full text-textdim hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                          title={t("common.delete")}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Albums Tab */}
            {activeTab === "albums" && (
              activeSelectedAlbum ? (
                <div className="flex flex-col gap-6 animate-fade-in">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedAlbumKey(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-white/5 hover:bg-white/10 text-white transition border border-white/5 cursor-pointer"
                    >
                      <ArrowLeft size={14} />
                      <span>{t("common.back")}</span>
                    </button>
                    {activeSelectedAlbum.albumId ? (
                      <Link
                        href={`/album/${activeSelectedAlbum.albumId}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full text-textdim hover:text-white transition"
                      >
                        <ExternalLink size={13} />
                        <span>{t("common.album")}</span>
                      </Link>
                    ) : null}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6 bg-panel p-4 sm:p-6 rounded-2xl border border-white/5 shadow-md">
                    <div className="relative w-36 h-36 sm:w-44 sm:h-44 shrink-0 rounded-xl overflow-hidden shadow-xl">
                      <CoverArt
                        seed={`${activeSelectedAlbum.albumName}-${activeSelectedAlbum.artistName}`}
                        label={activeSelectedAlbum.albumName}
                        artwork={activeSelectedAlbum.artworkUrl}
                        rounded="rounded-xl"
                        className="w-full h-full"
                      />
                    </div>
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <span className="text-xs uppercase font-bold tracking-wider text-accent">{t("library.offlineAlbums")}</span>
                      <h2 className="text-2xl sm:text-3xl font-extrabold truncate mt-1">{activeSelectedAlbum.albumName}</h2>
                      <div className="text-sm font-semibold text-textdim mt-1">{activeSelectedAlbum.artistName}</div>
                      <div className="text-xs text-textfaint mt-2">
                        {t("library.songsCountPlural", { count: activeSelectedAlbum.tracks.length })} • {formatTime(activeSelectedAlbum.tracks.reduce((acc, trk) => acc + (trk.duration || 0), 0))}
                      </div>
                      <div className="mt-4 flex items-center justify-center sm:justify-start gap-3">
                        <button
                          onClick={() => playQueue(activeSelectedAlbum.tracks, 0)}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-black font-bold text-xs hover:scale-105 transition shadow-md cursor-pointer"
                        >
                          <Play size={16} fill="currentColor" />
                          <span>{t("common.play")}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Album Track List */}
                  <div className="flex flex-col gap-1">
                    {activeSelectedAlbum.items.map((item, idx) => {
                      const isCurrent = current?.id === item.trackId;
                      const sizeMb = item.fileSize ? (item.fileSize / (1024 * 1024)).toFixed(1) : null;
                      return (
                        <div
                          key={item.trackId}
                          onClick={() => playQueue(activeSelectedAlbum.tracks, idx)}
                          className={clsx(
                            "group flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-xl transition cursor-pointer border border-transparent",
                            isCurrent ? "bg-panel-hover border-accent/20" : "hover:bg-panel"
                          )}
                        >
                          <div className="w-6 text-center text-xs font-mono text-textdim shrink-0 group-hover:hidden">
                            {idx + 1}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              playQueue(activeSelectedAlbum.tracks, idx);
                            }}
                            className="hidden group-hover:grid place-items-center w-6 h-6 rounded-full text-white shrink-0"
                          >
                            <Play size={14} fill="currentColor" />
                          </button>
                          <div className="relative h-10 w-10 shrink-0 rounded-lg overflow-hidden shadow-sm">
                            <CoverArt
                              seed={`${item.title}-${item.artist}`}
                              label={item.title}
                              artwork={item.artworkUrl}
                              rounded="rounded-lg"
                              className="w-full h-full"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={clsx("font-medium truncate text-sm", isCurrent ? "text-accent font-semibold" : "")}>
                              {item.title}
                            </div>
                            <div className="text-textdim text-xs truncate mt-0.5">{item.artist}</div>
                          </div>
                          <div className="hidden sm:flex items-center gap-2 shrink-0">
                            {item.isFullTrack ? (
                              <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-[#0f9d4f] bg-[#0f9d4f]/10 px-2 py-0.5 rounded-full border border-[#0f9d4f]/20">
                                <Check size={10} /> Full
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpgrade(item);
                                }}
                                disabled={upgradingIds.has(item.trackId)}
                                className="flex items-center gap-1 text-[10px] uppercase font-bold text-accent hover:text-black bg-accent/10 hover:bg-accent px-2 py-0.5 rounded-full border border-accent/30 transition-all cursor-pointer"
                              >
                                {upgradingIds.has(item.trackId) ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : (
                                  <Sparkles size={10} />
                                )}
                                <span>{t("common.edit")}</span>
                              </button>
                            )}
                            {sizeMb && <span className="text-[11px] font-mono text-textfaint">{sizeMb} MB</span>}
                          </div>
                          <div className="text-textdim text-xs font-mono shrink-0 ml-2">{formatTime(item.duration)}</div>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await removeDownload(item.trackId);
                              toast(t("common.delete"), "🗑️");
                              load();
                            }}
                            className="grid place-items-center h-8 w-8 rounded-full text-textdim hover:text-red-400 hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                            title={t("common.delete")}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {downloadedAlbums.map((album) => (
                    <div
                      key={album.key}
                      onClick={() => setSelectedAlbumKey(album.key)}
                      className="group relative rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 flex flex-col h-full border border-white/5 hover:border-white/10 cursor-pointer"
                    >
                      <div className="relative aspect-square mb-3 shadow-md rounded-lg overflow-hidden">
                        <CoverArt
                          seed={`${album.title}-${album.artistName}`}
                          label={album.title}
                          artwork={album.thumbnail}
                          rounded="rounded-lg"
                          className="w-full h-full"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            playQueue(album.tracks, 0);
                          }}
                          className="absolute right-2 bottom-2 grid place-items-center h-11 w-11 rounded-full bg-accent text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all hover:scale-105 cursor-pointer"
                          title={t("common.play")}
                        >
                          <Play size={18} fill="currentColor" className="ml-0.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-semibold truncate text-sm block group-hover:text-accent transition-colors"
                        >
                          {album.title}
                        </div>
                        <div className="text-textdim text-xs truncate mt-0.5">{album.artistName}</div>
                      </div>
                      <div className="text-textfaint text-[10px] mt-2 uppercase tracking-wider font-semibold">
                        {t("library.songsCountPlural", { count: album.trackCount })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* Playlists Tab */}
            {activeTab === "playlists" && (
              downloadedPlaylists.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {downloadedPlaylists.map(({ playlist, tracks: plTracks, downloadedCount, totalCount }) => (
                    <div
                      key={playlist.id}
                      className="group relative rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 flex flex-col h-full border border-white/5 hover:border-white/10"
                    >
                      <div className="relative aspect-square mb-3 shadow-md rounded-lg overflow-hidden">
                        <CoverArt
                          seed={playlist.coverSeed ?? playlist.name}
                          label={playlist.name}
                          rounded="rounded-lg"
                          className="w-full h-full"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            playQueue(plTracks, 0);
                          }}
                          className="absolute right-2 bottom-2 grid place-items-center h-11 w-11 rounded-full bg-accent text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all hover:scale-105 cursor-pointer"
                          title={t("common.play")}
                        >
                          <Play size={18} fill="currentColor" className="ml-0.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/playlist/${playlist.id}`}
                          className="font-semibold truncate text-sm block hover:underline hover:text-accent"
                        >
                          {playlist.name}
                        </Link>
                        <div className="text-textdim text-xs truncate mt-0.5">
                          {downloadedCount === totalCount ? (
                            <span className="text-[#0f9d4f] font-semibold">{t("library.offlineReadyBadge")}</span>
                          ) : (
                            <span>{downloadedCount} / {totalCount}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-textfaint text-[10px] mt-2 truncate max-w-full font-medium">
                        {playlist.description || t("common.playlist")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 text-textdim">
                  <Library size={40} className="mx-auto mb-3 text-textfaint" />
                  {t("library.noDownloadedPlaylists")}
                </div>
              )
            )}
          </>
        ) : (
          <div className="text-center py-20 text-textdim">
            <Download size={40} className="mx-auto mb-3 text-textfaint" />
            {t("library.noOfflineMusicTitle")}
            <div className="text-xs mt-1">
              {t("library.noOfflineMusicDesc")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
