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

    const [player, room] = await Promise.all([
      authenticatePlayer(db, body.token, roomId),
      db
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle()
        .then(({ data }) => data),
    ]);

    if (!player.is_host) throw new ApiError(403, "Only the host can start a new race");
    if (!room) throw new ApiError(404, "Room not found");
    if (room.status !== "finished") throw new ApiError(409, "Race is still in progress");

    const settings = room.settings as RoomSettings;
    const words = pickRaceWords(settings.wordsPerRace * 3);

    const resetFields = {
      status: "active" as const,
      current_word_index: 0,
      words_solved: 0,
      total_guesses: 0,
      guesses_this_word: 0,
      race_end_time: null,
    };

    // None of these touch the same rows, so they all run together: the
    // room_words replacement (delete must finish before insert, since both
    // use the same (room_id, word_index) primary key), the room row, and
    // the two player groups (host vs. non-host only differ in is_ready).
    const results = await Promise.all([
      (async () => {
        const { error: deleteError } = await db.from("room_words").delete().eq("room_id", roomId);
        if (deleteError) throw deleteError;
        return db
          .from("room_words")
          .insert(words.map((word, word_index) => ({ room_id: roomId, word_index, word })));
      })(),
      db
        .from("rooms")
        .update({ status: "waiting", game_start_at: null, started_at: null, ended_at: null })
        .eq("id", roomId),
      db
        .from("players")
        .update({ ...resetFields, is_ready: false })
        .eq("room_id", roomId)
        .eq("is_host", false),
      db
        .from("players")
        .update({ ...resetFields, is_ready: true })
        .eq("room_id", roomId)
        .eq("is_host", true),
    ]);

    for (const result of results) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
