"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { DownloadAllButton } from "@/components/download-button";
import { Trash2, RotateCw } from "lucide-react";
import type { Track, Playlist } from "@/lib/types";
import { useToast } from "@/lib/toast";

interface Data {
  playlist: Playlist;
  tracks: (Track & { liked?: boolean })[];
}

export default function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { toast } = useToast();
  const [id, setId] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [syncing, setSyncing] = useState(false);
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

  const syncPlaylist = async () => {
    if (!id || syncing) return;
    setSyncing(true);
    toast("Syncing playlist with origin platform…", "🔄");
    try {
      const res = await fetch(`/api/playlists/${id}/sync`, { method: "POST" });
      const resData = await res.json();
      if (res.ok && resData.success) {
        await load(id);
        window.dispatchEvent(new Event("playlists-changed"));
        toast(`Playlist synced successfully! Loaded ${resData.addedCount} tracks.`, "✅");
      } else {
        toast(resData.error || "Failed to sync playlist", "❌");
      }
    } catch (err) {
      toast("Error syncing playlist", "❌");
    } finally {
      setSyncing(false);
    }
  };

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
  const isSyncedPlaylist =
    playlist.description?.toLowerCase().includes("synced") ||
    playlist.description?.toLowerCase().includes("spotify.com") ||
    playlist.description?.toLowerCase().includes("playlist");

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
            {isSyncedPlaylist && (
              <button
                onClick={syncPlaylist}
                disabled={syncing}
                className="flex items-center gap-1.5 h-11 px-5 rounded-full bg-accent hover:bg-accent/80 text-black font-extrabold text-xs transition disabled:opacity-50 cursor-pointer"
                title="Sync playlist with origin platform"
              >
                <RotateCw size={14} className={syncing ? "animate-spin" : ""} />
                <span>{syncing ? "Syncing…" : "Sync now"}</span>
              </button>
            )}
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
