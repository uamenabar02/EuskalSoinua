"use client";

import { ReactNode } from "react";
import { usePlayer } from "@/lib/player-context";
import { Sidebar, MobileNav } from "@/components/nav";
import { PlayerBar } from "@/components/player-bar";
import { NowPlaying } from "@/components/now-playing";
import { Eye } from "lucide-react";

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const p = usePlayer();
  const { playerHidden } = p;

  return (
    <>
      <div className="flex flex-col md:flex-row h-dvh overflow-hidden">
        <Sidebar />
        <main
          className={`flex-1 min-w-0 overflow-y-auto md:pr-2 transition-all duration-300 ${
            playerHidden ? "pb-20 md:pb-6" : "pb-36 md:pb-28"
          }`}
        >
          {children}
        </main>
      </div>
      {!playerHidden && <PlayerBar />}
      <MobileNav />
      {!playerHidden && <NowPlaying />}
      {playerHidden && (
        <button
          onClick={p.togglePlayerHidden}
          className="md:hidden fixed right-4 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 flex items-center justify-center h-12 w-12 rounded-full bg-accent text-black shadow-lg shadow-accent/25 border border-white/10 active:scale-95 transition-all animate-bounce"
          title="Show Music Player"
        >
          <Eye size={22} />
        </button>
      )}
    </>
  );
}
