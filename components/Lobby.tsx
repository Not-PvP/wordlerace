"use client";

import { useState } from "react";
import { PlayerList } from "./PlayerList";
import { postJson, ClientApiError } from "@/lib/client/api";
import type { PlayerRow, RoomSettings } from "@/types/game";

interface LobbyProps {
  roomId: string;
  roomCode: string;
  token: string;
  settings: RoomSettings;
  selfPlayer: PlayerRow;
  players: PlayerRow[];
  onStarted: (gameStartAt: string) => void;
}

export function Lobby({
  roomId,
  roomCode,
  token,
  settings,
  selfPlayer,
  players,
  onStarted,
}: LobbyProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const allReady = players.length > 0 && players.every((p) => p.is_ready);

  async function toggleReady() {
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/room/${roomId}/ready`, { token, ready: !selfPlayer.is_ready });
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not update ready status");
    } finally {
      setBusy(false);
    }
  }

  async function startRace() {
    setBusy(true);
    setError(null);
    try {
      // Use our own response immediately instead of waiting for Realtime to
      // tell us what we just did — that round trip (through the DB and back
      // to ourselves) could otherwise eat a second or more of the 3-2-1
      // countdown before it even starts rendering.
      const res = await postJson<{ gameStartAt: string }>(`/api/room/${roomId}/start`, { token });
      onStarted(res.gameStartAt);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not start race");
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore, code is visible on screen
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Wordle Race</h1>
        <button
          onClick={copyCode}
          className="mt-2 border border-border px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em]"
          aria-label={`Room code ${roomCode}, click to copy`}
        >
          {roomCode}
        </button>
        <p className="mt-1 text-xs text-muted">{copied ? "Copied!" : "Tap the code to copy it"}</p>
      </div>

      <div className="w-full text-sm text-muted">
        {settings.startingTime}s start · +{settings.correctWordBonus}s per word ·{" "}
        {settings.wordsPerRace} words to win
      </div>

      <PlayerList players={players} selfId={selfPlayer.id} mode="lobby" />

      <div className="flex w-full flex-col gap-2">
        <button
          onClick={toggleReady}
          disabled={busy}
          className={`rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            selfPlayer.is_ready
              ? "border-border bg-white hover:bg-zinc-50"
              : "border-foreground bg-foreground text-white hover:bg-zinc-800"
          }`}
        >
          {selfPlayer.is_ready ? "Not ready" : "I'm ready"}
        </button>

        {selfPlayer.is_host && (
          <button
            onClick={startRace}
            disabled={busy || !allReady}
            className="rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            {allReady ? "Start Race" : "Waiting for everyone to be ready"}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
