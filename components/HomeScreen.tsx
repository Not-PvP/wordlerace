"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson, ClientApiError } from "@/lib/client/api";
import { saveSession } from "@/lib/client/session";
import { GAME_CONFIG } from "@/lib/game/config";

type Tab = "create" | "join";

interface CreateResponse {
  roomId: string;
  roomCode: string;
  playerId: string;
  token: string;
}

export function HomeScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("create");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [startingTime, setStartingTime] = useState<number>(GAME_CONFIG.startingTime);
  const [correctWordBonus, setCorrectWordBonus] = useState<number>(GAME_CONFIG.correctWordBonus);
  const [wordsPerRace, setWordsPerRace] = useState<number>(GAME_CONFIG.wordsPerRace);
  const [maxPlayers, setMaxPlayers] = useState<number>(GAME_CONFIG.maxPlayers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await postJson<CreateResponse>("/api/room/create", {
        displayName: name,
        settings: { startingTime, correctWordBonus, wordsPerRace, maxPlayers },
      });
      saveSession({ ...data, displayName: name.trim() });
      router.push(`/room/${data.roomCode}`);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not create room");
      setBusy(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await postJson<CreateResponse>("/api/room/join", {
        displayName: name,
        roomCode,
      });
      saveSession({ ...data, displayName: name.trim() });
      router.push(`/room/${data.roomCode}`);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Could not join room");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Wordle Race</h1>
        <p className="mt-1 text-sm text-muted">Guess words. Race the clock. Beat your friends.</p>
      </div>

      <div className="flex w-full border border-border">
        <button
          type="button"
          onClick={() => setTab("create")}
          className={`flex-1 py-2.5 text-sm font-semibold ${
            tab === "create" ? "bg-foreground text-white" : "bg-white text-foreground"
          }`}
        >
          Create Race
        </button>
        <button
          type="button"
          onClick={() => setTab("join")}
          className={`flex-1 py-2.5 text-sm font-semibold ${
            tab === "join" ? "bg-foreground text-white" : "bg-white text-foreground"
          }`}
        >
          Join Race
        </button>
      </div>

      {tab === "create" ? (
        <form onSubmit={handleCreate} className="flex w-full flex-col gap-4">
          <Field label="Your name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              required
              autoFocus
              className="input"
            />
          </Field>

          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="text-left text-sm font-medium text-muted underline underline-offset-2"
          >
            {showSettings ? "Hide" : "Race settings"}
          </button>

          {showSettings && (
            <div className="flex flex-col gap-3 border border-border p-3">
              <NumberField
                label="Starting time (sec)"
                value={startingTime}
                onChange={setStartingTime}
                min={20}
                max={300}
              />
              <NumberField
                label="Bonus per word (sec)"
                value={correctWordBonus}
                onChange={setCorrectWordBonus}
                min={0}
                max={60}
              />
              <NumberField
                label="Words to win"
                value={wordsPerRace}
                onChange={setWordsPerRace}
                min={1}
                max={50}
              />
              <NumberField
                label="Max players"
                value={maxPlayers}
                onChange={setMaxPlayers}
                min={2}
                max={GAME_CONFIG.maxPlayers}
              />
            </div>
          )}

          <SubmitButton busy={busy}>Create Room</SubmitButton>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="flex w-full flex-col gap-4">
          <Field label="Your name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              required
              autoFocus
              className="input"
            />
          </Field>
          <Field label="Room code">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={GAME_CONFIG.roomCodeLength}
              required
              className="input font-mono uppercase tracking-widest"
              placeholder="AB7K2"
            />
          </Field>
          <SubmitButton busy={busy}>Join Room</SubmitButton>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <style jsx global>{`
        .input {
          border: 1px solid var(--border);
          border-radius: 0.375rem;
          padding: 0.625rem 0.75rem;
          font-size: 0.9375rem;
          width: 100%;
        }
        .input:focus-visible {
          outline: 2px solid var(--foreground);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 border border-border px-2 py-1 text-right"
      />
    </label>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}
