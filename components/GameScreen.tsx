"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WordGrid } from "./WordGrid";
import { Keyboard } from "./Keyboard";
import { Timer } from "./Timer";
import { PlayerList } from "./PlayerList";
import { useCountdown } from "@/hooks/useCountdown";
import { deriveKeyboardStatus, type LetterResult } from "@/lib/game/wordMatch";
import { postJson, ClientApiError } from "@/lib/client/api";
import type { EliminateResponse, GuessResponse, PlayerRow, RoomSettings } from "@/types/game";

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
  const [revealedWord, setRevealedWord] = useState<string | null>(null);

  const lastWordIndexRef = useRef(selfPlayer.current_word_index);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = selfPlayer.status === "active";

  const remainingMs = useCountdown(isActive ? selfPlayer.race_end_time : null);

  // A new word started for a reason other than our own guess response below
  // (e.g. a page refresh landing mid-race) — clear the board. Our own
  // correct/exhausted handling pre-marks lastWordIndexRef so this doesn't
  // also fire (and cut the solved-row animation short) once realtime
  // catches up to a transition we already started locally.
  useEffect(() => {
    if (selfPlayer.current_word_index !== lastWordIndexRef.current) {
      lastWordIndexRef.current = selfPlayer.current_word_index;
      setGuesses([]);
      setCurrentGuess("");
      setMessage(null);
    }
  }, [selfPlayer.current_word_index]);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // Ask the server to eliminate us once our local clock says time's up, and
  // keep retrying (network blips, a hair of clock drift vs. the server)
  // until it actually confirms — otherwise a single failed attempt could
  // strand the player "active" forever, since remainingMs floors at exactly
  // 0 and stops changing, so an effect keyed on it alone would never fire
  // again to retry.
  const timeExpired = isActive && remainingMs <= 0;
  useEffect(() => {
    if (!timeExpired) return;

    let stopped = false;
    const attempt = () => {
      postJson<EliminateResponse>(`/api/room/${roomId}/eliminate`, { token })
        .then((res) => {
          if (!stopped && res.revealedWord) setRevealedWord(res.revealedWord);
        })
        .catch(() => {
          // realtime will confirm success once it lands; on failure just
          // let the interval below try again.
        });
    };

    attempt();
    const interval = setInterval(attempt, 1500);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [timeExpired, roomId, token]);

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
      } else if (res.message) {
        setMessage(res.revealedWord ? `${res.message} It was ${res.revealedWord.toUpperCase()}.` : res.message);
      }

      // The word is advancing (solved, or out of guesses). Hold the
      // finished grid on screen for a beat — long enough to see the flip
      // animation and bonus flash — before clearing it for the next word,
      // instead of clearing the instant realtime confirms the DB write
      // (which can now arrive in well under 100ms).
      if (res.correct || res.message) {
        lastWordIndexRef.current = res.currentWordIndex;
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = setTimeout(
          () => {
            setGuesses([]);
            setBonusFlash(null);
            setMessage(null);
          },
          res.correct ? 900 : 1100
        );
      }
    } catch (err) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      if (err instanceof ClientApiError) {
        setMessage(err.message);
        const word = err.data.revealedWord;
        if (typeof word === "string") setRevealedWord(word);
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
              : revealedWord
                ? `Time's up! The word was ${revealedWord.toUpperCase()}. Watching the race finish…`
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
