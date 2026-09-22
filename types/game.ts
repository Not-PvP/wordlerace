import type { LetterResult } from "@/lib/game/wordMatch";

export type RoomStatus = "waiting" | "countdown" | "playing" | "finished";
export type PlayerStatus = "active" | "eliminated" | "finished";

export interface RoomSettings {
  wordLength: number;
  maxGuesses: number;
  startingTime: number;
  correctWordBonus: number;
  wordsPerRace: number;
  countdownSeconds: number;
  maxPlayers: number;
}

export interface RoomRow {
  id: string;
  code: string;
  host_player_id: string | null;
  status: RoomStatus;
  settings: RoomSettings;
  game_start_at: string | null; // ISO timestamp — when PLAYING begins (after countdown)
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface PlayerRow {
  id: string;
  room_id: string;
  display_name: string;
  is_host: boolean;
  is_ready: boolean;
  status: PlayerStatus;
  current_word_index: number;
  words_solved: number;
  total_guesses: number;
  guesses_this_word: number;
  race_end_time: string | null; // ISO timestamp, server-authoritative
  created_at: string;
}

/** Client-side app states, distinct from the DB's RoomStatus. */
export type ClientGameState =
  | "HOME"
  | "LOBBY"
  | "COUNTDOWN"
  | "PLAYING"
  | "PLAYER_ELIMINATED"
  | "GAME_FINISHED"
  | "ERROR";

export interface GuessResponse {
  result: LetterResult[];
  correct: boolean;
  raceEndTime: string;
  wordsSolved: number;
  currentWordIndex: number;
  playerStatus: PlayerStatus;
  message?: string;
}

export interface ApiError {
  error: string;
}
