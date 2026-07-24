"use client";

import { useState } from "react";
import { Sparkles, Loader2, Play, Music, Plus, Check } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";
import { Track } from "@/lib/types";

const PROMPT_SUGGESTIONS = [
  "High-energy Basque Punk & Rock for driving",
  "Acoustic Trikitia and traditional Folk for studying",
  "Melancholic Basque indie pop for a rainy evening",
  "Upbeat modern Basque electronic & reggae mix",
];

export function AiPlaylistGenerator() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    playlistId: number | null;
    name: string;
    description: string;
    tracks: Track[];
  } | null>(null);

  const p = usePlayer();
  const { toast } = useToast();

  const handleGenerate = async (queryToUse?: string) => {
    const q = (queryToUse || prompt).trim();
    if (!q) return;

    setLoading(true);
    try {
      const res = await fetch("/api/ai/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      const data = await res.json();
      if (res.ok && data.tracks) {
        setResult(data);
        toast(`Generated "${data.name}"!`, "✨");
        window.dispatchEvent(new Event("playlists-changed"));
      } else {
        toast(data.error || "Failed to generate playlist", "❌");
      }
    } catch (err) {
      toast("Error generating playlist with Gemini AI", "❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-bg-soft rounded-2xl border border-white/5 p-6 shadow-xl space-y-6">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl bg-accent/10 text-accent">
          <Sparkles size={22} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Gemini AI Smart Playlist Curation</h3>
          <p className="text-xs text-textdim">
            Describe any vibe, mood, or context in natural language to curate a custom playlist.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
            placeholder="e.g. Energetic Basque rock for a summer road trip..."
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => handleGenerate()}
            disabled={loading || !prompt.trim()}
            className="absolute right-1.5 bg-accent text-black font-extrabold px-4 py-2 rounded-lg text-xs hover:scale-105 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Generate
          </button>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-2 pt-1">
          {PROMPT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setPrompt(s);
                handleGenerate(s);
              }}
              className="text-[11px] px-3 py-1.5 rounded-full bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-textdim hover:text-white transition cursor-pointer"
            >
              💡 {s}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="bg-black/40 border border-accent/20 rounded-xl p-4 space-y-4 animate-fade-up">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                AI Created Playlist
              </span>
              <h4 className="text-base font-extrabold text-white">{result.name}</h4>
              <p className="text-xs text-textdim">{result.description}</p>
            </div>
            <button
              onClick={() => p.playQueue(result.tracks, 0)}
              className="bg-accent text-black font-bold px-4 py-2 rounded-full text-xs flex items-center gap-1.5 hover:scale-105 transition shadow-lg shadow-accent/20 cursor-pointer"
            >
              <Play size={14} fill="currentColor" /> Play All ({result.tracks.length})
            </button>
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 no-scrollbar">
            {result.tracks.map((t, i) => (
              <div
                key={t.id}
                onClick={() => p.playQueue(result.tracks, i)}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition cursor-pointer group text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-textfaint font-bold w-4 text-center">{i + 1}</span>
                  <div className="min-w-0">
                    <span className="block font-bold text-white truncate group-hover:text-accent">
                      {t.title}
                    </span>
                    <span className="block text-[10px] text-textdim truncate">{t.artistName}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    p.addToQueue(t);
                    toast("Added to queue", "➕");
                  }}
                  className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                >
                  <Plus size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
