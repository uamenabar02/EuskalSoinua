"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Search as SearchIcon,
  Loader2,
  X,
  Globe,
  History,
  Play,
  Plus,
  Radio,
  Sparkles,
  Music2,
  ListPlus,
  ListMusic,
  ExternalLink,
} from "lucide-react";
import { TrackList } from "@/components/track-row";
import { ArtistCard, AlbumCard } from "@/components/cards";
import { Section, SectionCard } from "@/components/sections";
import { AddMetadataModal } from "@/components/add-metadata-modal";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import type { Track, Artist, Album } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { formatTime } from "@/lib/utils";

interface Results {
  tracks: (Track & { liked?: boolean })[];
  artists: (Artist & { followed?: boolean })[];
  albums: (Album & { saved?: boolean })[];
  online?: boolean;
}

interface YouTubeHit {
  videoId: string;
  title: string;
  author: string;
  duration?: number;
  thumbnail: string;
  guessedTitle?: string;
  guessedArtist?: string;
}

const SUGGESTIONS = [
  "La Txama",
  "StreetWise",
  "Berri Txarrak",
  "Gatibu",
  "Huntza",
  "Su Ta Gar",
  "Euskal rock",
  "Trikitia",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 999999;
}

function hitToPlayableTrack(hit: YouTubeHit): Track {
  return {
    id: -Math.abs(hashString(hit.videoId)),
    externalId: hit.videoId,
    source: "youtube",
    title: hit.guessedTitle || hit.title,
    artistId: null,
    artistName: hit.guessedArtist || hit.author || "YouTube",
    albumId: null,
    albumName: "YouTube Audio",
    duration: hit.duration || 180,
    thumbnail: hit.thumbnail,
    artworkUrl: hit.thumbnail,
    genre: null,
    region: "global",
    language: "und",
    demoAudio: null,
    isrc: null,
    previewUrl: null,
    previewUrlAlt: null,
    playCount: 1,
  };
}

export default function SearchPage() {
  const { t } = useTranslation();
  const { playQueue, playNext, addToQueue, current, isPlaying } = usePlayer();
  const { toast } = useToast();

  const [mode, setMode] = useState<"catalog" | "youtube">("catalog");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [ytResults, setYtResults] = useState<YouTubeHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Metadata form modal
  const [modalVideo, setModalVideo] = useState<YouTubeHit | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("euskalsoinua_search_history");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });

  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addToHistory = (term: string) => {
    const clean = term.trim();
    if (!clean || clean.length < 2) return;
    setHistory((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== clean.toLowerCase());
      const updated = [clean, ...filtered].slice(0, 15);
      try {
        localStorage.setItem("euskalsoinua_search_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const removeFromHistory = (termToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((item) => item !== termToRemove);
      try {
        localStorage.setItem("euskalsoinua_search_history", JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem("euskalsoinua_search_history");
    } catch {}
  };

  // Search effect
  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const t = setTimeout(() => {
        setResults(null);
        setYtResults(null);
        setError(false);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const thisRequestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        if (mode === "catalog") {
          const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("Search request failed");
          const data = await res.json();

          if (requestIdRef.current === thisRequestId) {
            setResults(data);
            setLoading(false);
            setError(false);
            if (trimmed.length >= 2 && (data.tracks?.length > 0 || data.artists?.length > 0 || data.albums?.length > 0)) {
              addToHistory(trimmed);
            }
          }
        } else {
          // YouTube Direct Audio Search
          const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error("YouTube search failed");
          const data = await res.json();

          if (requestIdRef.current === thisRequestId) {
            setYtResults(data.hits || []);
            setLoading(false);
            setError(false);
            if (trimmed.length >= 2 && data.hits?.length > 0) {
              addToHistory(trimmed);
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          return;
        }
        if (requestIdRef.current === thisRequestId) {
          setError(true);
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [q, mode]);

  const handleClear = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    requestIdRef.current++;
    setQ("");
    setResults(null);
    setYtResults(null);
    setLoading(false);
    setError(false);
  };

  const openAddMetadata = (hit: YouTubeHit, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setModalVideo(hit);
    setIsModalOpen(true);
  };

  const handleTrackAdded = (newTrack: Track) => {
    setIsModalOpen(false);
    // If we're in catalog mode, add to results; if in YouTube mode, toast
    toast(`"${newTrack.title}" added to catalog!`, "✅");
  };

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-[1600px] mx-auto pb-28">
      {/* Search Mode Selector (Pill tabs) */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("catalog")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition cursor-pointer touch-manipulation min-h-[38px] ${
            mode === "catalog"
              ? "bg-accent text-black shadow-md font-bold"
              : "bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5"
          }`}
        >
          <Music2 size={16} />
          <span>{t("search.catalogTab")}</span>
        </button>

        <button
          type="button"
          onClick={() => setMode("youtube")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition cursor-pointer touch-manipulation min-h-[38px] ${
            mode === "youtube"
              ? "bg-red-600 text-white shadow-md font-bold"
              : "bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5"
          }`}
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
          <span>{t("search.youtubeTab")}</span>
        </button>
      </div>

      {/* Main Search Input */}
      <div className="relative max-w-xl mb-6">
        <SearchIcon
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-textdim"
        />
        <input
          id="search-input"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              addToHistory(q.trim());
            }
          }}
          placeholder={
            mode === "youtube"
              ? t("search.searchYouTubePlaceholder")
              : t("search.placeholder")
          }
          className="w-full bg-white/10 focus:bg-white/15 rounded-full pl-12 pr-12 py-3.5 text-base outline-none placeholder:text-textdim transition"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {loading ? (
            <Loader2 size={18} className="animate-spin text-textdim" />
          ) : null}
          {q ? (
            <button
              id="search-clear-btn"
              type="button"
              onClick={handleClear}
              aria-label="Clear search"
              className="text-textdim hover:text-ink transition p-1 cursor-pointer touch-manipulation"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Idle state: Suggestions & History */}
      {!q ? (
        <div className="space-y-8 animate-fade-up">
          <div>
            <h3 className="text-textdim text-xs font-bold mb-3 uppercase tracking-wider">
              {t("search.trySearchingFor")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  id={`suggestion-${s.toLowerCase().replace(/\s+/g, "-")}`}
                  type="button"
                  onClick={() => {
                    setQ(s);
                    addToHistory(s);
                  }}
                  className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-white/90 hover:text-white transition cursor-pointer touch-manipulation"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-textdim text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <History size={14} className="text-accent" />
                  {t("search.recentSearches")}
                </h3>
                <button
                  type="button"
                  onClick={clearHistory}
                  className="text-xs text-textdim hover:text-white transition cursor-pointer touch-manipulation"
                >
                  {t("search.clearSearches")}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((term) => (
                  <div
                    key={term}
                    onClick={() => setQ(term)}
                    className="group flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 text-sm text-white/90 hover:text-white transition cursor-pointer touch-manipulation"
                  >
                    <History size={12} className="text-textdim group-hover:text-accent shrink-0" />
                    <span>{term}</span>
                    <button
                      type="button"
                      onClick={(e) => removeFromHistory(term, e)}
                      title="Remove from history"
                      className="p-1 rounded-full text-textdim hover:text-white hover:bg-white/10 transition ml-0.5 cursor-pointer touch-manipulation"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : loading && ((mode === "catalog" && !results) || (mode === "youtube" && !ytResults)) ? (
        <div className="py-20 grid place-items-center text-textdim">
          <Loader2 className="animate-spin text-accent" size={32} />
          <p className="mt-3 text-sm text-textdim">
            {mode === "youtube" ? t("search.searchingYouTube") : t("search.searchingCatalogWeb")}
          </p>
        </div>
      ) : error ? (
        <div className="py-20 text-center text-textdim text-sm">
          {t("search.searchFailed")}
        </div>
      ) : mode === "youtube" ? (
        /* YouTube Direct Results View */
        <div className="animate-fade-up space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-white">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                {t("search.youtubeResults")}
              </h2>
              <p className="text-xs text-textdim mt-0.5">
                Play any video directly or add it to the application catalog with custom metadata
              </p>
            </div>
            <span className="text-xs text-textdim bg-white/5 px-3 py-1 rounded-full w-fit">
              {ytResults?.length ?? 0} {t("common.tracks")} found
            </span>
          </div>

          {ytResults && ytResults.length === 0 ? (
            <div className="py-16 text-center text-textdim space-y-3">
              <p>{t("search.noYouTubeResults", { query: q })}</p>
              <button
                type="button"
                onClick={() => setMode("catalog")}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition cursor-pointer"
              >
                Switch to Catalog Search
              </button>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:gap-3">
              {ytResults?.map((hit) => {
                const asTrack = hitToPlayableTrack(hit);
                const isThisPlaying = current?.externalId === hit.videoId && isPlaying;

                return (
                  <div
                    key={hit.videoId}
                    onClick={() => playQueue([asTrack], 0)}
                    className="group flex items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl bg-panel hover:bg-panel-hover border border-white/5 hover:border-white/15 transition-all cursor-pointer shadow-sm"
                  >
                    {/* Thumbnail + Play Overlay */}
                    <div className="relative w-16 h-12 sm:w-20 sm:h-14 rounded-xl overflow-hidden shrink-0 bg-black/40 shadow">
                      {hit.thumbnail ? (
                        <Image
                          src={hit.thumbnail}
                          alt={hit.title}
                          fill
                          sizes="(max-width: 640px) 64px, 80px"
                          className="object-cover group-hover:scale-105 transition-transform"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Music2 className="w-full h-full p-3 text-white/30" />
                      )}
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                        <span className="h-7 w-7 rounded-full bg-red-600/90 text-white grid place-items-center shadow">
                          <Play size={12} fill="currentColor" />
                        </span>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm sm:text-base text-white truncate group-hover:text-accent transition-colors">
                        {hit.guessedTitle || hit.title}
                      </div>
                      <div className="text-xs text-textdim truncate mt-0.5 flex items-center gap-1.5">
                        <span className="font-medium text-white/80">
                          {hit.guessedArtist || hit.author}
                        </span>
                        <span>•</span>
                        <span>{formatTime(hit.duration || 180)}</span>
                      </div>
                      {hit.guessedTitle && hit.title !== hit.guessedTitle ? (
                        <div className="text-[11px] text-textdim/70 truncate mt-0.5">
                          YT: {hit.title}
                        </div>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-1.5 sm:gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Quick Add to Metadata Button */}
                      <button
                        type="button"
                        onClick={(e) => openAddMetadata(hit, e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent hover:bg-accent/80 active:bg-accent/90 text-black font-extrabold text-xs transition cursor-pointer touch-manipulation min-h-[36px]"
                        title="Add this video to the application's catalog with metadata"
                      >
                        <Plus size={14} strokeWidth={3} />
                        <span className="hidden sm:inline">{t("search.addToMetadata")}</span>
                      </button>

                      {/* Play Next */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playNext(asTrack);
                          toast(`Added to Up Next`, "🎵");
                        }}
                        className="grid place-items-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 text-white/80 hover:text-white transition cursor-pointer touch-manipulation"
                        title="Play Next"
                        aria-label="Play Next"
                      >
                        <ListPlus size={15} />
                      </button>

                      {/* Add to Queue */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToQueue(asTrack);
                          toast(`Added to Queue`, "➕");
                        }}
                        className="grid place-items-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 text-white/80 hover:text-white transition cursor-pointer touch-manipulation"
                        title="Add to Queue"
                        aria-label="Add to Queue"
                      >
                        <ListMusic size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : results ? (
        /* Standard Catalog Results View */
        <div className="animate-fade-up">
          {results.online ? (
            <div className="flex items-center gap-2 mb-4 text-xs text-sky-300/80">
              <Globe size={13} />
              {t("search.searchedWeb")}
            </div>
          ) : null}

          {results.tracks.length === 0 &&
          results.artists.length === 0 &&
          results.albums.length === 0 ? (
            <div className="py-12 space-y-6 text-center">
              <div className="text-textdim text-sm">
                {t("search.noResults", { query: q })}
              </div>

              {/* Seamless Fallback Card to YouTube */}
              <div className="max-w-xl mx-auto p-5 rounded-2xl bg-gradient-to-br from-red-950/40 via-panel to-panel border border-red-500/20 text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
                <div className="flex items-start gap-3">
                  <span className="p-2.5 rounded-xl bg-red-600/15 text-red-400 shrink-0">
                    <Play size={20} fill="currentColor" />
                  </span>
                  <div>
                    <h4 className="font-bold text-white text-sm sm:text-base">
                      {t("search.searchOnYouTube")}
                    </h4>
                    <p className="text-xs text-textdim mt-0.5">
                      {t("search.searchYouTubeFallback")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMode("youtube")}
                  className="px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs transition cursor-pointer touch-manipulation flex items-center gap-1.5 shrink-0"
                >
                  <Play size={13} fill="currentColor" />
                  <span>{t("search.searchOnYouTube")}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {results.tracks.length ? (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold">{t("search.songs")}</h2>
                    <button
                      type="button"
                      onClick={() => setMode("youtube")}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer touch-manipulation"
                    >
                      <span>Find on YouTube</span>
                      <ExternalLink size={12} />
                    </button>
                  </div>
                  <TrackList tracks={results.tracks.slice(0, 15)} />
                </div>
              ) : null}

              {results.artists.length ? (
                <Section title={t("search.artists")}>
                  {results.artists.map((a) => (
                    <SectionCard key={a.id}>
                      <ArtistCard artist={a} />
                    </SectionCard>
                  ))}
                </Section>
              ) : null}

              {results.albums.length ? (
                <Section title={t("search.albums")}>
                  {results.albums.map((a) => (
                    <SectionCard key={a.id}>
                      <AlbumCard album={a} />
                    </SectionCard>
                  ))}
                </Section>
              ) : null}

              {/* Bottom fallback suggestion */}
              <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03]">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    Can&apos;t find a specific version or rare track?
                  </h4>
                  <p className="text-xs text-textdim mt-0.5">
                    Search YouTube directly to find live performances, rarities, or unreleased music.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMode("youtube")}
                  className="px-4 py-2 rounded-full bg-red-600/90 hover:bg-red-500 text-white font-semibold text-xs transition cursor-pointer touch-manipulation flex items-center gap-1.5 shrink-0"
                >
                  <Play size={12} fill="currentColor" />
                  <span>Search YouTube</span>
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Add to Application Metadata Modal Form */}
      <AddMetadataModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        videoData={modalVideo}
        onSuccess={handleTrackAdded}
      />
    </div>
  );
}
