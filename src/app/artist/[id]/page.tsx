"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { ToggleButton } from "@/components/like-button";
import { AlbumCard, BasqueBadge } from "@/components/cards";
import { CoverArt } from "@/components/cover";
import { Section, SectionCard } from "@/components/sections";
import type { Track, Artist, Album } from "@/lib/types";

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
  const singles: (Track & { liked?: boolean })[] = [];
  for (const t of tracks) {
    const name = t.albumName?.trim();
    if (!name || !t.albumId) {
      singles.push(t);
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
    g.tracks.push(t);
  }
  // sort albums by track count desc then name
  const albums = [...map.values()].sort((a, b) => b.tracks.length - a.tracks.length || a.name.localeCompare(b.name));
  return { albums, singles };
}

export default function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    params.then((p) => setId(Number(p.id)));
  }, [params]);

  useEffect(() => {
    if (id == null) return;
    fetch(`/api/artist/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, [id]);

  // Pull the full discography (all songs from iTunes/Deezer) so every track by
  // this artist is available, then refresh.
  const loadFullDiscography = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      await fetch(`/api/discography?artist=${encodeURIComponent(data.artist.name)}`);
      const fresh = await fetch(`/api/artist/${id}`).then((r) => r.json());
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
    return <div className="grid place-items-center py-32 text-textdim text-sm">Artist not found.</div>;
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
            <span className="text-sm font-semibold text-textdim">Artist</span>
            {isBasque ? <BasqueBadge /> : null}
          </span>
        }
        title={artist.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 justify-center sm:justify-start">
            <span>{artist.monthlyListeners.toLocaleString()} monthly listeners</span>
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
        <div className="flex items-center justify-end mb-4">
          <button
            onClick={loadFullDiscography}
            disabled={loadingMore}
            className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full transition disabled:opacity-50"
          >
            {loadingMore ? "Loading all songs…" : "Load full catalog"}
          </button>
        </div>

        {artist.bio ? (
          <p className="text-textdim text-sm mb-6 max-w-2xl">{artist.bio}</p>
        ) : null}

        {tracks.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-textdim text-sm mb-3">No tracks cached for this artist yet.</p>
            <button
              onClick={loadFullDiscography}
              disabled={loadingMore}
              className="bg-accent text-black font-semibold text-sm px-4 py-2 rounded-full hover:scale-105 transition disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Find their songs online"}
            </button>
          </div>
        ) : (
          <>
            {/* Popular */}
            {popular.length ? (
              <section className="mb-10">
                <h2 className="text-lg sm:text-xl font-bold mb-3">Popular</h2>
                <TrackList tracks={popular} showAlbum={false} />
              </section>
            ) : null}

            {/* Discography grid */}
            {albums.length ? (
              <Section title="Albums" subtitle="Tap an album to open it">
                {albums.map((a) => (
                  <SectionCard key={a.id}>
                    <AlbumCard album={a} />
                  </SectionCard>
                ))}
              </Section>
            ) : null}

            {/* Songs grouped by album */}
            <section className="mt-4">
              <h2 className="text-lg sm:text-xl font-bold mb-4">Songs by album</h2>
              {grouped.albums.map((g) => (
                <div key={g.key} className="mb-8">
                  <Link
                    href={`/album/${g.albumId}`}
                    className="flex items-center gap-4 mb-2 group"
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
                        Album · {g.tracks.length} song{g.tracks.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <PlayAllButton tracks={g.tracks} size="sm" />
                  </Link>
                  <TrackList tracks={g.tracks} showAlbum={false} />
                </div>
              ))}

              {/* Singles / tracks without an album */}
              {grouped.singles.length ? (
                <div className="mb-8">
                  <h3 className="font-bold text-base mb-2">Singles & other releases</h3>
                  <TrackList tracks={grouped.singles} showAlbum={false} />
                </div>
              ) : null}
            </section>

            {/* Play everything */}
            <section className="mt-8 rounded-2xl bg-gradient-to-br from-white/[0.06] to-transparent p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold">All songs</h2>
                  <p className="text-xs text-textdim">
                    {tracks.length} track{tracks.length === 1 ? "" : "s"} · play the full catalog
                  </p>
                </div>
                <PlayAllButton tracks={tracks} />
              </div>
              <div className="mt-3">
                <TrackList tracks={tracks} showAlbum />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
