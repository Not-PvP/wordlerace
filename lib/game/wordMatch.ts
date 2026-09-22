export type LetterStatus = "correct" | "present" | "absent";

export interface LetterResult {
  letter: string;
  status: LetterStatus;
}

/**
 * Standard two-pass Wordle matching. Handles duplicate letters correctly:
 * pass 1 claims exact-position matches, pass 2 only marks a letter "present"
 * while an unclaimed occurrence of it still remains in the target.
 */
export function matchGuess(guess: string, target: string): LetterResult[] {
  const g = guess.toLowerCase().split("");
  const t = target.toLowerCase().split("");
  const length = t.length;

  const result: LetterResult[] = new Array(length);
  const targetUsed = new Array(length).fill(false);

  // Pass 1: exact-position matches.
  for (let i = 0; i < length; i++) {
    if (g[i] === t[i]) {
      result[i] = { letter: g[i], status: "correct" };
      targetUsed[i] = true;
    }
  }

  // Pass 2: present-but-wrong-position, consuming only unused target letters.
  for (let i = 0; i < length; i++) {
    if (result[i]) continue;

    let foundIndex = -1;
    for (let j = 0; j < length; j++) {
      if (!targetUsed[j] && t[j] === g[i]) {
        foundIndex = j;
        break;
      }
    }

    if (foundIndex !== -1) {
      result[i] = { letter: g[i], status: "present" };
      targetUsed[foundIndex] = true;
    } else {
      result[i] = { letter: g[i], status: "absent" };
    }
  }

  return result;
}

export function isSolved(result: LetterResult[]): boolean {
  return result.every((r) => r.status === "correct");
}

/**
 * Derives per-letter keyboard states from guess history, keeping the best
 * status seen for each letter (correct > present > absent).
 */
export function deriveKeyboardStatus(
  guesses: LetterResult[][]
): Record<string, LetterStatus> {
  const rank: Record<LetterStatus, number> = { absent: 0, present: 1, correct: 2 };
  const statuses: Record<string, LetterStatus> = {};

  for (const guess of guesses) {
    for (const { letter, status } of guess) {
      const current = statuses[letter];
      if (!current || rank[status] > rank[current]) {
        statuses[letter] = status;
      }
    }
  }

  return statuses;
}
