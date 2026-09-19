"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { DetailToggle } from "@/components/detail-toggle";
import { usePlayer } from "@/lib/player-context";
import type { Track, Artist, Album, Playlist, Recommendation } from "@/lib/types";
import {
  Sparkles,
  Loader2,
  TrendingUp,
  Radio as RadioIcon,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  Clock,
  Flame,
  Disc3,
  Play,
  X,
  Music,
  Layers,
  History,
} from "lucide-react";
import { clsx } from "@/lib/utils";
import { useToast } from "@/lib/toast";

interface Catalog {
  trending: (Track & { liked?: boolean })[];
  basqueHighlights: (Track & { liked?: boolean })[];
  topArtists: (Artist & { followed?: boolean })[];
  newReleases: (Album & { saved?: boolean })[];
  basqueArtists: (Artist & { followed?: boolean })[];
}

export interface UnifiedHistoryItem {
  type: "album" | "playlist";
  id: string | number;
  item: Album | Playlist;
  playCount?: number;
  lastPlayed?: string;
}

export interface DailyMix {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  accentColor: string;
  genre: string;
  tracks: Track[];
}

export default function HomePage() {
  const router = useRouter();
  const p = usePlayer();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [reloadingSection, setReloadingSection] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState<{
    recent: (Track & { liked?: boolean })[];
    mostHeard: (Track & { liked?: boolean })[];
    playlistsAndAlbums: {
      recent: UnifiedHistoryItem[];
      mostHeard: UnifiedHistoryItem[];
    };
    albums: Album[];
    playlists: Playlist[];
  }>(() => {
    let recent: (Track & { liked?: boolean })[] = [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("euskalsoinua_recent_tracks");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) recent = parsed;
        }
      } catch (e) {}
    }
    return {
      recent,
      mostHeard: [],
      playlistsAndAlbums: { recent: [], mostHeard: [] },
      albums: [],
      playlists: [],
    };
  });
  const [historyCategory, setHistoryCategory] = useState<"tracks" | "playlists_albums">("tracks");
  const [historyTab, setHistoryTab] = useState<"recent" | "mostHeard">("recent");
  const [dailyMixes, setDailyMixes] = useState<DailyMix[]>([]);
  const [loadingDailyMixes, setLoadingDailyMixes] = useState(false);

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

  const reloadCatalogSection = useCallback((sectionKey: keyof Catalog, sectionName: string) => {
    setReloadingSection((prev) => ({ ...prev, [sectionKey]: true }));
    toast(`AI Agent is tailoring ${sectionName.toLowerCase()}…`, "🤖");
    const randomSeed = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    fetch(`/api/catalog?section=${sectionKey}&seed=${randomSeed}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.items) {
          setCatalog((prev) => (prev ? { ...prev, [sectionKey]: d.items } : null));
        }
      })
      .catch(() => {})
      .finally(() => {
        setReloadingSection((prev) => ({ ...prev, [sectionKey]: false }));
      });
  }, [toast]);

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
      .then((d) => {
        const fetchedTracks = d.tracks ?? [];
        setDiscover(fetchedTracks);
        if (typeof window !== "undefined" && fetchedTracks.length > 0) {
          try {
            sessionStorage.setItem("euskalsoinua_discover_cache", JSON.stringify(fetchedTracks));
          } catch (e) {}
        }
      })
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
    
    // Discover Now cache check: only load from API if no cached discovery tracks exist
    let cachedDiscover: any = null;
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("euskalsoinua_discover_cache");
        if (stored) cachedDiscover = JSON.parse(stored);
      } catch (e) {}
    }

    if (cachedDiscover && Array.isArray(cachedDiscover) && cachedDiscover.length > 0) {
      setDiscover(cachedDiscover);
    } else {
      loadDiscover();
    }

    loadRecs();
  }, [loadDiscover, loadRecs]);

  // Load history ("Go back to your music")
  const loadHistory = useCallback(() => {
    fetch("/api/user/history")
      .then((r) => r.json())
      .then((d) => {
        if (d) {
          setHistory((prev) => ({
            recent: d.recent && d.recent.length > 0 ? d.recent : prev.recent,
            mostHeard: d.mostHeard ?? prev.mostHeard,
            playlistsAndAlbums: d.playlistsAndAlbums ?? prev.playlistsAndAlbums,
            albums: d.albums ?? prev.albums,
            playlists: d.playlists ?? prev.playlists,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const loadDailyMixes = useCallback((showLoading = false) => {
    if (showLoading) setLoadingDailyMixes(true);
    fetch("/api/user/daily-mixes")
      .then((r) => r.json())
      .then((d) => {
        if (d.mixes) setDailyMixes(d.mixes);
      })
      .catch(() => {})
      .finally(() => {
        if (showLoading) setLoadingDailyMixes(false);
      });
  }, []);

  useEffect(() => {
    fetch("/api/user/daily-mixes")
      .then((r) => r.json())
      .then((d) => {
        if (d.mixes) setDailyMixes(d.mixes);
      })
      .catch(() => {});

    loadHistory();
    const onTrackPlayed = () => {
      try {
        const stored = localStorage.getItem("euskalsoinua_recent_tracks");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHistory((prev) => ({ ...prev, recent: parsed }));
          }
        }
      } catch (e) {}
      loadHistory();
      loadDailyMixes(false);
    };
    window.addEventListener("track-played", onTrackPlayed);
    return () => window.removeEventListener("track-played", onTrackPlayed);
  }, [loadHistory, loadDailyMixes]);

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
    };
    window.addEventListener("playlists-changed", handleChanged);
    return () => window.removeEventListener("playlists-changed", handleChanged);
  }, [loadRecs]);

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
    <div className="w-full px-2 sm:px-6 pt-4 sm:pt-6 max-w-[1600px] mx-auto">
      {/* hero */}
      <header className="mb-6 sm:mb-8 animate-fade-up flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="text-textdim text-xs sm:text-sm">{greeting}</p>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mt-0.5">
            Zer entzun <span className="text-accent">gaur?</span>
          </h1>
          <p className="text-textdim text-xs sm:text-sm mt-1 max-w-lg non-critical-detail">
            Ad-free streaming powered by open-source audio extraction. Your taste stays on this device.
          </p>
        </div>
        <div className="shrink-0 self-start sm:self-auto">
          <DetailToggle />
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
          <Section
            title="Trending now"
            subtitle="AI-tailored popular tracks based on your taste"
            onReload={() => reloadCatalogSection("trending", "Trending now")}
            reloading={reloadingSection["trending"]}
          >
            {catalog.trending.map((t) => (
              <SectionCard key={t.id}>
                <TrackCard track={t} />
              </SectionCard>
            ))}
          </Section>

          {/* Daily Mixes (Spotify-style) */}
          {dailyMixes.length > 0 && (
            <Section
              title="Daily Mix"
              subtitle="Personalized mixes based on your recent plays, taste profile & liked songs"
              action={
                <button
                  onClick={() => loadDailyMixes(true)}
                  title="Refresh Daily Mixes"
                  className="text-xs text-textdim hover:text-white flex items-center gap-1.5 transition px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer"
                >
                  <RotateCw size={12} className={clsx(loadingDailyMixes && "animate-spin")} />
                  <span>Update mixes</span>
                </button>
              }
            >
              {dailyMixes.map((mix) => (
                <SectionCard key={mix.id}>
                  <DailyMixCard
                    mix={mix}
                    onPlay={() => p.playQueue(mix.tracks, 0)}
                    onOpen={() => router.push(`/playlist/${mix.id}`)}
                  />
                </SectionCard>
              ))}
            </Section>
          )}

          {/* Go back to your music (Songs, Playlists & Albums) */}
          <Section
            title="Go back to your music"
            subtitle="Jump back into your recent tracks, albums & playlists"
            action={
              <div className="flex items-center gap-2 flex-wrap">
                {/* Category selector */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
                  <button
                    onClick={() => setHistoryCategory("tracks")}
                    className={clsx(
                      "text-xs px-3 py-1 rounded-full font-semibold transition cursor-pointer flex items-center gap-1.5",
                      historyCategory === "tracks"
                        ? "bg-accent text-black shadow-sm font-bold"
                        : "text-textdim hover:text-white"
                    )}
                  >
                    <Music size={12} />
                    <span>Songs</span>
                  </button>
                  <button
                    onClick={() => setHistoryCategory("playlists_albums")}
                    className={clsx(
                      "text-xs px-3 py-1 rounded-full font-semibold transition cursor-pointer flex items-center gap-1.5",
                      historyCategory === "playlists_albums"
                        ? "bg-accent text-black shadow-sm font-bold"
                        : "text-textdim hover:text-white"
                    )}
                  >
                    <Layers size={12} />
                    <span>Playlists & Albums</span>
                  </button>
                </div>

                {/* Sub-tab: Last heard vs Most heard (Available for BOTH Songs and Playlists & Albums!) */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
                  <button
                    onClick={() => setHistoryTab("recent")}
                    className={clsx(
                      "text-[11px] px-2.5 py-0.5 rounded-full font-medium transition cursor-pointer flex items-center gap-1",
                      historyTab === "recent"
                        ? "bg-white/20 text-white font-semibold"
                        : "text-textdim hover:text-white"
                    )}
                  >
                    <Clock size={11} />
                    <span>Last heard</span>
                  </button>
                  <button
                    onClick={() => setHistoryTab("mostHeard")}
                    className={clsx(
                      "text-[11px] px-2.5 py-0.5 rounded-full font-medium transition cursor-pointer flex items-center gap-1",
                      historyTab === "mostHeard"
                        ? "bg-white/20 text-white font-semibold"
                        : "text-textdim hover:text-white"
                    )}
                  >
                    <Flame size={11} />
                    <span>Most heard</span>
                  </button>
                </div>

                <Link
                  href="/taste/history"
                  className="text-xs text-accent hover:underline flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/10 hover:bg-accent/20 border border-accent/20 font-semibold transition"
                >
                  <History size={12} />
                  <span>Full History</span>
                </Link>
              </div>
            }
          >
            {historyCategory === "tracks" ? (
              (historyTab === "recent" ? history.recent : history.mostHeard).length > 0 ? (
                <>
                  {(historyTab === "recent" ? history.recent : history.mostHeard).slice(0, 10).map((t) => (
                    <SectionCard key={`goback-${historyTab}-${t.id}`}>
                      <TrackCard track={t} />
                    </SectionCard>
                  ))}
                  <SectionCard key="goback-view-all-tracks">
                    <Link
                      href="/taste/history"
                      className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-accent/40 transition group cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-2 group-hover:scale-110 transition">
                        <History size={18} />
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-accent transition">
                        View Entire History
                      </span>
                      <span className="text-[10px] text-textdim mt-1">
                        Up to 100 tracks &rarr;
                      </span>
                    </Link>
                  </SectionCard>
                </>
              ) : (
                <div className="w-full py-8 text-center text-xs text-textdim rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-1.5">
                  <Clock size={22} className="text-textfaint mb-1" />
                  <p className="font-semibold text-textdim">
                    {historyTab === "recent" ? "No recently played tracks yet" : "No play history recorded yet"}
                  </p>
                  <p className="text-[11px] text-textfaint max-w-sm">
                    {historyTab === "recent"
                      ? "Play any song across the catalog to build your personal recent listening history."
                      : "Your most-played tracks and heavy rotation will appear here as you listen to music."}
                  </p>
                </div>
              )
            ) : (
              (
                history.playlistsAndAlbums?.[historyTab]?.length > 0
                  ? history.playlistsAndAlbums[historyTab]
                  : [
                      ...history.albums.map((a) => ({
                        type: "album" as const,
                        id: a.id,
                        item: a,
                        playCount: 0,
                        lastPlayed: "",
                      })),
                      ...history.playlists.map((pl) => ({
                        type: "playlist" as const,
                        id: pl.id,
                        item: pl,
                        playCount: 0,
                        lastPlayed: "",
                      })),
                    ]
              ).length > 0 ? (
                <>
                  {(
                    history.playlistsAndAlbums?.[historyTab]?.length > 0
                      ? history.playlistsAndAlbums[historyTab]
                      : [
                          ...history.albums.map((a) => ({
                            type: "album" as const,
                            id: a.id,
                            item: a,
                            playCount: 0,
                            lastPlayed: "",
                          })),
                          ...history.playlists.map((pl) => ({
                            type: "playlist" as const,
                            id: pl.id,
                            item: pl,
                            playCount: 0,
                            lastPlayed: "",
                          })),
                        ]
                  ).slice(0, 10).map((entry) => (
                    <SectionCard key={`goback-${entry.type}-${entry.id}`}>
                      {entry.type === "album" ? (
                        <AlbumCard album={entry.item as Album} />
                      ) : (
                        <PlaylistCard playlist={entry.item as Playlist} />
                      )}
                    </SectionCard>
                  ))}
                  <SectionCard key="goback-view-all-collections">
                    <Link
                      href="/taste/history"
                      className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-accent/40 transition group cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-2 group-hover:scale-110 transition">
                        <History size={18} />
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-accent transition">
                        View Entire History
                      </span>
                      <span className="text-[10px] text-textdim mt-1">
                        Up to 100 items &rarr;
                      </span>
                    </Link>
                  </SectionCard>
                </>
              ) : (
                <div className="w-full py-8 text-center text-xs text-textdim rounded-xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-1.5">
                  <Layers size={22} className="text-textfaint mb-1" />
                  <p className="font-semibold text-textdim">
                    {historyTab === "recent"
                      ? "No playlists or albums heard recently"
                      : "No most-heard playlists or albums yet"}
                  </p>
                  <p className="text-[11px] text-textfaint max-w-sm">
                    Listen to your favorite albums or curated playlists to jump right back into them here.
                  </p>
                </div>
              )
            )}
          </Section>

          <Section
            title="Basque highlights"
            subtitle="AI-tailored Euskal musika — rock, folk, trikitia"
            action={<BasqueBadge />}
            onReload={() => reloadCatalogSection("basqueHighlights", "Basque highlights")}
            reloading={reloadingSection["basqueHighlights"]}
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
                <p className="text-textdim text-xs sm:text-sm mt-0.5 non-critical-detail">
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
                className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full transition disabled:opacity-50 cursor-pointer"
              >
                <RotateCw size={14} className={loadingRecs ? "animate-spin-slow" : ""} />
                <span className="hidden sm:inline">Reload</span>
              </button>
            </div>

            {taste.topGenres.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-4 non-critical-detail">
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
              <div className="rounded-xl bg-white/[0.02] p-1 sm:p-3 w-full">
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

          <section className="mb-8">
            <div className="flex items-end justify-between mb-3 px-1">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                  🤖 Discover Now <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-accent/20 text-accent">AI Agent</span>
                </h2>
                <p className="text-textdim text-xs sm:text-sm mt-0.5 non-critical-detail">
                  10 fresh recommendations (published &lt; 5 years) curated by Gemini AI based on your Swipes, Liked Songs, Albums, Synced Playlists &amp; Artists
                </p>
              </div>
              <button
                onClick={() => {
                  toast("Gemini AI is curating 10 new recommendations…", "🤖");
                  loadDiscover(true);
                }}
                disabled={loadingDiscover}
                title="Reload 10 new AI recommendations"
                className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full transition disabled:opacity-50 cursor-pointer shrink-0"
              >
                <RotateCw size={14} className={loadingDiscover ? "animate-spin-slow" : ""} />
                <span className="hidden sm:inline">Reload</span>
              </button>
            </div>
            {loadingDiscover && discover.length === 0 ? (
              <div className="py-12 grid place-items-center text-textdim rounded-xl bg-white/[0.02]">
                <div className="flex items-center gap-2 text-xs text-accent">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Gemini AI Agent is analyzing your taste signals…</span>
                </div>
              </div>
            ) : discover.length > 0 ? (
              <div className="rounded-xl bg-white/[0.02] p-1 sm:p-3 w-full">
                {discover.slice(0, 10).map((t, i) => (
                  <TrackRow
                    key={`${t.id}-disc-${i}`}
                    track={{ ...t, liked: false }}
                    index={i}
                    queue={discover.slice(0, 10)}
                    showAlbum
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-textdim rounded-xl bg-white/[0.02]">
                No discovery recommendations found at the moment. Click Reload to generate new recommendations.
              </div>
            )}
          </section>

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

          <Section
            title="Top artists"
            subtitle="AI-tailored favorite & recommended artists"
            onReload={() => reloadCatalogSection("topArtists", "Top artists")}
            reloading={reloadingSection["topArtists"]}
          >
            {catalog.topArtists.map((a) => (
              <SectionCard key={a.id}>
                <ArtistCard artist={a} />
              </SectionCard>
            ))}
          </Section>

          <Section
            title="Basque artists"
            subtitle="AI-tailored Euskal Herria regional talent"
            onReload={() => reloadCatalogSection("basqueArtists", "Basque artists")}
            reloading={reloadingSection["basqueArtists"]}
          >
            {catalog.basqueArtists.map((a) => (
              <SectionCard key={a.id}>
                <ArtistCard artist={a} />
              </SectionCard>
            ))}
          </Section>

          <Section
            title="New & notable albums"
            subtitle="AI-tailored recent album releases"
            onReload={() => reloadCatalogSection("newReleases", "New & notable albums")}
            reloading={reloadingSection["newReleases"]}
          >
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

function DailyMixCard({
  mix,
  onPlay,
  onOpen,
}: {
  mix: DailyMix;
  onPlay: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className="group relative flex flex-col justify-between rounded-2xl bg-panel hover:bg-panel-hover p-4 transition-all duration-300 border border-white/5 hover:border-white/10 cursor-pointer shadow-lg hover:shadow-2xl overflow-hidden"
    >
      {/* Cover / Multi-stop banner */}
      <div
        className={clsx(
          "relative aspect-square w-full rounded-xl mb-4 overflow-hidden flex flex-col justify-between p-4 bg-gradient-to-br shadow-inner",
          mix.accentColor
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md bg-black/40 backdrop-blur-md text-white/90 border border-white/10">
            Daily Mix
          </span>
          <Disc3 size={22} className="text-white/40 group-hover:rotate-45 transition-transform duration-700" />
        </div>

        <div>
          <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest block">
            {mix.genre}
          </span>
          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none mt-1">
            {mix.title}
          </h3>
        </div>

        {/* Floating Quick Play Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
          title={`Play ${mix.title}`}
          className="absolute right-3 bottom-3 h-11 w-11 rounded-full bg-accent text-black flex items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 hover:scale-105 cursor-pointer z-10"
        >
          <Play size={18} fill="currentColor" className="ml-0.5" />
        </button>
      </div>

      {/* Info Footer */}
      <div>
        <div className="font-bold text-base text-white truncate group-hover:text-accent transition-colors">
          {mix.title}
        </div>
        <p className="text-xs text-textdim line-clamp-2 mt-1 leading-relaxed">
          {mix.subtitle}
        </p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-textfaint">
          <span>{mix.tracks.length} tracks</span>
          <span className="text-accent font-semibold flex items-center gap-1 group-hover:underline">
            View mix
          </span>
        </div>
      </div>
    </div>
  );
}
