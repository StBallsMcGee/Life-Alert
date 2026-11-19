# NFL data provider

## Recommendation

1. **Development (now): the built-in mock provider** (`NFL_DATA_PROVIDER=mock`). Free, plays a
   complete, deterministic sample postseason in real time. Everything in the app works with it.
2. **Production: SportsDataIO NFL**, with a commercial licence for a fantasy product with live
   (real-time) postseason stats. It is purpose-built for fantasy (player stats, D/ST, injuries,
   projections), priced per sport, and allows storing responses in your own database for display
   in your licensed product (confirm in your contract).
3. **Alternative: Sportradar NFL** if you need official-league-grade data or enterprise SLAs; it
   is materially more expensive and contract-based.

## Licensing and cost (checked November 2026; confirm with the vendors)

- SportsDataIO's self-serve low tier (reported around **$99/month per league**) is for personal
  use with delayed data and **is not licensed for a commercial app** or for live scoring.
- Commercial, real-time NFL access is **quote-only**. Third-party estimates put a single sport
  at roughly **$300–$1,000+/month**; postseason-only usage (about 6 weeks) may be negotiable.
- Sportradar publishes no prices; contracts are annual with minimums. Its 30-day trial is for
  non-commercial evaluation only. Third-party estimates start around €1,300/month.
- No ESPN or NFL.com scraping and no undocumented endpoints in production.

Questions to settle with the vendor before buying: postseason coverage and latency of live
player stats, D/ST and kicking-distance detail, stat-correction feed, rate limits, historical
seasons, redistribution/display rights, attribution, webhooks/push.

## What to do

1. Request a commercial quote at sportsdata.io (NFL, fantasy use, live stats, postseason).
2. Put the key in the **sync service's** environment only, e.g. `SPORTSDATAIO_API_KEY` in the
   Vercel project (Production) and in the sync worker host. Never in `NEXT_PUBLIC_*` variables.
3. Phase 3 adds `src/lib/nfl/sportsdataio/` implementing `NflDataProvider`, with recorded-fixture
   tests, then `NFL_DATA_PROVIDER=sportsdataio`.
4. Test: Admin → *Sync now* → check the sync log, unmatched-ID list and a known box score
   against NFL.com/ESPN manually.

Sources: [SportsDataIO developers](https://sportsdata.io/developers),
[sportsapis.dev review](https://sportsapis.dev/apis/sportsdata-io),
[sharpapi.io comparison](https://sharpapi.io/compare/sports-data-apis),
[highlightly.net](https://highlightly.net/blogs/best-nfl-apis-in-2026),
[Sportradar terms](https://developer.sportradar.com/terms-and-conditions),
[sportsapis.dev Sportradar review](https://sportsapis.dev/apis/sportradar).
