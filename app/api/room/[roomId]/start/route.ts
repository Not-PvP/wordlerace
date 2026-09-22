import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { ApiError, errorResponse } from "@/lib/game/apiError";
import type { RoomRow, RoomSettings } from "@/types/game";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();

    // Auth and the room+players read don't depend on each other, so they
    // run concurrently. The room/players query is combined into one
    // request via embedding instead of two separate ones.
    const [player, room] = await Promise.all([
      authenticatePlayer(db, body.token, roomId),
      db
        .from("rooms")
        .select("*, players(id, is_ready)")
        .eq("id", roomId)
        .maybeSingle()
        .then(({ data }) => data as (RoomRow & { players: { id: string; is_ready: boolean }[] }) | null),
    ]);

    if (!player.is_host) throw new ApiError(403, "Only the host can start the race");
    if (!room) throw new ApiError(404, "Room not found");
    if (room.status !== "waiting") throw new ApiError(409, "This race has already started");

    const players = room.players;
    if (players.length < 1) throw new ApiError(400, "Need at least one player to start");
    if (players.some((p) => !p.is_ready)) {
      throw new ApiError(409, "All players must be ready before starting");
    }

    const settings = room.settings as RoomSettings;
    const now = Date.now();
    const gameStartAt = new Date(now + settings.countdownSeconds * 1000);
    const raceEndTime = new Date(gameStartAt.getTime() + settings.startingTime * 1000);

    // These two updates touch different tables and don't depend on each
    // other's result, so they run together instead of one after the other.
    const [roomUpdate, playersUpdate] = await Promise.all([
      db
        .from("rooms")
        .update({
          status: "countdown",
          game_start_at: gameStartAt.toISOString(),
          started_at: new Date(now).toISOString(),
        })
        .eq("id", roomId),
      db
        .from("players")
        .update({
          status: "active",
          current_word_index: 0,
          words_solved: 0,
          total_guesses: 0,
          guesses_this_word: 0,
          race_end_time: raceEndTime.toISOString(),
        })
        .eq("room_id", roomId),
    ]);
    if (roomUpdate.error) throw roomUpdate.error;
    if (playersUpdate.error) throw playersUpdate.error;

    return NextResponse.json({
      gameStartAt: gameStartAt.toISOString(),
      raceEndTime: raceEndTime.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
