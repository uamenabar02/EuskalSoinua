"use client";

import { useState, useEffect, useRef } from "react";
import { Search as SearchIcon, Loader2, X, Globe, History, Trash2 } from "lucide-react";
import { TrackList } from "@/components/track-row";
import { ArtistCard, AlbumCard } from "@/components/cards";
import { Section, SectionCard } from "@/components/sections";
import type { Track, Artist, Album } from "@/lib/types";

interface Results {
  tracks: (Track & { liked?: boolean })[];
  artists: (Artist & { followed?: boolean })[];
  albums: (Album & { saved?: boolean })[];
  online?: boolean;
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

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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

  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const t = setTimeout(() => {
        setResults(null);
        setError(false);
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }

    // Cancel any previous in-flight HTTP request immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Increment request ID so older requests can never overwrite newer ones
    const thisRequestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search request failed");
        const data = await res.json();

        // Only commit state if this is still the active, newest request
        if (requestIdRef.current === thisRequestId) {
          setResults(data);
          setLoading(false);
          setError(false);
          if (trimmed.length >= 2 && (data.tracks?.length > 0 || data.artists?.length > 0 || data.albums?.length > 0)) {
            addToHistory(trimmed);
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          // Expected when user continues typing; do not show error
          return;
        }
        if (requestIdRef.current === thisRequestId) {
          setError(true);
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      clearTimeout(timer);
    };
  }, [q]);

  const handleClear = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    requestIdRef.current++;
    setQ("");
    setResults(null);
    setLoading(false);
    setError(false);
  };

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-[1600px] mx-auto pb-24">
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
          placeholder="Songs, artists, albums…"
          className="w-full bg-white/10 focus:bg-white/15 rounded-full pl-12 pr-12 py-3.5 text-base outline-none placeholder:text-textdim transition"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {loading ? (
            <Loader2 size={18} className="animate-spin text-textdim" />
          ) : null}
          {q ? (
            <button
              id="search-clear-btn"
              onClick={handleClear}
              aria-label="Clear search"
              className="text-textdim hover:text-ink transition p-1"
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {!q ? (
        <div className="space-y-8 animate-fade-up">
          <div>
            <h3 className="text-textdim text-xs font-bold mb-3 uppercase tracking-wider">
              Try searching for
            </h3>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  id={`suggestion-${s.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => {
                    setQ(s);
                    addToHistory(s);
                  }}
                  className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-white/90 hover:text-white transition cursor-pointer"
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
                  Recent searches
                </h3>
                <button
                  onClick={clearHistory}
                  className="text-xs text-textdim hover:text-white transition cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {history.map((term) => (
                  <div
                    key={term}
                    onClick={() => setQ(term)}
                    className="group flex items-center gap-2 pl-3.5 pr-2 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 hover:border-white/10 text-sm text-white/90 hover:text-white transition cursor-pointer"
                  >
                    <History size={12} className="text-textdim group-hover:text-accent shrink-0" />
                    <span>{term}</span>
                    <button
                      onClick={(e) => removeFromHistory(term, e)}
                      title="Remove from history"
                      className="p-1 rounded-full text-textdim hover:text-white hover:bg-white/10 transition ml-0.5"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : loading && !results ? (
        <div className="py-20 grid place-items-center text-textdim">
          <Loader2 className="animate-spin-slow" size={28} />
          <p className="mt-3 text-sm text-textdim">Searching catalog & web...</p>
        </div>
      ) : error ? (
        <div className="py-20 text-center text-textdim text-sm">
          Search failed — the catalog may be warming up. Try again shortly.
        </div>
      ) : results ? (
        <div className="animate-fade-up">
          {results.online ? (
            <div className="flex items-center gap-2 mb-4 text-xs text-sky-300/80">
              <Globe size={13} />
              Searched your library + the web (iTunes & Deezer)
            </div>
          ) : null}
          {results.tracks.length === 0 &&
          results.artists.length === 0 &&
          results.albums.length === 0 ? (
            <div className="py-20 text-center text-textdim">
              No results for “{q}”.
            </div>
          ) : (
            <>
              {results.tracks.length ? (
                <div className="mb-8">
                  <h2 className="text-lg font-bold mb-3">Songs</h2>
                  <TrackList tracks={results.tracks.slice(0, 15)} />
                </div>
              ) : null}
              {results.artists.length ? (
                <Section title="Artists">
                  {results.artists.map((a) => (
                    <SectionCard key={a.id}>
                      <ArtistCard artist={a} />
                    </SectionCard>
                  ))}
                </Section>
              ) : null}
              {results.albums.length ? (
                <Section title="Albums">
                  {results.albums.map((a) => (
                    <SectionCard key={a.id}>
                      <AlbumCard album={a} />
                    </SectionCard>
                  ))}
                </Section>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
