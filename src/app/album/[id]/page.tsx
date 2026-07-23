"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { ToggleButton } from "@/components/like-button";
import { DownloadAllButton } from "@/components/download-button";
import type { Track, Album } from "@/lib/types";

interface Data {
  album: Album & { saved?: boolean };
  tracks: (Track & { liked?: boolean })[];
}

export default function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    params.then((p) => setId(Number(p.id)));
  }, [params]);

  const load = (aid: number) => {
    fetch(`/api/album/${aid}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((resData) => {
        setData(resData);
        try {
          localStorage.setItem(`euskalsoinua-album-cache-${aid}`, JSON.stringify(resData));
        } catch (e) {}
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem(`euskalsoinua-album-cache-${aid}`);
          if (cached) {
            setData(JSON.parse(cached));
            setError(false);
          } else {
            setError(true);
          }
        } catch (e) {
          setError(true);
        }
      });
  };

  useEffect(() => {
    if (id == null) return;
    load(id);
  }, [id]);

  if (error)
    return <div className="grid place-items-center py-32 text-textdim text-sm">Album not found.</div>;
  if (!data) return <CenterLoader />;

  const { album, tracks } = data;

  return (
    <div>
      <DetailHeader
        seed={`${album.title}-${album.artistName}`}
        coverLabel={album.title}
        meta={<span className="text-sm font-semibold text-textdim">Album</span>}
        title={album.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 justify-center sm:justify-start">
            {album.artistId ? (
              <Link href={`/artist/${album.artistId}`} className="font-semibold hover:underline">
                {album.artistName}
              </Link>
            ) : (
              <span>{album.artistName}</span>
            )}
            <span>• {album.year ?? ""}</span>
            <span>• {tracks.length} songs</span>
          </span>
        }
        actions={
          <>
            <PlayAllButton tracks={tracks} />
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
          <div className="text-center py-20 text-textdim">No tracks in this album.</div>
        )}
      </div>
    </div>
  );
}
