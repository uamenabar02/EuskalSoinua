"use client";

import { useState, useEffect } from "react";
import { Sparkles, X, Loader2, BookOpen, Music, Compass, Heart } from "lucide-react";
import { Track } from "@/lib/types";

interface AiTrackInsightModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AiTrackInsightModal({ track, isOpen, onClose }: AiTrackInsightModalProps) {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<{
    summary: string;
    mood: string;
    culturalContext: string;
    thematicMeaning: string;
    recommendedListening: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen && track) {
      setLoading(true);
      setInsight(null);
      fetch("/api/ai/track-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.insight) setInsight(data.insight);
        })
        .catch((err) => console.error("Insight fetch error:", err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, track]);

  if (!isOpen || !track) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-bg-soft border border-white/10 rounded-2xl w-full max-w-lg p-6 relative shadow-2xl space-y-5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-white/60 hover:text-white bg-white/5 hover:bg-white/10 transition"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/15 text-accent">
            <Sparkles size={22} />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-accent">
              Gemini AI Musical Insight
            </span>
            <h3 className="text-xl font-extrabold text-white truncate max-w-xs">{track.title}</h3>
            <p className="text-xs text-textdim truncate">{track.artistName}</p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-textdim space-y-3">
            <Loader2 size={32} className="animate-spin text-accent" />
            <p className="text-xs font-semibold">Analyzing track history, lyrics, and Basque context...</p>
          </div>
        ) : insight ? (
          <div className="space-y-4 text-xs text-white/80 leading-relaxed max-h-[60vh] overflow-y-auto no-scrollbar pr-1">
            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="block font-extrabold text-accent mb-1 flex items-center gap-1">
                <BookOpen size={13} /> Summary & Mood
              </span>
              <p>{insight.summary}</p>
              <div className="mt-2 inline-block px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-bold">
                Mood: {insight.mood}
              </div>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="block font-extrabold text-accent mb-1 flex items-center gap-1">
                <Compass size={13} /> Cultural & Historical Significance
              </span>
              <p>{insight.culturalContext}</p>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="block font-extrabold text-accent mb-1 flex items-center gap-1">
                <Music size={13} /> Meaning & Themes
              </span>
              <p>{insight.thematicMeaning}</p>
            </div>

            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <span className="block font-extrabold text-accent mb-1 flex items-center gap-1">
                <Heart size={13} /> Ideal Listening Setting
              </span>
              <p>{insight.recommendedListening}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-red-400 py-6 text-center">Unable to load AI insight for this track.</p>
        )}
      </div>
    </div>
  );
}
