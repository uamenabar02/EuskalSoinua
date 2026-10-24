"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { ToggleButton } from "@/components/like-button";
import { AlbumCard, BasqueBadge } from "@/components/cards";
import { CoverArt } from "@/components/cover";
import { Section, SectionCard } from "@/components/sections";
import type { Track, Artist, Album } from "@/lib/types";
import { Radio, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { ArtistAuditModal } from "@/components/artist-audit-modal";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import { useTranslation } from "@/lib/i18n";

interface Data {
  artist: Artist & { followed?: boolean };
  tracks: (Track & { liked?: boolean })[];
  albums: (Album & { saved?: boolean })[];
}

interface AlbumGroup {
  key: string;
  name: string;
  albumId: number | null;
  year: number | null;
  cover: string | null;
  tracks: (Track & { liked?: boolean })[];
}

function groupByAlbum(tracks: (Track & { liked?: boolean })[]): {
  albums: AlbumGroup[];
  singles: (Track & { liked?: boolean })[];
} {
  const map = new Map<string, AlbumGroup>();
  const singlesMap = new Map<string, Track & { liked?: boolean }>();
  for (const t of tracks) {
    const name = t.albumName?.trim();
    const trackKey = t.title.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, "").trim() || t.id.toString();
    if (!name || !t.albumId) {
      if (!singlesMap.has(trackKey)) {
        singlesMap.set(trackKey, t);
      }
      continue;
    }
    let g = map.get(name);
    if (!g) {
      g = {
        key: name,
        name,
        albumId: t.albumId,
        year: null,
        cover: t.artworkUrl ?? null,
        tracks: [],
      };
      map.set(name, g);
    }
    if (!g.tracks.some(existing => (existing.title.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, "").trim() || existing.id.toString()) === trackKey)) {
      g.tracks.push(t);
    }
  }
  // sort albums by track count desc then name
  const albums = [...map.values()].sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name));
  return { albums, singles: Array.from(singlesMap.values()) };
}

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const p = usePlayer();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [artistParam, setArtistParam] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingRadio, setLoadingRadio] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [confirmItem, setConfirmItem] = useState<{ type: "album" | "track"; id?: number; title: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleRequestTrackRemove = (track: Track) => {
    setConfirmItem({
      type: "track",
      id: track.id,
      title: track.title,
    });
  };

  const handleRequestAlbumRemove = (albumId: number | null, albumName: string) => {
    setConfirmItem({
      type: "album",
      id: albumId ?? undefined,
      title: albumName,
    });
  };

  const handleConfirmRemove = async () => {
    if (!confirmItem || !data?.artist) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/artist/${encodeURIComponent(data.artist.id ?? artistParam ?? data.artist.name)}/exclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: confirmItem.type,
          title: confirmItem.title,
          itemId: confirmItem.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to remove item");
      }

      toast(
        confirmItem.type === "album"
          ? t("artist.albumRemovedToast", { title: confirmItem.title })
          : t("artist.trackRemovedToast", { title: confirmItem.title }),
        "🗑️",
      );

      // Optimistically prune from state
      setData((prev) => {
        if (!prev) return prev;
        if (confirmItem.type === "track") {
          return {
            ...prev,
            tracks: prev.tracks.filter(
              (t) => t.id !== confirmItem.id && t.title.toLowerCase().trim() !== confirmItem.title.toLowerCase().trim(),
            ),
          };
        } else {
          return {
            ...prev,
            albums: prev.albums.filter(
              (a) => a.id !== confirmItem.id && a.title.toLowerCase().trim() !== confirmItem.title.toLowerCase().trim(),
            ),
            tracks: prev.tracks.filter(
              (t) => t.albumId !== confirmItem.id && t.albumName?.toLowerCase().trim() !== confirmItem.title.toLowerCase().trim(),
            ),
          };
        }
      });
      setConfirmItem(null);
    } catch (err: any) {
      toast(err.message || "Failed to remove item", "⚠️");
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => {
    params.then((p) => setArtistParam(p.id));
  }, [params]);

  useEffect(() => {
    if (!artistParam) return;
    fetch(`/api/artist/${encodeURIComponent(artistParam)}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((initialData) => {
        setData(initialData);
        // Automatically pull catalog from online sources only if zero tracks are cached yet
        if (initialData?.artist?.name && initialData.tracks.length === 0) {
          fetch(`/api/discography?artist=${encodeURIComponent(initialData.artist.name)}`)
            .then(() => fetch(`/api/artist/${encodeURIComponent(initialData.artist.id ?? artistParam)}`))
            .then((r) => r.json())
            .then(setData)
            .catch(() => {});
        }
      })
      .catch(() => setError(true));
  }, [artistParam]);

  // Pull the full discography (all songs from iTunes/Deezer) so every track by
  // this artist is available, then refresh.
  const loadFullDiscography = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      await fetch(`/api/discography?artist=${encodeURIComponent(data.artist.name)}`);
      const targetId = data.artist.id ?? artistParam;
      const fresh = await fetch(`/api/artist/${encodeURIComponent(targetId)}`).then((r) => r.json());
      setData(fresh);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  const { artist, tracks, albums } = data ?? {
    artist: null,
    tracks: [],
    albums: [],
  };

  const grouped = useMemo(() => groupByAlbum(tracks), [tracks]);
  // popular = sorted by playCount, top 5
  const popular = useMemo(
    () => [...tracks].sort((a, b) => b.playCount - a.playCount).slice(0, 5),
    [tracks],
  );

  if (error)
    return <div className="grid place-items-center py-32 text-textdim text-sm">{t("artist.notFound")}</div>;
  if (!data || !artist) return <CenterLoader />;

  const isBasque = artist.region === "eu";

  return (
    <div>
      <DetailHeader
        seed={artist.name}
        coverLabel={artist.name}
        coverShape="rounded-full"
        meta={
          <span className="flex items-center gap-2 justify-center sm:justify-start">
            <span className="text-sm font-semibold text-textdim">{t("common.artist")}</span>
            {isBasque ? <BasqueBadge /> : null}
          </span>
        }
        title={artist.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 justify-center sm:justify-start">
            <span>{t("home.monthlyListeners", { count: artist.monthlyListeners.toLocaleString() })}</span>
            {artist.genre ? (
              <>
                <span>•</span>
                <span>{artist.genre}</span>
              </>
            ) : null}
          </span>
        }
        actions={
          <>
            <PlayAllButton tracks={tracks} />
            <button
              onClick={async () => {
                if (loadingRadio) return;
                setLoadingRadio(true);
                toast(`Building ${artist.name} Radio…`, "📻");
                const playlistId = await p.playRadio({
                  artistId: artist.id,
                  artistName: artist.name,
                });
                setLoadingRadio(false);
                if (playlistId) {
                  toast("Artist Radio playlist ready!", "✅");
                  router.push(`/playlist/${playlistId}`);
                }
              }}
              disabled={loadingRadio}
              title={`Start ${artist.name} Radio`}
              className="flex items-center gap-1.5 h-11 px-4 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {loadingRadio ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} className="text-accent" />}
              <span>{t("artist.artistRadio")}</span>
            </button>
            <button
              onClick={() => setShowAuditModal(true)}
              title={t("artist.checkDiscography")}
              className="flex items-center gap-1.5 h-11 px-4 rounded-full bg-accent/15 hover:bg-accent/25 border border-accent/30 text-white font-semibold text-xs transition cursor-pointer"
            >
              <ShieldCheck size={16} className="text-accent" />
              <span>{t("artist.checkDiscography")}</span>
            </button>
            <ToggleButton
              endpoint="follow"
              id={artist.id}
              initial={artist.followed ?? false}
              className="h-11 w-11 bg-white/10 hover:bg-white/20"
              size={20}
              field="artistId"
            />
          </>
        }
      />

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        <div className="flex items-center justify-end gap-2 mb-4">
          <button
            onClick={() => setShowAuditModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-accent/20 hover:bg-accent/30 border border-accent/40 px-3 py-1.5 rounded-full transition cursor-pointer"
          >
            <ShieldCheck size={13} className="text-accent" />
            <span>{t("artist.checkDiscography")}</span>
          </button>
          <button
            onClick={loadFullDiscography}
            disabled={loadingMore}
            className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full transition disabled:opacity-50"
          >
            {loadingMore ? t("artist.loadingAllSongs") : t("artist.loadFullCatalog")}
          </button>
        </div>

        {artist.bio ? (
          <p className="text-textdim text-sm mb-6 max-w-2xl">{artist.bio}</p>
        ) : null}

        {tracks.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-textdim text-sm mb-3">{t("artist.noTracksCached")}</p>
            <button
              onClick={loadFullDiscography}
              disabled={loadingMore}
              className="bg-accent text-black font-semibold text-sm px-4 py-2 rounded-full hover:scale-105 transition disabled:opacity-50"
            >
              {loadingMore ? t("common.loading") : t("artist.findSongsOnline")}
            </button>
          </div>
        ) : (
          <>
            {/* Popular */}
            {popular.length ? (
              <section className="mb-10">
                <h2 className="text-lg sm:text-xl font-bold mb-3">{t("artist.popular")}</h2>
                <TrackList tracks={popular} showAlbum={false} onRemove={handleRequestTrackRemove} />
              </section>
            ) : null}

            {/* Discography grid */}
            {albums.length ? (
              <Section title={t("search.albums")} subtitle={t("artist.tapAlbumToOpen")}>
                {albums.map((a) => (
                  <SectionCard key={a.id}>
                    <AlbumCard album={a} />
                  </SectionCard>
                ))}
              </Section>
            ) : null}

            {/* Songs grouped by album */}
            <section className="mt-4">
              <h2 className="text-lg sm:text-xl font-bold mb-4">{t("artist.songsByAlbum")}</h2>
              {grouped.albums.map((g) => (
                <div key={g.key} className="mb-8">
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <Link
                      href={`/album/${g.albumId}`}
                      className="flex items-center gap-4 group min-w-0 flex-1"
                    >
                      <CoverArt
                        seed={`${g.name}-${artist.name}`}
                        artwork={g.cover}
                        label={g.name}
                        rounded="rounded-lg"
                        className="h-16 w-16 sm:h-20 sm:w-20 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-base sm:text-lg group-hover:underline truncate">
                          {g.name}
                        </div>
                        <div className="text-xs text-textdim">
                          {t("common.album")} · {g.tracks.length} {g.tracks.length === 1 ? t("common.songSingular") : t("common.songs")}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <PlayAllButton tracks={g.tracks} size="sm" />
                      <button
                        type="button"
                        onClick={() => handleRequestAlbumRemove(g.albumId, g.name)}
                        title={t("artist.removeAlbum")}
                        aria-label={t("artist.removeAlbum")}
                        className="h-8 w-8 rounded-full grid place-items-center text-textdim hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <TrackList tracks={g.tracks} showAlbum={false} onRemove={handleRequestTrackRemove} />
                </div>
              ))}

              {/* Singles / tracks without an album */}
              {grouped.singles.length ? (
                <div className="mb-8">
                  <h3 className="font-bold text-base mb-2">{t("artist.singlesAndOther")}</h3>
                  <TrackList tracks={grouped.singles} showAlbum={false} onRemove={handleRequestTrackRemove} />
                </div>
              ) : null}
            </section>

            {/* Play everything */}
            <section className="mt-8 rounded-2xl bg-gradient-to-br from-white/[0.06] to-transparent p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold">{t("artist.allSongs")}</h2>
                  <p className="text-xs text-textdim">
                    {tracks.length} {tracks.length === 1 ? t("common.songSingular") : t("common.songs")}
                  </p>
                </div>
                <PlayAllButton tracks={tracks} />
              </div>
              <div className="mt-3">
                <TrackList tracks={tracks} showAlbum onRemove={handleRequestTrackRemove} />
              </div>
            </section>
          </>
        )}
      </div>

      {/* Direct Removal & Blacklist Confirmation Modal */}
      {confirmItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !removing && setConfirmItem(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#12131a] border border-white/10 shadow-2xl p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 text-red-400 grid place-items-center shrink-0 mt-0.5">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {t("artist.confirmRemoveTitle")}
                </h3>
                <p className="text-xs sm:text-sm text-textdim mt-1.5 leading-relaxed">
                  {confirmItem.type === "album"
                    ? t("artist.confirmRemoveAlbumDesc", {
                        title: confirmItem.title,
                        artist: artist.name,
                      })
                    : t("artist.confirmRemoveTrackDesc", {
                        title: confirmItem.title,
                        artist: artist.name,
                      })}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmItem(null)}
                disabled={removing}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={removing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition cursor-pointer disabled:opacity-50"
              >
                {removing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{t("common.loading")}</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>{t("artist.removeAndBlacklist")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuditModal && artist && (
        <ArtistAuditModal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          artistId={artist.id}
          artistName={artist.name}
          onApplied={() => {
            const targetId = artist.id ?? artistParam;
            fetch(`/api/artist/${encodeURIComponent(targetId)}`)
              .then((r) => r.json())
              .then(setData)
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
