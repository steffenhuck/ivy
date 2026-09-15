# THE LEAGUE

A browser game about running a university, in one standalone HTML file.
Now in its **second edition**, revised after playtest feedback.

**Play:** open [`index.html`](index.html) in any browser. No build step, no
dependencies; the game runs fully offline (a GoatCounter analytics beacon is
the only external request, and nothing depends on it). An optional `?seed=`
URL parameter makes a season reproducible — same students, same news, same
luck — and the seed in play is printed in the footer either way, as the
season's licence number (fresh seasons draw a six-digit one).

You take over one of four universities — by design, the bottom-ranked
Greyfriars College — and have twenty academic years to climb The Morning
Ledger's league table. Each year you make two moves: run admissions, then
invest the proceeds in research and teaching quality. Rivals are run by three
adaptive AI personalities playing under exactly the same rules.
Score = starting rank − final rank.

The game ships in **two editions**, chosen on the title screen (or via
`?world=scheme`):

Both worlds share **one cost of seats**: each of a department's eight seats
costs £0.75k a year, filled or not, and every student beyond the eighth
costs £24k — a term only the market can reach.

- **The Open Market** — you set fees (up to £25k; only demand polices the
  top end) and thresholds per field; applicants apply where they can afford
  and take their best offer; every acceptance must be honoured.
- **The National Admissions Scheme** — fees are fixed by the Regulator,
  means don't matter, and a student-proposing deferred-acceptance match
  (Gale–Shapley) assigns students against reported quotas, never exceeding
  them. The quota is a pure report (Sönmez 1997 manipulation, undiluted).
  The market can overflow your seats; the Scheme can only leave them empty.

## New in the second edition

- **Scheme rivals spend like rationals.** With fee income guaranteed by the
  clearing house, the AI colleges no longer hold market-bred precautionary
  cash, and their spending plans loosen. This closes the playtest exploit
  ("spend the full budget equally, top by year five, coast"): that strategy
  now tops the Scheme in under 10% of seeds and never coasts.
- **The Founders' Reckoning.** At the final table, remaining endowment
  converts to league points — 1 point per £15k, capped at 8, in both worlds.
  Money is never worthless, and the incumbents' hoards finally count
  against a challenger.
- **Merit scholarships** (both worlds): per field, you set a stipend per
  student and the school score that qualifies for it. Every qualifying
  student who enrols is owed the stipend — the bill settles with the
  intake, so a generous stipend at a low bar is a road to ruin. In the
  market the stipend counts toward the fee (merit aid as a targeted price
  cut to the bright); in the Scheme it makes qualifying students rank you
  higher — a side payment, the only price competition the Regulator has
  left.
- **Choice cards**: some mornings the post brings a dilemma — poach a
  rival's professor, take a donor's conditioned money, insure against the
  storm season, host the congress, hush a scandal. Odds and sums are
  printed on the card; ignored post resolves itself, not always kindly.
- **Legibility**: every news event now carries a table of who was hit and
  by how much, and the admissions desk explains how students choose and
  what your offer yield was.

## Development

The game engine was built headless and calibrated before any UI existed
(`dev/`):

- `dev/engine.js` — the full game engine + AI opponents + event and choice
  card mechanics (this exact file is inlined into `index.html`)
- `dev/strategies.js` — scripted Naive / Sensible / Sharp players, plus
  probes: `rustam` (the reviewer's full-spend strategy), `scholar`,
  `gambler`, `overbooker`
- `dev/harness.js` — calibration harness: `node dev/harness.js [seeds]`
- `dev/sweep.js` — parameter sweep used during calibration
- `dev/debug.js` — single-game tracer: `node dev/debug.js sharp 3`
- `dev/build.js` — assembles `index.html` and embeds a fresh 500-seed
  harness report in its header comment

Calibration over 500 seeds from the worst start, per world (full report
embedded at the top of `index.html`). Market: Sharp finishes 1st in 32% of
seeds, Sensible improves in 30% and tops rarely (2.0%), static Naive is
foreclosed on by the rent (99.6% bankrupt), and the reviewer's full-spend
strategy goes bankrupt in 61%. Scheme: Sharp 33.4%, Sensible improves in
43% and never tops in 500 seeds, the full-spend strategy tops 9.8%, and
static Naive survives a third of seeds but now tops only 2% — where there
is no price there is still no selection; the clearing house keeps the
asleep alive, it just no longer crowns them. Starting endowments are
world-specific and private — the market's bottom college holds a war chest
the Scheme's must not have — while the published starting table is
identical in both editions.
