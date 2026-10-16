"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  X,
  Sparkles,
  Check,
  Music2,
  ExternalLink,
  Loader2,
  Disc3,
  CheckCircle2,
  AlertCircle,
  Library,
  ArrowRight,
  Disc,
} from "lucide-react";
import { useToast } from "@/lib/toast";
import { usePlayer } from "@/lib/player-context";
import { useTranslation } from "@/lib/i18n";
import type { Track } from "@/lib/types";

interface VideoData {
  videoId: string;
  title: string;
  author: string;
  duration?: number;
  thumbnail?: string;
  guessedTitle?: string;
  guessedArtist?: string;
}

interface AddMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoData: VideoData | null;
  onSuccess?: (track: Track) => void;
}

interface ArtistSuggestion {
  id: number;
  name: string;
  thumbnail: string | null;
  genre: string | null;
  region: string | null;
  language: string | null;
  trackCount: number;
  albumCount: number;
  isExactMatch: boolean;
  isDifferentCasing: boolean;
}

interface AlbumSuggestion {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  thumbnail: string | null;
  year: number | null;
  genre: string | null;
  trackCount: number;
  isExactMatch: boolean;
  isDifferentCasing: boolean;
}

const COMMON_GENRES = [
  "Basque Rock",
  "Folk / Tradizioa",
  "Trikitia",
  "Pop",
  "Urban / Rap",
  "Punk / Ska",
  "Indie",
  "Acoustic",
  "Electronic",
  "Metal",
];

function isBasqueGuess(title: string, author: string): boolean {
  const text = `${title} ${author}`.toLowerCase();
  return (
    text.includes("tx") ||
    text.includes("berri") ||
    text.includes("euskal") ||
    text.includes("bask") ||
    text.includes("soinua") ||
    text.includes("gazte")
  );
}

function AddMetadataForm({
  videoData,
  onClose,
  onSuccess,
}: {
  videoData: VideoData;
  onClose: () => void;
  onSuccess?: (track: Track) => void;
}) {
  const { toast } = useToast();
  const { playQueue } = usePlayer();
  const { t } = useTranslation();

  const isBasque = isBasqueGuess(videoData.title, videoData.author);

  const [title, setTitle] = useState(videoData.guessedTitle || videoData.title || "");
  const [artistName, setArtistName] = useState(videoData.guessedArtist || videoData.author || "");
  const [albumName, setAlbumName] = useState("Single");
  const [genre, setGenre] = useState("");
  const [region, setRegion] = useState<"eu" | "global">(isBasque ? "eu" : "global");
  const [language, setLanguage] = useState<"eu" | "es" | "en" | "und">(isBasque ? "eu" : "und");
  const [saving, setSaving] = useState(false);
  const [savedTrack, setSavedTrack] = useState<Track | null>(null);

  // Suggestions state
  const [artistSuggestions, setArtistSuggestions] = useState<ArtistSuggestion[]>([]);
  const [albumSuggestions, setAlbumSuggestions] = useState<AlbumSuggestion[]>([]);
  const [artistReleases, setArtistReleases] = useState<AlbumSuggestion[]>([]);
  const [loadingArtists, setLoadingArtists] = useState(false);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [showAlbumDropdown, setShowAlbumDropdown] = useState(false);

  const artistDropdownRef = useRef<HTMLDivElement>(null);
  const albumDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch artist suggestions on artistName change
  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmed = artistName.trim();
      if (!trimmed) {
        setArtistSuggestions([]);
        return;
      }
      setLoadingArtists(true);
      try {
        const res = await fetch(`/api/metadata/suggestions?type=artist&q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setArtistSuggestions(data.artists || []);
      } catch {
        setArtistSuggestions([]);
      } finally {
        setLoadingArtists(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [artistName]);

  // Fetch known albums for this artist
  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmedArtist = artistName.trim();
      if (!trimmedArtist) {
        setArtistReleases([]);
        return;
      }
      try {
        const res = await fetch(`/api/metadata/suggestions?type=album&artistName=${encodeURIComponent(trimmedArtist)}`);
        const data = await res.json();
        setArtistReleases(data.albums || []);
      } catch {
        setArtistReleases([]);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [artistName]);

  // Fetch album suggestions when albumName changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmedAlbum = albumName.trim();
      const trimmedArtist = artistName.trim();

      if (!trimmedAlbum) {
        setAlbumSuggestions([]);
        return;
      }

      setLoadingAlbums(true);
      try {
        const url = `/api/metadata/suggestions?type=album&artistName=${encodeURIComponent(trimmedArtist)}&q=${encodeURIComponent(trimmedAlbum)}`;
        const res = await fetch(url);
        const data = await res.json();
        setAlbumSuggestions(data.albums || []);
      } catch {
        setAlbumSuggestions([]);
      } finally {
        setLoadingAlbums(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [albumName, artistName]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (artistDropdownRef.current && !artistDropdownRef.current.contains(e.target as Node)) {
        setShowArtistDropdown(false);
      }
      if (albumDropdownRef.current && !albumDropdownRef.current.contains(e.target as Node)) {
        setShowAlbumDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute matched artist
  const exactArtistMatch = artistSuggestions.find(
    (a) => a.name.trim().toLowerCase() === artistName.trim().toLowerCase()
  );
  const artistCasingDiffers = exactArtistMatch && exactArtistMatch.name.trim() !== artistName.trim();

  // Compute matched album
  const exactAlbumMatch = (albumSuggestions.length > 0 ? albumSuggestions : artistReleases).find(
    (alb) => alb.title.trim().toLowerCase() === albumName.trim().toLowerCase()
  );
  const albumCasingDiffers = exactAlbumMatch && exactAlbumMatch.title.trim() !== albumName.trim();

  // Select artist helper
  const handleSelectArtist = (selected: ArtistSuggestion) => {
    setArtistName(selected.name);
    if (selected.genre && !genre) {
      setGenre(selected.genre);
    }
    if (selected.region) {
      setRegion(selected.region as "eu" | "global");
    }
    if (selected.language && selected.language !== "und") {
      setLanguage(selected.language as any);
    }
    setShowArtistDropdown(false);
  };

  // Select album helper
  const handleSelectAlbum = (selectedTitle: string) => {
    setAlbumName(selectedTitle);
    setShowAlbumDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !artistName.trim()) {
      toast("Please provide both song title and artist name", "⚠️");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/metadata/add-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: videoData.videoId,
          title: title.trim(),
          artistName: artistName.trim(),
          albumName: albumName.trim() || "Single",
          genre: genre.trim() || null,
          region,
          language,
          duration: videoData.duration || 180,
          artworkUrl: videoData.thumbnail,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save");
      }

      toast(
        data.alreadyExists
          ? `Updated metadata for "${data.track.title}"!`
          : `"${data.track.title}" added to catalog!`,
        "✅"
      );

      setSavedTrack(data.track);
      if (onSuccess) {
        onSuccess(data.track);
      }
    } catch (err: any) {
      toast(err?.message || "Failed to add track", "❌");
    } finally {
      setSaving(false);
    }
  };

  const handlePlaySaved = () => {
    if (savedTrack) {
      playQueue([savedTrack], 0);
      onClose();
    }
  };

  if (savedTrack) {
    return (
      <div className="text-center py-6 space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center mx-auto ring-4 ring-emerald-500/10">
          <Check size={28} strokeWidth={3} />
        </div>
        <div>
          <h4 className="text-lg font-bold text-white">
            {t("metadataModal.addedSuccessTitle", undefined) || "Track Added Successfully!"}
          </h4>
          <p className="text-xs text-textdim mt-1 max-w-sm mx-auto">
            &ldquo;{savedTrack.title}&rdquo; by{" "}
            <span className="text-accent font-semibold">{savedTrack.artistName}</span> is now
            registered in the application catalog.
          </p>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={handlePlaySaved}
            className="px-5 py-2.5 rounded-full bg-accent hover:bg-accent/80 active:scale-95 text-black font-bold text-sm transition cursor-pointer"
          >
            {t("metadataModal.playNow", undefined) || "Play Now"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white font-medium text-sm transition cursor-pointer"
          >
            {t("metadataModal.done", undefined) || "Done"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* YouTube preview card */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="relative w-16 h-12 rounded-lg overflow-hidden shrink-0 bg-black/40">
          {videoData.thumbnail ? (
            <Image
              src={videoData.thumbnail}
              alt={videoData.title}
              fill
              sizes="64px"
              className="object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Disc3 className="w-full h-full p-2 text-white/30" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-white truncate">
            {videoData.title}
          </div>
          <div className="text-[11px] text-textdim truncate">
            {t("metadataModal.channel", undefined) || "Channel"}: {videoData.author}
          </div>
          <a
            href={`https://www.youtube.com/watch?v=${videoData.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline mt-0.5"
          >
            {t("metadataModal.viewOnYouTube", undefined) || "View on YouTube"} <ExternalLink size={9} />
          </a>
        </div>
      </div>

      {/* Song Title */}
      <div>
        <label className="block text-xs font-semibold text-white/90 mb-1">
          {t("metadataModal.songTitle", undefined) || "Song Title"}{" "}
          <span className="text-accent">*</span>
        </label>
        <input
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("metadataModal.songTitlePlaceholder", undefined) || "e.g. Aldapan Gora"}
          className="w-full px-3.5 py-2.5 rounded-xl bg-white/10 focus:bg-white/15 border border-white/10 focus:border-accent/50 text-white text-sm outline-none transition"
        />
      </div>

      {/* Artist Name with Live Catalog Detection & Auto-helper */}
      <div className="relative" ref={artistDropdownRef}>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-white/90">
            {t("metadataModal.artistName", undefined) || "Artist Name"}{" "}
            <span className="text-accent">*</span>
          </label>
          {loadingArtists && (
            <span className="flex items-center gap-1 text-[11px] text-accent">
              <Loader2 size={11} className="animate-spin" />
              <span>Checking catalog…</span>
            </span>
          )}
        </div>

        <input
          type="text"
          required
          value={artistName}
          onFocus={() => setShowArtistDropdown(true)}
          onChange={(e) => {
            setArtistName(e.target.value);
            setShowArtistDropdown(true);
          }}
          placeholder={t("metadataModal.artistPlaceholder", undefined) || "e.g. Huntza"}
          className={`w-full px-3.5 py-2.5 rounded-xl bg-white/10 focus:bg-white/15 border text-white text-sm outline-none transition ${
            exactArtistMatch
              ? "border-emerald-500/50 focus:border-emerald-400"
              : "border-white/10 focus:border-accent/50"
          }`}
        />

        {/* Existing Artist Alert Banner & Normalizer */}
        {exactArtistMatch && (
          <div className="mt-1.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <div className="min-w-0 text-[11px] leading-tight">
                {artistCasingDiffers ? (
                  <span className="text-amber-300 font-medium">
                    Catalog has official spelling:{" "}
                    <strong className="text-white underline">{exactArtistMatch.name}</strong>
                  </span>
                ) : (
                  <span className="text-emerald-300">
                    Linked to catalog artist:{" "}
                    <strong className="text-white">{exactArtistMatch.name}</strong>
                  </span>
                )}
                <div className="text-[10px] text-emerald-400/80">
                  {exactArtistMatch.albumCount} releases • {exactArtistMatch.trackCount} tracks • No
                  duplicate will be created
                </div>
              </div>
            </div>

            {artistCasingDiffers && (
              <button
                type="button"
                onClick={() => handleSelectArtist(exactArtistMatch)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-bold text-[11px] transition cursor-pointer shadow-sm"
              >
                <Sparkles size={11} />
                <span>Use &ldquo;{exactArtistMatch.name}&rdquo;</span>
              </button>
            )}
          </div>
        )}

        {/* Informative message if completely new artist */}
        {!exactArtistMatch && artistName.trim().length >= 2 && !loadingArtists && artistSuggestions.length === 0 && (
          <div className="mt-1 text-[11px] text-textdim flex items-center gap-1.5 px-1">
            <Library size={12} className="text-accent/70" />
            <span>
              {t("metadataModal.newArtistNotice", undefined) || "New artist will be created in catalog"}:{" "}
              <strong className="text-white">{artistName.trim()}</strong>
            </span>
          </div>
        )}

        {/* Dropdown Suggestions List */}
        {showArtistDropdown && artistSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#161a22] border border-white/15 rounded-xl shadow-2xl max-h-52 overflow-y-auto overflow-x-hidden p-1 space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-textdim font-semibold flex items-center justify-between">
              <span>Catalog Artist Matches</span>
              <span className="text-accent">{artistSuggestions.length} found</span>
            </div>
            {artistSuggestions.map((a) => {
              const isCurrent = a.name.toLowerCase() === artistName.trim().toLowerCase();
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelectArtist(a)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition cursor-pointer ${
                    isCurrent
                      ? "bg-accent/20 text-white"
                      : "hover:bg-white/10 text-white/90 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden shrink-0 grid place-items-center relative">
                      {a.thumbnail ? (
                        <Image
                          src={a.thumbnail}
                          alt={a.name}
                          fill
                          sizes="32px"
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Music2 size={14} className="text-white/40" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                        <span>{a.name}</span>
                        {a.isExactMatch && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                            Exact
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-textdim truncate">
                        {a.genre || "Music"} • {a.trackCount} tracks
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={13} className="text-textdim shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Album / Release with Existing Releases Chips & Auto-helper */}
      <div className="relative" ref={albumDropdownRef}>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-semibold text-white/90">
            {t("metadataModal.albumName", undefined) || "Album / Release"}
          </label>
          {loadingAlbums && (
            <span className="flex items-center gap-1 text-[11px] text-accent">
              <Loader2 size={11} className="animate-spin" />
              <span>Checking releases…</span>
            </span>
          )}
        </div>

        <input
          type="text"
          value={albumName}
          onFocus={() => setShowAlbumDropdown(true)}
          onChange={(e) => {
            setAlbumName(e.target.value);
            setShowAlbumDropdown(true);
          }}
          placeholder={t("metadataModal.albumPlaceholder", undefined) || "Single (or Album title)"}
          className={`w-full px-3.5 py-2.5 rounded-xl bg-white/10 focus:bg-white/15 border text-white text-sm outline-none transition ${
            exactAlbumMatch
              ? "border-emerald-500/50 focus:border-emerald-400"
              : "border-white/10 focus:border-accent/50"
          }`}
        />

        {/* Existing Album Alert Banner & Normalizer */}
        {exactAlbumMatch && (
          <div className="mt-1.5 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <div className="min-w-0 text-[11px] leading-tight">
                {albumCasingDiffers ? (
                  <span className="text-amber-300 font-medium">
                    Catalog has official release:{" "}
                    <strong className="text-white underline">{exactAlbumMatch.title}</strong>
                  </span>
                ) : (
                  <span className="text-emerald-300">
                    Linked to existing release:{" "}
                    <strong className="text-white">{exactAlbumMatch.title}</strong>
                  </span>
                )}
                <div className="text-[10px] text-emerald-400/80">
                  {exactAlbumMatch.trackCount} tracks • Will add to this release without duplicate
                </div>
              </div>
            </div>

            {albumCasingDiffers && (
              <button
                type="button"
                onClick={() => handleSelectAlbum(exactAlbumMatch.title)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-black font-bold text-[11px] transition cursor-pointer shadow-sm"
              >
                <Sparkles size={11} />
                <span>Use &ldquo;{exactAlbumMatch.title}&rdquo;</span>
              </button>
            )}
          </div>
        )}

        {/* Quick album pills for the selected artist */}
        {artistReleases.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] text-textdim font-medium mb-1 flex items-center justify-between">
              <span>Existing releases by {exactArtistMatch?.name || artistName}:</span>
              <button
                type="button"
                onClick={() => setAlbumName("Single")}
                className="text-accent hover:underline cursor-pointer"
              >
                Set as &ldquo;Single&rdquo;
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto no-scrollbar">
              {artistReleases.map((alb) => {
                const isSelected = alb.title.toLowerCase() === albumName.trim().toLowerCase();
                return (
                  <button
                    key={alb.id}
                    type="button"
                    onClick={() => handleSelectAlbum(alb.title)}
                    className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition cursor-pointer ${
                      isSelected
                        ? "bg-accent text-black border-accent font-bold shadow-sm"
                        : "bg-white/5 hover:bg-white/10 text-textdim hover:text-white border-white/10"
                    }`}
                  >
                    <Disc size={11} className={isSelected ? "text-black" : "text-textdim"} />
                    <span>{alb.title}</span>
                    {alb.trackCount > 0 && (
                      <span className="opacity-70 text-[9px]">({alb.trackCount})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dropdown Suggestions List for Album */}
        {showAlbumDropdown && albumSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#161a22] border border-white/15 rounded-xl shadow-2xl max-h-52 overflow-y-auto overflow-x-hidden p-1 space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-textdim font-semibold flex items-center justify-between">
              <span>Catalog Album Matches</span>
              <span className="text-accent">{albumSuggestions.length} found</span>
            </div>
            {albumSuggestions.map((alb) => {
              const isCurrent = alb.title.toLowerCase() === albumName.trim().toLowerCase();
              return (
                <button
                  key={alb.id}
                  type="button"
                  onClick={() => handleSelectAlbum(alb.title)}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left transition cursor-pointer ${
                    isCurrent
                      ? "bg-accent/20 text-white"
                      : "hover:bg-white/10 text-white/90 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-white/10 overflow-hidden shrink-0 grid place-items-center relative">
                      {alb.thumbnail ? (
                        <Image
                          src={alb.thumbnail}
                          alt={alb.title}
                          fill
                          sizes="28px"
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Disc3 size={13} className="text-white/40" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                        <span>{alb.title}</span>
                        {alb.isExactMatch && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                            Exact
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-textdim truncate">
                        {alb.artistName || "Artist"} {alb.year ? `• ${alb.year}` : ""} •{" "}
                        {alb.trackCount} tracks
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={13} className="text-textdim shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Genre with quick tags */}
      <div>
        <label className="block text-xs font-semibold text-white/90 mb-1">
          {t("metadataModal.genre", undefined) || "Genre"}
        </label>
        <input
          type="text"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
          placeholder={
            t("metadataModal.genrePlaceholder", undefined) || "Select below or type custom genre"
          }
          className="w-full px-3.5 py-2 rounded-xl bg-white/10 focus:bg-white/15 border border-white/10 focus:border-accent/50 text-white text-sm outline-none transition mb-2"
        />
        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto no-scrollbar">
          {COMMON_GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenre(g)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition cursor-pointer active:scale-95 ${
                genre.toLowerCase() === g.toLowerCase()
                  ? "bg-accent text-black border-accent font-bold"
                  : "bg-white/5 hover:bg-white/10 text-textdim hover:text-white border-white/10"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Regional classification */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div>
          <label className="block text-xs font-semibold text-white/90 mb-1">
            {t("metadataModal.region", undefined) || "Region"}
          </label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-xs outline-none cursor-pointer"
          >
            <option value="eu" className="bg-panel text-white">
              {t("metadataModal.basqueRegion", undefined) || "Basque Country (Euskal Herria)"}
            </option>
            <option value="global" className="bg-panel text-white">
              {t("metadataModal.globalRegion", undefined) || "Global / International"}
            </option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-white/90 mb-1">
            {t("metadataModal.language", undefined) || "Language"}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white text-xs outline-none cursor-pointer"
          >
            <option value="eu" className="bg-panel text-white">
              {t("metadataModal.basqueLanguage", undefined) || "Basque (Euskara)"}
            </option>
            <option value="es" className="bg-panel text-white">
              {t("metadataModal.spanishLanguage", undefined) || "Spanish (Castellano)"}
            </option>
            <option value="en" className="bg-panel text-white">
              {t("metadataModal.englishLanguage", undefined) || "English"}
            </option>
            <option value="und" className="bg-panel text-white">
              {t("metadataModal.otherLanguage", undefined) || "Instrumental / Other"}
            </option>
          </select>
        </div>
      </div>

      {/* Submit CTA */}
      <div className="flex gap-2 justify-end pt-3 border-t border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-textdim hover:text-white text-xs font-semibold transition cursor-pointer"
        >
          {t("metadataModal.cancel", undefined) || "Cancel"}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent hover:bg-accent/80 active:scale-95 text-black font-bold text-xs transition cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>{t("metadataModal.saving", undefined) || "Saving to Catalog…"}</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>{t("metadataModal.save", undefined) || "Save to Catalog"}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export function AddMetadataModal({
  isOpen,
  onClose,
  videoData,
  onSuccess,
}: AddMetadataModalProps) {
  const { t } = useTranslation();

  if (!isOpen || !videoData) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-panel border border-white/10 rounded-2xl shadow-2xl p-5 sm:p-6 text-left my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-9 w-9 rounded-full bg-accent/15 text-accent">
              <Music2 size={18} />
            </span>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">
                {t("metadataModal.title", undefined) || "Add to Application Catalog"}
              </h3>
              <p className="text-xs text-textdim">
                {t("metadataModal.subtitle", undefined) ||
                  "Make this YouTube audio permanent in your search & library"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-textdim hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <AddMetadataForm
          key={videoData.videoId}
          videoData={videoData}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </div>
    </div>
  );
}
