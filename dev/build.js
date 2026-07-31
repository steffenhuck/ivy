'use strict';
/* Assemble the single-file deliverable: index.html at the repo root.
 * Runs the calibration harness (500 seeds x 3 strategies) and embeds the
 * report + full parameter set as the header comment block. */
const fs = require('fs');
const path = require('path');
const { runOne, summarize } = require('./harness.js');
const { DEFAULT_PARAMS } = require('./engine.js');

const N = 500;
console.log(`running harness (${N} seeds x 3 strategies x 2 worlds)...`);
const lines = [];
lines.push(`Seeds: 1..${N}. Player: Greyfriars College (initial rank 4, worst).`);
lines.push('Two worlds, each with its own scripted Naive/Sensible/Sharp players');
lines.push('(dev/strategies.js):');
lines.push('  market - the original economy: per-field fees and thresholds, no');
lines.push('           intake cap, overage penalty. Sharp prices the captive');
lines.push('           segment, farms the intake->teaching loop, forecasts offer');
lines.push('           yield from league position, rations admission once on top.');
lines.push('  scheme - the National Admissions Scheme: regulated flat fee,');
lines.push('           student-proposing deferred acceptance per field, declared');
lines.push('           quotas with a per-seat annual cost. Sharp dives its');
lines.push('           threshold for the rejection cascade, then under-reports');
lines.push('           capacity (the Sonmez manipulation) to farm intake calibre,');
lines.push('           then re-expands late.');
lines.push('');
for (const world of ['market', 'scheme']) {
  lines.push(`-- world: ${world} --`);
  lines.push('strategy  | meanScore | rank1  rank2  rank3  rank4 | score=3 | score>=1 | score<=0 | bankrupt');
  for (const name of ['naive', 'sensible', 'sharp']) {
    const rs = [];
    for (let seed = 1; seed <= N; seed++) rs.push(runOne(name, seed, null, world));
    const s = summarize(name, rs);
    lines.push(
      name.padEnd(9) + ' | ' + String(s.meanScore).padStart(9) + ' | ' +
      s.rankPct.join(' ') + ' | ' + s.score3.padStart(7) + ' | ' + s.scoreGe1.padStart(8) +
      ' | ' + s.scoreLe0.padStart(8) + ' | ' + s.bankrupt.padStart(8));
  }
  lines.push('');
}
lines.push('Calibration targets, market world (all met; numbers identical to the');
lines.push('previous report - the scheme was added without touching the market path):');
lines.push('  - Sharp reaches score 3 (worst -> best) in a healthy share of seeds (~1/3+)');
lines.push('  - Sensible typically improves rank, rarely reaches the top');
lines.push('  - Naive stagnates or declines');
lines.push('  - Bankruptcy possible but rare under Sensible play');
lines.push('');
lines.push('Scheme world, against the same targets:');
lines.push('  - Sharp 74% worst -> first: met.');
lines.push('  - Sensible rarely tops (8.4%): met. Improves in 37% of seeds, less');
lines.push('    often than the market\'s 64% - a documented structural property,');
lines.push('    not a bug: with no price competition, incumbents defend rank with');
lines.push('    quality investment (reaction functions in the AI personalities),');
lines.push('    which deters half-hearted challenges. The Scheme protects the');
lines.push('    competent; it does not promote them.');
lines.push('  - Naive declines terminally in ~95% of seeds: static play declares');
lines.push('    seats it never fills and pays the Regulator\'s rent until broke.');
lines.push('    The market kills by crowd; the Scheme kills by emptiness.');
lines.push('  - Bankruptcy under Sensible play: 0.0-0.2% (rare).');
lines.push('');
lines.push('FULL PARAMETER SET (also live in DEFAULT_PARAMS below):');
lines.push(JSON.stringify(DEFAULT_PARAMS, null, 2));

const report = lines.join('\n');
console.log(report.split('\n').slice(0, 20).join('\n'));

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
// Function replacements: engine/ui sources may contain '$'-patterns that
// string replacements would mangle. Also keep '--' out of the comment block.
const html = read('template.html')
  .replace('{{REPORT}}', () => report.replace(/--/g, '‑‑'))
  .replace('{{CSS}}', () => read('style.css'))
  .replace('{{ENGINE}}', () => read('engine.js'))
  .replace('{{UI}}', () => read('ui.js'));

const out = path.join(__dirname, '..', 'index.html');
fs.writeFileSync(out, html);
console.log(`\nwrote ${out} (${(html.length / 1024).toFixed(0)} kB)`);
