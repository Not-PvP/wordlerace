import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { maybeFinishRoom } from "@/lib/game/roomLogic";
import { ApiError, errorResponse } from "@/lib/game/apiError";

/**
 * Called by the client when its local countdown hits zero. The elimination
 * only actually happens if the server's own clock agrees the player's
 * authoritative race_end_time has passed — the client cannot eliminate
 * (or avoid eliminating) itself by lying about the time.
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
    if (Date.now() < raceEndTime) {
      throw new ApiError(400, "Time has not run out yet");
    }

    await db.from("players").update({ status: "eliminated" }).eq("id", player.id);
    await maybeFinishRoom(db, roomId);

    return NextResponse.json({ status: "eliminated" });
  } catch (err) {
    return errorResponse(err);
  }
}
