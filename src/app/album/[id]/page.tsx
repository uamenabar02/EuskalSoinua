"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { ToggleButton } from "@/components/like-button";
import { DownloadAllButton } from "@/components/download-button";
import { ArtistLinks } from "@/components/artist-links";
import type { Track, Album } from "@/lib/types";
import { listDownloads, normalizeTrackString } from "@/lib/downloads";
import { ArrowLeft, Radio, Loader2 } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import { useTranslation } from "@/lib/i18n";

interface Data {
  album: Album & { saved?: boolean };
  tracks: (Track & { liked?: boolean })[];
}

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const p = usePlayer();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [loadingRadio, setLoadingRadio] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAlbum() {
      const resolvedParams = await params;
      const rawId = resolvedParams.id;
      if (!rawId) return;

      const decoded = decodeURIComponent(rawId).trim();
      const numId = Number(rawId);
      const isNumeric = !isNaN(numId) && numId > 0;

      // 1. Try local storage cache first for instant 0ms offline rendering
      try {
        const cacheKeys = [
          isNumeric ? `euskalsoinua-album-cache-${numId}` : null,
          `euskalsoinua-album-cache-${encodeURIComponent(decoded)}`,
          `euskalsoinua-album-cache-${decoded}`,
        ].filter(Boolean) as string[];

        for (const k of cacheKeys) {
          const cached = localStorage.getItem(k);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.album && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
              if (!cancelled) {
                setData(parsed);
                setError(false);
              }
              // If online and numeric, keep updating in background
              if (isNumeric && typeof navigator !== "undefined" && navigator.onLine) {
                fetch(`/api/album/${numId}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((resData) => {
                    if (resData && !cancelled) {
                      setData(resData);
                      localStorage.setItem(`euskalsoinua-album-cache-${numId}`, JSON.stringify(resData));
                    }
                  })
                  .catch(() => {});
              }
              return;
            }
          }
        }
      } catch (e) {}

      // 2. If online and numeric, try network fetch
      if (isNumeric) {
        try {
          const r = await fetch(`/api/album/${numId}`);
          if (r.ok) {
            const resData = await r.json();
            if (!cancelled) {
              setData(resData);
              setError(false);
            }
            try {
              localStorage.setItem(`euskalsoinua-album-cache-${numId}`, JSON.stringify(resData));
              if (resData.album?.title) {
                localStorage.setItem(`euskalsoinua-album-cache-${encodeURIComponent(resData.album.title)}`, JSON.stringify(resData));
              }
            } catch (e) {}
            return;
          }
        } catch (e) {
          // Network fetch failed (offline) -> fall through to IndexedDB reconstruction
        }
      }

      // 3. Fallback: Reconstruct directly from IndexedDB downloads
      try {
        const dl = await listDownloads();
        const normDecoded = normalizeTrackString(decoded);

        const albumTracks = dl.filter((d) => {
          if (isNumeric && d.albumId === numId) return true;
          if (d.albumName) {
            const normAlbum = normalizeTrackString(d.albumName);
            if (normAlbum === normDecoded || normAlbum.includes(normDecoded) || normDecoded.includes(normAlbum)) {
              return true;
            }
          }
          return false;
        });

        if (albumTracks.length > 0) {
          const sample = albumTracks[0];
          if (!cancelled) {
            setData({
              album: {
                id: isNumeric ? numId : 0,
                externalId: null,
                source: "local",
                title: sample.albumName || decoded || "Downloaded Album",
                artistId: null,
                artistName: sample.artist,
                thumbnail: sample.artworkUrl ?? null,
                year: null,
                genre: "Basque",
                region: "eu",
                trackCount: albumTracks.length,
                saved: true,
              },
              tracks: albumTracks.map((i) => ({
                id: i.trackId,
                externalId: null,
                source: "local",
                title: i.title,
                artistId: null,
                artistName: i.artist,
                albumId: isNumeric ? numId : 0,
                albumName: sample.albumName ?? null,
                duration: i.duration,
                thumbnail: null,
                genre: null,
                region: "eu",
                language: "eu",
                demoAudio: null,
                isrc: null,
                previewUrl: null,
                previewUrlAlt: null,
                artworkUrl: i.artworkUrl ?? null,
                playCount: 0,
                liked: false,
              })),
            });
            setError(false);
          }
          return;
        }
      } catch (e) {}

      if (!cancelled) {
        setError(true);
      }
    }

    fetchAlbum();

    return () => {
      cancelled = true;
    };
  }, [params]);

  if (error)
    return (
      <div className="grid place-items-center py-32 text-textdim text-sm text-center px-4">
        <p className="mb-4">{t("album.notFound")}</p>
        <Link
          href="/library/downloaded"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-black font-semibold text-xs hover:scale-105 transition"
        >
          <ArrowLeft size={14} />
          <span>{t("album.backToDownloads")}</span>
        </Link>
      </div>
    );
  if (!data) return <CenterLoader />;

  const { album, tracks } = data;

  return (
    <div>
      <DetailHeader
        seed={`${album.title}-${album.artistName}`}
        coverLabel={album.title}
        artwork={album.thumbnail}
        meta={<span className="text-sm font-semibold text-textdim">{t("common.album")}</span>}
        title={album.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 justify-center sm:justify-start">
            <ArtistLinks artistName={album.artistName || ""} primaryArtistId={album.artistId} className="font-semibold hover:underline" />
            {album.year ? <span>• {album.year}</span> : null}
            <span>• {tracks.length} {tracks.length === 1 ? t("common.songSingular") : t("common.songs")}</span>
          </span>
        }
        actions={
          <>
            <PlayAllButton tracks={tracks} />
            <button
              onClick={async () => {
                if (loadingRadio || !album.id) return;
                setLoadingRadio(true);
                toast(`Building ${album.title} Radio…`, "📻");
                const playlistId = await p.playRadio({
                  albumId: album.id,
                });
                setLoadingRadio(false);
                if (playlistId) {
                  toast("Album Radio playlist ready!", "✅");
                  router.push(`/playlist/${playlistId}`);
                }
              }}
              disabled={loadingRadio || !album.id}
              title={`Start ${album.title} Radio`}
              className="flex items-center gap-1.5 h-11 px-4 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition disabled:opacity-50 cursor-pointer"
            >
              {loadingRadio ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} className="text-accent" />}
              <span>{t("album.albumRadio")}</span>
            </button>
            <DownloadAllButton tracks={tracks} />
            <ToggleButton
              endpoint="album-save"
              id={album.id}
              initial={album.saved ?? false}
              className="h-11 w-11 bg-white/10 hover:bg-white/20"
              size={20}
              field="albumId"
            />
          </>
        }
      />

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        {tracks.length ? (
          <TrackList tracks={tracks} showAlbum={false} />
        ) : (
          <div className="text-center py-20 text-textdim">{t("album.noTracks")}</div>
        )}
      </div>
    </div>
  );
}
