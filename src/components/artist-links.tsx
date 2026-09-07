"use client";

import Link from "next/link";
import React from "react";
import { splitArtistNames } from "@/lib/utils";

export { splitArtistNames };

interface ArtistLinksProps {
  artistName: string;
  primaryArtistId?: number | null;
  className?: string;
  containerClassName?: string;
}

export function ArtistLinks({
  artistName,
  primaryArtistId,
  className,
  containerClassName = "truncate block max-w-full text-xs text-textdim",
}: ArtistLinksProps) {
  if (!artistName) return null;

  const parts = splitArtistNames(artistName);

  if (parts.length <= 1) {
    const href = primaryArtistId ? `/artist/${primaryArtistId}` : `/artist/${encodeURIComponent(artistName)}`;
    return (
      <span className={containerClassName}>
        <Link
          href={href}
          className={className ?? "hover:underline hover:text-ink transition-colors"}
          onClick={(e) => e.stopPropagation()}
        >
          {artistName}
        </Link>
      </span>
    );
  }

  return (
    <span className={containerClassName}>
      {parts.map((part, index) => {
        // If it's the 1st artist and we have a numeric primaryArtistId, use it; otherwise use name route
        const href =
          index === 0 && primaryArtistId
            ? `/artist/${primaryArtistId}`
            : `/artist/${encodeURIComponent(part)}`;

        const isLast = index === parts.length - 1;
        const isSecondToLast = index === parts.length - 2;
        const separator = isLast ? "" : isSecondToLast ? " & " : ", ";

        return (
          <React.Fragment key={`${part}-${index}`}>
            <Link
              href={href}
              className={className ?? "hover:underline hover:text-ink transition-colors"}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
            {separator}
          </React.Fragment>
        );
      })}
    </span>
  );
}
