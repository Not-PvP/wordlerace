-- Wordle Race schema.
-- Tables that must be readable by the browser (rooms, players) get an RLS
-- policy allowing SELECT to everyone. Nothing gets an INSERT/UPDATE/DELETE
-- policy for the anon/authenticated roles, so all writes must go through
-- server API routes using the service role key (which bypasses RLS).
-- Tables holding secrets (player_tokens, room_words) get RLS enabled with
-- NO policies at all, so anon/authenticated can never read them.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- rooms
-- ---------------------------------------------------------------------------
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_player_id uuid,
  status text not null default 'waiting'
    check (status in ('waiting', 'countdown', 'playing', 'finished')),
  settings jsonb not null,
  game_start_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create index if not exists rooms_code_idx on rooms (code);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms (id) on delete cascade,
  display_name text not null,
  is_host boolean not null default false,
  is_ready boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'eliminated', 'finished')),
  current_word_index int not null default 0,
  words_solved int not null default 0,
  total_guesses int not null default 0,
  race_end_time timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists players_room_id_idx on players (room_id);

-- ---------------------------------------------------------------------------
-- player_tokens — secret bearer token per player, used to authenticate API
-- requests as that player. Never exposed to anon/authenticated via RLS.
-- ---------------------------------------------------------------------------
create table if not exists player_tokens (
  player_id uuid primary key references players (id) on delete cascade,
  token text not null unique
);

-- ---------------------------------------------------------------------------
-- room_words — the hidden target-word sequence for a race. Never exposed to
-- anon/authenticated via RLS; only server routes (service role) read it.
-- ---------------------------------------------------------------------------
create table if not exists room_words (
  room_id uuid not null references rooms (id) on delete cascade,
  word_index int not null,
  word text not null,
  primary key (room_id, word_index)
);

-- ---------------------------------------------------------------------------
-- guesses — optional history for anti-abuse checks / post-game stats.
-- ---------------------------------------------------------------------------
create table if not exists guesses (
  id bigserial primary key,
  player_id uuid not null references players (id) on delete cascade,
  room_id uuid not null references rooms (id) on delete cascade,
  word_index int not null,
  guess text not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists guesses_player_id_idx on guesses (player_id);
create index if not exists guesses_room_id_idx on guesses (room_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table rooms enable row level security;
alter table players enable row level security;
alter table player_tokens enable row level security;
alter table room_words enable row level security;
alter table guesses enable row level security;

drop policy if exists "rooms are publicly readable" on rooms;
create policy "rooms are publicly readable"
  on rooms for select
  using (true);

drop policy if exists "players are publicly readable" on players;
create policy "players are publicly readable"
  on players for select
  using (true);

-- player_tokens, room_words, guesses intentionally have no policies:
-- RLS is enabled with zero grants, so anon/authenticated get nothing and
-- only the service-role key (used server-side) can read or write them.

-- ---------------------------------------------------------------------------
-- Realtime — push row changes on rooms/players to subscribed clients.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table players;
  end if;
end $$;
