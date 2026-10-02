"use client";

import { useEffect, useState } from "react";
import { DetailHeader, PlayAllButton, CenterLoader } from "@/components/detail";
import { TrackList } from "@/components/track-row";
import { useTranslation } from "@/lib/i18n";
import type { Track } from "@/lib/types";
import { Heart } from "lucide-react";

export default function LikedPage() {
  const { t } = useTranslation();
  const [liked, setLiked] = useState<(Track & { liked?: boolean })[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/library")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((d) => {
        if (!d || d.error || !Array.isArray(d.liked)) {
          throw new Error("Offline or invalid data");
        }
        setLiked(d.liked);
      })
      .catch(() => {
        try {
          const cached = localStorage.getItem("euskalsoinua-library-cache");
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed?.liked)) {
              setLiked(parsed.liked);
              return;
            }
          }
        } catch (e) {}
        setError(true);
      });
  }, []);

  if (error)
    return (
      <div className="grid place-items-center py-32 text-textdim text-sm">
        {t("home.cannotReachCatalog")}
      </div>
    );
  if (!liked) return <CenterLoader />;

  return (
    <div>
      <DetailHeader
        seed="liked-songs"
        coverLabel="♥"
        meta={<span className="text-sm font-semibold uppercase tracking-wide text-textdim">{t("common.playlist")}</span>}
        title={t("library.likedSongs")}
        subtitle={
          liked.length === 1
            ? t("library.songsCountSingular")
            : t("library.songsCountPlural", { count: liked.length })
        }
        actions={<PlayAllButton tracks={liked} />}
      >
        <span
          className="absolute left-6 sm:left-[14.5rem] top-44 sm:top-24 text-pink-400 pointer-events-none hidden"
          aria-hidden
        >
          <Heart size={400} />
        </span>
      </DetailHeader>

      <div className="px-4 sm:px-6 max-w-[1600px] mx-auto pb-10">
        {liked.length === 0 ? (
          <div className="text-center py-20 text-textdim">
            <Heart size={40} className="mx-auto mb-3 text-textfaint" />
            {t("library.emptyLibraryDesc")}
          </div>
        ) : (
          <TrackList tracks={liked} />
        )}
      </div>
    </div>
  );
}
