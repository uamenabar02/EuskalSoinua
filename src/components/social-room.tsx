"use client";

import { useState, useEffect } from "react";
import { Users, Radio, Send, Heart, Flame, Sparkles, Copy, Check, LogOut, Volume2 } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { useToast } from "@/lib/toast";

export function SocialRoom() {
  const p = usePlayer();
  const { toast } = useToast();

  const [code, setCode] = useState("");
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [userName, setUserName] = useState("BasqueFan");
  const [copied, setCopied] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string }[]>([]);

  // Poll room status every 3s if joined
  useEffect(() => {
    if (!activeRoom?.code) return;

    const interval = setInterval(() => {
      fetch(`/api/social/room?code=${activeRoom.code}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.room) {
            setActiveRoom(data.room);
            if (data.room.reactions?.length > 0) {
              setFloatingReactions(data.room.reactions.slice(-8));
            }
          }
        })
        .catch((err) => console.error("Poll error:", err));
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRoom?.code]);

  // Sync current playing track with room
  useEffect(() => {
    if (activeRoom && p.current) {
      fetch("/api/social/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_track",
          code: activeRoom.code,
          track: p.current,
        }),
      });
    }
  }, [p.current?.id, activeRoom?.code]);

  const createRoom = async () => {
    try {
      const res = await fetch("/api/social/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          user: userName,
          track: p.current,
        }),
      });
      const data = await res.json();
      if (data.room) {
        setActiveRoom(data.room);
        toast(`Room ${data.room.code} created!`, "🎉");
      }
    } catch (err) {
      toast("Could not create room", "❌");
    }
  };

  const joinRoom = async () => {
    if (!code.trim()) return;
    try {
      const res = await fetch("/api/social/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join",
          code: code.trim(),
          user: userName,
        }),
      });
      const data = await res.json();
      if (data.room) {
        setActiveRoom(data.room);
        toast(`Joined room ${data.room.code}!`, "🎧");
      } else {
        toast("Room not found", "❌");
      }
    } catch (err) {
      toast("Error joining room", "❌");
    }
  };

  const sendReaction = async (emoji: string) => {
    if (!activeRoom) return;
    try {
      await fetch("/api/social/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "react",
          code: activeRoom.code,
          user: userName,
          emoji,
        }),
      });
      setFloatingReactions((prev) => [...prev, { id: Math.random().toString(), emoji }]);
    } catch (err) {}
  };

  const copyCode = () => {
    if (activeRoom?.code) {
      navigator.clipboard.writeText(activeRoom.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast("Room code copied to clipboard", "📋");
    }
  };

  return (
    <div className="bg-bg-soft rounded-2xl border border-white/5 p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-accent/10 text-accent">
            <Users size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">Live Social Listening Room</h3>
            <p className="text-xs text-textdim">Listen together in real time and send live reactions</p>
          </div>
        </div>

        {activeRoom && (
          <button
            onClick={() => setActiveRoom(null)}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 font-bold px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition"
          >
            <LogOut size={13} /> Leave
          </button>
        )}
      </div>

      {!activeRoom ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Your nickname"
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={createRoom}
              className="bg-accent text-black font-extrabold py-3 rounded-xl text-xs hover:scale-[1.02] transition flex items-center justify-center gap-2 shadow-lg shadow-accent/15 cursor-pointer"
            >
              <Radio size={16} /> Host New Listening Room
            </button>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter Room Code (e.g. ROOM-1234)"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white uppercase focus:outline-none focus:border-accent"
              />
              <button
                onClick={joinRoom}
                className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer shrink-0"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4 pt-2 animate-fade-in">
          {/* Active Room Card */}
          <div className="bg-black/40 border border-accent/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-accent">ROOM CODE:</span>
                <span className="text-sm font-extrabold text-white tracking-widest">{activeRoom.code}</span>
                <button
                  onClick={copyCode}
                  className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition"
                  title="Copy room code"
                >
                  {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="text-xs text-textdim mt-1 flex items-center gap-2">
                <span>Listeners ({activeRoom.users?.length || 1}):</span>
                <span className="text-white font-semibold">{activeRoom.users?.join(", ")}</span>
              </div>
            </div>

            {/* Currently Playing in Room */}
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/5 max-w-xs">
              <Volume2 size={16} className="text-accent shrink-0 animate-pulse" />
              <div className="min-w-0 text-xs">
                <span className="block font-bold text-white truncate">
                  {activeRoom.trackTitle || "No track active"}
                </span>
                <span className="block text-[10px] text-textdim truncate">
                  {activeRoom.artistName || "Select a song to start broadcasting"}
                </span>
              </div>
            </div>
          </div>

          {/* Live Floating Reaction Buttons */}
          <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border border-white/5">
            <span className="text-xs font-bold text-textdim">Send Live Reactions:</span>
            <div className="flex gap-2">
              {["🔥", "🤘", "❤️", "⚡", "👏", "🎉"].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className="text-lg p-2 rounded-xl hover:bg-white/10 active:scale-125 transition cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Floating emoji animation display */}
          <div className="relative h-12 overflow-hidden flex items-center justify-end gap-3 pr-4">
            {floatingReactions.slice(-6).map((r) => (
              <span key={r.id} className="text-2xl animate-bounce">
                {r.emoji}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
