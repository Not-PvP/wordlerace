import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./apiError";
import type { PlayerRow } from "@/types/game";

/**
 * Resolves a bearer token to the player it belongs to, scoped to a room.
 * This is the server's only way of knowing "which player is making this
 * request" — the client never gets to just assert a player id.
 */
export async function authenticatePlayer(
  db: SupabaseClient,
  token: string | undefined,
  roomId: string
): Promise<PlayerRow> {
  if (!token) {
    throw new ApiError(401, "Missing player token");
  }

  // One round trip instead of two: embed the player row via the
  // player_tokens -> players foreign key rather than looking up the token,
  // then separately looking up the player it points to.
  const { data: tokenRow, error: tokenError } = await db
    .from("player_tokens")
    .select("players(*)")
    .eq("token", token)
    .maybeSingle();

  const player = tokenRow?.players as PlayerRow | null | undefined;

  if (tokenError || !player) {
    throw new ApiError(401, "Invalid player token");
  }

  if (player.room_id !== roomId) {
    throw new ApiError(403, "Player does not belong to this room");
  }

  return player;
}
