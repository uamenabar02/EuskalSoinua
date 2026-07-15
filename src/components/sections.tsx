"use client";

import { useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "@/lib/utils";

export function Section({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
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
          <div className="hidden md:flex gap-1">
            <button
              onClick={() => scroll(-1)}
              className="grid place-items-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 transition"
              aria-label="scroll left"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => scroll(1)}
              className="grid place-items-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 transition"
              aria-label="scroll right"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
      <div
        ref={scroller}
        className={clsx(
          "flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar snap-x",
          "-mx-1 px-1",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SectionCard({ children }: { children: ReactNode }) {
  return <div className="snap-start shrink-0 w-40 sm:w-48 lg:w-52">{children}</div>;
}
