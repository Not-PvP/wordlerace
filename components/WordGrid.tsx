import type { LetterResult } from "@/lib/game/wordMatch";

interface WordGridProps {
  wordLength: number;
  maxGuesses: number;
  rows: LetterResult[][];
  currentGuess: string;
  shake: boolean;
  submitting: boolean;
}

const statusClasses: Record<LetterResult["status"], string> = {
  correct: "bg-tile-correct border-tile-correct text-white",
  present: "bg-tile-present border-tile-present text-white",
  absent: "bg-tile-absent border-tile-absent text-white",
};

export function WordGrid({
  wordLength,
  maxGuesses,
  rows,
  currentGuess,
  shake,
  submitting,
}: WordGridProps) {
  const emptyRowCount = Math.max(0, maxGuesses - rows.length - 1);
  const showCurrentRow = rows.length < maxGuesses;

  return (
    <div
      className="flex flex-col gap-1.5"
      role="group"
      aria-label={`Word grid, ${rows.length} of ${maxGuesses} guesses used`}
    >
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {row.map((cell, cellIndex) => (
            <div
              key={cellIndex}
              className={`flex h-12 w-12 items-center justify-center border-2 text-xl font-bold uppercase sm:h-14 sm:w-14 sm:text-2xl animate-tile-flip ${statusClasses[cell.status]}`}
              style={{ animationDelay: `${cellIndex * 80}ms` }}
              aria-label={`${cell.letter || "blank"}: ${cell.status}`}
            >
              {cell.letter}
            </div>
          ))}
        </div>
      ))}

      {showCurrentRow && (
        <div
          className={`flex gap-1.5 ${shake ? "animate-shake" : ""} ${
            submitting ? "animate-pulse" : ""
          }`}
        >
          {Array.from({ length: wordLength }).map((_, i) => (
            <div
              key={i}
              className="flex h-12 w-12 items-center justify-center border-2 border-border text-xl font-bold uppercase text-foreground sm:h-14 sm:w-14 sm:text-2xl"
            >
              {currentGuess[i] ?? ""}
            </div>
          ))}
        </div>
      )}

      {Array.from({ length: emptyRowCount }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {Array.from({ length: wordLength }).map((_, cellIndex) => (
            <div
              key={cellIndex}
              className="h-12 w-12 border-2 border-border/60 sm:h-14 sm:w-14"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
