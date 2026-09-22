import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { sanitizeDisplayName } from "@/lib/game/roomLogic";
import { ApiError, errorResponse } from "@/lib/game/apiError";
import type { RoomSettings } from "@/types/game";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const displayName = sanitizeDisplayName(body.displayName);
    const rawCode = typeof body.roomCode === "string" ? body.roomCode : "";
    const code = rawCode.trim().toUpperCase();
    if (!code) throw new ApiError(400, "Room code is required");

    const db = createServiceClient();

    // One round trip for both the room and its current players, via
    // PostgREST's foreign-table embedding, instead of two sequential ones.
    const { data: room, error: roomError } = await db
      .from("rooms")
      .select("*, players(id, display_name)")
      .eq("code", code)
      .maybeSingle();
    if (roomError) throw roomError;
    if (!room) throw new ApiError(404, "Room not found");
    if (room.status !== "waiting") throw new ApiError(409, "This race has already started");

    const players = room.players as { id: string; display_name: string }[];
    const settings = room.settings as RoomSettings;
    if (players.length >= settings.maxPlayers) {
      throw new ApiError(409, "This room is full");
    }
    if (players.some((p) => p.display_name.toLowerCase() === displayName.toLowerCase())) {
      throw new ApiError(409, "That name is already taken in this room");
    }

    const playerId = randomUUID();
    const token = randomUUID();

    // player_tokens.player_id has a foreign key on players.id, so this pair
    // has to stay sequential — the token insert would otherwise race the
    // player insert and fail with a foreign-key violation.
    const { error: playerError } = await db.from("players").insert({
      id: playerId,
      room_id: room.id,
      display_name: displayName,
      is_host: false,
      is_ready: false,
    });
    if (playerError) throw playerError;

    const { error: tokenError } = await db
      .from("player_tokens")
      .insert({ player_id: playerId, token });
    if (tokenError) throw tokenError;

    return NextResponse.json({
      roomId: room.id,
      roomCode: room.code,
      playerId,
      token,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
