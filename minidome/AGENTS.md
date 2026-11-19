# THE MINIDOME: notes for coding agents

This folder is a **Next.js 15 web app / PWA** (not the Expo app at the repository root; the root
AGENTS.md Expo rules do not apply here). It is a sibling of the Sideout volleyball app and shares
its design system and conventions.

- Database changes go in a **new** file in `supabase/migrations/`. New tables need RLS enabled, a
  read policy, and no write grants for `authenticated`; writes go through `security definer`
  functions that check the caller, validate game rules and write history/audit rows.
- Game rules live in the database (`set_selection`, `game_is_locked`, unique indexes). TypeScript
  copies (`src/lib/league/roster.ts`, `src/lib/nfl/rounds.ts`, `src/lib/data/pool.ts`) are for
  display only. Change both together.
- Scoring lives only in `src/lib/scoring/engine.ts`, run server-side by the sync service. Bump
  `ENGINE_VERSION` when results could change; add a new `scoring_configs` version, never edit one.
- Never make core features depend on undocumented endpoints or scraping. Providers implement
  `NflDataProvider` (`src/lib/nfl/provider.ts`).
- Before finishing: `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build`.
