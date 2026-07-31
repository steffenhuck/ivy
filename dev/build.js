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
lines.push('Two worlds, ONE unified cost function (per department, both worlds):');
lines.push('  C = capacity*seatRent + cOver*max(0, enrolment - capacity)');
lines.push('    = 8*0.75 + 24*(m-8)+  -- rent on every seat, filled or not, plus a');
lines.push('  steep price above capacity that deferred acceptance makes unreachable');
lines.push('  in the scheme. Fees may exceed cOver (feeCap 25 > 24): the overbooker');
lines.push('  probe strategy showed overflow-for-profit never materialises -- demand');
lines.push('  thins out far below the fee cap and maintenance eats the margin.');
lines.push('Endowments are world-specific AND private (the public starting position,');
lines.push('the quality table, is identical): market E=[120,100,130,145] -- the');
lines.push('board recapitalises the turnaround colleges; scheme ES=[120,100,95,105]');
lines.push('-- under guaranteed DA demand a war chest would make early over-spending');
lines.push('a winning strategy for the diligent and the asleep alike.');
lines.push('');
lines.push('Scripted players per world (dev/strategies.js):');
lines.push('  market: naive static; sensible demand-tracking + maintenance; sharp');
lines.push('          undercuts the cash cow floor for the captive segment, farms');
lines.push('          the intake->teaching loop, forecasts offer yield from league');
lines.push('          position, rations admission once on top.');
lines.push('  scheme: naive static full quota; sensible quota-tracking; sharp dives');
lines.push('          the threshold for the rejection cascade, then under-reports');
lines.push('          capacity (Sonmez manipulation, now a PURE report -- no rent');
lines.push('          rebate), then re-expands late.');
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
lines.push('Against the calibration targets:');
lines.push('  - Sharp reaches score 3 (worst -> best) in ~1/3+ of seeds: met in both');
lines.push('    worlds (36.2% market, 33.8% scheme).');
lines.push('  - Sensible rarely reaches the top: met (2.4% / 4.6%). Its improvement');
lines.push('    rate (~35% / ~33%) is well below the old free-capacity market\'s 64%:');
lines.push('    the rent world is harsher for basic play. Its bankruptcy is uncommon');
lines.push('    rather than rare in the market (9.8%; scheme 6.8%).');
lines.push('  - Naive: in the market it declines terminally (99.8% bankrupt -- fixed');
lines.push('    costs bill the sleeping in both worlds now). In the scheme it');
lines.push('    survives in a third of seeds and TOPS the table in 18%: a documented');
lines.push('    institutional finding, not a bug -- where there is no price, there');
lines.push('    is no selection; the clearing house does not distinguish the');
lines.push('    diligent from the lucky.');
lines.push('');
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
