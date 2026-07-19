"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Section,
  SectionCard,
} from "@/components/sections";
import {
  TrackCard,
  ArtistCard,
  AlbumCard,
  BasqueBadge,
} from "@/components/cards";
import { PlaylistCard } from "@/components/cards";
import {
  TrackRow,
} from "@/components/track-row";
import { usePlayer } from "@/lib/player-context";
import type { Track, Artist, Album, Playlist, Recommendation } from "@/lib/types";
import { Sparkles, Loader2, TrendingUp, Radio as RadioIcon, RotateCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { clsx } from "@/lib/utils";
import { useToast } from "@/lib/toast";

interface Catalog {
  trending: (Track & { liked?: boolean })[];
  basqueHighlights: (Track & { liked?: boolean })[];
  topArtists: (Artist & { followed?: boolean })[];
  newReleases: (Album & { saved?: boolean })[];
  basqueArtists: (Artist & { followed?: boolean })[];
}

export default function HomePage() {
  const p = usePlayer();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [taste, setTaste] = useState<{
    topGenres: { genre: string; score: number }[];
    totalEvents: number;
  }>({ topGenres: [], totalEvents: 0 });
  const [loadingRecs, setLoadingRecs] = useState(true);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [radios, setRadios] = useState<Playlist[]>([]);
  const [discover, setDiscover] = useState<(Track & { reason?: string })[]>([]);
  const [feedback, setFeedback] = useState<Record<number, "like" | "discharge" | "dislike">>({});
  const { toast } = useToast();

  const recsRef = useRef<Recommendation[]>([]);
  const discoverRef = useRef<(Track & { reason?: string })[]>([]);

  useEffect(() => {
    recsRef.current = recs;
  }, [recs]);

  useEffect(() => {
    discoverRef.current = discover;
  }, [discover]);

  const loadDiscover = useCallback((excludeCurrent = false) => {
    setLoadingDiscover(true);
    const excludeIds = excludeCurrent ? discoverRef.current.map((d) => d.id).join(",") : "";
    const url = `/api/discover` + (excludeIds ? `?exclude=${excludeIds}` : "");
    fetch(url)
      .then((r) => r.json())
      .then((d) => setDiscover(d.tracks ?? []))
      .catch(() => {})
      .finally(() => setLoadingDiscover(false));
  }, []);

  const loadRecs = useCallback((excludeCurrent = false) => {
    setLoadingRecs(true);
    const excludeIds = excludeCurrent ? recsRef.current.map((r) => r.track.id).join(",") : "";
    const url = `/api/recommendations?limit=20&basqueBooster=${p.basqueBooster}` + (excludeIds ? `&exclude=${excludeIds}` : "");
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setRecs(d.recommendations ?? []);
        setTaste(d.taste ?? { topGenres: [], totalEvents: 0 });
      })
      .finally(() => setLoadingRecs(false));
  }, [p.basqueBooster]);

  const initialLoadedRef = useRef(false);

  useEffect(() => {
    if (initialLoadedRef.current) return;
    initialLoadedRef.current = true;

    fetch("/api/catalog")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setCatalog)
      .catch(() => setCatalogError(true));
    // load song radios for the home sections
    fetch("/api/library")
      .then((r) => r.json())
      .then((d) => setRadios(d.radios ?? []))
      .catch(() => {});
    
    loadDiscover();
    loadRecs();
  }, [loadDiscover, loadRecs]);

  // Load recommendations specifically when basqueBooster changes value
  const lastBoosterRef = useRef(p.basqueBooster);
  useEffect(() => {
    if (p.basqueBooster !== lastBoosterRef.current) {
      lastBoosterRef.current = p.basqueBooster;
      loadRecs();
    }
  }, [p.basqueBooster, loadRecs]);

  useEffect(() => {
    const handleChanged = () => {
      loadRecs();
      loadDiscover();
    };
    window.addEventListener("playlists-changed", handleChanged);
    return () => window.removeEventListener("playlists-changed", handleChanged);
  }, [loadRecs, loadDiscover]);

  // Computed in an effect (not during render) to avoid a server/client time
  // hydration mismatch that can destabilize the session.
  const [greeting, setGreeting] = useState("Kaixo");
  useEffect(() => {
    const hour = new Date().getHours();
    const g = hour < 6 ? "Good night" : hour < 12 ? "Egun on" : hour < 19 ? "Arratsalde on" : "Gabon";
    const t = setTimeout(() => {
      setGreeting(g);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-[1600px] mx-auto">
      {/* hero */}
      <header className="mb-8 animate-fade-up">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-textdim text-sm">{greeting}</p>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mt-1">
              Zer entzun <span className="text-accent">gaur?</span>
            </h1>
            <p className="text-textdim text-sm mt-2 max-w-lg">
              Ad-free streaming powered by open-source audio extraction. Your taste stays on this device.
            </p>
          </div>
          <BoosterToggle
            enabled={p.basqueBooster}
            onToggle={() => {
              p.toggleBooster();
              setTimeout(loadRecs, 50);
            }}
          />
        </div>
      </header>

      {catalogError ? (
        <div className="grid place-items-center py-32 text-center text-textdim px-6">
          <p className="font-semibold text-ink mb-1">Couldn’t reach the music catalog</p>
          <p className="text-sm max-w-sm">
            The database may still be starting up. Refresh in a moment — if it
            persists, the seed catalog couldn’t load.
          </p>
        </div>
      ) : !catalog ? (
        <div className="grid place-items-center py-32 text-textdim">
          <Loader2 className="animate-spin-slow" />
        </div>
      ) : (
        <>
          <Section title="Trending now" subtitle="Most played across your catalog">
            {catalog.trending.map((t) => (
              <SectionCard key={t.id}>
                <TrackCard track={t} />
              </SectionCard>
            ))}
          </Section>

          <Section
            title="Basque highlights"
            subtitle="Euskal musika — rock, folk, trikitia"
            action={<BasqueBadge />}
          >
            {catalog.basqueHighlights.map((t) => (
              <SectionCard key={t.id}>
                <TrackCard track={t} />
              </SectionCard>
            ))}
          </Section>

          {/* For You recommendations */}
          <section className="mb-10">
            <div className="flex items-end justify-between mb-3 px-1">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                  <Sparkles size={20} className="text-accent" /> For You
                </h2>
                <p className="text-textdim text-xs sm:text-sm mt-0.5">
                  On-device recommendations •{" "}
                  {taste.totalEvents > 0
                    ? `${taste.totalEvents} listening signals`
                    : "play more to tune the engine"}
                </p>
              </div>
              <button
                onClick={() => {
                  toast("Refreshing recommendations…", "🔄");
                  loadRecs(true);
                }}
                disabled={loadingRecs}
                title="Reload recommendations"
                className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full transition disabled:opacity-50"
              >
                <RotateCw size={14} className={loadingRecs ? "animate-spin-slow" : ""} />
                <span className="hidden sm:inline">Reload</span>
              </button>
            </div>

            {taste.topGenres.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-4">
                {taste.topGenres.map((g) => (
                  <span
                    key={g.genre}
                    className={clsx(
                      "text-xs px-3 py-1 rounded-full",
                      g.genre.toLowerCase().includes("euskal") || g.score > 0
                        ? "bg-basque/20 text-basque"
                        : "bg-white/5 text-textdim",
                    )}
                  >
                    {g.genre}
                  </span>
                ))}
              </div>
            ) : null}

            {loadingRecs ? (
              <div className="py-16 grid place-items-center text-textdim">
                <Loader2 className="animate-spin-slow" />
              </div>
            ) : (
              <div className="rounded-xl bg-white/[0.02] p-2 sm:p-3">
                {recs.slice(0, 8).map((r, i) => (
                  <div key={r.track.id} className="group/rec relative">
                    <TrackRow
                      track={{ ...r.track, liked: false }}
                      index={i}
                      queue={recs.map((x) => x.track)}
                      showAlbum
                      feedbackValue={feedback[r.track.id]}
                      onFeedback={async (f) => {
                        setFeedback((fbs) => ({ ...fbs, [r.track.id]: f }));
                        await fetch("/api/feedback", {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ trackId: r.track.id, feedback: f }),
                        });
                        toast(
                          f === "like"
                            ? "👍 We'll recommend more like this"
                            : "👎 We'll show less like this",
                          "",
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {discover.length > 0 ? (
            <section className="mb-8">
              <div className="flex items-end justify-between mb-3 px-1">
                <div>
                  <h2 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                    🔮 Discover New
                  </h2>
                  <p className="text-textdim text-xs sm:text-sm mt-0.5">
                    Fresh releases matched to your taste
                  </p>
                </div>
                <button
                  onClick={() => {
                    toast("Refreshing discovery tracks…", "🔮");
                    loadDiscover(true);
                  }}
                  disabled={loadingDiscover}
                  title="Reload discovery tracks"
                  className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full transition disabled:opacity-50 cursor-pointer"
                >
                  <RotateCw size={14} className={loadingDiscover ? "animate-spin-slow" : ""} />
                  <span className="hidden sm:inline">Reload</span>
                </button>
              </div>
              <div className="rounded-xl bg-white/[0.02] p-2 sm:p-3">
                {discover.slice(0, 8).map((t, i) => (
                  <TrackRow
                    key={`${t.id}-disc-${i}`}
                    track={{ ...t, liked: false }}
                    index={i}
                    queue={discover}
                    showAlbum
                  />
                ))}
              </div>
            </section>
          ) : null}

          {radios.length > 0 ? (
            <Section
              title="Song Radios"
              subtitle="Auto-generated from songs you've played"
            >
              {radios.map((pl) => (
                <SectionCard key={pl.id}>
                  <PlaylistCard playlist={pl} />
                </SectionCard>
              ))}
            </Section>
          ) : null}

          <Section title="Top artists" subtitle="Follow your favorites">
            {catalog.topArtists.map((a) => (
              <SectionCard key={a.id}>
                <ArtistCard artist={a} />
              </SectionCard>
            ))}
          </Section>

          <Section title="Basque artists" subtitle="Discover regional talent">
            {catalog.basqueArtists.map((a) => (
              <SectionCard key={a.id}>
                <ArtistCard artist={a} />
              </SectionCard>
            ))}
          </Section>

          <Section title="New & notable albums">
            {catalog.newReleases.map((a) => (
              <SectionCard key={a.id}>
                <AlbumCard album={a} />
              </SectionCard>
            ))}
          </Section>

          <footer className="py-10 text-center text-textfaint text-xs">
            <TrendingUp size={14} className="inline mr-1" />
            EuskalSoinua • Open-source media client • No ads, no tracking.
            <div className="mt-1">
              Audio resolved via Piped / Invidious • Non-music segments skipped via SponsorBlock
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function BoosterToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        "flex items-center gap-3 rounded-2xl px-4 py-3 transition border",
        enabled
          ? "border-basque/40 bg-basque/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      )}
    >
      <span
        className={clsx(
          "grid place-items-center h-10 w-10 rounded-xl transition",
          enabled ? "bg-basque text-black" : "bg-white/5 text-basque",
        )}
      >
        🎶
      </span>
      <span className="text-left">
        <span className="block text-sm font-bold">Basque & Local Booster</span>
        <span className="block text-xs text-textdim">
          {enabled ? "Heavily weighting regional tags" : "Tap to surface Euskal music"}
        </span>
      </span>
      <span
        className={clsx(
          "relative h-6 w-11 rounded-full transition shrink-0",
          enabled ? "bg-basque" : "bg-white/15",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
            enabled ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}
