"use client";

import { useViewMode } from "@/lib/view-mode-context";
import { Eye, EyeOff } from "lucide-react";
import { clsx } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function DetailToggle({
  className,
  variant = "pill",
}: {
  className?: string;
  variant?: "pill" | "icon" | "minimal";
}) {
  const { showDetails, toggleDetails } = useViewMode();
  const { t } = useTranslation();

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggleDetails}
        title={showDetails ? t("common.hideDetails") : t("common.showDetails")}
        className={clsx(
          "grid place-items-center h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 text-textdim hover:text-white transition cursor-pointer border border-white/10",
          className
        )}
      >
        {showDetails ? <EyeOff size={15} /> : <Eye size={15} className="text-accent" />}
      </button>
    );
  }

  if (variant === "minimal") {
    return (
      <button
        type="button"
        onClick={toggleDetails}
        className={clsx(
          "inline-flex items-center gap-1.5 text-xs text-textdim hover:text-white transition cursor-pointer px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/5",
          className
        )}
      >
        {showDetails ? (
          <>
            <EyeOff size={13} />
            <span>{t("common.hideDetails")}</span>
          </>
        ) : (
          <>
            <Eye size={13} className="text-accent" />
            <span className="text-accent font-semibold">{t("common.showDetails")}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleDetails}
      className={clsx(
        "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition cursor-pointer font-medium shrink-0",
        showDetails
          ? "bg-white/5 hover:bg-white/10 border-white/10 text-textdim hover:text-white"
          : "bg-accent/15 border-accent/30 text-accent font-bold shadow-sm",
        className
      )}
    >
      {showDetails ? (
        <>
          <EyeOff size={13} />
          <span>{t("common.hideDetails")}</span>
        </>
      ) : (
        <>
          <Eye size={13} />
          <span>{t("common.showDetails")}</span>
        </>
      )}
    </button>
  );
}
