import assert from "node:assert";
import { matchGuess, isSolved, deriveKeyboardStatus } from "./wordMatch";

function statuses(guess: string, target: string) {
  return matchGuess(guess, target).map((r) => r.status);
}

// Target APPLE, guess ALERT — classic duplicate-letter edge case.
// A: correct (pos 0). L: target has one L at pos 3, guess L is at pos 1 -> present.
// E: target E at pos 4, guess E at pos 2 -> present. R: absent. T: absent.
assert.deepStrictEqual(statuses("ALERT", "APPLE"), [
  "correct",
  "present",
  "present",
  "absent",
  "absent",
]);

// Guess has more repeats than target: target "BATCH", guess "ABBEY" -> only one B available.
assert.deepStrictEqual(statuses("ABBEY", "BATCH"), [
  "present",
  "present",
  "absent",
  "absent",
  "absent",
]);

// Exact match.
assert.deepStrictEqual(statuses("APPLE", "APPLE"), [
  "correct",
  "correct",
  "correct",
  "correct",
  "correct",
]);
assert.strictEqual(isSolved(matchGuess("APPLE", "APPLE")), true);
assert.strictEqual(isSolved(matchGuess("ALERT", "APPLE")), false);

// Double E in target, D and E both remain unclaimed for the guess's D and E.
assert.deepStrictEqual(statuses("ABIDE", "SPEED"), [
  "absent",
  "absent",
  "absent",
  "present",
  "present",
]);

// Keyboard status keeps the best status seen per letter.
const kb = deriveKeyboardStatus([matchGuess("ALERT", "APPLE"), matchGuess("APPLE", "APPLE")]);
assert.strictEqual(kb["a"], "correct");
assert.strictEqual(kb["l"], "correct"); // upgraded from "present" to "correct" by second guess
assert.strictEqual(kb["r"], "absent");

console.log("wordMatch: all assertions passed");
