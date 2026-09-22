import type { PlayerRow } from "@/types/game";

interface PlayerListProps {
  players: PlayerRow[];
  selfId: string | null;
  mode: "lobby" | "race";
  wordsPerRace?: number;
}

const statusLabel: Record<PlayerRow["status"], string> = {
  active: "Racing",
  eliminated: "Eliminated",
  finished: "Finished",
};

export function PlayerList({ players, selfId, mode, wordsPerRace = 1 }: PlayerListProps) {
  return (
    <ul className="flex w-full flex-col gap-2" aria-label="Players">
      {players.map((player) => {
        const isSelf = player.id === selfId;
        return (
          <li
            key={player.id}
            className={`flex items-center gap-3 border border-border px-3 py-2 text-sm ${
              isSelf ? "bg-zinc-50" : "bg-white"
            }`}
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {player.display_name}
              {isSelf ? " (you)" : ""}
              {player.is_host ? (
                <span className="ml-1.5 text-xs font-normal text-muted">host</span>
              ) : null}
            </span>

            {mode === "lobby" ? (
              <span
                className={`shrink-0 text-xs font-semibold ${
                  player.is_ready ? "text-tile-correct" : "text-muted"
                }`}
              >
                {player.is_ready ? "Ready" : "Not ready"}
              </span>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <div className="h-2 w-20 overflow-hidden rounded-full bg-zinc-200 sm:w-28">
                  <div
                    className="h-full bg-foreground transition-[width]"
                    style={{
                      width: `${Math.min(100, (player.words_solved / wordsPerRace) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right tabular-nums text-muted">
                  {player.words_solved}
                </span>
                {player.status !== "active" ? (
                  <span className="shrink-0 text-xs text-muted">{statusLabel[player.status]}</span>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
