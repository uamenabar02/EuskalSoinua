"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { DownloadAllButton } from "@/components/download-button";
import { Trash2 } from "lucide-react";
import type { Track, Playlist } from "@/lib/types";

interface Data {
  playlist: Playlist;
  tracks: (Track & { liked?: boolean })[];
}

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    params.then((p) => setId(Number(p.id)));
  }, [params]);

  const load = (pid: number) =>
    fetch(`/api/playlists/${pid}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setData)
      .catch(() => setError(true));

  useEffect(() => {
    if (id == null) return;
    load(id);
  }, [id]);

  const removePlaylist = async () => {
    if (!data) return;
    if (!window.confirm(`Delete playlist “${data.playlist.name}”?`)) return;
    await fetch(`/api/playlists/${id}`, { method: "DELETE" });
    window.dispatchEvent(new Event("playlists-changed"));
    router.push("/library");
  };

  if (error)
    return <div className="grid place-items-center py-32 text-textdim text-sm">Playlist not found.</div>;
  if (!data) return <CenterLoader />;

  const { playlist, tracks } = data;

  return (
    <div>
      <DetailHeader
        seed={playlist.coverSeed ?? playlist.name}
        coverLabel={playlist.name}
        meta={<span className="text-sm font-semibold text-textdim">Playlist</span>}
        title={playlist.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 justify-center sm:justify-start">
            <span>{tracks.length} song{tracks.length === 1 ? "" : "s"}</span>
            {playlist.description ? (
              <>
                <span>•</span>
                <span>{playlist.description}</span>
              </>
            ) : null}
          </span>
        }
        actions={
          <>
            <PlayAllButton tracks={tracks} />
            <DownloadAllButton tracks={tracks} />
            <button
              onClick={removePlaylist}
              className="grid place-items-center h-11 w-11 rounded-full bg-white/10 hover:bg-red-500/20 text-textdim hover:text-red-400 transition"
              aria-label="delete playlist"
            >
              <Trash2 size={18} />
            </button>
          </>
        }
      />

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        {tracks.length ? (
          <TrackList tracks={tracks} showAlbum />
        ) : (
          <div className="text-center py-20 text-textdim">
            This playlist is empty.
            <div className="text-xs mt-1">
              Add songs with the “⋯” menu on any track.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
