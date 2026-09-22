import type { PlayerRow } from "@/types/game";

interface ResultsProps {
  players: PlayerRow[];
  selfId: string | null;
  endedAt: string | null;
  onPlayAgain: () => void;
  onNewRace: () => void;
  onHome: () => void;
  canPlayAgain: boolean;
}

function remainingSecondsAt(player: PlayerRow, endedAt: string | null): number {
  if (player.status !== "finished" || !player.race_end_time || !endedAt) return 0;
  const remaining = new Date(player.race_end_time).getTime() - new Date(endedAt).getTime();
  return Math.max(0, Math.round(remaining / 1000));
}

export function Results({
  players,
  selfId,
  endedAt,
  onPlayAgain,
  onNewRace,
  onHome,
  canPlayAgain,
}: ResultsProps) {
  const ranked = [...players].sort((a, b) => {
    if (b.words_solved !== a.words_solved) return b.words_solved - a.words_solved;
    const remainingDiff = remainingSecondsAt(b, endedAt) - remainingSecondsAt(a, endedAt);
    if (remainingDiff !== 0) return remainingDiff;
    return a.total_guesses - b.total_guesses;
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Race Complete</h1>

      <ol className="flex w-full flex-col gap-2">
        {ranked.map((player, index) => (
          <li
            key={player.id}
            className={`flex items-center gap-3 border px-3 py-2.5 ${
              player.id === selfId ? "border-foreground bg-zinc-50" : "border-border"
            }`}
          >
            <span className="w-6 shrink-0 text-right font-mono text-sm text-muted">
              {index + 1}.
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {player.display_name}
              {player.id === selfId ? " (you)" : ""}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-muted">
              {player.words_solved} word{player.words_solved === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ol>

      <div className="w-full border border-border p-3 text-sm text-muted">
        <p className="mb-1 font-medium text-foreground">Details</p>
        <ul className="flex flex-col gap-1">
          {ranked.map((player) => (
            <li key={player.id} className="flex justify-between gap-2">
              <span className="truncate">{player.display_name}</span>
              <span className="tabular-nums">
                {player.total_guesses} guesses · {remainingSecondsAt(player, endedAt)}s left
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row">
        {canPlayAgain && (
          <button
            onClick={onPlayAgain}
            className="flex-1 rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Play Again
          </button>
        )}
        <button
          onClick={onNewRace}
          className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-zinc-50"
        >
          New Race
        </button>
        <button
          onClick={onHome}
          className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-zinc-50"
        >
          Home
        </button>
      </div>
    </div>
  );
}
