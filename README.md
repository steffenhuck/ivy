# THE LEAGUE

A browser game about running a university, in one standalone HTML file.

**Play:** open [`index.html`](index.html) in any browser. No build step, no
dependencies; the game runs fully offline (a GoatCounter analytics beacon is
the only external request, and nothing depends on it). An optional `?seed=`
URL parameter makes a season reproducible; the seed in play is printed in the
footer either way.

You take over one of four universities — by design, the bottom-ranked
Greyfriars College — and have twenty academic years to climb The Morning
Ledger's league table. Each year you make two moves: set admission thresholds
and fees per field (STEM / HSS), then invest the proceeds in research and
teaching quality. Rivals are run by three adaptive AI personalities playing
under exactly the same rules. Score = starting rank − final rank.

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

Calibration result over 500 seeds from the worst start (also embedded at the
top of `index.html`, regenerated after the stratified-cohort and random-event
engine changes): Sharp finishes 1st in 58% of seeds, Sensible improves rank
in 64% but reaches the top in only 6%, Naive stagnates or declines in 98%;
bankruptcy under Sensible play is rare (4.2%).
