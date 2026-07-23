"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePlayer } from "@/lib/player-context";
import { Sidebar, MobileNav } from "@/components/nav";
import { PlayerBar } from "@/components/player-bar";
import { NowPlaying } from "@/components/now-playing";
import { Eye, ShieldAlert } from "lucide-react";
import { AccessGate } from "@/components/access-gate";

export function LayoutWrapper({ children }: { children: ReactNode }) {
  const p = usePlayer();
  const { playerHidden } = p;
  const [unlinked, setUnlinked] = useState(false);

  useEffect(() => {
    const checkSyncStatus = async () => {
      try {
        const res = await fetch("/api/sync");
        const data = await res.json().catch(() => ({}));
        if (data.unlinked) {
          // We were unlinked! Let's generate a new sync key
          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          let code = "";
          for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          const target = `S-${code}`;
          
          const oldKey = localStorage.getItem("euskalsoinua-sync-key") || "default";
          const deviceId = localStorage.getItem("euskalsoinua-device-id") || "";
          const deviceName = localStorage.getItem("euskalsoinua-device-name") || "Browser Device";
          const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

          // Perform backend cloning so Device B keeps all its liked tracks, playlists, etc. intact
          try {
            await fetch("/api/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "clone",
                fromKey: oldKey,
                toKey: target,
                deviceId,
                deviceName,
                userAgent,
              }),
            });
          } catch (cloneErr) {
            console.error("Failed to clone database during remote unlink:", cloneErr);
          }

          try {
            localStorage.setItem("euskalsoinua-sync-key", target);
          } catch (e) {}
          document.cookie = `sync_key=${target}; path=/; max-age=31536000; SameSite=Strict`;
          setUnlinked(true);
        }
      } catch (e) {
        console.error("Failed to verify sync status:", e);
      }
    };

    checkSyncStatus();

    // Check periodically in the background (every 15 seconds) so that when Device A unlinks Device B, Device B reacts immediately
    const interval = setInterval(checkSyncStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  if (unlinked) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
        <div className="bg-neutral-900 border border-white/10 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-accent mb-4">
            <ShieldAlert size={28} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Device Unlinked</h2>
          <p className="text-sm text-textdim mb-6 leading-relaxed">
            This device has been explicitly unlinked from the synchronized device group by another device. A new private library has been generated for you under a new Device Sync Code.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-accent hover:bg-accent/90 text-black font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-accent/20"
          >
            Restart EuskalSoinua
          </button>
        </div>
      </div>
    );
  }

  return (
    <AccessGate>
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
    </AccessGate>
  );
}
