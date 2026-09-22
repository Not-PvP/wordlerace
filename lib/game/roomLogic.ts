import type { SupabaseClient } from "@supabase/supabase-js";
import { GAME_CONFIG } from "./config";
import type { RoomSettings } from "@/types/game";
import { ApiError } from "./apiError";

const DISPLAY_NAME_MAX_LENGTH = 20;

export function buildSettings(overrides?: Partial<RoomSettings>): RoomSettings {
  const settings: RoomSettings = {
    wordLength: GAME_CONFIG.wordLength,
    maxGuesses: GAME_CONFIG.maxGuesses,
    startingTime: GAME_CONFIG.startingTime,
    correctWordBonus: GAME_CONFIG.correctWordBonus,
    wordsPerRace: GAME_CONFIG.wordsPerRace,
    countdownSeconds: GAME_CONFIG.countdownSeconds,
    maxPlayers: GAME_CONFIG.maxPlayers,
  };

  if (overrides?.startingTime) {
    settings.startingTime = clamp(overrides.startingTime, 20, 300);
  }
  if (overrides?.correctWordBonus) {
    settings.correctWordBonus = clamp(overrides.correctWordBonus, 0, 60);
  }
  if (overrides?.wordsPerRace) {
    settings.wordsPerRace = clamp(overrides.wordsPerRace, 1, 50);
  }
  if (overrides?.maxPlayers) {
    settings.maxPlayers = clamp(overrides.maxPlayers, 2, GAME_CONFIG.maxPlayers);
  }

  return settings;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeDisplayName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ApiError(400, "Display name is required");
  }
  const trimmed = raw.trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
  if (trimmed.length === 0) {
    throw new ApiError(400, "Display name is required");
  }
  return trimmed;
}

/**
 * If every player in the room has finished the race or been eliminated,
 * marks the room finished. Called after any player-state transition.
 */
export async function maybeFinishRoom(db: SupabaseClient, roomId: string): Promise<void> {
  const { data: players, error } = await db
    .from("players")
    .select("status")
    .eq("room_id", roomId);

  if (error || !players || players.length === 0) return;

  const allDone = players.every((p) => p.status === "eliminated" || p.status === "finished");
  if (!allDone) return;

  await db
    .from("rooms")
    .update({ status: "finished", ended_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("status", "countdown"); // no-op if already finished
}
