/**
 * Central game configuration. Change values here to retune the game —
 * nothing else in the codebase should hard-code these numbers.
 */
export const GAME_CONFIG = {
  wordLength: 5,
  maxGuesses: 6,
  startingTime: 90, // seconds each player starts the race with
  correctWordBonus: 15, // seconds added when a player solves a word
  wordsPerRace: 20, // race ends for a player once they solve this many words
  countdownSeconds: 3,
  maxPlayers: 8,
  roomCodeLength: 5,
  // Safety margin (ms) given to clients before the server treats a race
  // timer as expired, to absorb network latency / clock drift.
  eliminationGraceMs: 1500,
} as const;

export type GameConfig = typeof GAME_CONFIG;
