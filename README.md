# Wordle Race

A fast, competitive multiplayer word-guessing race. Everyone in a room solves
the same sequence of 5-letter words; every correct word buys you more time on
your personal countdown; last one standing (or furthest along) wins.

This is an original implementation inspired by the general shape of Wordle —
no proprietary assets, branding, or code are used.

## How it works

- Create a room, share the short room code, everyone joins and marks ready.
- The host starts the race; a 3-2-1-GO countdown runs, then everyone gets the
  same first word.
- Each player has a personal countdown timer (60s by default). Solving a word
  adds bonus time (+15s by default) and immediately serves the next word.
- Guesses are validated word-by-word against a ~14,800-word dictionary; wrong
  guesses don't cost time directly, but the clock never stops.
- If a player's timer hits zero, they're eliminated (spectating the rest of
  the race). The race ends once everyone has finished or been eliminated.
- Results show final rankings by words solved, with guesses and leftover time
  as tiebreakers.

## Architecture

- **Frontend**: Next.js App Router, React 19, TypeScript, Tailwind CSS.
- **Backend**: Next.js Route Handlers (`app/api/**`) using the Supabase
  service-role key — this is the only thing allowed to write game state.
- **Database**: Supabase Postgres.
- **Realtime**: Supabase Realtime (`postgres_changes`) pushes room/player row
  updates to every connected browser.

### Why the server is authoritative

The browser can never award itself time, pick its own word, or fake a
result:

- The anon key (used by the browser) has **read-only** access to `rooms` and
  `players` via RLS `SELECT` policies — there are no `INSERT`/`UPDATE`
  policies for it at all, so writes can only happen server-side with the
  service-role key.
- The target-word sequence lives in `room_words`, which has RLS enabled with
  **zero** policies — the browser can never read it, even the current or
  future words. The server resolves the current target when it validates a
  guess and only ever returns per-letter colors, never the word itself
  (except implicitly, once you guess it correctly).
- Each player authenticates their API requests with a random per-player
  `token` (from `player_tokens`, also unreadable by the anon key) instead of
  just asserting a player id.
- The timer is a timestamp (`players.race_end_time`), not a counter. The
  client renders `remaining = race_end_time - Date.now()` locally for a
  smooth countdown, but every server action re-checks the real time against
  that timestamp. A correct guess extends it server-side
  (`race_end_time += CORRECT_WORD_BONUS`) — editing client JS can't add time
  because the client never gets to set `race_end_time` itself.

### Project structure

```
app/
  page.tsx                     Home (create/join)
  room/[code]/page.tsx         Room shell → <RoomClient>
  api/room/
    create/route.ts            Create a room (+ pre-generate word sequence)
    join/route.ts               Join by room code
    [roomId]/ready/route.ts     Toggle ready
    [roomId]/start/route.ts     Host starts the race
    [roomId]/guess/route.ts     Validate a guess (the core anti-cheat path)
    [roomId]/eliminate/route.ts Server-checked elimination on timeout
    [roomId]/reset/route.ts     Host returns a finished room to the lobby
components/                    Lobby, GameScreen, WordGrid, Keyboard, Timer,
                                PlayerList, Results, Countdown, HomeScreen
lib/
  game/                        config.ts, wordMatch.ts (+ tests), roomCode.ts,
                                roomLogic.ts, auth.ts, apiError.ts
  words/                       Word lists + pickRaceWords/isValidGuess
  supabase/                    Browser client (anon) / server client (service role)
  client/                      localStorage session + fetch helper
hooks/                         useRoomRealtime, useCountdown
types/game.ts                  Shared DB row + API types
supabase/migrations/0001_init.sql   Full schema, RLS, realtime publication
```

All gameplay constants (starting time, bonus, word length, guesses, etc.)
live in one place: [`lib/game/config.ts`](lib/game/config.ts).

## Environment variables

Create `.env.local` (see [`.env.example`](.env.example)):

| Variable | Where to find it | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API | **No — server only** |

The service role key bypasses Row Level Security. It's only ever imported
from `lib/supabase/server.ts`, which is only used inside `app/api/**` route
handlers — never import it from a client component.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (or run one
   locally, see below).
2. Run the migration in `supabase/migrations/0001_init.sql` — either:
   - Paste it into the Supabase Dashboard's SQL Editor and run it, or
   - `npx supabase link --project-ref <your-project-ref>` then
     `npx supabase db push`.
3. Copy the project URL, anon key, and service role key from
   Settings → API into `.env.local`.
4. Realtime: the migration already adds `rooms` and `players` to the
   `supabase_realtime` publication, so no dashboard toggling is needed.

### Local development with the Supabase CLI (no account needed)

If you have Docker installed:

```bash
npx supabase start
```

This spins up a local Postgres + Realtime + Studio stack and prints a local
`API URL`, `anon key`, and `service_role key` — put those in `.env.local`.
The migration in `supabase/migrations` is applied automatically. Stop it
with `npx supabase stop`.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

Open two browser windows (or one normal + one private/incognito) at
`http://localhost:3000` to test with multiple players: create a room in one,
join with the room code in the other.

Other scripts:

```bash
npm run lint    # ESLint
npm run test    # Wordle letter-matching unit tests (lib/game/wordMatch.test.ts)
npm run build   # Production build + type check
```

### Live end-to-end test script

`scripts/integration-test.ts` plays a full two-player race ("Alice" and
"Bob") against a running dev server and your real Supabase project, purely
through the public HTTP API — the same one the browser uses. It covers room
creation/join, ready-up/start, the countdown, correct/incorrect guesses,
the time bonus, replay protection, forged-token rejection, RLS locking
`room_words` from the browser, timeout elimination, and the room
auto-finishing. Run it with the dev server already up:

```bash
npm run dev &
npx tsx --env-file=.env.local scripts/integration-test.ts
```

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it in Vercel.
3. Add the three environment variables above in the Vercel project settings
   (Production **and** Preview).
4. Deploy. No further configuration needed — the app is a standard Next.js
   App Router project.

## Known limitations

- **Reconnect resumes progress, not keystrokes.** Room/player state (score,
  current word index, time left) is public and reloaded from the DB on
  refresh, so a disconnect/reconnect never loses race progress. The specific
  guesses typed for the *current* word are kept in local component state
  only, so a mid-word refresh clears that one word's grid (you keep your
  time and score, and get a fresh grid for the same word slot).
- **A word that runs out of guesses is skipped** (no bonus, no penalty
  beyond the time already spent) rather than ending the race, so one hard
  word can't strand a player for the rest of the timer. This isn't specified
  by the base rules and was the simplest choice that keeps the race moving.
- **Presence/online indicators** aren't implemented — the player list shows
  everyone who has joined the room, not a live "currently connected" dot.
- Ranking ties are broken by leftover time at the moment the race ended,
  then by fewest total guesses.
