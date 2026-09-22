import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { buildSettings, sanitizeDisplayName, generateUniqueRoomCode } from "@/lib/game/roomLogic";
import { errorResponse } from "@/lib/game/apiError";
import { pickRaceWords } from "@/lib/words";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const displayName = sanitizeDisplayName(body.displayName);
    const settings = buildSettings(body.settings);

    const db = createServiceClient();
    const code = await generateUniqueRoomCode(db);

    const { data: room, error: roomError } = await db
      .from("rooms")
      .insert({ code, status: "waiting", settings })
      .select()
      .single();
    if (roomError || !room) throw roomError ?? new Error("Failed to create room");

    const { data: player, error: playerError } = await db
      .from("players")
      .insert({
        room_id: room.id,
        display_name: displayName,
        is_host: true,
        is_ready: true,
      })
      .select()
      .single();
    if (playerError || !player) throw playerError ?? new Error("Failed to create player");

    const token = randomUUID();
    const { error: tokenError } = await db
      .from("player_tokens")
      .insert({ player_id: player.id, token });
    if (tokenError) throw tokenError;

    await db.from("rooms").update({ host_player_id: player.id }).eq("id", room.id);

    // Extra buffer beyond wordsPerRace: a player who fails a word outright
    // still advances (see guess route), so more target words may be
    // consumed than words_solved ends up counting.
    const words = pickRaceWords(settings.wordsPerRace * 3);
    const wordRows = words.map((word, word_index) => ({ room_id: room.id, word_index, word }));
    const { error: wordsError } = await db.from("room_words").insert(wordRows);
    if (wordsError) throw wordsError;

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
