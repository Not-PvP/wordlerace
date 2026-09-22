import type { LetterStatus } from "@/lib/game/wordMatch";

const ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["enter", "z", "x", "c", "v", "b", "n", "m", "backspace"],
];

const statusClasses: Record<LetterStatus, string> = {
  correct: "bg-tile-correct border-tile-correct text-white",
  present: "bg-tile-present border-tile-present text-white",
  absent: "bg-tile-absent border-tile-absent text-white",
};

interface KeyboardProps {
  letterStatus: Record<string, LetterStatus>;
  onKey: (key: string) => void;
  disabled?: boolean;
}

export function Keyboard({ letterStatus, onKey, disabled }: KeyboardProps) {
  return (
    <div className="flex w-full max-w-lg flex-col gap-1 sm:gap-1.5" aria-label="On-screen keyboard">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-1 sm:gap-1.5">
          {row.map((key) => {
            const isWide = key === "enter" || key === "backspace";
            const status = letterStatus[key];
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => onKey(key)}
                aria-label={key === "backspace" ? "Backspace" : key === "enter" ? "Enter" : key}
                className={`flex h-11 items-center justify-center rounded-md border text-[0.65rem] font-semibold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-50 sm:h-14 sm:text-sm ${
                  isWide ? "min-w-10 px-1.5 sm:min-w-16 sm:px-2" : "w-7 sm:w-10"
                } ${status ? statusClasses[status] : "border-border bg-zinc-100 text-foreground hover:bg-zinc-200"}`}
              >
                {key === "backspace" ? "⌫" : key === "enter" ? "Enter" : key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
