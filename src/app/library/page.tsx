"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Heart,
  Loader2,
  UserRound,
  Disc3,
  Download,
  Sparkles,
  WifiOff,
  CloudOff,
  CheckCircle2,
} from "lucide-react";
import { PlaylistCard, ArtistCard, AlbumCard } from "@/components/cards";
import { Section, SectionCard } from "@/components/sections";
import type { Track, Artist, Album, Playlist } from "@/lib/types";
import ImportPlaylistModal from "@/components/import-playlist-modal";
import { listDownloads, type DownloadedTrack } from "@/lib/downloads";
import { clsx } from "@/lib/utils";
import { useToast } from "@/lib/toast";
import { useTranslation } from "@/lib/i18n";

import { SocialRoom } from "@/components/social-room";
import { ImportExportManager } from "@/components/import-export";

interface Lib {
  liked: (Track & { liked?: boolean })[];
  playlists: Playlist[];
  aiPlaylists: Playlist[];
  followed: (Artist & { followed?: boolean })[];
  albums: (Album & { saved?: boolean })[];
}

function hashId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return -Math.abs(hash || 1);
}

export default function LibraryPage() {
  const { t } = useTranslation();
  const [lib, setLib] = useState<Lib | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [offlineOnly, setOfflineOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) return true;
    try {
      return localStorage.getItem("euskalsoinua-offline-only") === "true";
    } catch {
      return false;
    }
  });
  const [downloads, setDownloads] = useState<Omit<DownloadedTrack, "blob">[]>([]);
  const [isDeviceOffline, setIsDeviceOffline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined") return !navigator.onLine;
    return false;
  });
  const { toast } = useToast();

  const refreshDownloads = () => {
    listDownloads()
      .then((dl) => setDownloads(dl))
      .catch(() => setDownloads([]));
  };

  const load = () =>
    fetch("/api/library")
      .then((r) => {
        if (!r.ok) throw new Error("Network response was not ok");
        return r.json();
      })
      .then((data) => {
        if (!data || data.error || !Array.isArray(data.liked)) {
          throw new Error("Invalid or offline response");
        }
        const safeData: Lib = {
          liked: Array.isArray(data.liked) ? data.liked : [],
          playlists: Array.isArray(data.playlists) ? data.playlists : [],
          aiPlaylists: Array.isArray(data.aiPlaylists) ? data.aiPlaylists : [],
          followed: Array.isArray(data.followed) ? data.followed : [],
          albums: Array.isArray(data.albums) ? data.albums : [],
        };
        setLib(safeData);
        try {
          localStorage.setItem("euskalsoinua-library-cache", JSON.stringify(safeData));
        } catch (e) {}
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem("euskalsoinua-library-cache");
          if (cached) {
            const parsed = JSON.parse(cached);
            setLib({
              liked: Array.isArray(parsed?.liked) ? parsed.liked : [],
              playlists: Array.isArray(parsed?.playlists) ? parsed.playlists : [],
              aiPlaylists: Array.isArray(parsed?.aiPlaylists) ? parsed.aiPlaylists : [],
              followed: Array.isArray(parsed?.followed) ? parsed.followed : [],
              albums: Array.isArray(parsed?.albums) ? parsed.albums : [],
            });
          } else {
            setLib({ liked: [], playlists: [], aiPlaylists: [], followed: [], albums: [] });
          }
        } catch (e) {
          setLib({ liked: [], playlists: [], aiPlaylists: [], followed: [], albums: [] });
        }
      });

  useEffect(() => {
    load();
    refreshDownloads();

    const handleOnline = () => {
      setIsDeviceOffline(false);
    };
    const handleOffline = () => {
      setIsDeviceOffline(true);
      setOfflineOnly(true);
      toast("Switched to Offline Mode", "✈️");
    };
    const handleDownloadsChanged = () => {
      refreshDownloads();
    };
    const handlePlaylistsChanged = () => {
      load();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("downloads-changed", handleDownloadsChanged);
    window.addEventListener("playlists-changed", handlePlaylistsChanged);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("downloads-changed", handleDownloadsChanged);
      window.removeEventListener("playlists-changed", handlePlaylistsChanged);
    };
  }, [toast]);

  const toggleOfflineOnly = () => {
    const next = !offlineOnly;
    setOfflineOnly(next);
    try {
      localStorage.setItem("euskalsoinua-offline-only", String(next));
    } catch {}
    if (next) {
      toast("Showing offline music only", "✈️");
    }
  };

  const createPlaylist = async () => {
    const name = window.prompt("Playlist name", "My Playlist");
    if (!name) return;
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    window.dispatchEvent(new Event("playlists-changed"));
    load();
  };

  const downloadedTrackIds = useMemo(() => new Set(downloads.map((d) => d.trackId)), [downloads]);
  const downloadedAlbumIds = useMemo(
    () => new Set(downloads.map((d) => d.albumId).filter((id): id is number => typeof id === "number" && id > 0)),
    [downloads]
  );
  const downloadedAlbumNames = useMemo(
    () => new Set(downloads.map((d) => d.albumName?.toLowerCase().trim()).filter(Boolean)),
    [downloads]
  );
  const downloadedArtistNames = useMemo(
    () => new Set(downloads.map((d) => d.artist.toLowerCase().trim())),
    [downloads]
  );

  // Helper for playlist offline track count
  const getPlaylistOfflineCount = (pl: Playlist): number => {
    if (pl.trackIds && pl.trackIds.length > 0) {
      return pl.trackIds.filter((tid) => downloadedTrackIds.has(tid)).length;
    }
    try {
      const cachedStr = localStorage.getItem(`euskalsoinua-playlist-cache-${pl.id}`);
      if (cachedStr) {
        const cachedPl = JSON.parse(cachedStr);
        if (Array.isArray(cachedPl?.tracks)) {
          return cachedPl.tracks.filter((t: any) => downloadedTrackIds.has(t.id)).length;
        }
      }
    } catch {}
    return 0;
  };

  // Helper for album offline track count
  const getAlbumOfflineCount = (a: Album): number => {
    if (a.trackIds && a.trackIds.length > 0) {
      return a.trackIds.filter((tid) => downloadedTrackIds.has(tid)).length;
    }
    if (downloadedAlbumIds.has(a.id)) {
      return downloads.filter((d) => d.albumId === a.id).length;
    }
    if (a.title && downloadedAlbumNames.has(a.title.toLowerCase().trim())) {
      return downloads.filter((d) => d.albumName?.toLowerCase().trim() === a.title.toLowerCase().trim()).length;
    }
    return 0;
  };

  // Combine saved albums with any downloaded albums
  const allAlbums = useMemo(() => {
    if (!lib) return [];
    const result: Album[] = [...lib.albums];
    const seenAlbumKeys = new Set<string>();
    for (const a of lib.albums) {
      if (a.id) seenAlbumKeys.add(String(a.id));
      if (a.title) seenAlbumKeys.add(a.title.toLowerCase().trim());
    }

    downloads.forEach((d) => {
      const name = d.albumName || "Downloaded Songs";
      const key = d.albumId ? String(d.albumId) : name.toLowerCase().trim();
      if (!seenAlbumKeys.has(key)) {
        seenAlbumKeys.add(key);
        result.push({
          id: d.albumId || hashId(name),
          externalId: null,
          source: "local",
          title: name,
          artistId: null,
          artistName: d.artist,
          thumbnail: d.artworkUrl ?? null,
          year: null,
          genre: "Basque",
          region: "eu",
          trackCount: downloads.filter(
            (x) => (x.albumId && x.albumId === d.albumId) || (x.albumName && x.albumName === name)
          ).length,
          saved: false,
          trackIds: downloads
            .filter((x) => (x.albumId && x.albumId === d.albumId) || (x.albumName && x.albumName === name))
            .map((x) => x.trackId),
        });
      }
    });

    return result;
  }, [lib, downloads]);

  if (!lib)
    return (
      <div className="grid place-items-center py-32 text-textdim">
        <Loader2 className="animate-spin-slow" />
      </div>
    );

  const offlineLikedTracks = lib.liked.filter((t) => downloadedTrackIds.has(t.id));
  const displayedPlaylists = offlineOnly
    ? lib.playlists.filter((pl) => getPlaylistOfflineCount(pl) > 0)
    : lib.playlists;

  const displayedAiPlaylists = offlineOnly
    ? lib.aiPlaylists.filter((pl) => getPlaylistOfflineCount(pl) > 0)
    : lib.aiPlaylists;

  const displayedAlbums = offlineOnly
    ? allAlbums.filter((a) => getAlbumOfflineCount(a) > 0)
    : lib.albums;

  const displayedArtists = offlineOnly
    ? lib.followed.filter((art) => downloadedArtistNames.has(art.name.toLowerCase().trim()))
    : lib.followed;

  const totalOfflineItems = downloads.length;

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t("library.title")}
          </h1>
          <p className="text-xs sm:text-sm text-textdim mt-1">
            {offlineOnly
              ? `Offline View • ${totalOfflineItems} downloaded song${totalOfflineItems === 1 ? "" : "s"} ready`
              : t("library.subtitle")}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Offline Only Toggle Button */}
          <button
            id="toggle-offline-only"
            onClick={toggleOfflineOnly}
            className={clsx(
              "flex items-center gap-2 font-bold text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-full transition cursor-pointer border shadow-sm",
              offlineOnly
                ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20"
                : "bg-white/10 hover:bg-white/15 text-textdim hover:text-white border-white/10"
            )}
            title={offlineOnly ? "Showing offline music only" : "Filter to offline available music"}
            aria-pressed={offlineOnly}
          >
            {offlineOnly ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <WifiOff size={15} className="text-emerald-400 shrink-0" />
                <span>Offline Only: <strong className="text-white">ON</strong></span>
              </>
            ) : (
              <>
                <Download size={15} className="shrink-0" />
                <span>{t("common.offline")} Only</span>
              </>
            )}
          </button>

          <Link
            href="/curator"
            className="flex items-center gap-2 bg-accent text-black font-extrabold text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-full hover:scale-105 transition shadow-md shadow-accent/15 cursor-pointer"
          >
            <Sparkles size={15} /> {t("nav.curatorMobile")}
          </Link>
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-full hover:scale-105 transition cursor-pointer"
          >
            {t("settings.syncPlaylists")}
          </button>
          <button
            onClick={createPlaylist}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs sm:text-sm px-3.5 sm:px-4 py-2 rounded-full hover:scale-105 transition cursor-pointer"
          >
            <Plus size={16} /> {t("library.createPlaylist")}
          </button>
        </div>
      </header>

      {/* Offline Mode Active Banner */}
      {offlineOnly && (
        <div
          id="offline-mode-banner"
          className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-200"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
              <WifiOff size={18} />
            </div>
            <div>
              <div className="font-bold text-sm text-white flex items-center gap-2">
                {t("library.offlineModeActive")}
                {isDeviceOffline && (
                  <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {t("library.noInternet")}
                  </span>
                )}
              </div>
              <div className="text-xs text-emerald-200/80">
                {t("library.offlineActiveDesc", { count: downloads.length })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Link
              href="/library/downloaded"
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500 text-black hover:bg-emerald-400 transition"
            >
              {t("library.manageDownloads")}
            </Link>
            {!isDeviceOffline && (
              <button
                onClick={() => {
                  setOfflineOnly(false);
                  try {
                    localStorage.setItem("euskalsoinua-offline-only", "false");
                  } catch {}
                }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white transition cursor-pointer"
              >
                {t("library.showAll")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quick Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
        {/* Liked Songs */}
        <Link
          href="/library/liked"
          className={clsx(
            "flex items-center gap-4 rounded-lg p-2 pr-4 transition border",
            offlineOnly
              ? "bg-white/5 hover:bg-white/10 border-white/5"
              : "bg-white/5 hover:bg-white/10 border-transparent"
          )}
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#ec4899,#8b5cf6)" }}
          >
            <Heart size={24} fill="#fff" className="text-ink" />
          </span>
          <div>
            <div className="font-semibold flex items-center gap-1.5">
              {t("library.likedSongs")}
              {offlineOnly && offlineLikedTracks.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                  {offlineLikedTracks.length} {t("common.offline")}
                </span>
              )}
            </div>
            <div className="text-xs text-textdim">
              {offlineOnly
                ? `${offlineLikedTracks.length} ${t("common.tracks")}`
                : `${lib.liked.length} ${t("common.tracks")}`}
            </div>
          </div>
        </Link>

        {/* Downloaded Songs */}
        <Link
          href="/library/downloaded"
          className={clsx(
            "flex items-center gap-4 rounded-lg p-2 pr-4 transition border",
            offlineOnly
              ? "bg-emerald-950/20 border-emerald-500/30 hover:bg-emerald-950/40"
              : "bg-white/5 hover:bg-white/10 border-transparent"
          )}
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#0f9d4f,#1ed760)" }}
          >
            <Download size={24} className="text-ink" />
          </span>
          <div>
            <div className="font-semibold flex items-center gap-1.5">
              {t("library.downloaded")}
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500 text-black">
                {t("common.offline")}
              </span>
            </div>
            <div className="text-xs text-textdim">
              {t("library.storedLocally", { count: downloads.length })}
            </div>
          </div>
        </Link>

        {/* Quick Playlists */}
        {displayedPlaylists.slice(0, 4).map((pl) => {
          const offlineCount = getPlaylistOfflineCount(pl);
          return (
            <Link
              key={pl.id}
              href={`/playlist/${pl.id}`}
              className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
            >
              <div
                className="h-14 w-14 rounded-md shrink-0"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${playlistColor(pl.id)} , #0a0a0f)`,
                }}
              />
              <div className="min-w-0">
                <div className="font-semibold truncate">{pl.name}</div>
                <div className="text-xs text-textdim">
                  {offlineOnly ? (
                    <span className="text-emerald-300 font-medium">
                      {offlineCount} {t("common.tracks")}
                    </span>
                  ) : (
                    `${t("common.playlist")} • ${pl.trackCount} ${pl.trackCount === 1 ? t("common.songSingular") : t("common.songs")}`
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick row: liked artists + albums */}
      <div className="grid sm:grid-cols-2 gap-2 mb-8">
        <Link
          href="#liked-artists"
          className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)" }}
          >
            <UserRound size={24} className="text-ink" />
          </span>
          <div>
            <div className="font-semibold">{t("library.likedArtists")}</div>
            <div className="text-xs text-textdim">
              {offlineOnly
                ? `${displayedArtists.length} ${t("common.artists")}`
                : `${lib.followed.length} ${t("common.artists")}`}
            </div>
          </div>
        </Link>
        <Link
          href="#liked-albums"
          className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#f59e0b,#db2777)" }}
          >
            <Disc3 size={24} className="text-ink" />
          </span>
          <div>
            <div className="font-semibold">{t("library.likedAlbums")}</div>
            <div className="text-xs text-textdim">
              {offlineOnly
                ? `${displayedAlbums.length} ${t("common.albums")}`
                : `${lib.albums.length} ${t("common.albums")}`}
            </div>
          </div>
        </Link>
      </div>

      {/* If in offline mode and 0 items downloaded */}
      {offlineOnly && totalOfflineItems === 0 && (
        <div className="my-12 p-8 sm:p-12 text-center rounded-2xl bg-panel border border-white/10 max-w-xl mx-auto">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <CloudOff size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">{t("library.noOfflineMusicTitle")}</h2>
          <p className="text-sm text-textdim mb-6 leading-relaxed">
            {t("library.noOfflineMusicDesc")}
          </p>
          <button
            onClick={() => {
              setOfflineOnly(false);
              try {
                localStorage.setItem("euskalsoinua-offline-only", "false");
              } catch {}
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-black font-extrabold text-sm hover:scale-105 transition shadow-lg cursor-pointer"
          >
            {t("library.viewAllLibraryBtn")}
          </button>
        </div>
      )}

      {/* Playlists Section */}
      <Section
        title={offlineOnly ? t("library.offlinePlaylists") : t("library.playlists")}
        subtitle={
          offlineOnly
            ? displayedPlaylists.length
              ? `${displayedPlaylists.length} ${t("common.playlists")}`
              : undefined
            : undefined
        }
      >
        {displayedPlaylists.length === 0 ? (
          <div className="text-textdim text-sm px-1 py-2">
            {offlineOnly
              ? "No playlists have downloaded tracks yet."
              : t("library.noPlaylistsYet")}
          </div>
        ) : (
          displayedPlaylists.map((pl) => {
            const count = getPlaylistOfflineCount(pl);
            const badge = offlineOnly && count > 0 ? `${count} ${t("common.offline")}` : undefined;
            return (
              <SectionCard key={pl.id}>
                <PlaylistCard playlist={pl} offlineBadge={badge} />
              </SectionCard>
            );
          })
        )}
      </Section>

      {/* AI-Curated Playlists Subsection */}
      <Section
        title={offlineOnly ? t("library.offlineAiPlaylists") : t("library.aiGeneratedPlaylists")}
        subtitle={
          offlineOnly
            ? undefined
            : t("library.curatedByGemini")
        }
      >
        {displayedAiPlaylists.length === 0 ? (
          <div className="text-textdim text-sm px-1 flex items-center gap-3 py-3">
            <span>
              {offlineOnly
                ? "No AI-curated playlists available offline."
                : t("library.noAiPlaylistsYet")}
            </span>
            {!offlineOnly && (
              <Link
                href="/curator"
                className="text-xs text-accent font-bold hover:underline flex items-center gap-1"
              >
                <Sparkles size={13} /> {t("library.createWithGemini")}
              </Link>
            )}
          </div>
        ) : (
          displayedAiPlaylists.map((pl) => {
            const count = getPlaylistOfflineCount(pl);
            const badge = offlineOnly && count > 0 ? `${count} ${t("common.offline")}` : undefined;
            return (
              <SectionCard key={pl.id}>
                <PlaylistCard playlist={pl} offlineBadge={badge} />
              </SectionCard>
            );
          })
        )}
      </Section>

      {/* Liked Artists */}
      <div id="liked-artists" className="scroll-mt-4">
        <Section
          title={offlineOnly ? t("library.offlineArtists") : t("library.likedArtists")}
          subtitle={
            displayedArtists.length
              ? `${displayedArtists.length} ${t("common.artists")}`
              : undefined
          }
        >
          {displayedArtists.length === 0 ? (
            <div className="text-textdim text-sm px-1 py-2">
              {offlineOnly
                ? "No followed artists have downloaded tracks on this device."
                : t("library.noLikedArtistsYet")}
            </div>
          ) : (
            displayedArtists.map((a) => (
              <SectionCard key={a.id}>
                <ArtistCard artist={a} />
              </SectionCard>
            ))
          )}
        </Section>
      </div>

      {/* Liked Albums */}
      <div id="liked-albums" className="scroll-mt-4">
        <Section
          title={offlineOnly ? t("library.offlineAlbums") : t("library.likedAlbums")}
          subtitle={
            displayedAlbums.length
              ? `${displayedAlbums.length} ${t("common.albums")}`
              : undefined
          }
        >
          {displayedAlbums.length === 0 ? (
            <div className="text-textdim text-sm px-1 py-2">
              {offlineOnly
                ? "No albums have downloaded tracks on this device."
                : t("library.noLikedAlbumsYet")}
            </div>
          ) : (
            displayedAlbums.map((a) => {
              const count = getAlbumOfflineCount(a);
              const badge = offlineOnly && count > 0 ? `${count} ${t("common.offline")}` : undefined;
              return (
                <SectionCard key={a.id}>
                  <AlbumCard album={a} offlineBadge={badge} />
                </SectionCard>
              );
            })
          )}
        </Section>
      </div>

      {!offlineOnly && (
        <div className="my-10 space-y-6">
          <SocialRoom />
          <ImportExportManager />
        </div>
      )}

      <ImportPlaylistModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={load}
      />
    </div>
  );
}

function playlistColor(id: number): string {
  const hues = ["#7c3aed", "#ec4899", "#10b981", "#f59e0b", "#06b6d4", "#f43f5e"];
  return hues[id % hues.length];
}
