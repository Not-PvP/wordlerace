import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { maybeFinishRoom } from "@/lib/game/roomLogic";
import { GAME_CONFIG } from "@/lib/game/config";
import { ApiError, errorResponse } from "@/lib/game/apiError";

/**
 * Called by the client when its local countdown hits zero. The elimination
 * only actually happens if the server's own clock agrees (within a small
 * grace window, to tolerate ordinary client/server clock drift) that the
 * player's authoritative race_end_time has passed — the client cannot
 * eliminate (or avoid eliminating) itself by lying about the time.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();
    const player = await authenticatePlayer(db, body.token, roomId);

    if (player.status !== "active") {
      return NextResponse.json({ status: player.status });
    }

    const raceEndTime = player.race_end_time ? new Date(player.race_end_time).getTime() : 0;
    if (Date.now() < raceEndTime - GAME_CONFIG.eliminationGraceMs) {
      throw new ApiError(400, "Time has not run out yet");
    }

    const { error: updateError } = await db
      .from("players")
      .update({ status: "eliminated" })
      .eq("id", player.id);
    if (updateError) throw updateError;

    after(() => maybeFinishRoom(db, roomId));

    // Tell the player what they were stuck on — safe now that their race
    // is over, and it's the same target word the server already validated
    // their guesses against.
    const { data: targetRow } = await db
      .from("room_words")
      .select("word")
      .eq("room_id", roomId)
      .eq("word_index", player.current_word_index)
      .maybeSingle();

    return NextResponse.json({ status: "eliminated", revealedWord: targetRow?.word });
  } catch (err) {
    return errorResponse(err);
  }
}
