import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { ApiError, errorResponse } from "@/lib/game/apiError";
import { maybeFinishRoom } from "@/lib/game/roomLogic";
import { GAME_CONFIG } from "@/lib/game/config";
import { matchGuess, isSolved } from "@/lib/game/wordMatch";
import { isValidGuess } from "@/lib/words";
import type { GuessResponse, RoomSettings } from "@/types/game";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const body = await req.json().catch(() => ({}));
    const db = createServiceClient();

    // Cheap, DB-free validation first so malformed requests never cost a
    // round trip. wordLength is always GAME_CONFIG's — settings never
    // override it — so this doesn't need the room row.
    const wordIndex = Number(body.wordIndex);
    if (!Number.isInteger(wordIndex) || wordIndex < 0) {
      throw new ApiError(400, "Invalid word index");
    }
    const rawGuess = typeof body.guess === "string" ? body.guess.trim().toLowerCase() : "";
    if (rawGuess.length !== GAME_CONFIG.wordLength || !/^[a-z]+$/.test(rawGuess)) {
      throw new ApiError(400, "Guess must be a single word");
    }
    if (!isValidGuess(rawGuess)) {
      throw new ApiError(422, "Not in word list");
    }

    // These three don't depend on each other, so fetch them concurrently
    // instead of round-tripping one at a time. (The target word is fetched
    // for whatever wordIndex was requested; it's only used once we've
    // confirmed below that it actually matches the player's current word.)
    const [player, room, targetRow] = await Promise.all([
      authenticatePlayer(db, body.token, roomId),
      db
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .maybeSingle()
        .then(({ data }) => data),
      db
        .from("room_words")
        .select("word")
        .eq("room_id", roomId)
        .eq("word_index", wordIndex)
        .maybeSingle()
        .then(({ data }) => data),
    ]);

    if (!room) throw new ApiError(404, "Room not found");

    const settings = room.settings as RoomSettings;
    const now = Date.now();
    const gameStartAt = room.game_start_at ? new Date(room.game_start_at).getTime() : null;

    if (room.status === "finished") {
      throw new ApiError(409, "This race has already finished");
    }
    if (room.status !== "countdown" || gameStartAt === null || now < gameStartAt) {
      throw new ApiError(400, "The race hasn't started yet");
    }

    if (player.status !== "active") {
      throw new ApiError(409, `You are ${player.status} in this race`);
    }

    const raceEndTime = player.race_end_time ? new Date(player.race_end_time).getTime() : null;
    if (raceEndTime === null || now > raceEndTime + GAME_CONFIG.eliminationGraceMs) {
      await db.from("players").update({ status: "eliminated" }).eq("id", player.id);
      after(() => maybeFinishRoom(db, roomId));
      throw new ApiError(410, "Your time ran out");
    }

    if (wordIndex !== player.current_word_index) {
      throw new ApiError(409, "Word out of sync, please refresh");
    }

    // Ran out of pre-generated target words (extreme edge case) — finish the
    // player gracefully rather than erroring.
    if (!targetRow) {
      await db.from("players").update({ status: "finished" }).eq("id", player.id);
      after(() => maybeFinishRoom(db, roomId));
      throw new ApiError(410, "No more words available — race complete for you");
    }

    const target = targetRow.word;
    const result = matchGuess(rawGuess, target);
    const correct = isSolved(result);
    const exhausted = !correct && player.guesses_this_word + 1 >= settings.maxGuesses;

    let newRaceEndTime = raceEndTime;
    let newWordsSolved = player.words_solved;
    let newWordIndex = player.current_word_index;
    let newGuessesThisWord = player.guesses_this_word + 1;
    let newStatus: "active" | "finished" = "active";

    if (correct) {
      newRaceEndTime = raceEndTime + settings.correctWordBonus * 1000;
      newWordsSolved = player.words_solved + 1;
      newWordIndex = player.current_word_index + 1;
      newGuessesThisWord = 0;
    } else if (exhausted) {
      // Word not solved within the guess limit: move on without a bonus so
      // one hard word can't strand a player for the rest of the race.
      newWordIndex = player.current_word_index + 1;
      newGuessesThisWord = 0;
    }

    if (newWordsSolved >= settings.wordsPerRace) {
      newStatus = "finished";
    }

    // The only write the response actually depends on. Guess history and
    // the room-finished check don't affect what we tell this player, so
    // they run after the response is sent instead of adding to its latency.
    const { error: updateError } = await db
      .from("players")
      .update({
        total_guesses: player.total_guesses + 1,
        guesses_this_word: newGuessesThisWord,
        race_end_time: new Date(newRaceEndTime).toISOString(),
        words_solved: newWordsSolved,
        current_word_index: newWordIndex,
        status: newStatus,
      })
      .eq("id", player.id);
    if (updateError) throw updateError;

    after(async () => {
      await db.from("guesses").insert({
        player_id: player.id,
        room_id: roomId,
        word_index: wordIndex,
        guess: rawGuess,
        correct,
      });
      if (newStatus === "finished") {
        await maybeFinishRoom(db, roomId);
      }
    });

    const response: GuessResponse = {
      result,
      correct,
      raceEndTime: new Date(newRaceEndTime).toISOString(),
      wordsSolved: newWordsSolved,
      currentWordIndex: newWordIndex,
      playerStatus: newStatus,
      message: exhausted ? "Out of guesses — next word!" : undefined,
    };

    return NextResponse.json(response);
  } catch (err) {
    return errorResponse(err);
  }
}
