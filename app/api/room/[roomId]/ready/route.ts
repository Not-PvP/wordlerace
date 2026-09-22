import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { ApiError, errorResponse } from "@/lib/game/apiError";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();
    const player = await authenticatePlayer(db, body.token, roomId);

    const { data: room } = await db.from("rooms").select("status").eq("id", roomId).maybeSingle();
    if (!room) throw new ApiError(404, "Room not found");
    if (room.status !== "waiting") throw new ApiError(409, "This race has already started");

    const ready = Boolean(body.ready);
    await db.from("players").update({ is_ready: ready }).eq("id", player.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
