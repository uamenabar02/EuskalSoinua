"use client";

import { useState, useCallback } from "react";
import { Heart } from "lucide-react";
import { clsx } from "@/lib/utils";

type Endpoint = "like" | "follow" | "album-save";

const FIELD: Record<Endpoint, string> = {
  like: "liked",
  follow: "followed",
  "album-save": "saved",
};

/**
 * Generic optimistic heart/follow/save toggle.
 * Posts { trackId | artistId | albumId } to the matching endpoint.
 */
export function ToggleButton({
  endpoint,
  id,
  initial,
  activeColor = "var(--accent)",
  className,
  size = 20,
  field,
}: {
  endpoint: Endpoint;
  id: number;
  initial: boolean;
  activeColor?: string;
  className?: string;
  size?: number;
  field?: "trackId" | "artistId" | "albumId";
}) {
  const idField = field ?? (endpoint === "follow" ? "artistId" : endpoint === "album-save" ? "albumId" : "trackId");
  const [active, setActive] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = useCallback(async () => {
    setBusy(true);
    setActive((a) => !a); // optimistic
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [idField]: id }),
      });
      const data = await res.json();
      setActive(!!data[FIELD[endpoint]]);
    } catch {
      setActive((a) => !a); // revert
    } finally {
      setBusy(false);
    }
  }, [endpoint, id, idField]);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!busy) toggle();
      }}
      aria-label="toggle"
      className={clsx(
        "inline-flex items-center justify-center rounded-full transition active:scale-90",
        className,
      )}
      style={active ? { color: activeColor } : undefined}
    >
      <Heart
        size={size}
        strokeWidth={active ? 0 : 2}
        fill={active ? activeColor : "none"}
      />
    </button>
  );
}
