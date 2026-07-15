"use client";

import { gradientFor, initials } from "@/lib/utils";
import { clsx } from "@/lib/utils";

export function CoverArt({
  seed,
  label,
  artwork,
  rounded = "rounded-lg",
  className,
  showInitials = true,
}: {
  seed: string | null | undefined;
  label?: string;
  artwork?: string | null;
  rounded?: string;
  className?: string;
  showInitials?: boolean;
}) {
  const [a, b] = gradientFor(seed ?? label ?? "x");
  return (
    <div
      className={clsx("relative overflow-hidden", rounded, className)}
      style={{ backgroundImage: `linear-gradient(135deg, ${a} 0%, ${b} 100%)` }}
    >
      {/* subtle texture */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.5) 0%, transparent 45%)",
        }}
      />
      {artwork ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={artwork}
          alt={label ?? ""}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : showInitials && label ? (
        <span className="absolute inset-0 flex items-center justify-center font-black text-ink/90 select-none text-[clamp(1rem,3vw,2rem)] tracking-tight">
          {initials(label)}
        </span>
      ) : null}
    </div>
  );
}

export function EqualizerBars({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-end gap-[2px] h-4", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="eq-bar h-full"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
