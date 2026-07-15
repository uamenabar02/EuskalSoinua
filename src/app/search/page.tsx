"use client";

import { useState, useEffect } from "react";
import { Search as SearchIcon, Loader2, X, Globe } from "lucide-react";
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

  useEffect(() => {
    if (!q.trim()) {
      const t = setTimeout(() => {
        setResults(null);
        setError(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const t1 = setTimeout(() => {
      setLoading(true);
      setError(false);
    }, 0);
    const t2 = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((d) => setResults(d))
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [q]);

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-[1600px] mx-auto">
      <div className="relative max-w-xl mb-6">
        <SearchIcon
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-textdim"
        />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Songs, artists, albums…"
          className="w-full bg-white/10 focus:bg-white/15 rounded-full pl-12 pr-12 py-3.5 text-base outline-none placeholder:text-textdim transition"
        />
        {q ? (
          <button
            onClick={() => setQ("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-textdim hover:text-ink"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="py-20 grid place-items-center text-textdim">
          <Loader2 className="animate-spin-slow" />
        </div>
      ) : !q ? (
        <div className="animate-fade-up">
          <h3 className="text-textdim text-sm font-semibold mb-3 uppercase tracking-wide">
            Try searching for
          </h3>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm transition"
              >
                {s}
              </button>
            ))}
          </div>
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
                  <TrackList tracks={results.tracks.slice(0, 12)} />
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
