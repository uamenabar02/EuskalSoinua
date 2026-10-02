"use client";

import { AiPlaylistGenerator } from "@/components/ai-playlist-generator";
import { DetailToggle } from "@/components/detail-toggle";
import { useTranslation } from "@/lib/i18n";
import { Sparkles, Music2, ShieldCheck, Flame } from "lucide-react";

export default function CuratorPage() {
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-6 pt-4 sm:pt-6 pb-28 space-y-6 sm:space-y-8 animate-fade-up">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-accent">
            <Sparkles size={16} />
            <span>{t("curator.geminiIntelligence")}</span>
          </div>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            {t("curator.title")}
          </h1>
          <p className="text-xs sm:text-sm text-textdim max-w-2xl leading-relaxed non-critical-detail">
            {t("curator.subtitle")}
          </p>
        </div>
        <div className="shrink-0 self-start sm:self-auto">
          <DetailToggle />
        </div>
      </div>

      {/* Main Generator Component */}
      <AiPlaylistGenerator />

      {/* Feature Explanations (collapsible / hidden in compact mode) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 non-critical-detail">
        <div className="p-4 rounded-xl bg-panel border border-white/5 space-y-2">
          <div className="flex items-center gap-2 text-accent text-sm font-bold">
            <Flame size={16} />
            <span>{t("curator.basqueGroundTruthTitle")}</span>
          </div>
          <p className="text-xs text-textdim leading-relaxed">
            {t("curator.basqueGroundTruthDesc")}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-white/5 space-y-2">
          <div className="flex items-center gap-2 text-accent text-sm font-bold">
            <Music2 size={16} />
            <span>{t("curator.influenceCustomizationTitle")}</span>
          </div>
          <p className="text-xs text-textdim leading-relaxed">
            {t("curator.influenceCustomizationDesc")}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-white/5 space-y-2">
          <div className="flex items-center gap-2 text-accent text-sm font-bold">
            <ShieldCheck size={16} />
            <span>{t("curator.realPlayableTracksTitle")}</span>
          </div>
          <p className="text-xs text-textdim leading-relaxed">
            {t("curator.realPlayableTracksDesc")}
          </p>
        </div>
      </div>
    </div>
  );
}
