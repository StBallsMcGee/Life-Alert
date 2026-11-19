# Set-up and deployment

## 1. Supabase
1. Create a project. In **SQL editor**, run each file in `supabase/migrations/` in order.
2. **Authentication → Providers**: Email on (keep "Confirm email" on). For **Google** and
   **Apple**, follow Supabase's guides to create the OAuth client / Services ID and paste the
   credentials. Add `https://YOUR-DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback`)
   to **URL Configuration → Redirect URLs**; set Site URL to your domain.
3. Note the project URL, anon key, service-role key and the **Session pooler** connection string.

## 2. Environment
Copy `.env.example` to `.env.local` (development) and set the same in Vercel → Settings →
Environment Variables (Production *and* Preview). `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
`CRON_SECRET` and any provider key are server-only; never prefix them with `NEXT_PUBLIC_`.

## 3. Vercel
Import the repository with **Root Directory = `minidome`**. Deploy.

## 4. First data and an administrator
```bash
DATABASE_URL=... npm run sync:once -- --full     # loads the (sample) season, teams, players
# sign up in the app, then:
DATABASE_URL=... npx tsx scripts/grant-admin.ts --email you@example.com
```
Admin → "Sample postseason controls" restarts the simulation (e.g. Wild Card in 10 minutes) so
you can try picks, kickoff locks, live scoring and standings.

## 5. Keeping data fresh
- `vercel.json` runs `/api/cron/sync` once a day (Vercel Hobby's limit).
- For game days run the worker, which follows the adaptive plan (20 s while games are live):
  `DATABASE_URL=... NFL_DATA_PROVIDER=... npm run sync:worker` on any small always-on Node host
  (e.g. Railway, Render, Fly.io), or call the cron URL every minute from an external scheduler
  with `Authorization: Bearer $CRON_SECRET`.

## 6. Verify
`npm run typecheck && npm test && npm run test:db && npm run build`. For `test:db`, point
`TEST_PG_ADMIN_URL` at any PostgreSQL 15+ superuser connection (a throwaway database is created
per test file).

## 7. Install on a phone
Open the site in Safari → Share → Add to Home Screen (or Chrome → Install app).
