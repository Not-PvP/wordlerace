interface CountdownProps {
  secondsLeft: number;
}

export function Countdown({ secondsLeft }: CountdownProps) {
  const label = secondsLeft > 0 ? String(secondsLeft) : "GO!";
  return (
    <div className="flex flex-1 items-center justify-center">
      <span
        key={label}
        aria-live="assertive"
        className="animate-solved text-7xl font-bold tabular-nums text-foreground"
      >
        {label}
      </span>
    </div>
  );
}
