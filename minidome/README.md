# THE MINIDOME

Private NFL **playoff One-and-Done** fantasy leagues. Pick nine players each postseason round
(Wild Card, Divisional, Conference Championships, Super Bowl); each player and each D/ST can be
used **once** per league; most points after the Super Bowl wins.

THE MINIDOME is the football version of **Sideout**: it reuses Sideout's stack, design system,
navigation, components and security model, with football in place of volleyball.

**Stack:** Next.js 15 · React 19 · TypeScript · Tailwind · Supabase (PostgreSQL, Auth, Row Level
Security) · Vercel · a separate NFL sync service.

## What works today (Phase 1 + Phase 2 MVP)

- Accounts: email + password (with email verification), magic link, password reset, Google and
  Apple sign-in (once enabled in Supabase), profile editing, account deletion.
- Private leagues (2–20 members, default 6): invitation links, codes and email-only invitations
  with expiry, maximum uses and revocation; commissioner settings that freeze at first kickoff;
  member removal before kickoff; audit history.
- The One-and-Done game, **enforced by the database**: per-person/per-league/per-season usage
  (unique indexes, safe under simultaneous requests), byes and eliminated teams, Out/IR players,
  position/FLEX/D-ST eligibility, individual kickoff locking from authoritative game data,
  postponed/cancelled handling with an audited admin exception.
- Lineup builder with the four availability states (Available / Selected / Used + round / Unavailable + reason),
  search and filters, save-as-you-go, submit, lock indicators, completion %.
- Half PPR scoring service (versioned, per-league, exact decimals, full breakdowns), provisional →
  final → updated score states, history of every earlier calculation.
- Live leaderboard (cumulative, any single round, rank movement, points behind, PRD tie-breakers),
  NFL games and box scores, player performance pages, My Players, notifications (in-app).
- NFL data adapter interface + a **mock provider** that plays a full sample postseason in real time.
- Admin dashboard: feed health, sync log, sync now, sample-season controls, stat corrections with
  reasons, selection exceptions, audit log.

Not yet: a licensed live data feed (Phase 3), email/push delivery (Phase 4), projections. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §9.

## Documents

| Read | For |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Phase 1 brief: decisions, architecture, schema, brand, UX, roadmap |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Step-by-step set-up and go-live |
| [docs/DATA_PROVIDER.md](docs/DATA_PROVIDER.md) | Which NFL data provider, licensing, cost, where the key goes |
| [docs/SCORING.md](docs/SCORING.md) | Exact scoring and points-allowed definitions |

## Commands

```bash
npm install
npm run dev          # http://localhost:3000 (needs .env.local, see .env.example)
npm run typecheck
npm test             # unit tests: scoring, tie-breakers, roster, locking, sync plan, mock provider
npm run test:db      # database acceptance tests (needs TEST_PG_ADMIN_URL, any PostgreSQL 15+)
npm run build
npm run sync:once    # one NFL sync against DATABASE_URL
npm run sync:worker  # always-on adaptive sync (20 s during live games)
```

## Layout

```
supabase/migrations/  tables, constraints, rules (security-definer functions), RLS, views
src/lib/scoring/      scoring service (pure)
src/lib/nfl/          provider interface, rounds/locking, mock provider
src/lib/sync/         sync service, adaptive plan, retries, stat corrections
src/lib/data/         per-request context, queries, player availability (pool)
src/app/              screens (src/app/(app)/…), server actions, cron endpoint
tests/db/             PRD acceptance tests against a real database
```
