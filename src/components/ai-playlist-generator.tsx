"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Play,
  Plus,
  Sliders,
  PenTool,
  Check,
  ExternalLink,
  Heart,
  X,
} from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import { Track } from "@/lib/types";
import { clsx } from "@/lib/utils";

const PROMPT_SUGGESTIONS = [
  "High-energy Basque Punk & Rock for driving",
  "Acoustic Trikitia and traditional Folk for studying",
  "Reggaeton & Latin party vibes for summer weekend",
  "Melancholic Basque indie pop for a rainy evening",
  "Upbeat modern electronic, synth-pop & dance mix",
  "Late night chilled urban pop with Bengo, Rosalia, and Tatta",
  "Iconic 90s and 2000s Rock anthems",
];

const MOODS = [
  { id: "Any vibe (No preference)", label: "✨ Any Vibe (Free Selection)" },
  { id: "Energetic & Upbeat", label: "⚡ Energetic & Upbeat" },
  { id: "Chill & Relaxed", label: "☕ Chill & Relaxed" },
  { id: "Party & High Hype", label: "🎉 Party & High Hype" },
  { id: "Happy & Feel-Good", label: "☀️ Happy & Feel-Good" },
  { id: "Melancholic & Reflective", label: "🌧️ Melancholic & Reflective" },
  { id: "Focus & Studying", label: "📚 Focus & Studying" },
  { id: "Road Trip & Driving", label: "🚗 Road Trip & Driving" },
  { id: "Dark & Intense", label: "🔥 Dark & Intense" },
];

const GENRES_OPTIONS = [
  "Reggaeton",
  "Latin Pop & Urban",
  "Pop / Mainstream",
  "Rock & Classic Rock",
  "Hip-Hop & Rap",
  "R&B & Soul",
  "Electronic & EDM",
  "Indie & Alternative",
  "Latin / Bachata / Salsa",
  "Trap & Urban",
  "Acoustic & Folk",
  "Jazz & Blues",
  "Metal & Hard Rock",
  "Reggae & Ska",
  "Classical & Ambient",
  "Basque Rock & Punk",
  "Basque Urban & Trap",
  "Basque Indie & Pop",
  "Traditional Folk & Trikitia",
  "Modern Synth-Pop",
];

const TEMPOS = [
  { id: "Any tempo", label: "Any Tempo" },
  { id: "Slow & Relaxed (60-90 BPM)", label: "Slow (60-90 BPM)" },
  { id: "Mid-tempo & Groovy (90-120 BPM)", label: "Mid-tempo (90-120 BPM)" },
  { id: "Fast & Upbeat (120-145 BPM)", label: "Fast (120-145 BPM)" },
  { id: "High Energy (145+ BPM)", label: "High Energy (145+ BPM)" },
];

const ERAS = [
  { id: "All eras", label: "All Eras" },
  { id: "2020s (Modern / Fresh)", label: "2020s (Current)" },
  { id: "2010s", label: "2010s" },
  { id: "2000s", label: "2000s" },
  { id: "1990s", label: "1990s" },
  { id: "1980s", label: "1980s" },
  { id: "Classic / Heritage", label: "Classic / Heritage" },
];

const GLOBAL_INSPIRATIONS = [
  "Bad Bunny",
  "Rosalía",
  "Coldplay",
  "Arctic Monkeys",
  "Dua Lipa",
  "The Weeknd",
  "Bengo",
  "ZETAK",
  "Berri Txarrak",
  "Izaro",
  "Tatta",
  "Belako",
  "Kortatu",
  "Bulego",
];

const BASQUE_INFLUENCE_OPTIONS = [
  { id: "Any / Flexible", label: "Any / Flexible (No constraint)", desc: "AI selects freely based on genres & artists" },
  { id: "100%", label: "100% Pure Basque Music", desc: "Exclusively Basque artists & tracks" },
  { id: "75%", label: "75% Dominant Basque", desc: "Mostly Basque with matching global flavors" },
  { id: "50%", label: "50% Basque & Global Mix", desc: "Half Basque, half international" },
  { id: "25%", label: "25% Subtle Basque Touch", desc: "Mostly international with a few Basque gems" },
  { id: "0%", label: "0% International Only", desc: "No Basque music, 100% global artists" },
];

export function AiPlaylistGenerator() {
  const router = useRouter();
  const p = usePlayer();
  const { toast } = useToast();

  const [curationMode, setCurationMode] = useState<"form" | "prompt">("form");

  // Prompt Mode State
  const [prompt, setPrompt] = useState("");

  // Form Mode State
  const [formName, setFormName] = useState("");
  const [formMood, setFormMood] = useState("Any vibe (No preference)");
  const [formGenres, setFormGenres] = useState<string[]>([]);
  const [formTempo, setFormTempo] = useState("Any tempo");
  const [formEra, setFormEra] = useState("All eras");
  const [formInspirations, setFormInspirations] = useState("");
  const [formBasqueInfluence, setFormBasqueInfluence] = useState("Any / Flexible");
  const [formTrackCount, setFormTrackCount] = useState<number>(12);

  // User liked/followed artists from library
  const [userLikedArtists, setUserLikedArtists] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    playlistId: number | null;
    name: string;
    description: string;
    tracks: Track[];
  } | null>(null);

  // Load user's liked & followed artists on mount
  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((d) => {
        const artistsSet = new Set<string>();
        if (Array.isArray(d?.liked)) {
          d.liked.forEach((t: Track) => {
            if (t.artistName && t.artistName.trim()) {
              artistsSet.add(t.artistName.trim());
            }
          });
        }
        if (Array.isArray(d?.followed)) {
          d.followed.forEach((a: { name?: string }) => {
            if (a.name && a.name.trim()) {
              artistsSet.add(a.name.trim());
            }
          });
        }
        setUserLikedArtists(Array.from(artistsSet));
      })
      .catch(() => {});
  }, []);

  const toggleGenre = (g: string) => {
    setFormGenres((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const clearGenres = () => {
    setFormGenres([]);
  };

  const addInspiration = (name: string) => {
    setFormInspirations((prev) => {
      const items = prev.split(",").map((s) => s.trim()).filter(Boolean);
      if (items.some((i) => i.toLowerCase() === name.toLowerCase())) return prev;
      return items.length > 0 ? `${prev}, ${name}` : name;
    });
  };

  const handleGenerate = async (overridePrompt?: string) => {
    setLoading(true);
    setResult(null);

    const payload =
      curationMode === "prompt" || overridePrompt
        ? {
            mode: "prompt",
            prompt: (overridePrompt || prompt).trim(),
            trackCount: formTrackCount,
          }
        : {
            mode: "form",
            name: formName.trim(),
            mood: formMood,
            genres: formGenres,
            tempo: formTempo,
            era: formEra,
            inspirations: formInspirations.trim(),
            basqueInfluence: formBasqueInfluence,
            trackCount: formTrackCount,
          };

    try {
      const res = await fetch("/api/ai/playlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to generate playlist");
      }

      setResult(data);
      toast(`Successfully curated "${data.name}" (${data.tracks.length} tracks)!`, "✨");
      window.dispatchEvent(new Event("playlists-changed"));
    } catch (err: any) {
      console.error("AI Playlist generation error:", err);
      toast(err.message || "Failed to generate AI playlist", "❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-panel border border-white/10 rounded-2xl p-4 sm:p-7 space-y-6 shadow-xl relative overflow-hidden">
      {/* Decorative gradient flare */}
      <div className="absolute -right-20 -top-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 border border-accent/20 text-accent text-xs font-black uppercase tracking-wider non-critical-detail">
            <Sparkles size={14} /> Gemini 3.8 Flash Curation Engine
          </div>
          <h3 className="text-lg sm:text-2xl font-black text-white tracking-tight">
            Gemini AI Smart Playlist Curator
          </h3>
          <p className="text-xs sm:text-sm text-textdim max-w-2xl leading-relaxed non-critical-detail">
            Create custom playlists by providing an open conversational prompt or tuning specific moods, global & Basque genres, and inspirations.
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/10 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setCurationMode("form")}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer",
              curationMode === "form"
                ? "bg-accent text-black shadow-sm font-extrabold"
                : "text-textdim hover:text-white"
            )}
          >
            <Sliders size={13} /> Structured Form
          </button>
          <button
            type="button"
            onClick={() => setCurationMode("prompt")}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer",
              curationMode === "prompt"
                ? "bg-accent text-black shadow-sm font-extrabold"
                : "text-textdim hover:text-white"
            )}
          >
            <PenTool size={13} /> Conversational Prompt
          </button>
        </div>
      </div>

      {/* Mode 1: PROMPT MODE */}
      {curationMode === "prompt" && (
        <div className="space-y-4 animate-fade-up">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-white uppercase tracking-wider">
              Natural Language Prompt
            </label>
            <p className="text-xs text-textdim">
              Describe your scenario, moods, favorite bands, cultural context, or energy level.
            </p>
          </div>

          <div className="relative">
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Late night road trip with energetic reggaeton, pop, and rock songs like Rosalía, Bengo, and Arctic Monkeys..."
              className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-white/40 focus:outline-none focus:border-accent resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
            <div className="flex items-center gap-3">
              <span className="text-xs text-textdim font-bold">Tracks to generate (1–50):</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formTrackCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setFormTrackCount(Math.min(50, Math.max(1, val)));
                    }
                  }}
                  className="w-16 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold text-center focus:outline-none focus:border-accent"
                />
                <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {[8, 12, 20, 30, 50].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setFormTrackCount(cnt)}
                      className={clsx(
                        "px-2 py-0.5 text-xs rounded font-bold cursor-pointer transition",
                        formTrackCount === cnt ? "bg-accent text-black font-extrabold" : "text-textdim hover:text-white"
                      )}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleGenerate()}
              disabled={loading || !prompt.trim()}
              className="bg-accent text-black font-extrabold px-6 py-2.5 rounded-full text-xs hover:scale-105 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-lg shadow-accent/20"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span>{loading ? "Curating with Gemini…" : "Curate Playlist"}</span>
            </button>
          </div>

          {/* Prompt Suggestions */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <span className="text-[11px] font-bold text-textfaint uppercase tracking-wider">
              Try these curated prompts:
            </span>
            <div className="flex flex-wrap gap-2">
              {PROMPT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setPrompt(s);
                    handleGenerate(s);
                  }}
                  className="text-xs px-3.5 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-textdim hover:text-white transition text-left cursor-pointer flex items-center gap-2"
                >
                  <Sparkles size={12} className="text-accent shrink-0" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: STRUCTURED FORM */}
      {curationMode === "form" && (
        <div className="space-y-6 animate-fade-up">
          {/* Row 1: Playlist Name & Mood */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Playlist Name (Optional)
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Summer Sunset Vibes (or leave blank for AI title)"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Mood & Vibe
              </label>
              <select
                value={formMood}
                onChange={(e) => setFormMood(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent cursor-pointer"
              >
                {MOODS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-panel text-white">
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Genres (Multi-select) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-white uppercase tracking-wider">
                  Genres (Select one or more)
                </label>
                <span className="text-[11px] text-textdim font-medium">
                  {formGenres.length === 0 ? "✨ Mix of everything (No restriction)" : `${formGenres.length} selected`}
                </span>
              </div>
              {formGenres.length > 0 && (
                <button
                  type="button"
                  onClick={clearGenres}
                  className="text-xs text-accent hover:underline cursor-pointer flex items-center gap-1 font-semibold"
                >
                  <X size={12} /> Clear all (Mix of everything)
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearGenres}
                className={clsx(
                  "text-xs px-3.5 py-2 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer",
                  formGenres.length === 0
                    ? "bg-accent/20 border-accent text-accent font-extrabold shadow-sm"
                    : "bg-white/[0.03] border-white/10 text-textdim hover:text-white hover:border-white/20"
                )}
              >
                {formGenres.length === 0 && <Check size={13} className="stroke-[3]" />}
                <span>🎲 Mix of Everything / Any</span>
              </button>

              {GENRES_OPTIONS.map((genre) => {
                const selected = formGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className={clsx(
                      "text-xs px-3.5 py-2 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer",
                      selected
                        ? "bg-accent/15 border-accent text-accent font-bold shadow-sm"
                        : "bg-white/[0.03] border-white/10 text-textdim hover:text-white hover:border-white/20"
                    )}
                  >
                    {selected && <Check size={13} className="stroke-[3]" />}
                    <span>{genre}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Tempo & Era */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Tempo & Energy
              </label>
              <select
                value={formTempo}
                onChange={(e) => setFormTempo(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent cursor-pointer"
              >
                {TEMPOS.map((t) => (
                  <option key={t.id} value={t.id} className="bg-panel text-white">
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Era / Decade
              </label>
              <select
                value={formEra}
                onChange={(e) => setFormEra(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent cursor-pointer"
              >
                {ERAS.map((er) => (
                  <option key={er.id} value={er.id} className="bg-panel text-white">
                    {er.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 4: Basque Music Influence Level */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Basque Music Influence Level
              </label>
              <span className="text-[11px] text-textdim">
                Optional quota constraint
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {BASQUE_INFLUENCE_OPTIONS.map((opt) => {
                const active = formBasqueInfluence === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFormBasqueInfluence(opt.id)}
                    className={clsx(
                      "p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                      active
                        ? "bg-accent/15 border-accent text-white shadow-md"
                        : "bg-white/[0.02] border-white/5 text-textdim hover:bg-white/[0.05] hover:text-white"
                    )}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className={clsx("text-xs font-black", active ? "text-accent" : "text-white")}>
                        {opt.id}
                      </span>
                      {active && <Check size={14} className="text-accent stroke-[3]" />}
                    </div>
                    <div className="text-[11px] font-bold text-white/90 leading-tight">
                      {opt.label}
                    </div>
                    <p className="text-[10px] text-textfaint mt-1 leading-snug non-critical-detail">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 5: Target Artist Inspirations */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Target Artist Inspirations
              </label>
              <input
                type="text"
                value={formInspirations}
                onChange={(e) => setFormInspirations(e.target.value)}
                placeholder="e.g. Bad Bunny, Rosalía, Bengo, ZETAK, Berri Txarrak, Arctic Monkeys..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent"
              />
            </div>

            {/* Liked Artists Quick Add */}
            {userLikedArtists.length > 0 && (
              <div className="space-y-1.5 p-3 rounded-xl bg-accent/5 border border-accent/15">
                <div className="flex items-center gap-1.5 text-accent text-[11px] font-bold">
                  <Heart size={12} fill="currentColor" />
                  <span>Your Liked & Saved Artists (Tap to add as inspiration):</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 no-scrollbar">
                  {userLikedArtists.map((artist) => (
                    <button
                      key={`liked-${artist}`}
                      type="button"
                      onClick={() => addInspiration(artist)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-accent/15 hover:bg-accent/25 border border-accent/20 text-white font-medium transition cursor-pointer flex items-center gap-1"
                    >
                      <Plus size={11} className="text-accent" />
                      <span>{artist}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Popular & Basque Quick Add */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-textfaint font-bold uppercase tracking-wider mr-1">
                Top Suggestions:
              </span>
              {GLOBAL_INSPIRATIONS.map((artist) => (
                <button
                  key={artist}
                  type="button"
                  onClick={() => addInspiration(artist)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-textdim hover:text-white transition cursor-pointer"
                >
                  +{artist}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Bar: Track Count (1-50) & Generate Button */}
          <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-textdim">Tracks to generate (1–50):</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formTrackCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setFormTrackCount(Math.min(50, Math.max(1, val)));
                    }
                  }}
                  className="w-16 bg-black/40 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white font-bold text-center focus:outline-none focus:border-accent"
                />
                <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  {[10, 15, 20, 30, 50].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setFormTrackCount(cnt)}
                      className={clsx(
                        "px-3 py-1 text-xs rounded-lg font-black transition cursor-pointer",
                        formTrackCount === cnt
                          ? "bg-accent text-black shadow-sm font-extrabold"
                          : "text-textdim hover:text-white"
                      )}
                    >
                      {cnt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => handleGenerate()}
              disabled={loading}
              className="bg-accent text-black font-extrabold px-8 py-3 rounded-full text-sm hover:scale-105 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer shadow-xl shadow-accent/20"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              <span>{loading ? "Generating tailored playlist…" : `Generate ${formTrackCount} Tracks`}</span>
            </button>
          </div>
        </div>
      )}

      {/* RESULT SECTION */}
      {result && (
        <div className="bg-black/50 border border-accent/30 rounded-2xl p-5 sm:p-6 space-y-5 animate-fade-up shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-accent bg-accent/10 px-2.5 py-1 rounded-md border border-accent/20">
                AI Curated Playlist
              </span>
              <h4 className="text-xl sm:text-2xl font-black text-white mt-2">
                {result.name}
              </h4>
              <p className="text-xs sm:text-sm text-textdim mt-1 max-w-xl leading-relaxed">
                {result.description}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {result.playlistId && (
                <button
                  type="button"
                  onClick={() => router.push(`/playlist/${result.playlistId}`)}
                  className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer border border-white/10"
                >
                  <ExternalLink size={14} /> Open Playlist
                </button>
              )}
              <button
                type="button"
                onClick={() => p.playQueue(result.tracks, 0)}
                className="bg-accent text-black font-extrabold px-5 py-2.5 rounded-full text-xs flex items-center gap-2 hover:scale-105 transition shadow-lg shadow-accent/25 cursor-pointer"
              >
                <Play size={15} fill="currentColor" /> Play All ({result.tracks.length})
              </button>
            </div>
          </div>

          <div className="space-y-1 divide-y divide-white/5 max-h-80 overflow-y-auto pr-1 no-scrollbar">
            {result.tracks.map((t, i) => (
              <div
                key={`${t.id}-${i}`}
                onClick={() => p.playQueue(result.tracks, i)}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 transition cursor-pointer group text-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <span className="text-textfaint font-bold w-5 text-center text-xs">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <span className="block font-bold text-white truncate text-sm group-hover:text-accent transition-colors">
                      {t.title}
                    </span>
                    <span className="block text-xs text-textdim truncate mt-0.5">
                      {t.artistName} {t.albumName ? `• ${t.albumName}` : ""}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-textfaint font-mono hidden sm:inline">
                    {Math.floor(t.duration / 60)}:{(t.duration % 60).toString().padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      p.addToQueue(t);
                      toast(`Added "${t.title}" to queue`, "➕");
                    }}
                    title="Add to queue"
                    className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
