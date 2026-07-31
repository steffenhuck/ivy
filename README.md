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

- **The Open Market** — you set fees and thresholds per field; applicants
  apply where they can afford and take their best offer; every acceptance
  must be honoured, and intake beyond capacity pays a punitive overage.
- **The National Admissions Scheme** — fees are fixed by the Regulator,
  means don't matter, and a student-proposing deferred-acceptance match
  (Gale–Shapley) assigns students to declared per-department quotas. Quotas
  are never exceeded, but every declared seat costs rent whether it fills or
  not: the market kills by crowd, the Scheme kills by emptiness. The sharp
  play here is real matching theory — under-reporting capacity to raise
  intake calibre.

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
embedded at the top of `index.html`). Market: Sharp finishes 1st in 58% of
seeds, Sensible improves in 64% but tops in only 6%, Naive stagnates in 98%;
Sensible bankruptcy 4.2%. Scheme: Sharp 74%, Sensible tops rarely (8%) and
improves in 37% — the Scheme's incumbents defend rank with quality investment,
which deters half-hearted challenges — while static Naive play pays rent on
empty seats until broke (~95%); Sensible bankruptcy ≤0.2%.
