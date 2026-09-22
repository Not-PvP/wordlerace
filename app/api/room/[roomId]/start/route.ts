import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { ApiError, errorResponse } from "@/lib/game/apiError";
import type { RoomSettings } from "@/types/game";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();
    const player = await authenticatePlayer(db, body.token, roomId);

    if (!player.is_host) throw new ApiError(403, "Only the host can start the race");

    const { data: room } = await db.from("rooms").select("*").eq("id", roomId).maybeSingle();
    if (!room) throw new ApiError(404, "Room not found");
    if (room.status !== "waiting") throw new ApiError(409, "This race has already started");

    const { data: players, error: playersError } = await db
      .from("players")
      .select("id, is_ready")
      .eq("room_id", roomId);
    if (playersError || !players) throw playersError ?? new Error("Failed to load players");

    if (players.length < 1) throw new ApiError(400, "Need at least one player to start");
    if (players.some((p) => !p.is_ready)) {
      throw new ApiError(409, "All players must be ready before starting");
    }

    const settings = room.settings as RoomSettings;
    const now = Date.now();
    const gameStartAt = new Date(now + settings.countdownSeconds * 1000);
    const raceEndTime = new Date(gameStartAt.getTime() + settings.startingTime * 1000);

    const { error: roomUpdateError } = await db
      .from("rooms")
      .update({
        status: "countdown",
        game_start_at: gameStartAt.toISOString(),
        started_at: new Date(now).toISOString(),
      })
      .eq("id", roomId);
    if (roomUpdateError) throw roomUpdateError;

    const { error: playersUpdateError } = await db
      .from("players")
      .update({
        status: "active",
        current_word_index: 0,
        words_solved: 0,
        total_guesses: 0,
        guesses_this_word: 0,
        race_end_time: raceEndTime.toISOString(),
      })
      .eq("room_id", roomId);
    if (playersUpdateError) throw playersUpdateError;

    return NextResponse.json({
      gameStartAt: gameStartAt.toISOString(),
      raceEndTime: raceEndTime.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
