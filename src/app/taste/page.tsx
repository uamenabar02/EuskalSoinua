"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePlayer } from "@/lib/player-context";
import { Track } from "@/lib/types";
import { useToast } from "@/lib/toast";
import { clsx } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Heart,
  Music4,
  Check,
  Globe,
  Loader2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  CheckCircle2,
  Trash2,
} from "lucide-react";

import { AiPlaylistGenerator } from "@/components/ai-playlist-generator";

const GENRES = [
  "Euskal Rock",
  "Euskal Pop",
  "Folk",
  "Trikitia",
  "Punk",
  "Electronic",
  "Reggae",
  "Rock",
  "Funk",
  "Indie Folk",
  "Psychedelic Rock",
  "Rap",
  "Pop",
];

const REGIONS = [
  { id: "eu", name: "Basque Country (Euskal Herria)", flag: "🔴⚪🟢" },
  { id: "es", name: "Spain (España)", flag: "🇪🇸" },
  { id: "global", name: "Global / International", flag: "🌐" },
];



interface SwipeTrack {
  track: Track;
  artist: { name: string; thumbnail?: string | null } | null;
}

export default function TasteTunerPage() {
  const p = usePlayer();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"tuner" | "swipe" | "ai">("swipe");
  
  // Read query params for direct tab navigation (e.g. /taste?tab=ai)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "ai" || tabParam === "tuner" || tabParam === "swipe") {
        setActiveTab(tabParam);
      }
    }
  }, []);
  
  // Tuner Preferences State
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [savingTuner, setSavingTuner] = useState(false);

  // Swipe State
  const [swipePool, setSwipePool] = useState<SwipeTrack[]>([]);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [loadingPool, setLoadingPool] = useState(true);
  const [swipedCount, setSwipedCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);
  const [history, setHistory] = useState<{ track: Track; liked: boolean }[]>([]);

  // Preview Audio State (Disabled by default so music doesn't start automatically on page load)
  const [autoplayPreviews, setAutoplayPreviews] = useState(false);

  const currentItem = swipePool[swipeIndex];
  const previewPlaying = p.isPlaying && p.current?.id === currentItem?.track.id;
  const previewLoading = p.buffering && p.current?.id === currentItem?.track.id;
  const swiperMode = p.fullTrackMode ? "full" : "preview";

  // Functions declared first to prevent hoisting / access warnings
  const loadSwipePool = () => {
    setLoadingPool(true);
    fetch("/api/taste/swipe-pool")
      .then((res) => res.json())
      .then((data) => {
        if (data.pool) {
          setSwipePool(data.pool);
          setSwipeIndex(0);
        }
      })
      .catch((err) => console.error("Error loading swipe pool:", err))
      .finally(() => setLoadingPool(false));
  };

  const playTrackPreview = (track: Track, modeParam?: "preview" | "full") => {
    const activeMode = modeParam || swiperMode;
    p.setFullTrackMode(activeMode === "full");
    if (p.current?.id !== track.id) {
      p.playQueue([track], 0);
    } else if (!p.isPlaying) {
      p.togglePlay();
    }
  };

  const stopTrackPreview = () => {
    if (p.isPlaying) {
      p.togglePlay();
    }
  };

  const togglePreviewPlay = () => {
    const currentTrack = currentItem?.track;
    if (!currentTrack) return;
    if (p.current?.id === currentTrack.id) {
      p.togglePlay();
    } else {
      p.playQueue([currentTrack], 0);
    }
  };

  // Load existing preferences and initial swipe pool
  useEffect(() => {
    let ignore = false;
    
    // Load local history
    const tHistory = setTimeout(() => {
      try {
        const storedHistory = localStorage.getItem("swipeHistory");
        if (storedHistory) {
          const hist = JSON.parse(storedHistory);
          setHistory(hist);
          
          const likes = hist.filter((h: any) => h.liked).length;
          const dislikes = hist.length - likes;
          setLikesCount(likes);
          setDislikesCount(dislikes);
          setSwipedCount(hist.length);
        }
      } catch (e) {
        console.error("Error loading local swipe history:", e);
      }
    }, 0);

    // 1. Fetch preferences
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore && data.music_preferences) {
          setSelectedGenres(data.music_preferences.genres || []);
          setSelectedRegions(data.music_preferences.regions || []);
        }
      })
      .catch((err) => console.error("Error loading preferences:", err));

    // 2. Fetch swipe pool
    const initSwipe = async () => {
      setLoadingPool(true);
      try {
        const res = await fetch("/api/taste/swipe-pool");
        const data = await res.json();
        if (!ignore && data.pool) {
          setSwipePool(data.pool);
          setSwipeIndex(0);
        }
      } catch (err) {
        console.error("Error loading swipe pool:", err);
      } finally {
        if (!ignore) setLoadingPool(false);
      }
    };
    initSwipe();

    return () => {
      ignore = true;
      clearTimeout(tHistory);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play next song preview automatically on card change if enabled
  useEffect(() => {
    if (swipePool.length > 0 && swipeIndex < swipePool.length) {
      const currentTrack = swipePool[swipeIndex].track;
      if (autoplayPreviews) {
        setTimeout(() => playTrackPreview(currentTrack), 0);
      } else {
        setTimeout(() => stopTrackPreview(), 0);
      }
    } else {
      setTimeout(() => stopTrackPreview(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipeIndex, swipePool, autoplayPreviews, swiperMode]);

  // Toggle selections in form
  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const toggleRegion = (regionId: string) => {
    setSelectedRegions((prev) =>
      prev.includes(regionId) ? prev.filter((r) => r !== regionId) : [...prev, regionId]
    );
  };

  // Save profile settings
  const savePreferences = async () => {
    setSavingTuner(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          music_preferences: JSON.stringify({
            genres: selectedGenres,
            regions: selectedRegions,
          }),
        }),
      });

      if (res.ok) {
        toast("Your taste profile has been saved!", "🎯");
        // Force reload home page recommendations silently next time the user navigates
        window.dispatchEvent(new Event("playlists-changed"));
      } else {
        throw new Error();
      }
    } catch (err) {
      toast("Could not save preferences", "❌");
    } finally {
      setSavingTuner(false);
    }
  };

  // Handle swipes (Left = dislike, Right = like)
  const handleSwipe = async (liked: boolean) => {
    if (swipeIndex >= swipePool.length) return;

    const current = swipePool[swipeIndex];
    const track = current.track;

    // Track statistics and history
    setSwipedCount((prev) => prev + 1);
    if (liked) {
      setLikesCount((prev) => prev + 1);
    } else {
      setDislikesCount((prev) => prev + 1);
    }
    const newHistory = [{ track, liked }, ...history].slice(0, 50);
    setHistory(newHistory);
    try {
      localStorage.setItem("swipeHistory", JSON.stringify(newHistory));
    } catch (e) {
      console.error("Error saving swipe history to localStorage:", e);
    }

    // Advance index
    setSwipeIndex((prev) => prev + 1);

    // Call API Route to feed recommendation events instantly!
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          feedback: liked ? "like" : "dislike",
        }),
      });
    } catch (err) {
      console.error("Error saving swipe feedback:", err);
    }
  };



  return (
    <div className="px-4 sm:px-6 pt-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <div className="flex flex-col gap-1.5">
          <span className="text-accent text-xs font-bold uppercase tracking-wider flex items-center gap-1">
            <Sparkles size={14} /> Personalization Hub
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Let me know about you
          </h1>
          <p className="text-textdim text-sm max-w-2xl">
            Fine-tune EuskalSoinua&apos;s on-device recommendation algorithms. Choose your preferred music types or play our high-contrast Matcher game to instantly shape your <b>For You</b> feed.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-white/5 mt-8 flex-wrap">
          <button
            onClick={() => setActiveTab("swipe")}
            className={clsx(
              "px-5 py-3 text-sm font-bold border-b-2 transition relative flex items-center gap-2",
              activeTab === "swipe"
                ? "border-accent text-accent"
                : "border-transparent text-textdim hover:text-ink hover:border-white/10"
            )}
          >
            🔥 Taste Matcher
            {swipePool.length > 0 && swipeIndex < swipePool.length && (
              <span className="bg-accent/10 text-accent text-[10px] px-2 py-0.5 rounded-full font-bold">
                {swipePool.length - swipeIndex} left
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            className={clsx(
              "px-5 py-3 text-sm font-bold border-b-2 transition relative flex items-center gap-2",
              activeTab === "ai"
                ? "border-accent text-accent"
                : "border-transparent text-textdim hover:text-ink hover:border-white/10"
            )}
          >
            ✨ AI Playlist Curator
          </button>
          <button
            onClick={() => setActiveTab("tuner")}
            className={clsx(
              "px-5 py-3 text-sm font-bold border-b-2 transition relative flex items-center gap-2",
              activeTab === "tuner"
                ? "border-accent text-accent"
                : "border-transparent text-textdim hover:text-ink hover:border-white/10"
            )}
          >
            📋 Music Profile Tuning
          </button>
        </div>
      </header>

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        {activeTab === "ai" ? (
          <motion.div
            key="ai"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
          >
            <AiPlaylistGenerator />
          </motion.div>
        ) : activeTab === "tuner" ? (
          <motion.div
            key="tuner"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* Genre Form */}
            <div className="bg-bg-soft rounded-2xl border border-white/5 p-5">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Music4 size={18} className="text-accent" /> Which genres do you love?
              </h3>
              <p className="text-xs text-textdim mb-5">
                Select your favorite musical styles. This will heavily weight and surface matches in your daily recommendations.
              </p>

              <div className="flex flex-wrap gap-2.5">
                {GENRES.map((g) => {
                  const isSelected = selectedGenres.includes(g);
                  return (
                    <button
                      key={g}
                      onClick={() => toggleGenre(g)}
                      className={clsx(
                        "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition border cursor-pointer select-none",
                        isSelected
                          ? "bg-accent/10 border-accent/40 text-accent"
                          : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05] hover:text-ink"
                      )}
                    >
                      {isSelected && <Check size={14} strokeWidth={2.5} />}
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Region Form */}
            <div className="bg-bg-soft rounded-2xl border border-white/5 p-5">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Globe size={18} className="text-accent" /> Origin & Local Prefs
              </h3>
              <p className="text-xs text-textdim mb-5">
                Surfaces music originating from specified regions. Perfect for highlighting regional, independent culture alongside top international records.
              </p>

              <div className="space-y-2.5">
                {REGIONS.map((r) => {
                  const isSelected = selectedRegions.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRegion(r.id)}
                      className={clsx(
                        "w-full flex items-center justify-between p-4 rounded-xl border text-left transition cursor-pointer select-none",
                        isSelected
                          ? "bg-accent/5 border-accent/30 text-ink"
                          : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05] hover:text-ink"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{r.flag}</span>
                        <div>
                          <span className="block font-bold text-sm text-white">{r.name}</span>
                          <span className="block text-xs text-textfaint mt-0.5">
                            {r.id === "eu"
                              ? "Euskal Rock, Basque folk, Trikitia and local artists first"
                              : r.id === "es"
                              ? "Rock and pop songs from regional Spanish charts"
                              : "High-affinity international gems across all major platforms"}
                          </span>
                        </div>
                      </div>
                      <span
                        className={clsx(
                          "grid place-items-center h-5 w-5 rounded-full border transition",
                          isSelected ? "bg-accent border-accent text-black" : "border-white/20"
                        )}
                      >
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center justify-between p-1 bg-white/[0.01] border-t border-white/5 pt-6">
              <p className="text-xs text-textfaint max-w-md">
                Your settings are saved directly in EuskalSoinua&apos;s secure client database, preserving your full search privacy.
              </p>
              <button
                onClick={savePreferences}
                disabled={savingTuner}
                className="bg-accent text-black font-extrabold px-6 py-3 rounded-full hover:scale-105 transition flex items-center gap-2 disabled:opacity-50 cursor-pointer text-sm shrink-0 shadow-lg shadow-accent/15"
              >
                {savingTuner ? (
                  <Loader2 size={16} className="animate-spin-slow" />
                ) : (
                  <Check size={16} strokeWidth={2.5} />
                )}
                Save Taste Settings
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="swipe"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-12 gap-8"
          >
            {/* Tinder Stack Column */}
            <div className="md:col-span-7 flex flex-col items-center">
              {loadingPool ? (
                <div className="h-96 w-full max-w-[360px] bg-bg-soft rounded-3xl border border-white/5 flex flex-col items-center justify-center text-textdim">
                  <Loader2 size={36} className="animate-spin-slow text-accent mb-3" />
                  <p className="text-sm font-semibold">Tuning client catalog…</p>
                </div>
              ) : swipeIndex >= swipePool.length ? (
                <div className="h-96 w-full max-w-[360px] bg-bg-soft rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center p-6 text-textdim animate-fade-up">
                  <CheckCircle2 size={44} className="text-accent mb-4" />
                  <p className="text-lg font-bold text-white mb-2">You&apos;re all tuned up!</p>
                  <p className="text-xs max-w-xs leading-relaxed mb-6">
                    We have updated your recommender profile with all your likes and dislikes. Check out the <b>For You</b> section on Home to see your brand-new custom recommendations!
                  </p>
                  <button
                    onClick={loadSwipePool}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full text-xs font-semibold transition"
                  >
                    <RotateCcw size={14} /> Play Again
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-[360px] flex flex-col items-center">
                  {/* Active Tinder Card Wrapper */}
                  <div className="relative h-96 w-full select-none mb-6">
                    <AnimatePresence mode="popLayout">
                      <motion.div
                        key={currentItem.track.id}
                        initial={{ scale: 0.95, opacity: 0, y: 10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{
                          x: 0,
                          y: 0,
                          opacity: 0,
                          rotate: 0,
                          transition: { duration: 0.3 }
                        }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        onDragEnd={async (_, info) => {
                          if (info.offset.x > 120) {
                            await handleSwipe(true);
                          } else if (info.offset.x < -120) {
                            await handleSwipe(false);
                          }
                        }}
                        className="absolute inset-0 bg-bg-soft rounded-3xl border border-white/10 shadow-2xl p-4 flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing group/card"
                      >
                        {/* Background subtle cover vignette */}
                        <div
                          className="absolute inset-0 opacity-10 bg-cover bg-center blur-2xl transition duration-500"
                          style={{
                            backgroundImage: currentItem.track.thumbnail
                              ? `url(${currentItem.track.thumbnail})`
                              : `linear-gradient(135deg, ${cardGradientColor(
                                  currentItem.track.id
                                )}, #000)`,
                          }}
                        />

                        {/* Top Metadata */}
                        <div className="relative flex justify-between items-center z-10">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white font-extrabold uppercase tracking-wide">
                            {currentItem.track.region === "eu" ? "🔴⚪🟢 Basque" : "International"}
                          </span>
                          <span className="text-[10px] text-textfaint font-semibold">
                            ID: {currentItem.track.id}
                          </span>
                        </div>

                        {/* Center Cover Art & Play trigger */}
                        <div className="relative flex-1 flex items-center justify-center my-4 z-10">
                          <div className="relative w-44 h-44 rounded-2xl overflow-hidden shadow-lg border border-white/5 bg-black/40 flex items-center justify-center">
                            {currentItem.track.thumbnail ? (
                              <img
                                src={currentItem.track.thumbnail}
                                alt={currentItem.track.title}
                                className="w-full h-full object-cover select-none pointer-events-none"
                              />
                            ) : (
                              <div
                                className="w-full h-full select-none pointer-events-none flex items-center justify-center text-4xl"
                                style={{
                                  background: `linear-gradient(135deg, ${cardGradientColor(
                                    currentItem.track.id
                                  )}, #14141c)`,
                                }}
                              >
                                🎵
                              </div>
                            )}

                            {/* Hover Overlay play button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePreviewPlay();
                              }}
                              className="absolute inset-0 bg-black/40 hover:bg-black/60 transition grid place-items-center group"
                            >
                              <span className="h-14 w-14 rounded-full bg-accent/90 group-hover:scale-110 text-black flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer">
                                {previewLoading ? (
                                  <Loader2 size={24} className="animate-spin-slow" />
                                ) : previewPlaying ? (
                                  <Pause size={24} fill="currentColor" />
                                ) : (
                                  <Play size={24} fill="currentColor" className="ml-0.5" />
                                )}
                              </span>
                            </button>
                          </div>

                          {/* Playing soundwave overlay */}
                          {previewPlaying && (
                            <div className="absolute bottom-1.5 flex gap-1 items-end h-6 justify-center">
                              <span className="w-1 bg-accent rounded-full animate-pulse h-3" style={{ animationDelay: "0ms", animationDuration: "0.6s" }} />
                              <span className="w-1 bg-accent rounded-full animate-pulse h-5" style={{ animationDelay: "150ms", animationDuration: "0.5s" }} />
                              <span className="w-1 bg-accent rounded-full animate-pulse h-4" style={{ animationDelay: "300ms", animationDuration: "0.7s" }} />
                              <span className="w-1 bg-accent rounded-full animate-pulse h-5" style={{ animationDelay: "450ms", animationDuration: "0.4s" }} />
                              <span className="w-1 bg-accent rounded-full animate-pulse h-2" style={{ animationDelay: "100ms", animationDuration: "0.8s" }} />
                            </div>
                          )}
                        </div>

                        {/* Bottom Info */}
                        <div className="relative text-center mt-2 z-10 px-2">
                          <h4 className="font-extrabold text-white text-base truncate" title={currentItem.track.title}>
                            {currentItem.track.title}
                          </h4>
                          <p className="text-textdim text-xs mt-0.5 font-medium truncate">
                            {currentItem.track.artistName}
                          </p>
                          {currentItem.track.genre && (
                            <span className="inline-block mt-2 text-[10px] px-2.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-textdim font-medium">
                              {currentItem.track.genre}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Mode Selector Button Group */}
                  <div className="w-full flex bg-white/5 p-1 rounded-xl border border-white/5 mb-5 mt-4 max-w-[280px]">
                    <button
                      onClick={() => {
                        if (swipePool[swipeIndex]) {
                          playTrackPreview(swipePool[swipeIndex].track, "preview");
                        }
                      }}
                      className={clsx(
                        "flex-1 text-center py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer",
                        swiperMode === "preview"
                          ? "bg-accent text-black font-extrabold shadow"
                          : "text-textdim hover:text-white"
                      )}
                    >
                      ⏱️ 30s Preview
                    </button>
                    <button
                      onClick={() => {
                        if (swipePool[swipeIndex]) {
                          playTrackPreview(swipePool[swipeIndex].track, "full");
                        }
                      }}
                      className={clsx(
                        "flex-1 text-center py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer",
                        swiperMode === "full"
                          ? "bg-accent text-black font-extrabold shadow"
                          : "text-textdim hover:text-white"
                      )}
                    >
                      🔥 Full Track
                    </button>
                  </div>

                  {/* Playback & Tinder Button Controls */}
                  <div className="flex items-center justify-between w-full px-6 gap-3">
                    {/* Thumbs Down Button */}
                    <button
                      onClick={() => handleSwipe(false)}
                      title="Dislike (Swipe Left)"
                      className="grid place-items-center h-14 w-14 rounded-full bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 text-textdim hover:text-red-400 active:scale-90 transition cursor-pointer"
                    >
                      <ThumbsDown size={22} />
                    </button>

                    {/* Play/Pause Center Button */}
                    <button
                      onClick={togglePreviewPlay}
                      title={previewPlaying ? "Pause preview" : "Play preview"}
                      className={clsx(
                        "grid place-items-center h-12 w-12 rounded-full transition active:scale-95 cursor-pointer",
                        previewPlaying
                          ? "bg-accent text-black font-bold"
                          : "bg-white/5 hover:bg-white/10 text-white border border-white/5"
                      )}
                    >
                      {previewLoading ? (
                        <Loader2 size={18} className="animate-spin-slow" />
                      ) : previewPlaying ? (
                        <Pause size={18} fill="currentColor" />
                      ) : (
                        <Play size={18} fill="currentColor" className="ml-0.5" />
                      )}
                    </button>

                    {/* Thumbs Up Button */}
                    <button
                      onClick={() => handleSwipe(true)}
                      title="Like (Swipe Right)"
                      className="grid place-items-center h-14 w-14 rounded-full bg-white/5 hover:bg-green-500/10 border border-white/5 hover:border-green-500/20 text-textdim hover:text-green-400 active:scale-90 transition cursor-pointer"
                    >
                      <ThumbsUp size={22} />
                    </button>
                  </div>

                  {/* Autoplay toggle */}
                  <div className="flex items-center gap-2 mt-6 cursor-pointer select-none" onClick={() => setAutoplayPreviews(!autoplayPreviews)}>
                    <input
                      type="checkbox"
                      checked={autoplayPreviews}
                      onChange={() => {}} // handled by click on parent div
                      className="accent-accent h-4 w-4 rounded bg-transparent border-white/20"
                    />
                    <span className="text-xs text-textdim font-semibold">Auto-play previews on load</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Stats & Swipe History */}
            <div className="md:col-span-5 flex flex-col gap-6">
              {/* Stats Card */}
              <div className="bg-bg-soft rounded-2xl border border-white/5 p-5">
                <h3 className="text-sm font-bold uppercase tracking-widest text-textfaint mb-4">
                  Match Progress
                </h3>
                
                <div className="grid grid-cols-3 gap-3 text-center mb-5">
                  <div className="bg-white/[0.01] border border-white/5 p-3 rounded-xl">
                    <span className="block text-xl font-bold text-white">{swipedCount}</span>
                    <span className="text-[10px] text-textfaint">Swiped</span>
                  </div>
                  <div className="bg-green-500/[0.02] border border-green-500/10 p-3 rounded-xl text-green-400">
                    <span className="block text-xl font-bold">{likesCount}</span>
                    <span className="text-[10px] text-textfaint">Likes</span>
                  </div>
                  <div className="bg-red-500/[0.02] border border-red-500/10 p-3 rounded-xl text-red-400">
                    <span className="block text-xl font-bold">{dislikesCount}</span>
                    <span className="text-[10px] text-textfaint">Dislikes</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-textdim font-semibold">
                    <span>Calibration level</span>
                    <span>{swipedCount >= 15 ? "Strongly Tuned ✨" : swipedCount >= 5 ? "Tuned 📈" : "Cold Start 🧊"}</span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${Math.min(100, (swipedCount / 15) * 100)}%` }}
                    />
                  </div>
                  <span className="block text-[10px] text-textfaint mt-1 leading-relaxed">
                    Swipe at least 15 songs to strongly train your local engine with high confidence parameters.
                  </span>
                </div>
              </div>

              {/* History list */}
              <div className="bg-bg-soft rounded-2xl border border-white/5 p-5 flex-1 flex flex-col min-h-[220px]">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-textfaint">
                    Swipe History
                  </h3>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/taste/history"
                      className="text-[10px] text-accent hover:underline font-bold"
                    >
                      View & Edit
                    </Link>
                    {history.length > 0 && (
                      <button
                        onClick={() => {
                          setHistory([]);
                          setLikesCount(0);
                          setDislikesCount(0);
                          setSwipedCount(0);
                          try {
                            localStorage.removeItem("swipeHistory");
                          } catch (e) {}
                          toast("History cleared", "🗑️");
                        }}
                        className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold cursor-pointer"
                      >
                        <Trash2 size={10} /> Clear
                      </button>
                    )}
                  </div>
                </div>

                {history.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-textfaint">
                    <Heart size={24} strokeWidth={1.5} className="mb-2 opacity-55" />
                    <span className="text-xs">Liked and disliked songs during swiping will appear here in real time.</span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto max-h-56 no-scrollbar space-y-2">
                    {history.map((h, idx) => (
                      <div
                        key={`${h.track.id}-hist-${idx}`}
                        className="flex items-center justify-between p-2 rounded-xl bg-white/[0.01] border border-white/5 hover:bg-white/[0.03] transition text-xs"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <span className="block font-bold text-white truncate">{h.track.title}</span>
                          <span className="block text-[10px] text-textfaint truncate">{h.track.artistName}</span>
                        </div>
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-wider shrink-0 flex items-center gap-1",
                            h.liked
                              ? "bg-green-500/10 text-green-400 border border-green-500/10"
                              : "bg-red-500/10 text-red-400 border border-red-500/10"
                          )}
                        >
                          {h.liked ? <ThumbsUp size={10} /> : <ThumbsDown size={10} />}
                          {h.liked ? "Liked" : "Nope"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}

function cardGradientColor(id: number): string {
  const hues = [
    "#7c3aed", // violet
    "#3b82f6", // blue
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ec4899", // pink
    "#f43f5e", // rose
    "#06b6d4", // cyan
  ];
  return hues[id % hues.length];
}
