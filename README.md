# THE LEAGUE

A browser game about running a university, in one standalone HTML file.

**Play:** open [`index.html`](index.html) in any browser. No build step, no
dependencies; the game runs fully offline (a GoatCounter analytics beacon is
the only external request, and nothing depends on it). An optional `?seed=`
URL parameter makes a season reproducible; the seed in play is printed in the
footer either way.

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
  them. The quota is a pure report, so the sharp play is matching theory
  undiluted — under-reporting capacity to raise intake calibre (Sönmez
  1997). The market can overflow your seats; the Scheme can only leave
  them empty.

## Development

The game engine was built headless and calibrated before any UI existed
(`dev/`):

- `dev/engine.js` — the full game engine + AI opponents (this exact file is
  inlined into `index.html`)
- `dev/strategies.js` — scripted Naive / Sensible / Sharp players
- `dev/harness.js` — calibration harness: `node dev/harness.js [seeds]`
- `dev/sweep.js` — parameter sweep used during calibration
- `dev/debug.js` — single-game tracer: `node dev/debug.js sharp 3`
- `dev/build.js` — assembles `index.html` and embeds a fresh 500-seed
  harness report in its header comment

Calibration over 500 seeds from the worst start, per world (full report
embedded at the top of `index.html`). Market: Sharp finishes 1st in 36% of
seeds, Sensible improves in 35% and tops rarely (2.4%), and static Naive is
foreclosed on by the rent (99.8% bankrupt). Scheme: Sharp 34%, Sensible
improves in 33% and tops in 4.6%, while static Naive survives a third of
seeds and tops the table in 18% of them — where there is no price, there is
no selection. Sensible bankruptcy: 9.8% (market), 6.8% (scheme).
Starting endowments are world-specific and private — the market's bottom
college holds a war chest the Scheme's must not have — while the published
starting table is identical in both editions.
