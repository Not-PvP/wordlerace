import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { buildSettings, sanitizeDisplayName } from "@/lib/game/roomLogic";
import { generateRoomCode } from "@/lib/game/roomCode";
import { ApiError, errorResponse } from "@/lib/game/apiError";
import { GAME_CONFIG } from "@/lib/game/config";
import { pickRaceWords } from "@/lib/words";
import type { RoomRow } from "@/types/game";

const UNIQUE_VIOLATION = "23505";
const MAX_CODE_ATTEMPTS = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const displayName = sanitizeDisplayName(body.displayName);
    const settings = buildSettings(body.settings);

    const db = createServiceClient();

    // The host player id is known up front, so it can go straight into the
    // room row (there's no FK on host_player_id, so ordering doesn't
    // matter) instead of a separate UPDATE after the player exists.
    const hostPlayerId = randomUUID();
    const token = randomUUID();

    // Insert-and-retry instead of check-then-insert: a code collision is
    // rare (32^5 codes), so this is one round trip in the common case
    // instead of always paying for a SELECT before the INSERT.
    let room: RoomRow | null = null;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateRoomCode(GAME_CONFIG.roomCodeLength);
      const { data, error } = await db
        .from("rooms")
        .insert({ code, status: "waiting", settings, host_player_id: hostPlayerId })
        .select()
        .single();

      if (!error) {
        room = data;
        break;
      }
      if (error.code !== UNIQUE_VIOLATION) throw error;
    }
    if (!room) throw new ApiError(500, "Could not allocate a room code, please try again");

    // Extra buffer beyond wordsPerRace: a player who fails a word outright
    // still advances (see guess route), so more target words may be
    // consumed than words_solved ends up counting.
    const words = pickRaceWords(settings.wordsPerRace * 3);

    // player_tokens.player_id has a foreign key on players.id, so the token
    // insert can't run until the player row actually exists — that pair has
    // to stay sequential. room_words has no such dependency, so it runs
    // alongside that pair instead of after it.
    const [, wordsResult] = await Promise.all([
      (async () => {
        const { error: playerError } = await db.from("players").insert({
          id: hostPlayerId,
          room_id: room.id,
          display_name: displayName,
          is_host: true,
          is_ready: true,
        });
        if (playerError) throw playerError;

        const { error: tokenError } = await db
          .from("player_tokens")
          .insert({ player_id: hostPlayerId, token });
        if (tokenError) throw tokenError;
      })(),
      db.from("room_words").insert(
        words.map((word, word_index) => ({ room_id: room.id, word_index, word }))
      ),
    ]);

    if (wordsResult.error) throw wordsResult.error;

    return NextResponse.json({
      roomId: room.id,
      roomCode: room.code,
      playerId: hostPlayerId,
      token,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
