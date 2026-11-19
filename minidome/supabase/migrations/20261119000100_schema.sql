-- THE MINIDOME: NFL playoff One-and-Done fantasy. Tables and constraints.
--
-- The rules that matter most are enforced HERE, by the database, not by the app:
--  * One-and-Done: a person can hold a given player (or D/ST) in at most one active selection per
--    league and season (unique indexes on lineup_selections). That covers every round, so a
--    player used in Wild Card can never be picked again in that league, and two requests sent at
--    the same instant cannot both succeed.
--  * Usage is per league: the same person in another league has a separate set of selections.
--  * Kickoff locking is checked inside the functions in the next migration, from the game's own
--    status and kickoff time.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  username text not null,
  display_name text not null default '',
  avatar_url text,
  is_site_admin boolean not null default false,
  notification_prefs jsonb not null default '{"email": true, "inApp": true}'::jsonb,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);
create unique index profiles_username_key on public.profiles (username);

-- ---------------------------------------------------------------------------
-- NFL data (filled by the sync service from the data provider)
-- ---------------------------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  nfl_season int not null,
  label text not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'complete', 'archived')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
-- One real season per NFL year; sample (test) seasons are kept apart from real ones.
create unique index seasons_year_key on public.seasons (nfl_season, is_sample);

create table public.playoff_rounds (
  season_id uuid not null references public.seasons (id) on delete cascade,
  round smallint not null check (round between 1 and 8),
  name text not null,
  short_name text not null,
  primary key (season_id, round)
);

create table public.nfl_teams (
  id uuid primary key default gen_random_uuid(),
  abbreviation text not null unique,
  city text not null,
  name text not null,
  conference text check (conference in ('AFC', 'NFC')),
  primary_color text not null default '#3a4578',
  secondary_color text not null default '#f9c22e',
  logo_url text
);

create table public.nfl_players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text not null default '',
  last_name text not null default '',
  team_id uuid references public.nfl_teams (id),
  position text not null check (position in ('QB', 'RB', 'WR', 'TE', 'K')),
  jersey_number int,
  headshot_url text,
  injury_status text, -- e.g. Questionable, Doubtful, Out, IR (as reported by the provider)
  injury_note text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index nfl_players_team_idx on public.nfl_players (team_id);

-- The teams in a season's postseason (including teams with a first-round bye).
create table public.season_teams (
  season_id uuid not null references public.seasons (id) on delete cascade,
  team_id uuid not null references public.nfl_teams (id),
  seed int,
  primary key (season_id, team_id)
);

-- Stable mapping from each provider's ids to ours. Statistics are matched by id, never by name.
create table public.external_ids (
  entity text not null check (entity in ('team', 'player', 'game', 'season')),
  provider text not null,
  external_id text not null,
  internal_id uuid not null,
  primary key (entity, provider, external_id)
);
create index external_ids_internal_idx on public.external_ids (internal_id);

create table public.nfl_games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  round smallint not null,
  home_team_id uuid not null references public.nfl_teams (id),
  away_team_id uuid not null references public.nfl_teams (id),
  kickoff_at timestamptz not null, -- UTC; shown in each viewer's own time zone
  status text not null default 'scheduled'
    check (status in ('scheduled', 'pregame', 'live', 'halftime', 'final', 'postponed', 'suspended', 'cancelled')),
  home_score int,
  away_score int,
  period text,
  clock text,
  winner_team_id uuid references public.nfl_teams (id),
  final_at timestamptz,
  provider text,
  provider_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  revision int not null default 1,
  foreign key (season_id, round) references public.playoff_rounds (season_id, round),
  check (home_team_id <> away_team_id)
);
create index nfl_games_season_round_idx on public.nfl_games (season_id, round);

-- Normalised statistics per player per game (see src/lib/scoring/stats.ts for the keys).
create table public.player_game_stats (
  player_id uuid not null references public.nfl_players (id),
  game_id uuid not null references public.nfl_games (id) on delete cascade,
  team_id uuid references public.nfl_teams (id),
  stats jsonb not null,
  raw jsonb, -- the provider's own record, kept to investigate discrepancies
  provider text not null,
  provider_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  revision int not null default 1,
  primary key (player_id, game_id)
);

-- Team defence / special teams statistics per game.
create table public.dst_game_stats (
  team_id uuid not null references public.nfl_teams (id),
  game_id uuid not null references public.nfl_games (id) on delete cascade,
  stats jsonb not null,
  raw jsonb,
  provider text not null,
  provider_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  revision int not null default 1,
  primary key (team_id, game_id)
);

-- Every change to imported statistics (provider corrections and admin corrections) is kept.
create table public.stat_revisions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('player', 'dst', 'game')),
  subject_id uuid not null,
  game_id uuid not null,
  previous jsonb,
  new jsonb,
  source text not null default 'provider' check (source in ('provider', 'admin')),
  actor uuid,
  reason text,
  changed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Scoring (versioned: a configuration is never edited, a new version is added)
-- ---------------------------------------------------------------------------
create table public.scoring_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version int not null,
  rules jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (name, version)
);

-- Fantasy points for one player (or D/ST) in one game under one scoring configuration.
create table public.fantasy_points (
  id uuid primary key default gen_random_uuid(),
  scoring_config_id uuid not null references public.scoring_configs (id),
  game_id uuid not null references public.nfl_games (id) on delete cascade,
  player_id uuid references public.nfl_players (id),
  dst_team_id uuid references public.nfl_teams (id),
  points numeric(8, 2) not null,
  breakdown jsonb not null,
  status text not null default 'provisional' check (status in ('provisional', 'updated', 'final')),
  stats_revision int not null default 1,
  engine_version text not null,
  calculated_at timestamptz not null default now(),
  check ((player_id is null) <> (dst_team_id is null))
);
create unique index fantasy_points_player_key on public.fantasy_points (scoring_config_id, game_id, player_id) where player_id is not null;
create unique index fantasy_points_dst_key on public.fantasy_points (scoring_config_id, game_id, dst_team_id) where dst_team_id is not null;

-- Earlier calculations are never lost: whenever points change, the old row is copied here.
create table public.fantasy_points_history (
  id bigint generated always as identity primary key,
  fantasy_points_id uuid not null,
  scoring_config_id uuid not null,
  game_id uuid not null,
  player_id uuid,
  dst_team_id uuid,
  points numeric(8, 2) not null,
  breakdown jsonb not null,
  status text not null,
  stats_revision int not null,
  engine_version text not null,
  calculated_at timestamptz not null,
  replaced_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leagues
-- ---------------------------------------------------------------------------
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id),
  name text not null check (length(trim(name)) between 2 and 60),
  description text not null default '' check (length(description) <= 500),
  commissioner_id uuid not null references auth.users (id),
  max_members int not null default 6 check (max_members between 2 and 20),
  scoring_config_id uuid not null references public.scoring_configs (id),
  roster_config jsonb not null default '{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"DST":1,"K":1}'::jsonb,
  lock_config jsonb not null default '{"mode":"player_kickoff"}'::jsonb,
  tiebreaker jsonb not null default '{"mode":"latest_round_first"}'::jsonb,
  allow_incomplete boolean not null default false,
  status text not null default 'active' check (status in ('active', 'complete', 'archived')),
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('commissioner', 'member')),
  status text not null default 'active' check (status in ('active', 'removed', 'left')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);
create index league_members_user_idx on public.league_members (user_id);

-- Invitation links, codes and email invitations. Only a hash of each secret is stored.
create table public.league_invitations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  kind text not null check (kind in ('link', 'code', 'email')),
  token_hash text not null unique,
  hint text not null, -- first characters, so the commissioner can tell invitations apart
  email text,
  expires_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  current_uses int not null default 0,
  revoked_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index league_invitations_league_idx on public.league_invitations (league_id);

-- ---------------------------------------------------------------------------
-- Lineups and One-and-Done usage
-- ---------------------------------------------------------------------------
create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id uuid not null references public.seasons (id),
  round smallint not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (league_id, user_id, round)
);

create table public.lineup_selections (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups (id) on delete cascade,
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  season_id uuid not null references public.seasons (id),
  round smallint not null,
  slot text not null,
  player_id uuid references public.nfl_players (id),
  dst_team_id uuid references public.nfl_teams (id),
  game_id uuid not null references public.nfl_games (id),
  status text not null default 'active' check (status in ('active', 'voided')),
  selected_at timestamptz not null default now(),
  locked_at timestamptz, -- stamped by lock_due_selections(); the live check uses the game itself
  voided_reason text,
  check ((player_id is null) <> (dst_team_id is null))
);
create unique index lineup_selections_slot_key on public.lineup_selections (lineup_id, slot) where status = 'active';
-- THE One-and-Done rule. Per person, per league, per season, each player and each D/ST once.
create unique index one_and_done_player on public.lineup_selections (league_id, user_id, season_id, player_id)
  where player_id is not null and status = 'active';
create unique index one_and_done_dst on public.lineup_selections (league_id, user_id, season_id, dst_team_id)
  where dst_team_id is not null and status = 'active';
create index lineup_selections_game_idx on public.lineup_selections (game_id);

-- History of every selection change (selected, replaced, cleared, locked, voided).
create table public.selection_events (
  id bigint generated always as identity primary key,
  league_id uuid not null,
  user_id uuid not null,
  round smallint not null,
  slot text not null,
  action text not null check (action in ('selected', 'replaced', 'cleared', 'locked', 'voided', 'submitted')),
  player_id uuid,
  dst_team_id uuid,
  actor uuid,
  reason text,
  at timestamptz not null default now()
);
create index selection_events_league_idx on public.selection_events (league_id, user_id);

-- ---------------------------------------------------------------------------
-- Audit, notifications, data feed monitoring
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  league_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz not null default now()
);
create index audit_log_league_idx on public.audit_log (league_id, at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  provider text not null,
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail text,
  counts jsonb,
  next_interval_seconds int
);

create table public.sync_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
