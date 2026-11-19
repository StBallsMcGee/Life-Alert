# THE MINIDOME: architecture and Phase 1 brief

## 1. Decisions taken (and why)

| Question the brief left open | Decision |
|---|---|
| Brand | **THE MINIDOME** (chosen by the owner). Original mark: a ribbed gold stadium dome over a football on turf; italic heavy wordmark. No NFL logos; teams shown as two-tone abbreviation badges in team colours. |
| Design | Reuse **Sideout** wholesale: dark charcoal surfaces, gold→orange primary, pastel gradient tiles, edge-to-edge cards on phones, sticky header + pill nav on desktop, bottom tab bar with raised centre button (a gold football, opening Lineup), "More" sheet, pop dialogs, springy motion, reduced-motion support. The volleyball court scene became an animated football field with your lineup in formation. |
| Desktop sidebar vs Sideout nav | Sideout's header + pill row on desktop (owner asked for Sideout's navigation structure). |
| Stack | Same as Sideout (and the PRD): Next.js + Supabase + Vercel. |
| Where it lives | `minidome/` in this repository, self-contained, leaving the existing Expo app untouched. Can be moved to its own repository as-is. |
| Where rules are enforced | In PostgreSQL. Browsers only read (RLS). Every change is a `security definer` function that validates the rules; unique indexes are the final One-and-Done guard. |
| Do saved-but-unsubmitted picks count? | **Yes.** Each pick is saved immediately and locks at its player's kickoff (consumed). "Submit" confirms a complete lineup; incomplete lineups can't be submitted unless the commissioner allows it. This avoids anyone losing a round by forgetting to press a button. |
| Reserved vs consumed | An unlocked pick reserves the player (can't be used in another round) and can be swapped; at kickoff it is consumed for the season. |
| Who can see whose picks | Your own always; others' only after that pick's game kicks off; the commissioner can review all (read-only). |
| Injuries | Out / IR / Suspended = unavailable. Questionable / Doubtful = selectable with a warning badge. |
| Cancelled / suspended games | Picks stay locked until a site administrator releases them with a recorded reason (audited, member notified). Postponed games re-open until the new kickoff. |
| Season reset | A league belongs to one NFL season; usage is per league + season, so a new season starts clean. Old seasons are archived, never edited. |
| Time zones | Stored as UTC; shown in each viewer's own time zone (rendered in the browser). |
| Live updates | Pages refresh while games are live (Sideout's LiveRefresh, 20–30 s) on top of the 20 s adaptive sync. Supabase Realtime can replace polling later without changing the data model. |
| Account deletion | Cascades the person's memberships and picks. Commissioners can't delete while they run a league. |

Still to decide (owner): the production data provider contract (see DATA_PROVIDER.md); whether
to send email via Supabase SMTP or a provider (Phase 4); custom domain.

## 2. System

```
Browser (PWA) ── Next.js on Vercel ── Supabase Postgres (RLS + rule functions)
                    │ server actions → RPC as the user           ▲
                    │ admin actions → owner connection           │
NFL provider ── sync service (cron endpoint / always-on worker) ─┘
                    adapter → normalise → stats (+revisions) → scoring service → fantasy_points
                    → lock_due_selections → season/round status → notifications
```

Separation: frontend (`src/app`, `src/components`) · auth (Supabase) · leagues/lineup validation
(SQL functions) · player DB (`nfl_*`) · NFL integration (`src/lib/nfl`, `src/lib/sync`) · scoring
(`src/lib/scoring`, pure) · leaderboards (`v_round_scores` + `src/lib/standings`) ·
notifications (table, written by functions and sync) · administration (`/admin`, owner-only paths).

## 3. Database (supabase/migrations)

Core entities match the brief, with these refinements:
`profiles` · `seasons` (+`is_sample`) · `playoff_rounds` (rounds come from the provider, nothing
hard-coded) · `season_teams` (incl. bye teams) · `nfl_teams` · `nfl_players` · `external_ids`
(provider id → internal id for teams, players, games, seasons) · `nfl_games` (UTC kickoff,
8 statuses, revision) · `player_game_stats` / `dst_game_stats` (normalised + raw JSON, revision) ·
`stat_revisions` · `scoring_configs` (versioned) · `fantasy_points` (+`fantasy_points_history`) ·
`leagues` · `league_members` · `league_invitations` (token **hash** only) · `lineups` ·
`lineup_selections` · `selection_events` · `audit_log` · `notifications` · `sync_runs` ·
`sync_state`.

Player usage is the set of active `lineup_selections`, guarded by
`unique (league_id, user_id, season_id, player_id)` and the same for `dst_team_id`. A separate
`player_usage` table would duplicate that data; the view `v_selection_points` exposes usage with
round, lock state and points.

## 4. API

Server actions in `src/app/actions.ts` (zod-validated) → Postgres functions:
`create_league`, `update_league_settings`, `create_invitation`, `revoke_invitation`,
`invitation_info`, `join_league`, `remove_member`, `leave_league`, `set_selection`,
`clear_selection`, `submit_lineup`, `league_lineup_status`, `update_profile`,
`mark_notifications_read`, `admin_void_selection`. Owner-only: `runSync`, `correctStats`,
`resetSampleSeason`. Cron: `GET /api/cron/sync` (Bearer `CRON_SECRET`).

## 5. NFL data

`NflDataProvider` interface: current season, playoff teams, players, playoff schedule (with live
status/score), per-game stats. Sync is one transaction with an advisory lock, retries with
exponential backoff and Retry-After, freshness timestamps, failure logging, unmatched-ID
reporting and a stale-feed warning on the admin page. Adaptive plan: live 20 s, just-final 90 s,
game day 5 min, ≤72 h 30 min, planning 6 h, offseason daily.

## 6. Testing

- Unit (52): scoring incl. the brief's Josh Allen example, all D/ST tiers, exact decimals;
  tie-breakers; roster/FLEX; locking/round state; adaptive plan and retries; mock bracket.
- Database (19) on real Postgres with real migrations + real sync service: PRD acceptance tests
  1–11 plus concurrency, direct-write attempts, invitation rules, commissioner limits, audited
  exceptions, hidden unlocked picks, settings freeze.
- Not automated yet: browser end-to-end tests against a running Supabase (Phase 5).

## 7. Screens

Home · My Leagues (+create, join) · League dashboard · Manage (commissioner) · Lineup ·
NFL Games · Game · Standings · My Players · Player · Profile · Scoring rules · Admin · Login ·
Join invitation.

## 8. Roadmap

| Phase | Status |
|---|---|
| 1 Product design & architecture | Done (this document) |
| 2 Functional MVP | Done, on the mock provider |
| 3 Licensed provider adapter, schedule/player sync, correction workflow against real feed | Next; needs a provider contract |
| 4 Email/push notifications, Realtime, historical analytics, projections | |
| 5 E2E/security/load testing, backups, monitoring, production launch | |

## 9. Known gaps

- No licensed live feed yet (mock data only).
- Email invitations create a link to send; automatic invitation/notification emails are Phase 4.
- Notification preferences are stored; only in-app notifications are delivered so far.
- No projections (the UI hides them when unavailable).
- No browser end-to-end tests yet; screens were checked visually with sample data.
