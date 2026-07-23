"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, RotateCw, Loader2 } from "lucide-react";
import { clsx } from "@/lib/utils";

export function Section({
  title,
  subtitle,
  children,
  action,
  onReload,
  reloading,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  onReload?: () => void;
  reloading?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => {
    scroller.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  };
  return (
    <section className="mb-8">
      <div className="flex items-end justify-between mb-3 px-1">
        <div>
          <h2 className="text-lg sm:text-2xl font-bold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="text-textdim text-xs sm:text-sm mt-0.5">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {onReload ? (
            <button
              onClick={onReload}
              disabled={reloading}
              title={`Reload ${title}`}
              className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full transition disabled:opacity-50 cursor-pointer shrink-0"
            >
              <RotateCw size={14} className={reloading ? "animate-spin-slow" : ""} />
              <span className="hidden sm:inline">Reload</span>
            </button>
          ) : null}
          <div className="hidden md:flex gap-1">
            <button
              onClick={() => scroll(-1)}
              className="grid place-items-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
              aria-label="scroll left"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => scroll(1)}
              className="grid place-items-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 transition cursor-pointer"
              aria-label="scroll right"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
      {reloading ? (
        <div className="py-12 grid place-items-center text-textdim rounded-xl bg-white/[0.02]">
          <div className="flex items-center gap-2 text-xs text-accent">
            <Loader2 size={16} className="animate-spin" />
            <span>AI Agent is tailoring {title.toLowerCase()} to your taste…</span>
          </div>
        </div>
      ) : (
        <div
          ref={scroller}
          className={clsx(
            "flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar snap-x",
            "-mx-1 px-1",
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}

export function SectionCard({ children }: { children: ReactNode }) {
  return <div className="snap-start shrink-0 w-40 sm:w-48 lg:w-52">{children}</div>;
}
