-- THE MINIDOME: rules, permissions and league actions.
--
-- Security model:
--  * Browsers only READ, and only what Row Level Security allows (your leagues; other people's
--    picks only after those picks' games kick off).
--  * Every change goes through one of the functions below. Each checks who is calling, validates
--    the change against the game rules, applies it in one transaction and leaves a history.
--  * The sync service and administrator tools connect as the database owner (server only).

-- ---------------------------------------------------------------------------
-- Profiles are created automatically for every new account.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_base text := left(regexp_replace(lower(split_part(coalesce(new.email, 'player'), '@', 1)), '[^a-z0-9_]', '', 'g'), 16);
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'Player'), '@', 1));
begin
  if length(v_base) < 3 then v_base := 'player'; end if;
  insert into public.profiles (id, email, username, display_name)
  values (new.id, new.email, v_base || '_' || substr(md5(new.id::text), 1, 5), left(v_name, 40));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------
create or replace function public.is_site_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_site_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_league_member(p_league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin() or exists (
    select 1 from public.league_members
    where league_id = p_league and user_id = auth.uid() and status = 'active');
$$;

create or replace function public.is_commissioner(p_league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_site_admin() or exists (
    select 1 from public.league_members
    where league_id = p_league and user_id = auth.uid() and status = 'active' and role = 'commissioner');
$$;

create or replace function public.shares_league_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or public.is_site_admin() or exists (
    select 1 from public.league_members a join public.league_members b using (league_id)
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_user);
$$;

create or replace function public.write_audit(
  p_league uuid, p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor, league_id, action, entity, entity_id, before, after, reason)
  values (auth.uid(), p_league, p_action, p_entity, p_entity_id, p_before, p_after, p_reason);
$$;

create or replace function public.notify(p_user uuid, p_type text, p_message text, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, type, message, link) values (p_user, p_type, p_message, p_link);
$$;

-- ---------------------------------------------------------------------------
-- Games, rounds and locking
-- ---------------------------------------------------------------------------

-- A game is locked once it has actually started. Kickoff time is the deadline unless the game
-- has been postponed (then the selection waits for the new kickoff). Cancelled and suspended
-- games stay locked until an administrator resolves them through an audited exception.
create or replace function public.game_is_locked(p_game uuid, p_at timestamptz default now()) returns boolean
language sql stable set search_path = public as $$
  select case
    when g.status in ('live', 'halftime', 'final', 'suspended', 'cancelled') then true
    when g.status = 'postponed' then false
    else g.kickoff_at <= p_at
  end
  from public.nfl_games g where g.id = p_game;
$$;

-- pending: no games scheduled yet (teams not decided); open: nothing has kicked off;
-- in_progress: at least one game started; complete: every game final or cancelled.
create or replace function public.round_status(p_season uuid, p_round int, p_at timestamptz default now()) returns text
language sql stable set search_path = public as $$
  select case
    when count(*) = 0 then 'pending'
    when bool_and(g.status in ('final', 'cancelled')) then 'complete'
    when bool_or(public.game_is_locked(g.id, p_at)) then 'in_progress'
    else 'open'
  end
  from public.nfl_games g where g.season_id = p_season and g.round = p_round;
$$;

-- The game a team plays in a round (none = bye or eliminated).
create or replace function public.team_round_game(p_team uuid, p_season uuid, p_round int) returns uuid
language sql stable set search_path = public as $$
  select g.id from public.nfl_games g
  where g.season_id = p_season and g.round = p_round and g.status <> 'cancelled'
    and p_team in (g.home_team_id, g.away_team_id)
  order by g.kickoff_at limit 1;
$$;

-- League settings freeze when the season's first game kicks off.
create or replace function public.league_competition_started(p_league uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (
    select 1 from public.nfl_games g join public.leagues l on l.season_id = g.season_id
    where l.id = p_league and public.game_is_locked(g.id));
$$;

-- Lineup spots from the league's roster settings, e.g. {QB, RB1, RB2, WR1, WR2, TE, FLEX, DST, K}.
create or replace function public.league_slots(p_league uuid) returns text[]
language sql stable set search_path = public as $$
  with r as (select roster_config as rc from public.leagues where id = p_league)
  select coalesce(array_agg(case when n = 1 then code else code || i end order by ord, i), '{}')
  from r,
    lateral (select p.code, p.ord, coalesce((r.rc ->> p.code)::int, 0) as n
             from (values ('QB', 1), ('RB', 2), ('WR', 3), ('TE', 4), ('FLEX', 5), ('DST', 6), ('K', 7)) as p(code, ord)) pos,
    generate_series(1, greatest(pos.n, 0)) as i
  where pos.n > 0;
$$;

create or replace function public.slot_base(p_slot text) returns text
language sql immutable as $$ select regexp_replace(p_slot, '[0-9]+$', ''); $$;

create or replace function public.position_fits_slot(p_position text, p_slot text) returns boolean
language sql immutable as $$
  select case public.slot_base(p_slot)
    when 'FLEX' then p_position in ('RB', 'WR', 'TE')
    else public.slot_base(p_slot) = p_position
  end;
$$;

create or replace function public.round_name(p_season uuid, p_round int) returns text
language sql stable set search_path = public as $$
  select coalesce((select name from public.playoff_rounds where season_id = p_season and round = p_round), 'Round ' || p_round);
$$;

-- ---------------------------------------------------------------------------
-- Scoring configuration: the default Half PPR rules (version 1)
-- ---------------------------------------------------------------------------
insert into public.scoring_configs (name, version, rules) values ('Half PPR', 1, '{
  "passYds": 0.04, "passTd": 4, "passInt": -2, "pass2pt": 2,
  "rushYds": 0.1, "rushTd": 6, "rush2pt": 2,
  "rec": 0.5, "recYds": 0.1, "recTd": 6, "rec2pt": 2,
  "fumLost": -2,
  "xpMade": 1, "xpMissed": -1, "fgMade0_39": 3, "fgMade40_49": 4, "fgMade50p": 5, "fgMissed": -1,
  "dstSack": 1, "dstInt": 2, "dstFumRec": 2, "dstTd": 6, "dstStTd": 6, "dstSafety": 2, "dstBlockedKick": 2,
  "dstXpReturn": 2, "dstTwoPtReturn": 2,
  "pointsAllowed": [
    {"max": 0, "points": 10}, {"max": 6, "points": 7}, {"max": 13, "points": 4}, {"max": 20, "points": 1},
    {"max": 27, "points": 0}, {"max": 34, "points": -1}, {"max": null, "points": -4}
  ]
}'::jsonb);

create or replace function public.default_scoring_config() returns uuid
language sql stable set search_path = public as $$
  select id from public.scoring_configs where name = 'Half PPR' order by version desc limit 1;
$$;

-- Keep every earlier calculation when points change (stat corrections, live updates).
create or replace function public.keep_points_history() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.points is distinct from new.points or old.breakdown is distinct from new.breakdown or old.status is distinct from new.status then
    insert into public.fantasy_points_history (fantasy_points_id, scoring_config_id, game_id, player_id, dst_team_id, points, breakdown, status, stats_revision, engine_version, calculated_at)
    values (old.id, old.scoring_config_id, old.game_id, old.player_id, old.dst_team_id, old.points, old.breakdown, old.status, old.stats_revision, old.engine_version, old.calculated_at);
  end if;
  return new;
end $$;
create trigger fantasy_points_history before update on public.fantasy_points
  for each row execute function public.keep_points_history();

-- ---------------------------------------------------------------------------
-- Leagues
-- ---------------------------------------------------------------------------
create or replace function public.current_season() returns uuid
language sql stable set search_path = public as $$
  select id from public.seasons where status in ('active', 'upcoming')
  order by (status = 'active') desc, nfl_season desc, is_sample asc limit 1;
$$;

create or replace function public.create_league(
  p_name text, p_description text default '', p_max_members int default 6, p_season uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_season uuid := coalesce(p_season, public.current_season());
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if v_season is null then raise exception 'No NFL season is set up yet. Ask the site administrator to run the data sync.'; end if;
  if (select status from public.seasons where id = v_season) not in ('upcoming', 'active') then
    raise exception 'That season is over. Leagues can only be created for the current season.';
  end if;
  if p_max_members not between 2 and 20 then raise exception 'A league has 2 to 20 members.'; end if;
  insert into public.leagues (season_id, name, description, commissioner_id, max_members, scoring_config_id)
  values (v_season, trim(p_name), coalesce(trim(p_description), ''), v_uid, p_max_members, public.default_scoring_config())
  returning id into v_id;
  insert into public.league_members (league_id, user_id, role) values (v_id, v_uid, 'commissioner');
  perform public.write_audit(v_id, 'league.create', 'league', v_id::text, null, jsonb_build_object('name', p_name, 'max_members', p_max_members));
  return v_id;
end $$;

-- Name, description and size can always change; scoring, roster, locking, tie-breakers and the
-- incomplete-lineup exception freeze when the season's first game kicks off.
create or replace function public.update_league_settings(p_league uuid, p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_league public.leagues;
  v_members int;
  v_frozen_keys text[] := array['roster_config', 'lock_config', 'tiebreaker', 'allow_incomplete', 'scoring_config_id'];
  k text;
begin
  if not public.is_commissioner(p_league) then raise exception 'Only the commissioner can change league settings.'; end if;
  select * into v_league from public.leagues where id = p_league for update;
  v_before := to_jsonb(v_league);
  foreach k in array v_frozen_keys loop
    if p_settings ? k and public.league_competition_started(p_league) then
      raise exception 'Scoring, roster and lock settings are frozen once the playoffs begin.';
    end if;
  end loop;
  if p_settings ? 'max_members' then
    select count(*) into v_members from public.league_members where league_id = p_league and status = 'active';
    if (p_settings ->> 'max_members')::int not between greatest(2, v_members) and 20 then
      raise exception 'League size must be between % and 20.', greatest(2, v_members);
    end if;
  end if;
  if p_settings ? 'roster_config' then
    if exists (select 1 from jsonb_each(p_settings -> 'roster_config') e
               where e.key not in ('QB', 'RB', 'WR', 'TE', 'FLEX', 'DST', 'K') or jsonb_typeof(e.value) <> 'number'
                 or (e.value)::text::int not between 0 and 4) then
      raise exception 'Invalid roster settings.';
    end if;
  end if;
  update public.leagues set
    name = coalesce(nullif(trim(p_settings ->> 'name'), ''), name),
    description = coalesce(p_settings ->> 'description', description),
    max_members = coalesce((p_settings ->> 'max_members')::int, max_members),
    roster_config = coalesce(p_settings -> 'roster_config', roster_config),
    tiebreaker = coalesce(p_settings -> 'tiebreaker', tiebreaker),
    allow_incomplete = coalesce((p_settings ->> 'allow_incomplete')::boolean, allow_incomplete),
    scoring_config_id = coalesce((p_settings ->> 'scoring_config_id')::uuid, scoring_config_id)
  where id = p_league;
  perform public.write_audit(p_league, 'league.settings', 'league', p_league::text, v_before,
    (select to_jsonb(l) from public.leagues l where id = p_league));
end $$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create or replace function public.hash_token(p_token text) returns text
language sql immutable set search_path = public as $$
  select encode(extensions.digest(upper(trim(p_token)), 'sha256'), 'hex');
$$;

-- Returns the secret ONCE (only its hash is stored). Links get a long token; codes get 8
-- easy-to-read characters; email invitations only work for the invited address.
create or replace function public.create_invitation(
  p_league uuid, p_kind text, p_email text default null, p_expires_hours int default 168, p_max_uses int default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_token text := '';
  v_bytes bytea;
  i int;
begin
  if not public.is_commissioner(p_league) then raise exception 'Only the commissioner can invite people.'; end if;
  if p_kind not in ('link', 'code', 'email') then raise exception 'Unknown invitation type.'; end if;
  if p_kind = 'email' and (p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Enter a valid email address.'; end if;
  if p_expires_hours is not null and p_expires_hours not between 1 and 24 * 90 then raise exception 'Invitations last 1 hour to 90 days.'; end if;
  v_bytes := extensions.gen_random_bytes(case when p_kind = 'code' then 8 else 20 end);
  for i in 0 .. length(v_bytes) - 1 loop
    v_token := v_token || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  insert into public.league_invitations (league_id, kind, token_hash, hint, email, expires_at, max_uses, created_by)
  values (p_league, p_kind, public.hash_token(v_token), left(v_token, 4), lower(trim(p_email)),
          case when p_expires_hours is null then null else now() + make_interval(hours => p_expires_hours) end,
          case when p_kind = 'email' then 1 else p_max_uses end, auth.uid());
  perform public.write_audit(p_league, 'invitation.create', 'invitation', left(v_token, 4), null,
    jsonb_build_object('kind', p_kind, 'email', p_email, 'expires_hours', p_expires_hours, 'max_uses', p_max_uses));
  return v_token;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_league uuid;
begin
  select league_id into v_league from public.league_invitations where id = p_invitation;
  if v_league is null or not public.is_commissioner(v_league) then raise exception 'Invitation not found.'; end if;
  update public.league_invitations set revoked_at = now() where id = p_invitation and revoked_at is null;
  perform public.write_audit(v_league, 'invitation.revoke', 'invitation', p_invitation::text, null, null);
end $$;

-- What an invitation leads to (shown on the join page, before signing in).
create or replace function public.invitation_info(p_token text)
returns table (league_name text, commissioner text, members int, max_members int, valid boolean, problem text)
language plpgsql stable security definer set search_path = public as $$
declare inv public.league_invitations; l public.leagues; n int;
begin
  select * into inv from public.league_invitations where token_hash = public.hash_token(p_token);
  if inv.id is null then return query select null::text, null::text, 0, 0, false, 'This invitation is not valid.'; return; end if;
  select * into l from public.leagues where id = inv.league_id;
  select count(*) into n from public.league_members where league_id = l.id and status = 'active';
  return query select l.name, (select display_name from public.profiles where id = l.commissioner_id), n, l.max_members,
    (inv.revoked_at is null and (inv.expires_at is null or inv.expires_at > now())
      and (inv.max_uses is null or inv.current_uses < inv.max_uses) and n < l.max_members),
    case
      when inv.revoked_at is not null then 'This invitation was cancelled by the commissioner.'
      when inv.expires_at is not null and inv.expires_at <= now() then 'This invitation has expired.'
      when inv.max_uses is not null and inv.current_uses >= inv.max_uses then 'This invitation has already been used.'
      when n >= l.max_members then 'This league is full.'
      else null end;
end $$;

create or replace function public.join_league(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  inv public.league_invitations;
  l public.leagues;
  n int;
  v_existing text;
  v_email text;
begin
  if v_uid is null then raise exception 'Sign in or create an account to join.'; end if;
  select * into inv from public.league_invitations where token_hash = public.hash_token(p_token) for update;
  if inv.id is null then raise exception 'This invitation is not valid.'; end if;
  select * into l from public.leagues where id = inv.league_id for update;
  select status into v_existing from public.league_members where league_id = l.id and user_id = v_uid;
  if v_existing = 'active' then return l.id; end if;
  if v_existing = 'removed' then raise exception 'The commissioner removed you from this league.'; end if;
  if inv.revoked_at is not null then raise exception 'This invitation was cancelled by the commissioner.'; end if;
  if inv.expires_at is not null and inv.expires_at <= now() then raise exception 'This invitation has expired.'; end if;
  if inv.max_uses is not null and inv.current_uses >= inv.max_uses then raise exception 'This invitation has already been used.'; end if;
  if inv.kind = 'email' then
    select lower(email) into v_email from public.profiles where id = v_uid;
    if v_email is distinct from inv.email then raise exception 'This invitation was sent to a different email address.'; end if;
  end if;
  select count(*) into n from public.league_members where league_id = l.id and status = 'active';
  if n >= l.max_members then raise exception 'This league is full.'; end if;
  insert into public.league_members (league_id, user_id, role, status) values (l.id, v_uid, 'member', 'active')
  on conflict (league_id, user_id) do update set status = 'active', joined_at = now();
  update public.league_invitations set current_uses = current_uses + 1 where id = inv.id;
  perform public.write_audit(l.id, 'member.join', 'member', v_uid::text, null, jsonb_build_object('invitation', inv.hint));
  perform public.notify(l.commissioner_id, 'member_joined',
    coalesce((select display_name from public.profiles where id = v_uid), 'Someone') || ' joined ' || l.name || '.', '/leagues/' || l.id);
  return l.id;
end $$;

create or replace function public.remove_member(p_league uuid, p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_commissioner(p_league) then raise exception 'Only the commissioner can remove members.'; end if;
  if p_user = (select commissioner_id from public.leagues where id = p_league) then raise exception 'The commissioner cannot be removed.'; end if;
  if public.league_competition_started(p_league) then raise exception 'Members cannot be removed once the playoffs begin.'; end if;
  update public.league_members set status = 'removed' where league_id = p_league and user_id = p_user and status = 'active';
  if not found then raise exception 'That person is not an active member.'; end if;
  -- Their unlocked picks are released (nothing has kicked off yet, so nothing is consumed).
  delete from public.lineups where league_id = p_league and user_id = p_user;
  perform public.write_audit(p_league, 'member.remove', 'member', p_user::text, null, null, p_reason);
end $$;

create or replace function public.leave_league(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid = (select commissioner_id from public.leagues where id = p_league) then raise exception 'The commissioner cannot leave their own league.'; end if;
  if public.league_competition_started(p_league) then raise exception 'You can''t leave once the playoffs begin: your scores are part of the standings.'; end if;
  update public.league_members set status = 'left' where league_id = p_league and user_id = v_uid and status = 'active';
  if not found then raise exception 'You are not in this league.'; end if;
  delete from public.lineups where league_id = p_league and user_id = v_uid;
  perform public.write_audit(p_league, 'member.leave', 'member', v_uid::text, null, null);
end $$;

-- ---------------------------------------------------------------------------
-- Lineups: the One-and-Done rules
-- ---------------------------------------------------------------------------
create or replace function public.lineup_for(p_league uuid, p_user uuid, p_round int) returns public.lineups
language plpgsql security definer set search_path = public as $$
declare v public.lineups;
begin
  select * into v from public.lineups where league_id = p_league and user_id = p_user and round = p_round for update;
  if v.id is null then
    insert into public.lineups (league_id, user_id, season_id, round)
    values (p_league, p_user, (select season_id from public.leagues where id = p_league), p_round)
    on conflict (league_id, user_id, round) do nothing;
    select * into v from public.lineups where league_id = p_league and user_id = p_user and round = p_round for update;
  end if;
  return v;
end $$;

create or replace function public.subject_label(p_player uuid, p_dst uuid) returns text
language sql stable set search_path = public as $$
  select coalesce((select full_name from public.nfl_players where id = p_player),
                  (select city || ' ' || name || ' D/ST' from public.nfl_teams where id = p_dst), 'That player');
$$;

-- Put a player (or a D/ST) in a lineup spot for a round. Replaces the spot's current pick if that
-- pick's game hasn't started. Every rule is checked here; the unique indexes are the last guard.
create or replace function public.set_selection(
  p_league uuid, p_round int, p_slot text, p_player uuid default null, p_dst_team uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  l public.leagues;
  v_lineup public.lineups;
  v_existing public.lineup_selections;
  v_prior record;
  v_team uuid;
  v_pos text;
  v_active boolean;
  v_injury text;
  v_game uuid;
  v_status text;
  v_label text := public.subject_label(p_player, p_dst_team);
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if not exists (select 1 from public.league_members where league_id = p_league and user_id = v_uid and status = 'active') then
    raise exception 'You are not a member of this league.';
  end if;
  if (p_player is null) = (p_dst_team is null) then raise exception 'Choose one player or one D/ST.'; end if;
  select * into l from public.leagues where id = p_league;
  if not (p_slot = any (public.league_slots(p_league))) then raise exception 'Unknown lineup spot %.', p_slot; end if;

  v_status := public.round_status(l.season_id, p_round);
  if v_status = 'pending' then raise exception 'The % matchups are not set yet.', public.round_name(l.season_id, p_round); end if;
  if v_status = 'complete' then raise exception 'The % is over.', public.round_name(l.season_id, p_round); end if;

  -- One person's changes in one league happen one at a time.
  perform pg_advisory_xact_lock(hashtextextended(p_league::text || v_uid::text, 0));
  v_lineup := public.lineup_for(p_league, v_uid, p_round);

  select * into v_existing from public.lineup_selections
  where lineup_id = v_lineup.id and slot = p_slot and status = 'active';
  if v_existing.id is not null then
    if public.game_is_locked(v_existing.game_id) then
      raise exception '%''s game has started, so your % pick is locked.', public.subject_label(v_existing.player_id, v_existing.dst_team_id), p_slot;
    end if;
    if v_existing.player_id is not distinct from p_player and v_existing.dst_team_id is not distinct from p_dst_team then
      return v_existing.id;
    end if;
  end if;

  if p_player is not null then
    select team_id, position, active, injury_status into v_team, v_pos, v_active, v_injury from public.nfl_players where id = p_player;
    if v_pos is null then raise exception 'Player not found.'; end if;
    if public.slot_base(p_slot) = 'DST' or not public.position_fits_slot(v_pos, p_slot) then
      raise exception '% (%) can''t play the % spot.', v_label, v_pos, p_slot;
    end if;
    if not v_active then raise exception '% is inactive.', v_label; end if;
    if v_injury in ('Out', 'IR', 'Suspended') then raise exception '% is ruled out (%).', v_label, v_injury; end if;
  else
    if public.slot_base(p_slot) <> 'DST' then raise exception 'A D/ST can only go in the D/ST spot.'; end if;
    v_team := p_dst_team;
  end if;

  v_game := public.team_round_game(v_team, l.season_id, p_round);
  if v_game is null then
    raise exception '% isn''t playing in the % (bye week or eliminated).', v_label, public.round_name(l.season_id, p_round);
  end if;
  if public.game_is_locked(v_game) then raise exception '%''s game has already kicked off.', v_label; end if;

  -- One-and-Done: has this person already used (or reserved) this player in this league and season?
  select s.round, s.slot, s.lineup_id into v_prior from public.lineup_selections s
  where s.league_id = p_league and s.user_id = v_uid and s.season_id = l.season_id and s.status = 'active'
    and s.id is distinct from v_existing.id
    and (s.player_id = p_player or s.dst_team_id = p_dst_team);
  if found then
    if v_prior.lineup_id = v_lineup.id then
      raise exception '% is already in this lineup at %.', v_label, v_prior.slot;
    end if;
    raise exception 'You already used % in the %. Each player can only be used once.', v_label, public.round_name(l.season_id, v_prior.round);
  end if;

  if v_existing.id is not null then
    delete from public.lineup_selections where id = v_existing.id;
  end if;
  begin
    insert into public.lineup_selections (lineup_id, league_id, user_id, season_id, round, slot, player_id, dst_team_id, game_id)
    values (v_lineup.id, p_league, v_uid, l.season_id, p_round, p_slot, p_player, p_dst_team, v_game)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already used % in this league. Each player can only be used once.', v_label;
  end;
  update public.lineups set updated_at = now() where id = v_lineup.id;
  insert into public.selection_events (league_id, user_id, round, slot, action, player_id, dst_team_id, actor)
  values (p_league, v_uid, p_round, p_slot, case when v_existing.id is null then 'selected' else 'replaced' end, p_player, p_dst_team, v_uid);
  return v_id;
end $$;

create or replace function public.clear_selection(p_league uuid, p_round int, p_slot text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  s public.lineup_selections;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_league::text || v_uid::text, 0));
  select * into s from public.lineup_selections
  where league_id = p_league and user_id = v_uid and round = p_round and slot = p_slot and status = 'active';
  if s.id is null then return; end if;
  if public.game_is_locked(s.game_id) then raise exception 'That pick is locked: the game has started.'; end if;
  delete from public.lineup_selections where id = s.id;
  update public.lineups set updated_at = now(),
    status = case when (select allow_incomplete from public.leagues where id = p_league) then status else 'draft' end,
    submitted_at = case when (select allow_incomplete from public.leagues where id = p_league) then submitted_at else null end
  where id = s.lineup_id;
  insert into public.selection_events (league_id, user_id, round, slot, action, player_id, dst_team_id, actor)
  values (p_league, v_uid, p_round, p_slot, 'cleared', s.player_id, s.dst_team_id, v_uid);
end $$;

-- Confirms the lineup. A full lineup is required unless the commissioner allows incomplete ones.
create or replace function public.submit_lineup(p_league uuid, p_round int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v public.lineups;
  v_filled int;
  v_slots int := coalesce(array_length(public.league_slots(p_league), 1), 0);
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v from public.lineups where league_id = p_league and user_id = v_uid and round = p_round for update;
  if v.id is null then raise exception 'Pick some players first.'; end if;
  select count(*) into v_filled from public.lineup_selections where lineup_id = v.id and status = 'active';
  if v_filled < v_slots and not (select allow_incomplete from public.leagues where id = p_league) then
    raise exception 'Fill all % spots before submitting (% to go).', v_slots, v_slots - v_filled;
  end if;
  update public.lineups set status = 'submitted', submitted_at = now(), updated_at = now() where id = v.id;
  insert into public.selection_events (league_id, user_id, round, slot, action, actor)
  values (p_league, v_uid, p_round, '*', 'submitted', v_uid);
end $$;

-- Stamps picks whose games have started (run by the sync job). The rules above never depend on
-- this stamp: they check the game itself, so a late job can't open a gap.
create or replace function public.lock_due_selections() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with due as (
    update public.lineup_selections s set locked_at = now()
    where s.locked_at is null and s.status = 'active' and public.game_is_locked(s.game_id)
    returning s.*)
  insert into public.selection_events (league_id, user_id, round, slot, action, player_id, dst_team_id)
  select league_id, user_id, round, slot, 'locked', player_id, dst_team_id from due;
  get diagnostics n = row_count;
  return n;
end $$;

-- Audited exception (site administrators only), e.g. a cancelled game: releases a locked pick so
-- the player is no longer consumed. Requires a reason; nothing is ever silently changed.
create or replace function public.admin_void_selection(p_selection uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s public.lineup_selections;
begin
  if not public.is_site_admin() then raise exception 'Administrators only.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 5 then raise exception 'Give a reason for this exception.'; end if;
  select * into s from public.lineup_selections where id = p_selection and status = 'active' for update;
  if s.id is null then raise exception 'Selection not found.'; end if;
  update public.lineup_selections set status = 'voided', voided_reason = p_reason where id = s.id;
  insert into public.selection_events (league_id, user_id, round, slot, action, player_id, dst_team_id, actor, reason)
  values (s.league_id, s.user_id, s.round, s.slot, 'voided', s.player_id, s.dst_team_id, auth.uid(), p_reason);
  perform public.write_audit(s.league_id, 'selection.void', 'selection', s.id::text, to_jsonb(s), null, p_reason);
  perform public.notify(s.user_id, 'selection_voided',
    public.subject_label(s.player_id, s.dst_team_id) || ' was released from your lineup: ' || p_reason, '/my-players?league=' || s.league_id);
end $$;

-- Submission status of everyone in a league for a round (without revealing unlocked picks).
create or replace function public.league_lineup_status(p_league uuid, p_round int)
returns table (user_id uuid, status text, filled int, locked int, slots int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_league_member(p_league) then raise exception 'Not a member of this league.'; end if;
  return query
  select m.user_id, coalesce(lu.status, 'none'),
    (select count(*)::int from public.lineup_selections s where s.lineup_id = lu.id and s.status = 'active'),
    (select count(*)::int from public.lineup_selections s where s.lineup_id = lu.id and s.status = 'active' and public.game_is_locked(s.game_id)),
    coalesce(array_length(public.league_slots(p_league), 1), 0)
  from public.league_members m
  left join public.lineups lu on lu.league_id = m.league_id and lu.user_id = m.user_id and lu.round = p_round
  where m.league_id = p_league and m.status = 'active';
end $$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.update_profile(p_display_name text, p_username text, p_prefs jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if length(trim(p_display_name)) not between 1 and 40 then raise exception 'Display name must be 1 to 40 characters.'; end if;
  if lower(p_username) !~ '^[a-z0-9_]{3,24}$' then raise exception 'Usernames are 3 to 24 letters, numbers or underscores.'; end if;
  begin
    update public.profiles set display_name = trim(p_display_name), username = lower(p_username),
      notification_prefs = coalesce(p_prefs, notification_prefs)
    where id = auth.uid();
  exception when unique_violation then raise exception 'That username is taken.';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: the reader's own permissions apply)
-- ---------------------------------------------------------------------------
create view public.v_selection_points with (security_invoker = on) as
select s.id, s.league_id, s.user_id, s.season_id, s.round, s.slot, s.player_id, s.dst_team_id, s.game_id,
  s.selected_at, s.locked_at, public.game_is_locked(s.game_id) as locked,
  g.kickoff_at, g.status as game_status,
  fp.points, fp.status as score_status, fp.breakdown, fp.calculated_at
from public.lineup_selections s
join public.leagues l on l.id = s.league_id
join public.nfl_games g on g.id = s.game_id
left join public.fantasy_points fp on fp.game_id = s.game_id and fp.scoring_config_id = l.scoring_config_id
  and (fp.player_id = s.player_id or fp.dst_team_id = s.dst_team_id)
where s.status = 'active';

create view public.v_round_scores with (security_invoker = on) as
select league_id, user_id, round, round(sum(coalesce(points, 0)), 2)::float8 as points,
  count(*) filter (where locked) as locked_count, count(*) as picks
from public.v_selection_points
group by league_id, user_id, round;

-- ---------------------------------------------------------------------------
-- Row Level Security: reads only
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'seasons', 'playoff_rounds', 'season_teams', 'nfl_teams', 'nfl_players', 'external_ids', 'nfl_games',
    'player_game_stats', 'dst_game_stats', 'stat_revisions', 'scoring_configs', 'fantasy_points', 'fantasy_points_history',
    'leagues', 'league_members', 'league_invitations', 'lineups', 'lineup_selections', 'selection_events', 'audit_log',
    'notifications', 'sync_runs', 'sync_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- NFL data and scoring rules: readable by anyone signed in.
do $$
declare t text;
begin
  foreach t in array array['seasons', 'playoff_rounds', 'season_teams', 'nfl_teams', 'nfl_players', 'nfl_games', 'player_game_stats',
    'dst_game_stats', 'scoring_configs', 'fantasy_points'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy read_signed_in on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

grant select on public.profiles, public.leagues, public.league_members, public.league_invitations, public.lineups,
  public.lineup_selections, public.selection_events, public.audit_log, public.notifications, public.sync_runs,
  public.sync_state, public.stat_revisions to authenticated;
grant select on public.v_selection_points, public.v_round_scores to authenticated;

create policy read_profiles on public.profiles for select to authenticated using (public.shares_league_with(id));
create policy read_leagues on public.leagues for select to authenticated using (public.is_league_member(id));
create policy read_members on public.league_members for select to authenticated using (public.is_league_member(league_id));
create policy read_invitations on public.league_invitations for select to authenticated using (public.is_commissioner(league_id));
create policy read_lineups on public.lineups for select to authenticated using (public.is_league_member(league_id));
-- Your own picks always; everyone else's only once that pick's game has kicked off; the
-- commissioner can review submitted lineups.
create policy read_selections on public.lineup_selections for select to authenticated using (
  user_id = auth.uid()
  or (public.is_league_member(league_id) and public.game_is_locked(game_id))
  or public.is_commissioner(league_id));
create policy read_selection_events on public.selection_events for select to authenticated using (
  user_id = auth.uid() or public.is_commissioner(league_id));
create policy read_audit on public.audit_log for select to authenticated using (
  public.is_site_admin() or (league_id is not null and public.is_commissioner(league_id)));
create policy read_notifications on public.notifications for select to authenticated using (user_id = auth.uid());
create policy read_sync_runs on public.sync_runs for select to authenticated using (public.is_site_admin());
create policy read_sync_state on public.sync_state for select to authenticated using (true);
create policy read_stat_revisions on public.stat_revisions for select to authenticated using (true);

-- Functions: nobody by default, then exactly who needs each one.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_site_admin(), public.is_league_member(uuid), public.is_commissioner(uuid), public.shares_league_with(uuid),
  public.game_is_locked(uuid, timestamptz), public.round_status(uuid, int, timestamptz), public.team_round_game(uuid, uuid, int),
  public.league_competition_started(uuid), public.league_slots(uuid), public.slot_base(text), public.position_fits_slot(text, text),
  public.round_name(uuid, int), public.current_season(), public.subject_label(uuid, uuid),
  public.create_league(text, text, int, uuid), public.update_league_settings(uuid, jsonb),
  public.create_invitation(uuid, text, text, int, int), public.revoke_invitation(uuid), public.invitation_info(text),
  public.join_league(text), public.remove_member(uuid, uuid, text), public.leave_league(uuid),
  public.set_selection(uuid, int, text, uuid, uuid), public.clear_selection(uuid, int, text), public.submit_lineup(uuid, int),
  public.admin_void_selection(uuid, text), public.league_lineup_status(uuid, int), public.mark_notifications_read(),
  public.update_profile(text, text, jsonb), public.hash_token(text)
to authenticated;
grant execute on function public.invitation_info(text), public.hash_token(text) to anon;
