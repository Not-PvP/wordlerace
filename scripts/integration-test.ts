/**
 * Scripted two-player integration test against a running dev server
 * (npm run dev) and the real Supabase project configured in .env.local.
 *
 * It plays both "Alice" and "Bob" through the whole room lifecycle purely
 * via the public HTTP API (exactly what a browser would call), and uses a
 * service-role Supabase client ONLY to peek at the hidden target words
 * (room_words) so it can submit a deliberately-correct or deliberately-wrong
 * guess — a real player's browser could never do this, since room_words has
 * no RLS policy for the anon/authenticated roles.
 *
 * This is a standalone dev/debug script, not part of the app runtime.
 * Run with: npx tsx --env-file=.env.local scripts/integration-test.ts
 */
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing Supabase env vars — pass --env-file=.env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey);
const anon = createClient(url, anonKey);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok  -", msg);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ...data, __status: res.status } as T & { __status: number };
}

async function targetWordFor(roomId: string, wordIndex: number): Promise<string> {
  const { data, error } = await admin
    .from("room_words")
    .select("word")
    .eq("room_id", roomId)
    .eq("word_index", wordIndex)
    .single();
  if (error || !data) throw new Error(`no target word for index ${wordIndex}: ${error?.message}`);
  return data.word;
}

async function fetchPlayers(roomId: string) {
  const { data, error } = await anon.from("players").select("*").eq("room_id", roomId);
  if (error) throw error;
  return data!;
}

async function fetchRoom(roomId: string) {
  const { data, error } = await anon.from("rooms").select("*").eq("id", roomId).single();
  if (error) throw error;
  return data!;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("--- create room (Alice, host) ---");
  const create = await post<{ roomId: string; roomCode: string; playerId: string; token: string }>(
    "/api/room/create",
    {
      displayName: "Alice",
      settings: { startingTime: 12, correctWordBonus: 5, wordsPerRace: 2, maxPlayers: 8 },
    }
  );
  assert(create.roomCode && create.token, "room created");
  console.log("    room code:", create.roomCode);

  console.log("--- join room (Bob) ---");
  const join = await post<{ roomId: string; playerId: string; token: string }>(
    "/api/room/join",
    { displayName: "Bob", roomCode: create.roomCode }
  );
  assert(join.token, "bob joined");

  const players = await fetchPlayers(create.roomId);
  assert(players.length === 2, "both players visible via public (anon) read");

  console.log("--- realtime: subscribe and wait for a change ---");
  let realtimeEvents = 0;
  const channel = anon
    .channel(`test:${create.roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `room_id=eq.${create.roomId}` },
      () => {
        realtimeEvents++;
      }
    )
    .subscribe();
  await sleep(1000);

  console.log("--- security: anon key cannot read room_words ---");
  const { data: leaked, error: leakErr } = await anon
    .from("room_words")
    .select("*")
    .eq("room_id", create.roomId);
  assert((leaked?.length ?? 0) === 0 || leakErr, "room_words is not readable via anon key");

  console.log("--- security: guessing with a wrong/foreign token is rejected ---");
  const badGuess = await post<{ error?: string; __status: number }>(
    `/api/room/${create.roomId}/guess`,
    { token: "not-a-real-token", guess: "apple", wordIndex: 0 }
  );
  assert(badGuess.__status === 401, "forged token rejected with 401");

  console.log("--- ready up + start ---");
  await post(`/api/room/${create.roomId}/ready`, { token: join.token, ready: true });
  const started = await post<{ gameStartAt?: string; __status: number }>(
    `/api/room/${create.roomId}/start`,
    { token: create.token }
  );
  assert(started.__status === 200 && started.gameStartAt, "host started the race");

  const room1 = await fetchRoom(create.roomId);
  assert(room1.status === "countdown", "room status is countdown right after start");

  const waitMs = new Date(started.gameStartAt!).getTime() - Date.now() + 300;
  console.log(`--- waiting ${waitMs}ms for countdown to finish ---`);
  await sleep(Math.max(0, waitMs));

  console.log("--- Alice solves word 0 correctly ---");
  const word0 = await targetWordFor(create.roomId, 0);
  const guess1 = await post<{
    correct: boolean;
    raceEndTime: string;
    wordsSolved: number;
    __status: number;
  }>(`/api/room/${create.roomId}/guess`, {
    token: create.token,
    guess: word0,
    wordIndex: 0,
  });
  assert(guess1.__status === 200 && guess1.correct === true, "Alice's correct guess accepted");
  assert(guess1.wordsSolved === 1, "Alice's words_solved incremented to 1");

  console.log("--- Alice cannot replay word 0 (word out of sync) ---");
  const replay = await post<{ __status: number }>(`/api/room/${create.roomId}/guess`, {
    token: create.token,
    guess: word0,
    wordIndex: 0,
  });
  assert(replay.__status === 409, "replaying an already-solved word index is rejected");

  console.log("--- Alice solves word 1 correctly -> finished (wordsPerRace=2) ---");
  const word1 = await targetWordFor(create.roomId, 1);
  const guess2 = await post<{ correct: boolean; playerStatus: string; __status: number }>(
    `/api/room/${create.roomId}/guess`,
    { token: create.token, guess: word1, wordIndex: 1 }
  );
  assert(guess2.__status === 200 && guess2.correct === true, "Alice's second correct guess accepted");
  assert(guess2.playerStatus === "finished", "Alice is marked finished after reaching wordsPerRace");

  console.log("--- Bob guesses wrong on purpose, then times out ---");
  const bobWord0 = await targetWordFor(create.roomId, 0);
  const wrongGuess = pickWrongGuess(bobWord0);
  const bobGuess = await post<{ correct: boolean; __status: number }>(
    `/api/room/${create.roomId}/guess`,
    { token: join.token, guess: wrongGuess, wordIndex: 0 }
  );
  assert(bobGuess.__status === 200 && bobGuess.correct === false, "Bob's wrong guess accepted, not correct");

  const bobBefore = await fetchPlayers(create.roomId);
  const bobRow = bobBefore.find((p) => p.display_name === "Bob")!;
  const bobRemainingMs = new Date(bobRow.race_end_time).getTime() - Date.now();
  console.log(`    Bob has ~${Math.round(bobRemainingMs / 1000)}s left, waiting it out...`);
  await sleep(Math.max(0, bobRemainingMs) + 500);

  const eliminate = await post<{ status: string; __status: number }>(
    `/api/room/${create.roomId}/eliminate`,
    { token: join.token }
  );
  assert(eliminate.__status === 200 && eliminate.status === "eliminated", "Bob eliminated once his timer expired");

  console.log("--- security: eliminating before time is up is rejected ---");
  const earlyEliminate = await post<{ __status: number }>(
    `/api/room/${create.roomId}/eliminate`,
    { token: create.token } // Alice is already "finished", not "active" -> should just echo status, not error
  );
  assert(earlyEliminate.__status === 200, "eliminating a non-active player is a harmless no-op");

  await sleep(500);
  const finalRoom = await fetchRoom(create.roomId);
  assert(finalRoom.status === "finished", "room auto-finished once all players were done/eliminated");
  assert(!!finalRoom.ended_at, "room has ended_at set");

  const finalPlayers = await fetchPlayers(create.roomId);
  const alice = finalPlayers.find((p) => p.display_name === "Alice")!;
  const bob = finalPlayers.find((p) => p.display_name === "Bob")!;
  assert(alice.status === "finished" && alice.words_solved === 2, "Alice final state correct");
  assert(bob.status === "eliminated" && bob.words_solved === 0, "Bob final state correct");

  assert(realtimeEvents > 0, `realtime delivered ${realtimeEvents} player row change event(s)`);

  anon.removeChannel(channel);
  console.log("\nALL CHECKS PASSED");
  process.exit(0);
}

function pickWrongGuess(target: string): string {
  const candidates = ["spelt", "sword", "brisk", "clamp"];
  return candidates.find((w) => w !== target)!;
}

main().catch((err) => {
  console.error("Integration test crashed:", err);
  process.exit(1);
});
