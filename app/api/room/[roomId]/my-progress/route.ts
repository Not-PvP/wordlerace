import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { authenticatePlayer } from "@/lib/game/auth";
import { errorResponse } from "@/lib/game/apiError";
import { matchGuess } from "@/lib/game/wordMatch";

/**
 * Reconstructs the guesses already made on the player's *current* word, so
 * a page refresh mid-word can restore the grid instead of showing it blank.
 * Nothing new is stored for this — the guesses table already has the raw
 * guess text, and the target word is re-matched against it the same way
 * the guess route does, rather than persisting colored results separately.
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

    const [{ data: guessRows, error: guessesError }, { data: target }] = await Promise.all([
      db
        .from("guesses")
        .select("guess")
        .eq("player_id", player.id)
        .eq("word_index", player.current_word_index)
        .order("created_at", { ascending: true }),
      db
        .from("room_words")
        .select("word")
        .eq("room_id", roomId)
        .eq("word_index", player.current_word_index)
        .maybeSingle(),
    ]);
    if (guessesError) throw guessesError;

    const guesses = target
      ? (guessRows ?? []).map((row) => matchGuess(row.guess, target.word))
      : [];

    return NextResponse.json({ guesses });
  } catch (err) {
    return errorResponse(err);
  }
}
