import answers from "./data/answers.json";
import validGuesses from "./data/valid-guesses.json";

const ANSWERS: string[] = answers;
const VALID_GUESSES_SET = new Set<string>(validGuesses as string[]);

/** Common, recognizable words used as race targets. */
export function getAnswerList(): readonly string[] {
  return ANSWERS;
}

/** Broad dictionary used to accept/reject a submitted guess. */
export function isValidGuess(word: string): boolean {
  return VALID_GUESSES_SET.has(word.toLowerCase());
}

/**
 * Picks `count` target words for a race with no repeats within the race.
 */
export function pickRaceWords(count: number): string[] {
  const pool = [...ANSWERS];
  const picked: string[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }

  return picked;
}
