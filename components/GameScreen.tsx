"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WordGrid } from "./WordGrid";
import { Keyboard } from "./Keyboard";
import { Timer } from "./Timer";
import { PlayerList } from "./PlayerList";
import { useCountdown } from "@/hooks/useCountdown";
import { deriveKeyboardStatus, type LetterResult } from "@/lib/game/wordMatch";
import { postJson, ClientApiError } from "@/lib/client/api";
import type { GuessResponse, PlayerRow, RoomSettings } from "@/types/game";

interface GameScreenProps {
  roomId: string;
  roomCode: string;
  token: string;
  settings: RoomSettings;
  selfPlayer: PlayerRow;
  players: PlayerRow[];
}

export function GameScreen({
  roomId,
  roomCode,
  token,
  settings,
  selfPlayer,
  players,
}: GameScreenProps) {
  const [guesses, setGuesses] = useState<LetterResult[][]>([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [shake, setShake] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bonusFlash, setBonusFlash] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lastWordIndexRef = useRef(selfPlayer.current_word_index);
  const eliminationSentRef = useRef(false);
  const isActive = selfPlayer.status === "active";

  const remainingMs = useCountdown(isActive ? selfPlayer.race_end_time : null);

  // A new word started (either our own advance or a reconnect) — clear the board.
  useEffect(() => {
    if (selfPlayer.current_word_index !== lastWordIndexRef.current) {
      lastWordIndexRef.current = selfPlayer.current_word_index;
      setGuesses([]);
      setCurrentGuess("");
      setMessage(null);
    }
  }, [selfPlayer.current_word_index]);

  useEffect(() => {
    if (isActive && remainingMs <= 0 && !eliminationSentRef.current) {
      eliminationSentRef.current = true;
      postJson(`/api/room/${roomId}/eliminate`, { token }).catch(() => {
        eliminationSentRef.current = false;
      });
    }
  }, [isActive, remainingMs, roomId, token]);

  const submitGuess = useCallback(async () => {
    if (submitting || !isActive) return;

    if (currentGuess.length !== settings.wordLength) {
      setShake(true);
      setMessage("Not enough letters");
      setTimeout(() => setShake(false), 400);
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await postJson<GuessResponse>(`/api/room/${roomId}/guess`, {
        token,
        guess: currentGuess,
        wordIndex: selfPlayer.current_word_index,
      });

      setGuesses((prev) => [...prev, res.result]);
      setCurrentGuess("");

      if (res.correct) {
        setBonusFlash(settings.correctWordBonus);
        setTimeout(() => setBonusFlash(null), 1200);
      } else if (res.message) {
        setMessage(res.message);
      }
    } catch (err) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (err instanceof ClientApiError) {
        setMessage(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting, isActive, currentGuess, settings, roomId, token, selfPlayer.current_word_index]);

  const handleKey = useCallback(
    (key: string) => {
      if (!isActive || submitting) return;
      if (key === "enter") {
        submitGuess();
      } else if (key === "backspace") {
        setCurrentGuess((g) => g.slice(0, -1));
      } else if (/^[a-z]$/.test(key) && currentGuess.length < settings.wordLength) {
        setCurrentGuess((g) => g + key);
      }
    },
    [isActive, submitting, submitGuess, currentGuess.length, settings.wordLength]
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "enter" || key === "backspace" || /^[a-z]$/.test(key)) {
        e.preventDefault();
        handleKey(key === "enter" ? "enter" : key === "backspace" ? "backspace" : key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const letterStatus = deriveKeyboardStatus(guesses);
  const wordNumber = Math.min(selfPlayer.words_solved + 1, settings.wordsPerRace);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-4">
      <header className="flex items-center justify-between border-b border-border pb-3">
        <h1 className="text-lg font-bold tracking-tight">Wordle Race</h1>
        <span className="font-mono text-sm text-muted">Room: {roomCode}</span>
      </header>

      <div className="flex flex-col items-center gap-3">
        <Timer remainingMs={remainingMs} bonusFlash={bonusFlash} />

        {!isActive ? (
          <p className="text-sm font-medium text-muted" role="status">
            {selfPlayer.status === "finished"
              ? "You solved every word! Waiting for the race to end…"
              : "You're out — watching the race finish…"}
          </p>
        ) : (
          <p className="text-sm font-medium text-muted">
            Word {wordNumber} / {settings.wordsPerRace}
          </p>
        )}

        <div aria-live="polite" className="h-5 text-sm font-medium text-red-600">
          {message}
        </div>

        <WordGrid
          wordLength={settings.wordLength}
          maxGuesses={settings.maxGuesses}
          rows={guesses}
          currentGuess={isActive ? currentGuess : ""}
          shake={shake}
          submitting={submitting}
        />
      </div>

      <div className="flex justify-center">
        <Keyboard letterStatus={letterStatus} onKey={handleKey} disabled={!isActive || submitting} />
      </div>

      <details className="mt-2 border border-border" open>
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">
          Players ({players.length})
        </summary>
        <div className="px-3 pb-3">
          <PlayerList
            players={players}
            selfId={selfPlayer.id}
            mode="race"
            wordsPerRace={settings.wordsPerRace}
          />
        </div>
      </details>
    </div>
  );
}
