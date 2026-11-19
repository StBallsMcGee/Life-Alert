# Scoring (Half PPR, configuration "Half PPR" version 1)

| Passing | | Rushing | | Receiving | |
|---|---|---|---|---|---|
| Yard | 0.04 | Yard | 0.1 | Reception | 0.5 |
| TD | 4 | TD | 6 | Yard | 0.1 |
| Interception | −2 | 2-pt conversion | 2 | TD | 6 |
| 2-pt conversion | 2 | | | 2-pt conversion | 2 |

Lost fumble −2. Kicking: XP 1, FG 0–39 3, FG 40–49 4, FG 50+ 5, missed FG −1, missed XP −1.

D/ST: sack 1, interception 2, fumble recovery 2, defensive TD 6, special-teams TD 6, safety 2,
blocked kick 2, extra-point return 2, two-point return 2. Points allowed: 0 → 10, 1–6 → 7,
7–13 → 4, 14–20 → 1, 21–27 → 0, 28–34 → −1, 35+ → −4.

## Points allowed definition

Points allowed = the opponent's final score (including overtime) **minus** points the opponent
scored with its own defense or special teams: return touchdowns (6) plus the try that followed
(1 or 2), safeties (2), and defensive extra-point / two-point returns (2). Those points weren't
allowed by the defense being scored. The data adapter computes this value; the engine applies
the tiers.

## Mechanics

- Calculated server-side only (sync service → `fantasy_points`), in thousandths, rounded to
  hundredths. Fractional and negative totals are supported.
- Each row records the scoring configuration, engine version and statistics revision. Status:
  `provisional` (game live), `final`, `updated` (changed after final by a stat correction).
- Any change to a points row copies the previous row into `fantasy_points_history` first.
- Configurations are versioned and per-league; a league's configuration freezes at first kickoff.
- Individual offensive players are not credited with return touchdowns in v1 (D/ST gets them).
