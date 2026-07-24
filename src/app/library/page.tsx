"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Heart, Loader2, UserRound, Disc3, Download, Sparkles } from "lucide-react";
import { PlaylistCard, ArtistCard, AlbumCard } from "@/components/cards";
import { Section, SectionCard } from "@/components/sections";
import type { Track, Artist, Album, Playlist } from "@/lib/types";
import ImportPlaylistModal from "@/components/import-playlist-modal";

import { SocialRoom } from "@/components/social-room";
import { ImportExportManager } from "@/components/import-export";
import { AiPlaylistGenerator } from "@/components/ai-playlist-generator";

interface Lib {
  liked: (Track & { liked?: boolean })[];
  playlists: Playlist[];
  followed: (Artist & { followed?: boolean })[];
  albums: (Album & { saved?: boolean })[];
}

export default function LibraryPage() {
  const [lib, setLib] = useState<Lib | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [showAiCurator, setShowAiCurator] = useState(true);

  const load = () =>
    fetch("/api/library")
      .then((r) => {
        if (!r.ok) throw new Error("Network response was not ok");
        return r.json();
      })
      .then((data) => {
        if (!data || data.error || !Array.isArray(data.liked)) {
          throw new Error("Invalid or offline response");
        }
        const safeData: Lib = {
          liked: Array.isArray(data.liked) ? data.liked : [],
          playlists: Array.isArray(data.playlists) ? data.playlists : [],
          followed: Array.isArray(data.followed) ? data.followed : [],
          albums: Array.isArray(data.albums) ? data.albums : [],
        };
        setLib(safeData);
        try {
          localStorage.setItem("euskalsoinua-library-cache", JSON.stringify(safeData));
        } catch (e) {}
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem("euskalsoinua-library-cache");
          if (cached) {
            const parsed = JSON.parse(cached);
            setLib({
              liked: Array.isArray(parsed?.liked) ? parsed.liked : [],
              playlists: Array.isArray(parsed?.playlists) ? parsed.playlists : [],
              followed: Array.isArray(parsed?.followed) ? parsed.followed : [],
              albums: Array.isArray(parsed?.albums) ? parsed.albums : [],
            });
          } else {
            setLib({ liked: [], playlists: [], followed: [], albums: [] });
          }
        } catch (e) {
          setLib({ liked: [], playlists: [], followed: [], albums: [] });
        }
      });

  useEffect(() => {
    load();
  }, []);

  const createPlaylist = async () => {
    const name = window.prompt("Playlist name", "My Playlist");
    if (!name) return;
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    window.dispatchEvent(new Event("playlists-changed"));
    load();
  };

  if (!lib)
    return (
      <div className="grid place-items-center py-32 text-textdim">
        <Loader2 className="animate-spin-slow" />
      </div>
    );

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Your Library
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowAiCurator((prev) => !prev)}
            className="flex items-center gap-2 bg-accent text-black font-extrabold text-sm px-4 py-2 rounded-full hover:scale-105 transition shadow-md shadow-accent/15 cursor-pointer"
          >
            <Sparkles size={16} /> {showAiCurator ? "AI Curator Active" : "✨ Gemini AI Curator"}
          </button>
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm px-4 py-2 rounded-full hover:scale-105 transition cursor-pointer"
          >
            Sync / Import
          </button>
          <button
            onClick={createPlaylist}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-sm px-4 py-2 rounded-full hover:scale-105 transition cursor-pointer"
          >
            <Plus size={18} /> Create
          </button>
        </div>
      </header>

      {/* quick grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
        <Link
          href="/library/liked"
          onClick={(e) => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              e.preventDefault();
              window.location.href = "/library/liked";
            }
          }}
          className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#ec4899,#8b5cf6)" }}
          >
            <Heart size={24} fill="#fff" className="text-ink" />
          </span>
          <div>
            <div className="font-semibold">Liked Songs</div>
            <div className="text-xs text-textdim">
              {lib.liked.length} track{lib.liked.length === 1 ? "" : "s"}
            </div>
          </div>
        </Link>
        <Link
          href="/library/downloaded"
          onClick={(e) => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              e.preventDefault();
              window.location.href = "/library/downloaded";
            }
          }}
          className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#0f9d4f,#1ed760)" }}
          >
            <Download size={24} className="text-ink" />
          </span>
          <div>
            <div className="font-semibold">Downloaded</div>
            <div className="text-xs text-textdim">Offline songs</div>
          </div>
        </Link>
        {lib.playlists.map((pl) => (
          <Link
            key={pl.id}
            href={`/playlist/${pl.id}`}
            onClick={(e) => {
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                e.preventDefault();
                window.location.href = `/playlist/${pl.id}`;
              }
            }}
            className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
          >
            <div
              className="h-14 w-14 rounded-md shrink-0"
              style={{
                backgroundImage: `linear-gradient(135deg, ${playlistColor(pl.id)} , #0a0a0f)`,
              }}
            />
            <div className="min-w-0">
              <div className="font-semibold truncate">{pl.name}</div>
              <div className="text-xs text-textdim">
                Playlist • {pl.trackCount} track{pl.trackCount === 1 ? "" : "s"}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* quick row: liked artists + albums */}
      <div className="grid sm:grid-cols-2 gap-2 mb-8">
        <Link
          href="#liked-artists"
          className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#06b6d4,#3b82f6)" }}
          >
            <UserRound size={24} className="text-ink" />
          </span>
          <div>
            <div className="font-semibold">Liked Artists</div>
            <div className="text-xs text-textdim">
              {lib.followed.length} artist{lib.followed.length === 1 ? "" : "s"}
            </div>
          </div>
        </Link>
        <Link
          href="#liked-albums"
          className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg p-2 pr-4 transition"
        >
          <span
            className="grid place-items-center h-14 w-14 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#f59e0b,#db2777)" }}
          >
            <Disc3 size={24} className="text-ink" />
          </span>
          <div>
            <div className="font-semibold">Liked Albums</div>
            <div className="text-xs text-textdim">
              {lib.albums.length} album{lib.albums.length === 1 ? "" : "s"}
            </div>
          </div>
        </Link>
      </div>

      {showAiCurator && (
        <div className="mb-8">
          <AiPlaylistGenerator />
        </div>
      )}

      <Section title="Playlists">
        {lib.playlists.length === 0 ? (
          <div className="text-textdim text-sm px-1">
            No playlists yet — tap “Create”.
          </div>
        ) : (
          lib.playlists.map((pl) => (
            <SectionCard key={pl.id}>
              <PlaylistCard playlist={pl} />
            </SectionCard>
          ))
        )}
      </Section>

      <div id="liked-artists" className="scroll-mt-4">
        <Section
          title="Liked Artists"
          subtitle={lib.followed.length ? `${lib.followed.length} artist${lib.followed.length === 1 ? "" : "s"}` : undefined}
        >
          {lib.followed.length === 0 ? (
            <div className="text-textdim text-sm px-1">
              No liked artists yet — open an artist and tap the heart.
            </div>
          ) : (
            lib.followed.map((a) => (
              <SectionCard key={a.id}>
                <ArtistCard artist={a} />
              </SectionCard>
            ))
          )}
        </Section>
      </div>

      <div id="liked-albums" className="scroll-mt-4">
        <Section
          title="Liked Albums"
          subtitle={lib.albums.length ? `${lib.albums.length} album${lib.albums.length === 1 ? "" : "s"}` : undefined}
        >
          {lib.albums.length === 0 ? (
            <div className="text-textdim text-sm px-1">
              No liked albums yet — open an album and tap the heart.
            </div>
          ) : (
            lib.albums.map((a) => (
              <SectionCard key={a.id}>
                <AlbumCard album={a} />
              </SectionCard>
            ))
          )}
        </Section>
      </div>

      <div className="my-10 space-y-6">
        <SocialRoom />
        <ImportExportManager />
      </div>

      <ImportPlaylistModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={load}
      />
    </div>
  );
}

function playlistColor(id: number): string {
  const hues = ["#7c3aed", "#ec4899", "#10b981", "#f59e0b", "#06b6d4", "#f43f5e"];
  return hues[id % hues.length];
}
