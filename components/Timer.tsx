interface TimerProps {
  remainingMs: number;
  bonusFlash?: number | null;
}

export function Timer({ remainingMs, bonusFlash }: TimerProps) {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const label = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}`;
  const low = totalSeconds <= 10;

  return (
    <div className="relative flex flex-col items-center">
      <span
        role="timer"
        aria-live="polite"
        className={`font-mono text-5xl font-bold tabular-nums sm:text-6xl ${
          low ? "text-red-600" : "text-foreground"
        }`}
      >
        {label}
      </span>
      <div className="h-6">
        {bonusFlash ? (
          <span className="text-sm font-semibold text-tile-correct" aria-hidden="true">
            +{bonusFlash} sec
          </span>
        ) : null}
      </div>
    </div>
  );
}
