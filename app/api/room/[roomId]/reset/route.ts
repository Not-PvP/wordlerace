import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { ApiError, errorResponse } from "@/lib/game/apiError";
import { pickRaceWords } from "@/lib/words";
import type { RoomSettings } from "@/types/game";

/** Host-only: returns a finished room to the lobby for a rematch. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();
    const player = await authenticatePlayer(db, body.token, roomId);

    if (!player.is_host) throw new ApiError(403, "Only the host can start a new race");

    const { data: room } = await db.from("rooms").select("*").eq("id", roomId).maybeSingle();
    if (!room) throw new ApiError(404, "Room not found");
    if (room.status !== "finished") throw new ApiError(409, "Race is still in progress");

    const settings = room.settings as RoomSettings;

    await db.from("room_words").delete().eq("room_id", roomId);
    const words = pickRaceWords(settings.wordsPerRace * 3);
    await db
      .from("room_words")
      .insert(words.map((word, word_index) => ({ room_id: roomId, word_index, word })));

    await db
      .from("rooms")
      .update({ status: "waiting", game_start_at: null, started_at: null, ended_at: null })
      .eq("id", roomId);

    await db
      .from("players")
      .update({
        is_ready: false,
        status: "active",
        current_word_index: 0,
        words_solved: 0,
        total_guesses: 0,
        guesses_this_word: 0,
        race_end_time: null,
      })
      .eq("room_id", roomId)
      .eq("is_host", false);

    await db
      .from("players")
      .update({
        is_ready: true,
        status: "active",
        current_word_index: 0,
        words_solved: 0,
        total_guesses: 0,
        guesses_this_word: 0,
        race_end_time: null,
      })
      .eq("room_id", roomId)
      .eq("is_host", true);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
