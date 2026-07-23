"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePlayer } from "@/lib/player-context";
import { listDownloads, removeDownload, clearAllDownloads } from "@/lib/downloads";
import { CoverArt } from "@/components/cover";
import { useToast } from "@/lib/toast";
import { Download, Play, Trash2, Loader2, Disc, Music, Library } from "lucide-react";
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
}

export default function DownloadedPage() {
  const { playQueue, current } = usePlayer();
  const { toast } = useToast();
  const [items, setItems] = useState<DownloadedItem[] | null>(null);
  const [activeTab, setActiveTab] = useState<"songs" | "albums" | "playlists">("songs");
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

  const load = () => listDownloads().then(setItems).catch(() => setItems([]));

  useEffect(() => {
    load();
  }, []);

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

  // Group downloaded tracks into albums
  const albumGroups = new Map<string, {
    albumId: number | null;
    albumName: string;
    artistName: string;
    artworkUrl: string | null;
    tracks: Track[];
  }>();

  (items || []).forEach((item, index) => {
    const albumName = item.albumName || "Downloaded Songs";
    const key = `${albumName}-${item.artist}`;
    if (!albumGroups.has(key)) {
      albumGroups.set(key, {
        albumId: item.albumId ?? null,
        albumName,
        artistName: item.artist,
        artworkUrl: item.artworkUrl ?? null,
        tracks: [],
      });
    }
    const trackObj = tracks[index];
    if (trackObj) {
      albumGroups.get(key)!.tracks.push(trackObj);
    }
  });

  const downloadedAlbums = Array.from(albumGroups.values()).map(group => ({
    id: group.albumId || 0,
    title: group.albumName,
    artistName: group.artistName,
    thumbnail: group.artworkUrl,
    tracks: group.tracks,
    trackCount: group.tracks.length,
  }));

  // Derive downloaded playlists dynamically from the offline cache
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

        // Find downloaded tracks that are part of this playlist
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
              Offline Cache
            </span>
            <h1 className="text-3xl sm:text-6xl font-extrabold tracking-tight mt-2">
              Downloads
            </h1>
            <p className="text-textdim mt-3 text-sm">
              {items.length} song{items.length === 1 ? "" : "s"} saved locally for uninterrupted device playback.
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        {items.length > 0 ? (
          <>
            {/* Quick Actions and Tab Selector */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 pb-6 border-b border-white/5">
              <div className="flex flex-wrap items-center gap-6 justify-between w-full lg:w-auto">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => playQueue(tracks, 0)}
                    className="grid place-items-center h-14 w-14 rounded-full bg-accent text-black hover:scale-105 transition shadow-md shrink-0"
                    title="Play all offline tracks"
                  >
                    <Play size={26} fill="currentColor" className="ml-0.5" />
                  </button>
                  <div>
                    <div className="font-semibold text-sm">Play Offline Mix</div>
                    <span className="text-textdim text-xs">Device playback works completely offline</span>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    if (confirm("Are you sure you want to clear all downloaded songs from your device? This cannot be undone.")) {
                      await clearAllDownloads();
                      toast("All downloaded tracks removed", "🗑️");
                      load();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 rounded-full border border-red-500/10 hover:border-red-500/20 transition-all shrink-0"
                  title="Remove all offline files"
                >
                  <Trash2 size={14} />
                  <span>Clear Downloads</span>
                </button>
              </div>

              {/* Tab Selector */}
              <div className="flex bg-white/5 p-1 rounded-full self-start sm:self-auto shrink-0 border border-white/5">
                <button
                  onClick={() => setActiveTab("songs")}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all",
                    activeTab === "songs" ? "bg-accent text-black shadow-sm" : "text-textdim hover:text-white"
                  )}
                >
                  <Music size={14} />
                  <span>Songs ({items.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab("albums")}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all",
                    activeTab === "albums" ? "bg-accent text-black shadow-sm" : "text-textdim hover:text-white"
                  )}
                >
                  <Disc size={14} />
                  <span>Albums ({downloadedAlbums.length})</span>
                </button>
                <button
                  onClick={() => setActiveTab("playlists")}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all",
                    activeTab === "playlists" ? "bg-accent text-black shadow-sm" : "text-textdim hover:text-white"
                  )}
                >
                  <Library size={14} />
                  <span>Playlists ({downloadedPlaylists.length})</span>
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
                        className="grid place-items-center w-6 text-textdim text-sm"
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
                          <div className={clsx("truncate text-sm font-medium", isCurrent ? "text-accent font-semibold" : "text-ink")}>
                            {item.title}
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
                        <span className="text-textfaint text-xs hidden sm:block">
                          {formatTime(item.duration)}
                        </span>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            await removeDownload(item.trackId);
                            toast("Removed from downloads", "🗑️");
                            load();
                          }}
                          className="grid place-items-center h-7 w-7 rounded-full text-textdim hover:text-red-400 hover:bg-white/10 transition-colors"
                          title="Remove download"
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {downloadedAlbums.map((album) => (
                  <div
                    key={`${album.title}-${album.artistName}`}
                    className="group relative rounded-xl bg-panel hover:bg-panel-hover transition p-3 sm:p-4 flex flex-col h-full border border-white/5 hover:border-white/10"
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
                        className="absolute right-2 bottom-2 grid place-items-center h-11 w-11 rounded-full bg-accent text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all hover:scale-105"
                        title="Play offline album"
                      >
                        <Play size={18} fill="currentColor" className="ml-0.5" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={album.id ? `/album/${album.id}` : "#"}
                        className={clsx("font-semibold truncate text-sm block", album.id ? "hover:underline hover:text-accent" : "")}
                      >
                        {album.title}
                      </Link>
                      <div className="text-textdim text-xs truncate mt-0.5">{album.artistName}</div>
                    </div>
                    <div className="text-textfaint text-[10px] mt-2 uppercase tracking-wider font-semibold">
                      {album.trackCount} song{album.trackCount === 1 ? "" : "s"} downloaded
                    </div>
                  </div>
                ))}
              </div>
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
                          className="absolute right-2 bottom-2 grid place-items-center h-11 w-11 rounded-full bg-accent text-black shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all hover:scale-105"
                          title="Play offline playlist"
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
                            <span className="text-[#0f9d4f] font-semibold">Fully Downloaded</span>
                          ) : (
                            <span>{downloadedCount} of {totalCount} downloaded</span>
                          )}
                        </div>
                      </div>
                      <div className="text-textfaint text-[10px] mt-2 truncate max-w-full font-medium">
                        {playlist.description || "Synced Playlist"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 text-textdim">
                  <Library size={40} className="mx-auto mb-3 text-textfaint" />
                  No offline playlists found.
                  <div className="text-xs mt-1">
                    Playlists are cached automatically once you sync them or add tracks while online.
                  </div>
                </div>
              )
            )}
          </>
        ) : (
          <div className="text-center py-20 text-textdim">
            <Download size={40} className="mx-auto mb-3 text-textfaint" />
            No downloads yet.
            <div className="text-xs mt-1">
              Use the “Download” option on any song, album, or playlist to save it for offline play.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
