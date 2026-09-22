"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRoomRealtime } from "@/hooks/useRoomRealtime";
import { useCountdown } from "@/hooks/useCountdown";
import { loadSession, saveSession, type RoomSession } from "@/lib/client/session";
import { postJson, ClientApiError } from "@/lib/client/api";
import { Lobby } from "./Lobby";
import { Countdown } from "./Countdown";
import { GameScreen } from "./GameScreen";
import { Results } from "./Results";
import type { RoomSettings } from "@/types/game";

interface RoomClientProps {
  code: string;
}

export function RoomClient({ code }: RoomClientProps) {
  const router = useRouter();
  const [session, setSession] = useState<RoomSession | null | undefined>(undefined);
  // Set the instant our own "Start Race" click succeeds, so the host doesn't
  // have to wait for Realtime to echo the room update back to itself before
  // the countdown starts rendering. Once Realtime does catch up, room's own
  // game_start_at (identical, since the server computed both) takes over
  // seamlessly via the `??` below.
  const [optimisticGameStartAt, setOptimisticGameStartAt] = useState<string | null>(null);

  useEffect(() => {
    // localStorage only exists on the client, so this has to run post-mount
    // rather than during render (which may run on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(loadSession(code));
  }, [code]);

  const { room, players, loading, error } = useRoomRealtime(session?.roomId ?? null);

  const isStarting = room?.status === "countdown" || (room?.status === "waiting" && optimisticGameStartAt !== null);
  const effectiveGameStartAt = room?.game_start_at ?? optimisticGameStartAt;
  const countdownMs = useCountdown(isStarting ? effectiveGameStartAt : null);

  // Clear a stale optimistic start once the room is back in the lobby for a
  // rematch — otherwise it would keep isStarting stuck true through the
  // whole next lobby phase.
  useEffect(() => {
    if (room?.status === "finished") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimisticGameStartAt(null);
    }
  }, [room?.status]);

  if (session === undefined) {
    return <CenteredMessage>Loading…</CenteredMessage>;
  }

  if (session === null) {
    return <JoinInlineForm code={code} onJoined={setSession} />;
  }

  if (loading) {
    return <CenteredMessage>Loading race…</CenteredMessage>;
  }

  if (error || !room) {
    return (
      <CenteredMessage>
        Room not found.{" "}
        <Link href="/" className="underline">
          Go home
        </Link>
      </CenteredMessage>
    );
  }

  const selfPlayer = players.find((p) => p.id === session.playerId);
  if (!selfPlayer) {
    return (
      <CenteredMessage>
        You&apos;re not part of this race anymore.{" "}
        <Link href="/" className="underline">
          Go home
        </Link>
      </CenteredMessage>
    );
  }

  const settings = room.settings as RoomSettings;

  if (room.status === "finished") {
    return (
      <Results
        players={players}
        selfId={selfPlayer.id}
        endedAt={room.ended_at}
        canPlayAgain={selfPlayer.is_host}
        onPlayAgain={async () => {
          try {
            await postJson(`/api/room/${room.id}/reset`, { token: session.token });
          } catch {
            // room stays finished; the button remains visible to retry
          }
        }}
        onNewRace={() => router.push("/")}
        onHome={() => router.push("/")}
      />
    );
  }

  if (!isStarting) {
    return (
      <Lobby
        roomId={room.id}
        roomCode={room.code}
        token={session.token}
        settings={settings}
        selfPlayer={selfPlayer}
        players={players}
        onStarted={setOptimisticGameStartAt}
      />
    );
  }

  // isStarting covers both the pre-race countdown and live play.
  if (countdownMs > 0) {
    return <Countdown secondsLeft={Math.ceil(countdownMs / 1000)} />;
  }

  return (
    <GameScreen
      roomId={room.id}
      roomCode={room.code}
      token={session.token}
      settings={settings}
      selfPlayer={selfPlayer}
      players={players}
    />
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function JoinInlineForm({
  code,
  onJoined,
}: {
  code: string;
  onJoined: (session: RoomSession) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await postJson<{
        roomId: string;
        roomCode: string;
        playerId: string;
        token: string;
      }>("/api/room/join", { displayName: name, roomCode: code });
      const session: RoomSession = { ...data, displayName: name.trim() };
      saveSession(session);
      onJoined(session);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not join room");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight">Join Race</h1>
        <p className="mt-1 font-mono text-lg tracking-widest text-muted">{code}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            required
            autoFocus
            className="rounded-md border border-border px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy ? "Joining…" : "Join Room"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
