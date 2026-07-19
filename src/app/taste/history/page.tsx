"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";

interface Track {
  id: number;
  title: string;
  artistName: string;
  albumName?: string | null;
  thumbnail?: string | null;
  genre?: string | null;
  region?: string | null;
}

interface HistoryItem {
  track: Track;
  liked: boolean;
}

export default function SwipeHistoryPage() {
  const { toast } = useToast();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Load history from localStorage on mount
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const stored = localStorage.getItem("swipeHistory");
        if (stored) {
          setHistory(JSON.parse(stored));
        }
      } catch (e) {
        console.error("Error loading swipe history:", e);
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Save history array helper
  const saveToStorage = (updated: HistoryItem[]) => {
    setHistory(updated);
    try {
      localStorage.setItem("swipeHistory", JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving updated history:", e);
    }
  };

  // Toggle swipe status (Like <-> Dislike)
  const handleToggle = async (trackId: number, currentLiked: boolean) => {
    const targetFeedback = currentLiked ? "dislike" : "like";
    
    // Optimistic UI update
    const updated = history.map((item) => {
      if (item.track.id === trackId) {
        return { ...item, liked: !item.liked };
      }
      return item;
    });
    saveToStorage(updated);

    try {
      const res = await fetch("/api/feedback", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackId,
          feedback: targetFeedback,
        }),
      });

      if (res.ok) {
        toast(
          targetFeedback === "like"
            ? "Changed to Liked! Retraining recommender…"
            : "Changed to Disliked! Retraining recommender…",
          "🔄"
        );
        // Dispatch event so other pages know to refresh
        window.dispatchEvent(new Event("playlists-changed"));
      } else {
        throw new Error();
      }
    } catch (err) {
      toast("Could not update feedback in database", "❌");
    }
  };

  // Delete individual history item
  const handleDelete = async (trackId: number) => {
    const trackName = history.find((h) => h.track.id === trackId)?.track.title || "Song";
    
    // Update local state first
    const updated = history.filter((item) => item.track.id !== trackId);
    saveToStorage(updated);

    try {
      const res = await fetch("/api/feedback", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trackId }),
      });

      if (res.ok) {
        toast(`Removed “${trackName}” from calibration history.`, "🗑️");
        window.dispatchEvent(new Event("playlists-changed"));
      } else {
        throw new Error();
      }
    } catch (err) {
      toast("Could not remove feedback from database", "❌");
    }
  };

  // Clear all history
  const handleClearAll = async () => {
    if (!window.confirm("Are you sure you want to delete your entire swipe history? This will reset all matcher tuning data.")) return;
    
    // Clear local storage & state
    saveToStorage([]);

    // Call API for each or clear all (we can delete feedback with an empty body or simply do it cleanly)
    try {
      // Clear all listen events by hitting feedback DELETE for all items
      await Promise.all(
        history.map((item) =>
          fetch("/api/feedback", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ trackId: item.track.id }),
          })
        )
      );
      toast("Entire Swipe History cleared successfully!", "🧹");
      window.dispatchEvent(new Event("playlists-changed"));
    } catch (err) {
      console.error("Error clearing feedback in database:", err);
    }
  };

  // Filter history based on search query
  const filteredHistory = history.filter(
    (item) =>
      item.track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.track.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <header className="mb-8 flex flex-col gap-4">
        <Link
          href="/taste"
          className="text-textdim hover:text-ink text-sm font-bold flex items-center gap-1.5 transition-colors group"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          Back to Personalization Hub
        </Link>

        <div className="flex flex-col gap-1.5 mt-2">
          <span className="text-accent text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={14} /> History Editor
          </span>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 id="swipe-history-title" className="text-3xl font-extrabold tracking-tight text-white">
                Swipe History Manager
              </h1>
              <p className="text-textdim text-sm max-w-xl mt-1">
                Directly inspect and tune the individual songs you have rated in the Matcher game. Toggle preferences or remove songs to dynamically adjust your recommendation model.
              </p>
            </div>
            {history.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold border border-red-500/20 px-4 py-2.5 rounded-xl transition cursor-pointer self-start sm:self-center shrink-0 flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Clear All Swipes
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-textdim">
          <div className="animate-spin h-8 w-8 border-4 border-accent border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-medium">Loading swipe entries…</p>
        </div>
      ) : history.length === 0 ? (
        <div className="bg-bg-soft rounded-2xl border border-white/5 p-10 text-center text-textdim max-w-md mx-auto mt-6 animate-fade-up">
          <div className="h-16 w-16 bg-white/[0.03] rounded-full flex items-center justify-center mx-auto mb-4 text-accent">
            <Music size={28} />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Swipe History Found</h3>
          <p className="text-xs text-textfaint mb-6 leading-relaxed">
            You haven&apos;t swiped on any tracks yet, or your history was recently cleared. Play the Taste Matcher to build up an on-device recommendation profile.
          </p>
          <Link
            href="/taste"
            className="inline-block bg-accent text-black text-xs font-extrabold px-5 py-2.5 rounded-full transition hover:scale-105"
          >
            Start Swiping Now
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-textfaint" size={18} />
            <input
              type="text"
              placeholder="Search by title, artist, or album…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-bg-soft border border-white/5 focus:border-accent/40 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-textfaint outline-none transition-all"
            />
          </div>

          {/* List */}
          <div className="bg-bg-soft rounded-2xl border border-white/5 overflow-hidden">
            <div className="divide-y divide-white/5">
              {filteredHistory.length === 0 ? (
                <div className="py-12 text-center text-textdim text-xs">
                  No matching tracks found for &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredHistory.map((item, idx) => (
                  <motion.div
                    key={`${item.track.id}-edit-${idx}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.01 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 hover:bg-white/[0.01] transition-colors"
                  >
                    {/* Track Info */}
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

                    {/* Actions */}
                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      {/* Swipe Status Toggle Switch Button */}
                      <button
                        onClick={() => handleToggle(item.track.id, item.liked)}
                        title={item.liked ? "Switch to Disliked" : "Switch to Liked"}
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

                      {/* Delete Swipe Button */}
                      <button
                        onClick={() => handleDelete(item.track.id)}
                        title="Delete Swipe Record"
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
              Changes to swipe entries instantly update the active parameters inside EuskalSoinua&apos;s 100% private, on-device recommendation algorithms.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
