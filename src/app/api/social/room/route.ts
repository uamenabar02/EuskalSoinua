import { NextRequest, NextResponse } from "next/server";

// In-memory active listening rooms store
type RoomReaction = { id: string; emoji: string; user: string; timestamp: number };
type RoomState = {
  code: string;
  host: string;
  trackId: number | null;
  trackTitle: string | null;
  artistName: string | null;
  thumbnail: string | null;
  users: string[];
  reactions: RoomReaction[];
  updatedAt: number;
};

const rooms = new Map<string, RoomState>();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.toUpperCase();

  if (!code || !rooms.has(code)) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const room = rooms.get(code)!;
  // Clean up old reactions > 10s
  room.reactions = room.reactions.filter((r) => Date.now() - r.timestamp < 10000);

  return NextResponse.json({ room });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, code, user = "Listener", track } = body;

    if (action === "create") {
      const newCode = `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
      const newRoom: RoomState = {
        code: newCode,
        host: user,
        trackId: track?.id ?? null,
        trackTitle: track?.title ?? null,
        artistName: track?.artistName ?? null,
        thumbnail: track?.thumbnail ?? null,
        users: [user],
        reactions: [],
        updatedAt: Date.now(),
      };
      rooms.set(newCode, newRoom);
      return NextResponse.json({ room: newRoom });
    }

    const roomCode = code?.toUpperCase();
    if (!roomCode || !rooms.has(roomCode)) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const room = rooms.get(roomCode)!;

    if (action === "join") {
      if (!room.users.includes(user)) {
        room.users.push(user);
      }
      room.updatedAt = Date.now();
      return NextResponse.json({ room });
    }

    if (action === "sync_track") {
      if (track) {
        room.trackId = track.id;
        room.trackTitle = track.title;
        room.artistName = track.artistName;
        room.thumbnail = track.thumbnail;
        room.updatedAt = Date.now();
      }
      return NextResponse.json({ room });
    }

    if (action === "react") {
      const emoji = body.emoji || "🔥";
      const reaction: RoomReaction = {
        id: Math.random().toString(),
        emoji,
        user,
        timestamp: Date.now(),
      };
      room.reactions.push(reaction);
      room.updatedAt = Date.now();
      return NextResponse.json({ room });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
