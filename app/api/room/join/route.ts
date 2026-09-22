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

    const { data: room } = await db.from("rooms").select("*").eq("code", code).maybeSingle();
    if (!room) throw new ApiError(404, "Room not found");
    if (room.status !== "waiting") throw new ApiError(409, "This race has already started");

    const { data: players, error: playersError } = await db
      .from("players")
      .select("id, display_name")
      .eq("room_id", room.id);
    if (playersError) throw playersError;

    const settings = room.settings as RoomSettings;
    if (players.length >= settings.maxPlayers) {
      throw new ApiError(409, "This room is full");
    }
    if (players.some((p) => p.display_name.toLowerCase() === displayName.toLowerCase())) {
      throw new ApiError(409, "That name is already taken in this room");
    }

    const { data: player, error: playerError } = await db
      .from("players")
      .insert({ room_id: room.id, display_name: displayName, is_host: false, is_ready: false })
      .select()
      .single();
    if (playerError || !player) throw playerError ?? new Error("Failed to join room");

    const token = randomUUID();
    const { error: tokenError } = await db
      .from("player_tokens")
      .insert({ player_id: player.id, token });
    if (tokenError) throw tokenError;

    return NextResponse.json({
      roomId: room.id,
      roomCode: room.code,
      playerId: player.id,
      token,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
