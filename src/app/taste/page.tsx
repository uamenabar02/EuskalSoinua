"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/lib/player-context";
import { Track, UserTasteProfile } from "@/lib/types";
import { useToast } from "@/lib/toast";
import { useTranslation } from "@/lib/i18n";
import { clsx } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Heart,
  Music4,
  Check,
  Globe,
  Loader2,
  Play,
  Pause,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  CheckCircle2,
  Trash2,
  Zap,
  Clock,
  Volume2,
  Sliders,
  ShieldBan,
  UserPlus,
  X,
  Share2,
  Flame,
  ArrowRight,
} from "lucide-react";

import { DetailToggle } from "@/components/detail-toggle";

interface SwipeTrack {
  track: Track;
  artist: { name: string; thumbnail?: string | null } | null;
}

const GENRE_CATEGORIES = [
  {
    key: "categoryUrban",
    name: "Urban, Pop & Latin",
    genres: ["Pop", "Indie Pop", "Hip-Hop & Rap", "Trap & Urban", "R&B & Soul", "Reggaeton & Latin Pop"],
  },
  {
    key: "categoryRock",
    name: "Rock, Indie & Alternative",
    genres: ["Indie Rock", "Alternative Rock", "Hard Rock", "Punk Rock", "Post-Punk", "Psychedelic Rock"],
  },
  {
    key: "categoryElectronic",
    name: "Electronic, Dance & Lo-Fi",
    genres: ["Synthwave & Synth-Pop", "EDM / House", "Techno & Club", "Lo-Fi & Chillout"],
  },
  {
    key: "categoryRoots",
    name: "Basque & Regional Roots",
    genres: ["Euskal Rock", "Euskal Pop", "Trikitia & Folk", "Flamenco & Spanish Roots", "World Fusion"],
  },
  {
    key: "categoryAcoustic",
    name: "Acoustic, Jazz & Classical",
    genres: ["Singer-Songwriter", "Folk & Acoustic", "Jazz & Blues", "Classical & Cinematic", "Metal & Heavy"],
  },
];

const ALL_GENRES_FLAT = GENRE_CATEGORIES.flatMap((c) => c.genres);

export default function TasteHubPage() {
  const p = usePlayer();
  const { toast } = useToast();
  const { t } = useTranslation();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"swipe" | "tuner" | "dna">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "ai") {
        window.location.href = "/curator";
      }
      if (tabParam === "tuner" || tabParam === "swipe" || tabParam === "dna") {
        return tabParam;
      }
    }
    return "swipe";
  });

  // Tuner Preferences State
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["eu", "global"]);
  const [energyLevel, setEnergyLevel] = useState<"chill" | "balanced" | "high" | "intense">("balanced");
  const [eraBias, setEraBias] = useState<"all" | "modern" | "2010s" | "2000s" | "90s80s">("all");
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [basqueAffinity, setBasqueAffinity] = useState<number>(60);
  const [favoriteArtists, setFavoriteArtists] = useState<string[]>([]);
  const [artistInput, setArtistInput] = useState("");
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [savingTuner, setSavingTuner] = useState(false);

  // Swipe State
  const [swipePool, setSwipePool] = useState<SwipeTrack[]>([]);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [loadingPool, setLoadingPool] = useState(true);
  const [history, setHistory] = useState<{ track: Track; liked: boolean }[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const storedHistory = localStorage.getItem("swipeHistory");
      return storedHistory ? JSON.parse(storedHistory) : [];
    } catch {
      return [];
    }
  });
  const [swipedCount, setSwipedCount] = useState<number>(() => history.length);
  const [likesCount, setLikesCount] = useState<number>(() => history.filter((h) => h.liked).length);
  const [dislikesCount, setDislikesCount] = useState<number>(() => history.length - history.filter((h) => h.liked).length);
  const [autoplayPreviews, setAutoplayPreviews] = useState(false);

  // Taste DNA State
  const [dnaPersona, setDnaPersona] = useState<string>("");
  const [topAffinityGenres, setTopAffinityGenres] = useState<{ genre: string; score: number }[]>([]);
  const [totalSignals, setTotalSignals] = useState<number>(0);
  const [calibrationPercent, setCalibrationPercent] = useState<number>(40);
  const [calibrationLevel, setCalibrationLevel] = useState<string>("medium");

  const currentItem = swipePool[swipeIndex];
  const previewPlaying = p.isPlaying && p.current?.id === currentItem?.track.id;
  const previewLoading = p.buffering && p.current?.id === currentItem?.track.id;
  const swiperMode = p.fullTrackMode ? "full" : "preview";

  const regions = [
    { id: "eu", name: "Basque Country (Euskal Herria)", flag: "🔴⚪🟢", desc: t("taste.originEuDesc") },
    { id: "es", name: "Spain (España)", flag: "🇪🇸", desc: t("taste.originEsDesc") },
    { id: "global", name: "Global & International", flag: "🌐", desc: t("taste.originGlobalDesc") },
    { id: "latam", name: "Latin America (LatAm)", flag: "🌎", desc: t("taste.originLatamDesc") },
    { id: "nordic_uk", name: "UK & European Indie", flag: "🇬🇧", desc: t("taste.originNordicUkDesc") },
  ];

  const moodOptions = [
    { id: "uplifting", label: t("taste.moodUplifting"), emoji: "✨" },
    { id: "melancholic", label: t("taste.moodMelancholic"), emoji: "🌧️" },
    { id: "focus", label: t("taste.moodFocus"), emoji: "📚" },
    { id: "night", label: t("taste.moodNight"), emoji: "🌙" },
    { id: "party", label: t("taste.moodParty"), emoji: "🎉" },
    { id: "cozy", label: t("taste.moodCozy"), emoji: "☕" },
  ];

  const energyOptions = [
    { id: "chill", title: t("taste.energyChill"), desc: t("taste.energyChillDesc"), emoji: "🍃" },
    { id: "balanced", title: t("taste.energyBalanced"), desc: t("taste.energyBalancedDesc"), emoji: "⚖️" },
    { id: "high", title: t("taste.energyHigh"), desc: t("taste.energyHighDesc"), emoji: "⚡" },
    { id: "intense", title: t("taste.energyIntense"), desc: t("taste.energyIntenseDesc"), emoji: "🔥" },
  ];

  const eraOptions = [
    { id: "all", label: t("taste.eraAll") },
    { id: "modern", label: t("taste.eraModern") },
    { id: "2010s", label: t("taste.era2010s") },
    { id: "2000s", label: t("taste.era2000s") },
    { id: "90s80s", label: t("taste.era90s80s") },
  ];

  const presets = [
    {
      id: "basque_wave",
      title: t("taste.presetBasqueWave"),
      desc: t("taste.presetBasqueWaveDesc"),
      icon: "🔴⚪🟢",
      genres: ["Euskal Pop", "Synthwave & Synth-Pop", "Euskal Rock", "Indie Pop"],
      artists: ["ZETAK", "Bengo", "Izaro", "Bulego", "Tatta"],
      energy: "high" as const,
      era: "modern" as const,
      basqueAffinity: 90,
    },
    {
      id: "global_indie",
      title: t("taste.presetGlobalIndie"),
      desc: t("taste.presetGlobalIndieDesc"),
      icon: "🎸",
      genres: ["Indie Rock", "Alternative Rock", "Indie Pop", "Post-Punk"],
      artists: ["Belako", "Arctic Monkeys", "The Strokes", "Berri Txarrak"],
      energy: "high" as const,
      era: "all" as const,
      basqueAffinity: 40,
    },
    {
      id: "lofi_chill",
      title: t("taste.presetLofiChill"),
      desc: t("taste.presetLofiChillDesc"),
      icon: "☕",
      genres: ["Lo-Fi & Chillout", "Singer-Songwriter", "Folk & Acoustic", "Classical & Cinematic"],
      artists: ["Anari", "Mikel Laboa", "Olaia Inziarte"],
      energy: "chill" as const,
      era: "all" as const,
      basqueAffinity: 50,
    },
    {
      id: "urban_latin",
      title: t("taste.presetUrbanLatin"),
      desc: t("taste.presetUrbanLatinDesc"),
      icon: "🔥",
      genres: ["Trap & Urban", "Reggaeton & Latin Pop", "Hip-Hop & Rap", "Pop"],
      artists: ["Bengo", "Rosalía", "Tatta", "Bad Bunny", "Dupla"],
      energy: "intense" as const,
      era: "modern" as const,
      basqueAffinity: 60,
    },
    {
      id: "rock_energy",
      title: t("taste.presetRockAnthems"),
      desc: t("taste.presetRockAnthemsDesc"),
      icon: "⚡",
      genres: ["Hard Rock", "Punk Rock", "Euskal Rock", "Alternative Rock"],
      artists: ["Berri Txarrak", "Kortatu", "Su Ta Gar", "Gatibu", "Streetwise"],
      energy: "intense" as const,
      era: "all" as const,
      basqueAffinity: 75,
    },
  ];

  const loadSwipePool = (showLoading = false) => {
    if (showLoading) setLoadingPool(true);
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

  const playTrackPreview = useCallback((track: Track, modeParam?: "preview" | "full") => {
    const activeMode = modeParam || swiperMode;
    p.setFullTrackMode(activeMode === "full");
    if (p.current?.id !== track.id) {
      p.playQueue([track], 0);
    } else if (!p.isPlaying) {
      p.togglePlay();
    }
  }, [p, swiperMode]);

  const stopTrackPreview = useCallback(() => {
    if (p.isPlaying) {
      p.togglePlay();
    }
  }, [p]);

  const togglePreviewPlay = () => {
    const currentTrack = currentItem?.track;
    if (!currentTrack) return;
    if (p.current?.id === currentTrack.id) {
      p.togglePlay();
    } else {
      p.playQueue([currentTrack], 0);
    }
  };

  // Load profile and swipe history on mount
  useEffect(() => {
    let ignore = false;

    // Load full settings & taste profile
    fetch("/api/taste/profile")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore && data) {
          if (data.preferences) {
            const prefs = data.preferences as UserTasteProfile;
            setSelectedGenres(prefs.genres || []);
            setSelectedRegions(prefs.regions || ["eu", "global"]);
            if (prefs.energy) setEnergyLevel(prefs.energy);
            if (prefs.era) setEraBias(prefs.era);
            if (prefs.moods) setSelectedMoods(prefs.moods);
            if (typeof prefs.basqueAffinity === "number") setBasqueAffinity(prefs.basqueAffinity);
            if (prefs.favoriteArtists) setFavoriteArtists(prefs.favoriteArtists);
            if (prefs.excludedGenres) setExcludedGenres(prefs.excludedGenres);
          }
          if (data.personaName) setDnaPersona(data.personaName);
          if (Array.isArray(data.topGenres)) setTopAffinityGenres(data.topGenres);
          if (data.totalEvents !== undefined) setTotalSignals(data.totalEvents);
          if (data.calibrationPercent !== undefined) setCalibrationPercent(data.calibrationPercent);
          if (data.calibrationLevel) setCalibrationLevel(data.calibrationLevel);
        }
      })
      .catch((err) => console.error("Error loading taste profile:", err));

    // Initial swipe pool
    const timer = setTimeout(() => {
      loadSwipePool();
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, []);

  // Autoplay handle
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
  }, [swipeIndex, swipePool, autoplayPreviews, swiperMode, playTrackPreview, stopTrackPreview]);

  // Helpers
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

  const toggleMood = (moodId: string) => {
    setSelectedMoods((prev) =>
      prev.includes(moodId) ? prev.filter((m) => m !== moodId) : [...prev, moodId]
    );
  };

  const toggleExcludedGenre = (g: string) => {
    setExcludedGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const addFavoriteArtist = () => {
    const trimmed = artistInput.trim();
    if (!trimmed) return;
    if (!favoriteArtists.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      setFavoriteArtists((prev) => [...prev, trimmed]);
    }
    setArtistInput("");
  };

  const removeFavoriteArtist = (artist: string) => {
    setFavoriteArtists((prev) => prev.filter((a) => a !== artist));
  };

  const applyPreset = (preset: typeof presets[0]) => {
    setSelectedGenres(preset.genres);
    setEnergyLevel(preset.energy);
    setEraBias(preset.era);
    setBasqueAffinity(preset.basqueAffinity);
    setFavoriteArtists(preset.artists);
    toast(t("taste.presetApplied"), "✨");
  };

  // Save profile settings
  const savePreferences = async () => {
    setSavingTuner(true);
    const fullProfile: UserTasteProfile = {
      genres: selectedGenres,
      regions: selectedRegions,
      energy: energyLevel,
      era: eraBias,
      moods: selectedMoods,
      favoriteArtists,
      excludedGenres,
      basqueAffinity,
    };

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          music_preferences: JSON.stringify(fullProfile),
        }),
      });

      if (res.ok) {
        toast(t("taste.preferencesSaved"), "🎯");
        window.dispatchEvent(new Event("playlists-changed"));

        // Refresh taste profile DNA
        fetch("/api/taste/profile")
          .then((r) => r.json())
          .then((d) => {
            if (d?.personaName) setDnaPersona(d.personaName);
            if (Array.isArray(d?.topGenres)) setTopAffinityGenres(d.topGenres);
            if (d?.totalEvents !== undefined) setTotalSignals(d.totalEvents);
            if (d?.calibrationPercent !== undefined) setCalibrationPercent(d.calibrationPercent);
          })
          .catch(() => {});
      } else {
        throw new Error();
      }
    } catch (err) {
      toast(t("taste.preferencesError"), "❌");
    } finally {
      setSavingTuner(false);
    }
  };

  // Swiper Handle
  const handleSwipe = async (liked: boolean) => {
    if (swipeIndex >= swipePool.length) return;

    const current = swipePool[swipeIndex];
    const track = current.track;

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

    setSwipeIndex((prev) => prev + 1);

    // Call API feedback
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

  const undoLastSwipe = () => {
    if (swipeIndex > 0) {
      setSwipeIndex((prev) => prev - 1);
      if (history.length > 0) {
        const last = history[0];
        if (last.liked) setLikesCount((c) => Math.max(0, c - 1));
        else setDislikesCount((c) => Math.max(0, c - 1));
        setSwipedCount((c) => Math.max(0, c - 1));
        const updated = history.slice(1);
        setHistory(updated);
        try {
          localStorage.setItem("swipeHistory", JSON.stringify(updated));
        } catch (e) {}
      }
    }
  };

  const copyTasteDna = () => {
    const summary = `🎵 My EuskalSoinua Taste Profile:
Persona: ${dnaPersona || "Eclectic Explorer"}
Top Genres: ${topAffinityGenres.map((g) => g.genre).join(", ") || "Diverse"}
Energy: ${energyLevel} | Era: ${eraBias}
Basque Connection: ${basqueAffinity}%
Favorite Artists: ${favoriteArtists.join(", ") || "Open to all"}`;

    navigator.clipboard.writeText(summary);
    toast(t("taste.tasteDnaCopied"), "📋");
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-2 sm:px-6 pt-4 sm:pt-6 pb-28">
      {/* Header */}
      <header className="mb-6 sm:mb-8 animate-fade-up">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-accent text-xs font-black uppercase tracking-wider flex items-center gap-1">
              <Sparkles size={14} /> {t("taste.hubBadge")}
            </span>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white">
              {t("taste.title")}
            </h1>
            <p className="text-textdim text-xs sm:text-sm max-w-2xl non-critical-detail leading-relaxed">
              {t("taste.subtitle")}
            </p>
          </div>
          <div className="shrink-0 self-start sm:self-auto">
            <DetailToggle />
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-white/10 mt-6 flex-wrap">
          <button
            onClick={() => setActiveTab("swipe")}
            className={clsx(
              "px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-bold border-b-2 transition relative flex items-center gap-2 cursor-pointer",
              activeTab === "swipe"
                ? "border-accent text-accent font-black"
                : "border-transparent text-textdim hover:text-white hover:border-white/20"
            )}
          >
            🔥 {t("taste.tasteMatcherTab")}
            {swipePool.length > 0 && swipeIndex < swipePool.length && (
              <span className="bg-accent/15 text-accent text-[10px] px-2 py-0.5 rounded-full font-bold">
                {t("taste.cardsLeft", { count: swipePool.length - swipeIndex })}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("tuner")}
            className={clsx(
              "px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-bold border-b-2 transition relative flex items-center gap-2 cursor-pointer",
              activeTab === "tuner"
                ? "border-accent text-accent font-black"
                : "border-transparent text-textdim hover:text-white hover:border-white/20"
            )}
          >
            🎛️ {t("taste.tunerTab")}
          </button>
          <button
            onClick={() => setActiveTab("dna")}
            className={clsx(
              "px-4 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-bold border-b-2 transition relative flex items-center gap-2 cursor-pointer",
              activeTab === "dna"
                ? "border-accent text-accent font-black"
                : "border-transparent text-textdim hover:text-white hover:border-white/20"
            )}
          >
            🧬 {t("taste.tasteDnaTab")}
          </button>
        </div>

        {/* AI Curator Banner */}
        <div className="mt-4 sm:mt-6 p-3.5 rounded-2xl bg-gradient-to-r from-accent/15 via-panel to-panel border border-accent/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 non-critical-detail">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent/20 text-accent shrink-0">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-white">{t("taste.aiCuratorBannerTitle")}</div>
              <div className="text-[11px] text-textdim">{t("taste.aiCuratorBannerDesc")}</div>
            </div>
          </div>
          <Link
            href="/curator"
            className="px-4 py-2 bg-accent text-black font-black text-xs rounded-full hover:scale-105 transition text-center shrink-0 shadow-sm flex items-center justify-center gap-1.5"
          >
            {t("taste.openAiCurator")} <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      {/* Tab Contents */}
      <AnimatePresence mode="wait">
        {/* ========================================================================= */}
        {/* TAB 1: TASTE MATCHER GAME                                                 */}
        {/* ========================================================================= */}
        {activeTab === "swipe" && (
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
                <div className="h-96 w-full max-w-[360px] bg-panel rounded-3xl border border-white/10 flex flex-col items-center justify-center text-textdim">
                  <Loader2 size={36} className="animate-spin text-accent mb-3" />
                  <p className="text-sm font-semibold">{t("common.loading")}</p>
                </div>
              ) : swipeIndex >= swipePool.length ? (
                <div className="h-96 w-full max-w-[360px] bg-panel rounded-3xl border border-white/10 flex flex-col items-center justify-center text-center p-6 text-textdim animate-fade-up">
                  <CheckCircle2 size={44} className="text-accent mb-4" />
                  <p className="text-lg font-black text-white mb-2">{t("taste.endOfPoolTitle")}</p>
                  <p className="text-xs max-w-xs leading-relaxed mb-6">
                    {t("taste.endOfPoolDesc")}
                  </p>
                  <button
                    onClick={() => loadSwipePool(true)}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-accent text-black rounded-full text-xs font-black transition cursor-pointer hover:scale-105 shadow-md shadow-accent/20"
                  >
                    <RotateCcw size={14} /> {t("taste.reloadPoolBtn")}
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-[360px] flex flex-col items-center">
                  {/* Active Tinder Card */}
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
                          transition: { duration: 0.25 },
                        }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        onDragEnd={async (_, info) => {
                          if (info.offset.x > 100) {
                            await handleSwipe(true);
                          } else if (info.offset.x < -100) {
                            await handleSwipe(false);
                          }
                        }}
                        className="absolute inset-0 bg-panel rounded-3xl border border-white/15 shadow-2xl p-4 flex flex-col justify-between overflow-hidden cursor-grab active:cursor-grabbing group/card"
                      >
                        {/* Background subtle vignette */}
                        <div
                          className="absolute inset-0 opacity-15 bg-cover bg-center blur-2xl transition duration-500"
                          style={{
                            backgroundImage: currentItem.track.thumbnail
                              ? `url(${currentItem.track.thumbnail})`
                              : `linear-gradient(135deg, ${cardGradientColor(currentItem.track.id)}, #000)`,
                          }}
                        />

                        {/* Top Metadata Badges */}
                        <div className="relative flex justify-between items-center z-10">
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-white/10 text-white font-extrabold uppercase tracking-wide border border-white/10 flex items-center gap-1">
                            {currentItem.track.region === "eu" ? "🔴⚪🟢 Basque" : "🌐 Global"}
                          </span>
                          <span className="text-[10px] text-textdim font-bold bg-black/40 px-2 py-0.5 rounded-full border border-white/5">
                            #{swipeIndex + 1}/{swipePool.length}
                          </span>
                        </div>

                        {/* Center Cover Art & Play Button */}
                        <div className="relative flex-1 flex items-center justify-center my-3 z-10">
                          <div className="relative w-44 h-44 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 flex items-center justify-center">
                            {currentItem.track.thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={currentItem.track.thumbnail}
                                alt={currentItem.track.title}
                                className="w-full h-full object-cover select-none pointer-events-none"
                              />
                            ) : (
                              <div
                                className="w-full h-full select-none pointer-events-none flex items-center justify-center text-4xl"
                                style={{
                                  background: `linear-gradient(135deg, ${cardGradientColor(currentItem.track.id)}, #14141c)`,
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
                              className="absolute inset-0 bg-black/35 hover:bg-black/55 transition grid place-items-center group cursor-pointer"
                            >
                              <span className="h-14 w-14 rounded-full bg-accent/95 group-hover:scale-110 text-black flex items-center justify-center shadow-lg transition active:scale-95 cursor-pointer">
                                {previewLoading ? (
                                  <Loader2 size={24} className="animate-spin" />
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

                        {/* Bottom Track Title & Genre */}
                        <div className="relative text-center mt-1 z-10 px-2">
                          <h4 className="font-black text-white text-base truncate" title={currentItem.track.title}>
                            {currentItem.track.title}
                          </h4>
                          <p className="text-textdim text-xs mt-0.5 font-bold truncate">
                            {currentItem.track.artistName}
                          </p>
                          {currentItem.track.genre && (
                            <span className="inline-block mt-1.5 text-[10px] px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-accent font-bold">
                              {currentItem.track.genre}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Mode Selector (Preview vs Full Track YouTube Extraction) */}
                  <div className="w-full flex bg-white/5 p-1 rounded-xl border border-white/10 mb-4 max-w-[280px]">
                    <button
                      onClick={() => {
                        if (swipePool[swipeIndex]) {
                          playTrackPreview(swipePool[swipeIndex].track, "preview");
                        }
                      }}
                      className={clsx(
                        "flex-1 text-center py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer",
                        swiperMode === "preview"
                          ? "bg-accent text-black font-black shadow"
                          : "text-textdim hover:text-white"
                      )}
                    >
                      ⏱️ {t("taste.previewTrackBadge")}
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
                          ? "bg-accent text-black font-black shadow"
                          : "text-textdim hover:text-white"
                      )}
                    >
                      🔥 {t("taste.fullTrackBadge")}
                    </button>
                  </div>

                  {/* Playback & Matcher Button Controls */}
                  <div className="flex items-center justify-between w-full px-6 gap-3">
                    {/* Dislike / Left */}
                    <button
                      onClick={() => handleSwipe(false)}
                      title={t("taste.dislikeBtn")}
                      className="grid place-items-center h-14 w-14 rounded-full bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-textdim hover:text-red-400 active:scale-90 transition cursor-pointer shadow-lg"
                    >
                      <ThumbsDown size={22} />
                    </button>

                    {/* Play/Pause Center Button */}
                    <button
                      onClick={togglePreviewPlay}
                      title={previewPlaying ? t("common.pause") : t("common.play")}
                      className={clsx(
                        "grid place-items-center h-12 w-12 rounded-full transition active:scale-95 cursor-pointer shadow-lg",
                        previewPlaying
                          ? "bg-accent text-black font-bold"
                          : "bg-white/10 hover:bg-white/15 text-white border border-white/10"
                      )}
                    >
                      {previewLoading ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : previewPlaying ? (
                        <Pause size={18} fill="currentColor" />
                      ) : (
                        <Play size={18} fill="currentColor" className="ml-0.5" />
                      )}
                    </button>

                    {/* Like / Right */}
                    <button
                      onClick={() => handleSwipe(true)}
                      title={t("taste.likeBtn")}
                      className="grid place-items-center h-14 w-14 rounded-full bg-white/5 hover:bg-green-500/15 border border-white/10 hover:border-green-500/30 text-textdim hover:text-green-400 active:scale-90 transition cursor-pointer shadow-lg"
                    >
                      <ThumbsUp size={22} />
                    </button>
                  </div>

                  {/* Secondary Actions */}
                  <div className="flex items-center justify-between w-full px-6 mt-4 text-xs text-textdim">
                    <button
                      onClick={undoLastSwipe}
                      disabled={swipeIndex === 0}
                      className="hover:text-white transition flex items-center gap-1 cursor-pointer disabled:opacity-30"
                    >
                      <RotateCcw size={12} /> {t("taste.undoLastSwipe")}
                    </button>

                    <div
                      className="flex items-center gap-1.5 cursor-pointer select-none"
                      onClick={() => setAutoplayPreviews(!autoplayPreviews)}
                    >
                      <input
                        type="checkbox"
                        checked={autoplayPreviews}
                        onChange={() => {}}
                        className="accent-accent h-3.5 w-3.5 rounded bg-transparent border-white/20"
                      />
                      <span className="font-semibold text-[11px]">{t("taste.previewToggle")}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Stats & Swipe History */}
            <div className="md:col-span-5 flex flex-col gap-6">
              {/* Stats Card */}
              <div className="bg-panel rounded-2xl border border-white/10 p-5 shadow-lg">
                <h3 className="text-xs font-black uppercase tracking-widest text-textdim mb-4">
                  {t("taste.tasteMatcherTab")}
                </h3>

                <div className="grid grid-cols-3 gap-3 text-center mb-5">
                  <div className="bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                    <span className="block text-xl font-black text-white">{swipedCount}</span>
                    <span className="text-[10px] text-textdim">{t("common.all")}</span>
                  </div>
                  <div className="bg-green-500/[0.05] border border-green-500/20 p-3 rounded-xl text-green-400">
                    <span className="block text-xl font-black">{likesCount}</span>
                    <span className="text-[10px] text-textdim">{t("nav.likedSongs")}</span>
                  </div>
                  <div className="bg-red-500/[0.05] border border-red-500/20 p-3 rounded-xl text-red-400">
                    <span className="block text-xl font-black">{dislikesCount}</span>
                    <span className="text-[10px] text-textdim">{t("taste.dislikeBtn")}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-textdim font-bold">
                    <span>{t("home.listeningSignals", { count: swipedCount })}</span>
                    <span>{swipedCount >= 15 ? "✨ Precision Calibrated" : "📈 Learning"}</span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-300"
                      style={{ width: `${Math.min(100, (swipedCount / 15) * 100)}%` }}
                    />
                  </div>
                  <span className="block text-[10px] text-textdim mt-1 leading-relaxed">
                    {t("taste.swipeHint")}
                  </span>
                </div>
              </div>

              {/* History list */}
              <div className="bg-panel rounded-2xl border border-white/10 p-5 flex-1 flex flex-col min-h-[220px] shadow-lg">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-textdim">
                    {t("home.fullHistory")}
                  </h3>
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
                        toast(t("taste.resetHistoryBtn"), "🗑️");
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <Trash2 size={11} /> {t("common.delete")}
                    </button>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-textdim">
                    <Heart size={24} strokeWidth={1.5} className="mb-2 opacity-40" />
                    <span className="text-xs">{t("home.noPlayHistoryDesc")}</span>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto max-h-56 no-scrollbar space-y-2">
                    {history.map((h, idx) => (
                      <div
                        key={`${h.track.id}-hist-${idx}`}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition text-xs"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <span className="block font-bold text-white truncate">{h.track.title}</span>
                          <span className="block text-[10px] text-textdim truncate">{h.track.artistName}</span>
                        </div>
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded-full font-bold uppercase text-[9px] tracking-wider shrink-0 flex items-center gap-1 border",
                            h.liked
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          )}
                        >
                          {h.liked ? <ThumbsUp size={10} /> : <ThumbsDown size={10} />}
                          {h.liked ? t("nav.likedSongs") : t("taste.dislikeBtn")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: SONIC TUNER & PREFERENCES                                          */}
        {/* ========================================================================= */}
        {activeTab === "tuner" && (
          <motion.div
            key="tuner"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* Instant Taste Archetypes / Presets */}
            <div className="bg-panel rounded-2xl border border-white/10 p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Sparkles size={18} className="text-accent" /> {t("taste.presetsTitle")}
                  </h3>
                  <p className="text-xs text-textdim mt-0.5">{t("taste.presetsDesc")}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="p-3.5 rounded-xl bg-white/[0.02] hover:bg-accent/10 border border-white/5 hover:border-accent/40 transition text-left cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{preset.icon}</span>
                        <span className="font-black text-sm text-white group-hover:text-accent transition">
                          {preset.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-textdim line-clamp-2">{preset.desc}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-accent">
                      <span>{t("common.apply" as any) || "Load Preset"}</span> →
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Global Musical Genres by Category */}
            <div className="bg-panel rounded-2xl border border-white/10 p-5 sm:p-6 shadow-xl space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                    <Music4 size={18} className="text-accent" /> {t("taste.genresTitle")}
                  </h3>
                  <p className="text-xs text-textdim mt-0.5">{t("taste.genresDesc")}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedGenres(ALL_GENRES_FLAT)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white font-bold transition cursor-pointer"
                  >
                    {t("taste.selectAll")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGenres([])}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-textdim hover:text-white font-bold transition cursor-pointer"
                  >
                    {t("taste.clearAll")}
                  </button>
                </div>
              </div>

              <div className="space-y-5">
                {GENRE_CATEGORIES.map((cat) => (
                  <div key={cat.key} className="space-y-2">
                    <span className="text-xs font-black uppercase tracking-wider text-textdim block">
                      {t(`taste.${cat.key}` as any) || cat.name}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {cat.genres.map((g) => {
                        const isSelected = selectedGenres.includes(g);
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => toggleGenre(g)}
                            className={clsx(
                              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition border cursor-pointer select-none",
                              isSelected
                                ? "bg-accent/15 border-accent text-accent shadow-sm"
                                : "bg-white/[0.02] border-white/10 text-textdim hover:bg-white/[0.06] hover:text-white"
                            )}
                          >
                            {isSelected && <Check size={13} className="stroke-[3]" />}
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sonic Energy & Pace */}
            <div className="bg-panel rounded-2xl border border-white/10 p-5 sm:p-6 shadow-xl space-y-4">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <Zap size={18} className="text-accent" /> {t("taste.energyTitle")}
                </h3>
                <p className="text-xs text-textdim mt-0.5">{t("taste.energyDesc")}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {energyOptions.map((opt) => {
                  const isSelected = energyLevel === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEnergyLevel(opt.id as any)}
                      className={clsx(
                        "p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between select-none",
                        isSelected
                          ? "bg-accent/10 border-accent text-white shadow-sm"
                          : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05] hover:text-white"
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-2xl">{opt.emoji}</span>
                          {isSelected && <Check size={14} className="text-accent stroke-[3]" />}
                        </div>
                        <span className="font-black text-sm text-white block">{opt.title}</span>
                        <span className="text-[11px] text-textdim mt-1 block leading-snug">{opt.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cultural Roots & Basque Music Connection Slider */}
            <div className="bg-panel rounded-2xl border border-white/10 p-5 sm:p-6 shadow-xl space-y-5">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <Globe size={18} className="text-accent" /> {t("taste.basqueAffinityTitle")}
                </h3>
                <p className="text-xs text-textdim mt-0.5">{t("taste.basqueAffinityDesc")}</p>
              </div>

              <div className="space-y-3 bg-black/40 p-4 rounded-2xl border border-white/10">
                <div className="flex items-center justify-between text-xs font-black">
                  <span className="text-accent">🔴⚪🟢 {basqueAffinity}% Basque Connection</span>
                  <span className="text-textdim">
                    {basqueAffinity === 0
                      ? t("taste.basqueAffinity0")
                      : basqueAffinity <= 25
                      ? t("taste.basqueAffinity25")
                      : basqueAffinity <= 50
                      ? t("taste.basqueAffinity50")
                      : basqueAffinity <= 75
                      ? t("taste.basqueAffinity75")
                      : t("taste.basqueAffinity100")}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={basqueAffinity}
                  onChange={(e) => setBasqueAffinity(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-textdim font-bold">
                  <span>0% (Global Only)</span>
                  <span>50% (Balanced)</span>
                  <span>100% (Pure Basque)</span>
                </div>
              </div>

              {/* Regional Preferences */}
              <div className="space-y-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-textdim block">
                  {t("taste.originTitle")}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {regions.map((r) => {
                    const isSelected = selectedRegions.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRegion(r.id)}
                        className={clsx(
                          "flex items-center justify-between p-3.5 rounded-xl border text-left transition cursor-pointer select-none",
                          isSelected
                            ? "bg-accent/5 border-accent/40 text-white"
                            : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05] hover:text-white"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl shrink-0">{r.flag}</span>
                          <div className="min-w-0">
                            <span className="block font-bold text-xs text-white truncate">{r.name}</span>
                            <span className="block text-[10px] text-textdim truncate mt-0.5">{r.desc}</span>
                          </div>
                        </div>
                        <span
                          className={clsx(
                            "grid place-items-center h-4 w-4 rounded-full border transition shrink-0 ml-2",
                            isSelected ? "bg-accent border-accent text-black" : "border-white/20"
                          )}
                        >
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Musical Era & Mood Flavors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Era Decade */}
              <div className="bg-panel rounded-2xl border border-white/10 p-5 shadow-xl space-y-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Clock size={16} className="text-accent" /> {t("taste.eraTitle")}
                </h3>
                <p className="text-xs text-textdim">{t("taste.eraDesc")}</p>
                <div className="space-y-2">
                  {eraOptions.map((era) => {
                    const isSelected = eraBias === era.id;
                    return (
                      <button
                        key={era.id}
                        type="button"
                        onClick={() => setEraBias(era.id as any)}
                        className={clsx(
                          "w-full flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition cursor-pointer",
                          isSelected
                            ? "bg-accent/10 border-accent text-white"
                            : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05] hover:text-white"
                        )}
                      >
                        <span>{era.label}</span>
                        {isSelected && <Check size={14} className="text-accent stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mood Flavors */}
              <div className="bg-panel rounded-2xl border border-white/10 p-5 shadow-xl space-y-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Flame size={16} className="text-accent" /> {t("taste.moodsTitle")}
                </h3>
                <p className="text-xs text-textdim">{t("taste.moodsDesc")}</p>
                <div className="flex flex-wrap gap-2">
                  {moodOptions.map((mood) => {
                    const isSelected = selectedMoods.includes(mood.id);
                    return (
                      <button
                        key={mood.id}
                        type="button"
                        onClick={() => toggleMood(mood.id)}
                        className={clsx(
                          "px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer flex items-center gap-1.5",
                          isSelected
                            ? "bg-accent/15 border-accent text-accent"
                            : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05] hover:text-white"
                        )}
                      >
                        <span>{mood.emoji}</span>
                        <span>{mood.label}</span>
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Favorite Artists & Excluded Styles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Pinned Favorite Artists */}
              <div className="bg-panel rounded-2xl border border-white/10 p-5 shadow-xl space-y-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <UserPlus size={16} className="text-accent" /> {t("taste.favoriteArtistsTitle")}
                </h3>
                <p className="text-xs text-textdim">{t("taste.favoriteArtistsDesc")}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={artistInput}
                    onChange={(e) => setArtistInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addFavoriteArtist();
                      }
                    }}
                    placeholder={t("taste.favoriteArtistsPlaceholder")}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={addFavoriteArtist}
                    className="px-3 py-2 bg-accent text-black font-extrabold text-xs rounded-xl hover:scale-105 transition cursor-pointer"
                  >
                    {t("taste.addArtistBtn")}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {favoriteArtists.map((artist) => (
                    <span
                      key={artist}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-white"
                    >
                      {artist}
                      <button
                        type="button"
                        onClick={() => removeFavoriteArtist(artist)}
                        className="text-textdim hover:text-red-400 cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Avoided Genres / Styles */}
              <div className="bg-panel rounded-2xl border border-white/10 p-5 shadow-xl space-y-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2 text-red-400">
                  <ShieldBan size={16} className="text-red-400" /> {t("taste.excludedGenresTitle")}
                </h3>
                <p className="text-xs text-textdim">{t("taste.excludedGenresDesc")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {["Metal & Heavy", "Reggaeton & Latin Pop", "Classical & Cinematic", "Punk Rock", "Electronic", "Trikitia & Folk"].map((eg) => {
                    const isExcluded = excludedGenres.includes(eg);
                    return (
                      <button
                        key={eg}
                        type="button"
                        onClick={() => toggleExcludedGenre(eg)}
                        className={clsx(
                          "px-2.5 py-1 rounded-lg text-xs font-bold transition border cursor-pointer flex items-center gap-1",
                          isExcluded
                            ? "bg-red-500/15 border-red-500 text-red-400"
                            : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05]"
                        )}
                      >
                        {isExcluded && <ShieldBan size={11} />}
                        <span>{eg}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Save Action Bar */}
            <div className="sticky bottom-4 z-20 flex items-center justify-between p-4 bg-neutral-950/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl">
              <p className="text-xs text-textdim max-w-sm hidden sm:block">
                {t("taste.preferencesSaved")}
              </p>
              <button
                onClick={savePreferences}
                disabled={savingTuner}
                className="w-full sm:w-auto bg-accent text-black font-black px-8 py-3 rounded-full hover:scale-105 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm shadow-xl shadow-accent/25"
              >
                {savingTuner ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} strokeWidth={3} />
                )}
                {t("taste.savePreferences")}
              </button>
            </div>
          </motion.div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: TASTE DNA & AI INSIGHTS                                            */}
        {/* ========================================================================= */}
        {activeTab === "dna" && (
          <motion.div
            key="dna"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Persona Hero Card */}
            <div className="bg-panel rounded-3xl border border-white/10 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute right-0 top-0 w-96 h-96 bg-gradient-to-br from-accent/20 to-purple-600/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 border border-accent/30 text-accent text-xs font-black uppercase tracking-wider">
                  <span>🧬</span> {t("taste.tasteDnaTitle")}
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">
                    {dnaPersona || "Eclectic Basque & Global Indie Explorer"}
                  </h2>
                  <p className="text-xs sm:text-sm text-textdim mt-1 max-w-xl leading-relaxed">
                    {t("taste.tasteDnaSubtitle")}
                  </p>
                </div>

                {/* Persona Attributes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-white/[0.03] border border-white/5 p-3 rounded-xl">
                    <span className="text-[10px] text-textdim uppercase font-bold block">{t("taste.energyTitle")}</span>
                    <span className="text-sm font-black text-white capitalize">{energyLevel}</span>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 p-3 rounded-xl">
                    <span className="text-[10px] text-textdim uppercase font-bold block">{t("taste.basqueAffinityTitle")}</span>
                    <span className="text-sm font-black text-accent">{basqueAffinity}%</span>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 p-3 rounded-xl">
                    <span className="text-[10px] text-textdim uppercase font-bold block">{t("taste.eraTitle")}</span>
                    <span className="text-sm font-black text-white capitalize">{eraBias}</span>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 p-3 rounded-xl">
                    <span className="text-[10px] text-textdim uppercase font-bold block">{t("taste.totalSignalsRecorded")}</span>
                    <span className="text-sm font-black text-white">{totalSignals}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-4 flex-wrap">
                  <Link
                    href="/curator"
                    className="px-5 py-2.5 rounded-full bg-accent text-black font-black text-xs hover:scale-105 transition cursor-pointer shadow-lg shadow-accent/20 flex items-center gap-2"
                  >
                    <Sparkles size={14} /> {t("taste.generateAiPlaylistFromTaste")}
                  </Link>
                  <button
                    type="button"
                    onClick={copyTasteDna}
                    className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Share2 size={13} /> {t("taste.copyTasteDna")}
                  </button>
                </div>
              </div>
            </div>

            {/* Calculated Genre Affinity Bars */}
            <div className="bg-panel rounded-2xl border border-white/10 p-6 shadow-xl space-y-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-textdim">
                {t("taste.genreAffinityBreakdown")}
              </h3>

              {topAffinityGenres.length === 0 ? (
                <div className="text-center py-6 text-textdim text-xs">
                  {t("taste.calibrationHint")}
                </div>
              ) : (
                <div className="space-y-3">
                  {topAffinityGenres.map((item, idx) => {
                    const maxScore = topAffinityGenres[0]?.score || 1;
                    const percent = Math.min(100, Math.round((item.score / maxScore) * 100));
                    return (
                      <div key={item.genre} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-white">
                          <span className="capitalize">{item.genre}</span>
                          <span className="text-textdim">{percent}%</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full transition-all duration-500"
                            style={{
                              width: `${percent}%`,
                              opacity: Math.max(0.4, 1 - idx * 0.1),
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Calibration Info Card */}
            <div className="bg-panel rounded-2xl border border-white/10 p-5 shadow-xl flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <span className="text-xs font-black text-white flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-accent" /> {t("taste.discoveryCalibration")}: {calibrationPercent}%
                </span>
                <p className="text-[11px] text-textdim leading-relaxed max-w-lg">
                  {t("taste.calibrationHint")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("swipe")}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-full text-xs font-bold transition cursor-pointer"
              >
                🔥 {t("taste.tasteMatcherTab")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function cardGradientColor(id: number): string {
  const hues = [
    "#7c3aed",
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#f43f5e",
    "#06b6d4",
  ];
  return hues[id % hues.length];
}
