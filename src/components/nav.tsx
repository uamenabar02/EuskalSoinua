"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, Disc3, Plus, Radio as RadioIcon, Eye, Settings, Sparkles } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { clsx } from "@/lib/utils";
import type { Playlist } from "@/lib/types";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/radio", label: "Radio", icon: RadioIcon },
  { href: "/taste", label: "Let me know", icon: Sparkles },
  { href: "/library", label: "Your Library", icon: Library },
];

const MOBILE_NAV = [
  ...NAV,
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          e.preventDefault();
          window.location.href = href;
        }
      }}
      className={clsx(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-semibold",
        active ? "bg-white/10 text-ink" : "text-textdim hover:text-ink hover:bg-white/5",
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const p = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  const refreshPlaylists = () =>
    fetch("/api/playlists")
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists ?? []))
      .catch(() => {});

  useEffect(() => {
    refreshPlaylists();
    // stay in sync when a playlist is created/deleted elsewhere
    const handler = () => refreshPlaylists();
    window.addEventListener("playlists-changed", handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener("playlists-changed", handler);
      window.removeEventListener("focus", handler);
    };
  }, []);

  const createPlaylist = async () => {
    const name = window.prompt("Playlist name", "My Playlist");
    if (!name) return;
    await fetch("/api/playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    window.dispatchEvent(new Event("playlists-changed"));
  };

  return (
    <aside className="hidden md:flex flex-col gap-2 w-64 shrink-0 p-2">
      <div className="flex items-center gap-2 px-3 py-5">
        <div
          className="grid place-items-center h-9 w-9 rounded-lg"
          style={{ background: "linear-gradient(135deg,#1ed760,#0ea5e9)" }}
        >
          <Disc3 size={22} className="text-black" />
        </div>
        <div className="leading-tight">
          <div className="font-extrabold tracking-tight">EuskalSoinua</div>
          <div className="text-[10px] text-textfaint uppercase tracking-widest">
            Ad-free • Open
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 bg-bg-soft rounded-xl p-2">
        {NAV.map((n) => (
          <NavItem
            key={n.href}
            {...n}
            active={pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href))}
          />
        ))}
      </nav>
      <div className="flex flex-col gap-1 bg-bg-soft rounded-xl p-2 flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1">
          <Link
            href="/library"
            onClick={(e) => {
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                e.preventDefault();
                window.location.href = "/library";
              }
            }}
            className="flex items-center gap-2 text-textfaint text-xs font-bold uppercase tracking-wide hover:text-ink"
          >
            <Library size={14} /> Your Library
          </Link>
          <button
            onClick={createPlaylist}
            title="Create playlist"
            className="grid place-items-center h-7 w-7 rounded-full text-textdim hover:text-ink hover:bg-white/10"
          >
            <Plus size={16} />
          </button>
        </div>
        <Link
          href="/taste?tab=ai"
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 text-accent font-semibold text-sm"
        >
          <span className="grid place-items-center h-9 w-9 rounded-md shrink-0 bg-accent/15 text-accent">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0">
            <div className="font-bold truncate text-xs">AI Playlist Curator</div>
            <div className="text-[10px] text-textdim truncate">Generate with Gemini</div>
          </div>
        </Link>
        <Link
          href="/library/liked"
          onClick={(e) => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              e.preventDefault();
              window.location.href = "/library/liked";
            }
          }}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 text-textdim hover:text-ink text-sm"
        >
          <span
            className="grid place-items-center h-9 w-9 rounded-md shrink-0"
            style={{ background: "linear-gradient(135deg,#ec4899,#8b5cf6)" }}
          >
            <span className="text-ink text-sm">♥</span>
          </span>
          <div className="min-w-0">
            <div className="font-medium truncate">Liked Songs</div>
            <div className="text-[11px] text-textfaint">Playlist</div>
          </div>
        </Link>
        <div className="flex-1 overflow-y-auto no-scrollbar -mx-1 px-1">
          {playlists.map((pl) => (
            <Link
              key={pl.id}
              href={`/playlist/${pl.id}`}
              onClick={(e) => {
                if (typeof navigator !== "undefined" && !navigator.onLine) {
                  e.preventDefault();
                  window.location.href = `/playlist/${pl.id}`;
                }
              }}
              className={clsx(
                "flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-colors",
                pathname === `/playlist/${pl.id}`
                  ? "bg-white/10 text-ink"
                  : "text-textdim hover:bg-white/5 hover:text-ink",
              )}
            >
              <span
                className="h-9 w-9 rounded-md shrink-0"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${playlistColor(pl.id)}, #0a0a0f)`,
                }}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{pl.name}</div>
                <div className="text-[11px] text-textfaint truncate">
                  Playlist • {pl.trackCount} song{pl.trackCount === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
        </div>
        {p.playerHidden && (
          <button
            onClick={p.togglePlayerHidden}
            className="flex items-center gap-3 px-2.5 py-2 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent text-sm w-full font-bold transition-all animate-pulse"
          >
            <Eye size={18} />
            <span>Show Music Player</span>
          </button>
        )}
        <Link
          href="/admin"
          onClick={(e) => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              e.preventDefault();
              window.location.href = "/admin";
            }
          }}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/10 text-textdim hover:text-accent text-sm font-semibold"
        >
          <span className="grid place-items-center h-8 w-8 rounded-md bg-accent/20 text-accent">🛡️</span>
          Admin Access
        </Link>
        <Link
          href="/settings"
          onClick={(e) => {
            if (typeof navigator !== "undefined" && !navigator.onLine) {
              e.preventDefault();
              window.location.href = "/settings";
            }
          }}
          className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 text-textdim hover:text-ink text-sm"
        >
          <span className="grid place-items-center h-8 w-8 rounded-md bg-white/5">⚙</span>
          Settings
        </Link>
      </div>
    </aside>
  );
}

function playlistColor(id: number): string {
  const hues = ["#7c3aed", "#ec4899", "#10b981", "#f59e0b", "#06b6d4", "#f43f5e"];
  return hues[id % hues.length];
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-white/10 flex items-stretch justify-around px-2 py-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)]">
      {MOBILE_NAV.map((n) => {
        const active =
          pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={(e) => {
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                e.preventDefault();
                window.location.href = n.href;
              }
            }}
            className={clsx(
              "flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg flex-1",
              active ? "text-ink" : "text-textdim",
            )}
          >
            <Icon size={22} strokeWidth={active ? 2.6 : 2} />
            <span className="text-[10px] font-medium">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
