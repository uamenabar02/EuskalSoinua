"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import { clsx } from "@/lib/utils";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Music,
  Sparkles,
  Search,
  CheckCircle,
  Clock,
  Flame,
  Layers,
  Play,
  RotateCw,
  Disc3,
} from "lucide-react";
import { TrackCard, AlbumCard, PlaylistCard } from "@/components/cards";
import { SectionCard } from "@/components/sections";
import type { Track, Album, Playlist } from "@/lib/types";

interface UnifiedMediaItem {
  type: "album" | "playlist";
  id: string | number;
  item: Album | Playlist;
  playCount: number;
  lastPlayed: string;
}

interface UserHistoryResponse {
  recent: Track[];
  mostHeard: Track[];
  playlistsAndAlbums: {
    recent: UnifiedMediaItem[];
    mostHeard: UnifiedMediaItem[];
  };
  albums: Album[];
  playlists: Playlist[];
  hasHistory: boolean;
}

interface SwipeTrack {
  id: number;
  title: string;
  artistName: string;
  albumName?: string | null;
  thumbnail?: string | null;
  genre?: string | null;
  region?: string | null;
}

interface SwipeHistoryItem {
  track: SwipeTrack;
  liked: boolean;
}

export default function HistoryPage() {
  const p = usePlayer();
  const { toast } = useToast();

  const [activeMainTab, setActiveMainTab] = useState<"listening" | "swipes">("listening");
  const [historyCategory, setHistoryCategory] = useState<"tracks" | "playlists_albums">("tracks");
  const [historyTab, setHistoryTab] = useState<"recent" | "mostHeard">("recent");
  const [searchQuery, setSearchQuery] = useState("");

  // Listening history state
  const [listeningData, setListeningData] = useState<UserHistoryResponse>({
    recent: [],
    mostHeard: [],
    playlistsAndAlbums: { recent: [], mostHeard: [] },
    albums: [],
    playlists: [],
    hasHistory: false,
  });
  const [loadingListening, setLoadingListening] = useState(true);

  // Swipe history state with lazy initializer
  const [swipeHistory, setSwipeHistory] = useState<SwipeHistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("swipeHistory");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed.slice(0, 100);
      }
    } catch (e) {}
    return [];
  });
  const [loadingSwipes, setLoadingSwipes] = useState(false);

  const fetchListeningHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/user/history");
      if (res.ok) {
        const data = await res.json();
        setListeningData({
          recent: (data.recent || []).slice(0, 100),
          mostHeard: (data.mostHeard || []).slice(0, 100),
          playlistsAndAlbums: {
            recent: (data.playlistsAndAlbums?.recent || []).slice(0, 100),
            mostHeard: (data.playlistsAndAlbums?.mostHeard || []).slice(0, 100),
          },
          albums: (data.albums || []).slice(0, 100),
          playlists: (data.playlists || []).slice(0, 100),
          hasHistory: !!data.hasHistory,
        });
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    } finally {
      setLoadingListening(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/user/history")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setListeningData({
          recent: (data.recent || []).slice(0, 100),
          mostHeard: (data.mostHeard || []).slice(0, 100),
          playlistsAndAlbums: {
            recent: (data.playlistsAndAlbums?.recent || []).slice(0, 100),
            mostHeard: (data.playlistsAndAlbums?.mostHeard || []).slice(0, 100),
          },
          albums: (data.albums || []).slice(0, 100),
          playlists: (data.playlists || []).slice(0, 100),
          hasHistory: !!data.hasHistory,
        });
      })
      .catch((e) => console.error("Failed to load history:", e))
      .finally(() => {
        if (active) setLoadingListening(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Swipe item handlers
  const saveSwipeStorage = (updated: SwipeHistoryItem[]) => {
    setSwipeHistory(updated);
    try {
      localStorage.setItem("swipeHistory", JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving updated history:", e);
    }
  };

  const handleToggleSwipe = async (trackId: number, currentLiked: boolean) => {
    const targetFeedback = currentLiked ? "dislike" : "like";
    const updated = swipeHistory.map((item) => {
      if (item.track.id === trackId) {
        return { ...item, liked: !item.liked };
      }
      return item;
    });
    saveSwipeStorage(updated);

    try {
      const res = await fetch("/api/feedback", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId, feedback: targetFeedback }),
      });
      if (res.ok) {
        toast(
          targetFeedback === "like"
            ? "Changed to Liked! Model updated."
            : "Changed to Disliked! Model updated.",
          "🔄"
        );
        window.dispatchEvent(new Event("playlists-changed"));
      }
    } catch (err) {
      toast("Could not update feedback in database", "❌");
    }
  };

  const handleDeleteSwipe = async (trackId: number) => {
    const trackName = swipeHistory.find((h) => h.track.id === trackId)?.track.title || "Song";
    const updated = swipeHistory.filter((item) => item.track.id !== trackId);
    saveSwipeStorage(updated);

    try {
      const res = await fetch("/api/feedback", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
      if (res.ok) {
        toast(`Removed “${trackName}” from calibration records.`, "🗑️");
        window.dispatchEvent(new Event("playlists-changed"));
      }
    } catch (err) {
      toast("Could not remove record", "❌");
    }
  };

  // Filtered tracks
  const currentTracks = (
    historyTab === "recent" ? listeningData.recent : listeningData.mostHeard
  ).filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.artistName.toLowerCase().includes(q) ||
      (t.albumName && t.albumName.toLowerCase().includes(q))
    );
  });

  // Filtered playlists & albums
  const currentCollections = (
    historyTab === "recent"
      ? listeningData.playlistsAndAlbums.recent
      : listeningData.playlistsAndAlbums.mostHeard
  ).filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const title = c.type === "album" ? (c.item as Album).title : (c.item as Playlist).name;
    const artist = c.type === "album" ? (c.item as Album).artistName : "";
    return (
      title.toLowerCase().includes(q) ||
      (artist && artist.toLowerCase().includes(q))
    );
  });

  // Filtered swipes
  const filteredSwipes = swipeHistory.filter(
    (item) =>
      item.track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.track.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-6xl mx-auto pb-28">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4">
        <Link
          href="/"
          className="text-textdim hover:text-white text-sm font-bold flex items-center gap-1.5 transition-colors group self-start"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          Back to Home
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Listening & Play History
            </h1>
            <p className="text-textdim text-sm max-w-xl mt-1">
              Browse up to 100 of your most recent and most-played tracks, playlists, and albums.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchListeningHistory();
                toast("History refreshed", "🔄");
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition cursor-pointer"
            >
              <RotateCw size={13} className={clsx(loadingListening && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Main Tab Selector (Listening History vs Taste Calibration Swipes) */}
      <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
        <button
          onClick={() => setActiveMainTab("listening")}
          className={clsx(
            "text-sm font-bold px-4 py-2 rounded-full transition flex items-center gap-2 cursor-pointer",
            activeMainTab === "listening"
              ? "bg-accent text-black shadow-md shadow-accent/20"
              : "bg-white/5 hover:bg-white/10 text-textdim hover:text-white"
          )}
        >
          <Clock size={16} />
          <span>Playback History</span>
        </button>
        <button
          onClick={() => setActiveMainTab("swipes")}
          className={clsx(
            "text-sm font-bold px-4 py-2 rounded-full transition flex items-center gap-2 cursor-pointer",
            activeMainTab === "swipes"
              ? "bg-accent text-black shadow-md shadow-accent/20"
              : "bg-white/5 hover:bg-white/10 text-textdim hover:text-white"
          )}
        >
          <Sparkles size={16} />
          <span>Taste Swipes ({swipeHistory.length})</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-textfaint" size={18} />
        <input
          type="text"
          placeholder={
            activeMainTab === "listening"
              ? "Search songs, artists, playlists, or albums in history…"
              : "Search swipe rating history…"
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-bg-soft border border-white/10 focus:border-accent/50 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-textfaint outline-none transition"
        />
      </div>

      {activeMainTab === "listening" ? (
        <div>
          {/* Controls Bar: Category and Order sub-tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white/[0.02] border border-white/5 p-2 rounded-2xl">
            {/* Category Selector */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
              <button
                onClick={() => setHistoryCategory("tracks")}
                className={clsx(
                  "text-xs px-4 py-1.5 rounded-full font-semibold transition cursor-pointer flex items-center gap-1.5",
                  historyCategory === "tracks"
                    ? "bg-accent text-black font-bold shadow-sm"
                    : "text-textdim hover:text-white"
                )}
              >
                <Music size={13} />
                <span>Songs</span>
              </button>
              <button
                onClick={() => setHistoryCategory("playlists_albums")}
                className={clsx(
                  "text-xs px-4 py-1.5 rounded-full font-semibold transition cursor-pointer flex items-center gap-1.5",
                  historyCategory === "playlists_albums"
                    ? "bg-accent text-black font-bold shadow-sm"
                    : "text-textdim hover:text-white"
                )}
              >
                <Layers size={13} />
                <span>Playlists & Albums</span>
              </button>
            </div>

            {/* Sub-tab: Last heard vs Most heard */}
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
              <button
                onClick={() => setHistoryTab("recent")}
                className={clsx(
                  "text-xs px-3.5 py-1.5 rounded-full font-medium transition cursor-pointer flex items-center gap-1.5",
                  historyTab === "recent"
                    ? "bg-white/20 text-white font-bold"
                    : "text-textdim hover:text-white"
                )}
              >
                <Clock size={12} />
                <span>Last heard</span>
              </button>
              <button
                onClick={() => setHistoryTab("mostHeard")}
                className={clsx(
                  "text-xs px-3.5 py-1.5 rounded-full font-medium transition cursor-pointer flex items-center gap-1.5",
                  historyTab === "mostHeard"
                    ? "bg-white/20 text-white font-bold"
                    : "text-textdim hover:text-white"
                )}
              >
                <Flame size={12} />
                <span>Most heard</span>
              </button>
            </div>
          </div>

          {loadingListening ? (
            <div className="py-24 text-center text-textdim flex flex-col items-center justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full mb-3" />
              <p className="text-sm">Loading listening history…</p>
            </div>
          ) : historyCategory === "tracks" ? (
            currentTracks.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {currentTracks.map((t, idx) => (
                  <SectionCard key={`track-history-${t.id}-${idx}`}>
                    <TrackCard track={t} />
                  </SectionCard>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center rounded-2xl bg-white/[0.02] border border-white/5 p-8">
                <Music size={32} className="text-textfaint mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">No songs found in history</h3>
                <p className="text-xs text-textdim max-w-sm mx-auto">
                  {searchQuery
                    ? `No songs matched "${searchQuery}".`
                    : "Start playing music across the app to build your listening history (up to 100 tracks)."}
                </p>
              </div>
            )
          ) : (
            currentCollections.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {currentCollections.map((entry, idx) => (
                  <SectionCard key={`collection-${entry.type}-${entry.id}-${idx}`}>
                    {entry.type === "album" ? (
                      <AlbumCard album={entry.item as Album} />
                    ) : (
                      <PlaylistCard playlist={entry.item as Playlist} />
                    )}
                  </SectionCard>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center rounded-2xl bg-white/[0.02] border border-white/5 p-8">
                <Layers size={32} className="text-textfaint mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">No playlists or albums found</h3>
                <p className="text-xs text-textdim max-w-sm mx-auto">
                  {searchQuery
                    ? `No playlists or albums matched "${searchQuery}".`
                    : "Listen to albums and playlists to see them listed in your history here (up to 100 items)."}
                </p>
              </div>
            )
          )}
        </div>
      ) : (
        /* Swipe History View */
        <div className="space-y-4">
          <div className="bg-bg-soft rounded-2xl border border-white/5 overflow-hidden">
            <div className="divide-y divide-white/5">
              {filteredSwipes.length === 0 ? (
                <div className="py-16 text-center text-textdim text-xs">
                  {searchQuery
                    ? `No matching swipe tracks found for "${searchQuery}".`
                    : "No swipe history recorded yet. Play the Taste Matcher game to calibrate your taste!"}
                </div>
              ) : (
                filteredSwipes.map((item, idx) => (
                  <motion.div
                    key={`${item.track.id}-edit-${idx}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.01 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-white/[0.01] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="relative h-12 w-12 rounded-xl bg-black/30 overflow-hidden flex items-center justify-center border border-white/5 shrink-0 select-none">
                        {item.track.thumbnail ? (
                          <img
                            src={item.track.thumbnail}
                            alt={item.track.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Music size={20} className="text-textfaint" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block font-bold text-white truncate text-sm">
                          {item.track.title}
                        </span>
                        <span className="block text-xs text-textdim mt-0.5 truncate">
                          {item.track.artistName} {item.track.albumName ? `• ${item.track.albumName}` : ""}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          {item.track.genre && (
                            <span className="text-[9px] px-2 py-0.5 bg-white/5 border border-white/5 text-textfaint rounded-full font-medium">
                              {item.track.genre}
                            </span>
                          )}
                          {item.track.region === "eu" && (
                            <span className="text-[9px] px-2 py-0.5 bg-basque/15 border border-basque/10 text-basque rounded-full font-bold">
                              🔴⚪🟢 Basque
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => handleToggleSwipe(item.track.id, item.liked)}
                        className={clsx(
                          "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition border cursor-pointer select-none",
                          item.liked
                            ? "bg-green-500/10 border-green-500/25 text-green-400 hover:bg-green-500/20"
                            : "bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20"
                        )}
                      >
                        {item.liked ? (
                          <>
                            <ThumbsUp size={13} fill="currentColor" />
                            <span>Liked</span>
                          </>
                        ) : (
                          <>
                            <ThumbsDown size={13} fill="currentColor" />
                            <span>Disliked</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleDeleteSwipe(item.track.id)}
                        className="grid place-items-center h-9 w-9 rounded-xl bg-white/5 hover:bg-red-500/15 border border-white/5 hover:border-red-500/20 text-textdim hover:text-red-400 transition cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
            <CheckCircle size={16} className="text-accent shrink-0" />
            <p className="text-[11px] text-textfaint leading-normal">
              Changes to taste entries immediately update the on-device recommender.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
