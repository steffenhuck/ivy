'use strict';
/* Assemble the single-file deliverable: index.html at the repo root.
 * Runs the calibration harness (500 seeds x 4 strategies x 2 worlds) and
 * embeds the report + full parameter set as the header comment block. */
const fs = require('fs');
const path = require('path');
const { runOne, summarize } = require('./harness.js');
const { DEFAULT_PARAMS } = require('./engine.js');

const N = 500;
console.log(`running harness (${N} seeds x 4 strategies x 2 worlds)...`);
const lines = [];
lines.push(`SECOND EDITION -- revised after playtest feedback (R. Hakimov).`);
lines.push(`Seeds: 1..${N}. Player: Greyfriars College (initial rank 4, worst).`);
lines.push('Two worlds, ONE unified cost function (per department, both worlds):');
lines.push('  C = capacity*seatRent + cOver*max(0, enrolment - capacity)');
lines.push('    = 8*0.75 + 24*(m-8)+  -- rent on every seat, filled or not, plus a');
lines.push('  steep price above capacity that deferred acceptance makes unreachable');
lines.push('  in the scheme. Fees may exceed cOver (feeCap 25 > 24): the overbooker');
lines.push('  probe showed overflow-for-profit never materialises (100% bankrupt).');
lines.push('Endowments are world-specific AND private: market E=[120,100,130,145];');
lines.push('scheme ES=[120,100,95,105]. The public starting table is identical.');
lines.push('');
lines.push('NEW IN THE SECOND EDITION:');
lines.push('  1. Scheme AI rationality: with fee income guaranteed by the clearing');
lines.push('     house, rival colleges no longer hold market-bred precautionary');
lines.push('     floats, and their plan ceilings loosen (aiSchemeCapMult 1.35).');
lines.push('     This closes the reviewer exploit: "spend the full budget equally,');
lines.push('     top by year five, coast" -- see the rustam row below.');
lines.push('  2. The Founders\' Reckoning: at the final table each house is');
lines.push('     credited max(0,E)/15 league points, capped at 8. Money is never');
lines.push('     worthless; the incumbents\' hoards (mean final E well above 1000)');
lines.push('     finally count against a challenger, in both worlds. For the');
lines.push('     player the credit never beats final-round investment (the curves');
lines.push('     cross near 500k/field), so its bite is difficulty, not hoarding.');
lines.push('  3. Merit scholarships (both worlds): an annual per-field fund F,');
lines.push('     spent whether anyone comes; students scoring >= 70 value the');
lines.push('     college 2.2*sqrt(F) higher, in market choice and in DA preference');
lines.push('     lists identically. The scholar probe (heavy standing pots on a');
lines.push('     sensible budget) goes bankrupt in 100% of seeds: a lever, not a');
lines.push('     freebie. Useful mainly in the overtaking fight, as merit aid is.');
lines.push('  4. Choice cards, player-only: ~12 dilemmas (poaching a rival\'s');
lines.push('     professor is the flagship) on the separate events RNG stream,');
lines.push('     three draws per round consumed unconditionally for stream');
lines.push('     stability; success rolls drawn eagerly at offer time. Unanswered');
lines.push('     cards auto-decline (an unattended college buys no insurance).');
lines.push('     The gambler probe (accept everything) does not beat sensible');
lines.push('     after risk; card prices are set against the investment');
lines.push('     technology g(I) = 1.5*sqrt(I), one card deliberately below it.');
lines.push('');
lines.push('Scripted players per world (dev/strategies.js):');
lines.push('  market: naive static; sensible demand-tracking + maintenance; sharp');
lines.push('          undercuts the cash cow floor for the captive segment, farms');
lines.push('          the intake->teaching loop, forecasts offer yield from league');
lines.push('          position, rations admission once on top, buys good cards.');
lines.push('  scheme: naive static full quota; sensible quota-tracking; sharp is');
lines.push('          VOLUME-FIRST in this edition -- all 8 seats declared always');
lines.push('          (the report is free), the threshold is the selectivity');
lines.push('          instrument, scholarships in the summit fight, cards by');
lines.push('          arithmetic. The first edition\'s Sonmez under-reporting is');
lines.push('          no longer best play against rationally-spending rivals.');
lines.push('  rustam: the reviewer\'s strategy, both worlds -- competent');
lines.push('          admissions, full budget spent, split equally, every year.');
lines.push('');
for (const world of ['market', 'scheme']) {
  lines.push(`-- world: ${world} --`);
  lines.push('strategy  | meanScore | rank1  rank2  rank3  rank4 | score=3 | score>=1 | score<=0 | bankrupt | top<=yr5&hold');
  for (const name of ['naive', 'sensible', 'sharp', 'rustam']) {
    const rs = [];
    for (let seed = 1; seed <= N; seed++) rs.push(runOne(name, seed, null, world));
    const s = summarize(name, rs);
    lines.push(
      name.padEnd(9) + ' | ' + String(s.meanScore).padStart(9) + ' | ' +
      s.rankPct.join(' ') + ' | ' + s.score3.padStart(7) + ' | ' + s.scoreGe1.padStart(8) +
      ' | ' + s.scoreLe0.padStart(8) + ' | ' + s.bankrupt.padStart(8) + ' | ' + s.coast.padStart(13));
  }
  lines.push('');
}
lines.push('Against the calibration targets:');
lines.push('  - Sharp reaches score 3 (worst -> best) in ~1/3 of seeds: met in both');
lines.push('    worlds (32.0% market, 34.8% scheme).');
lines.push('  - The reviewer exploit is closed: rustam tops the scheme in 9.8% of');
lines.push('    seeds (was 43.2% before the second edition -- more than sharp),');
lines.push('    and reaches the top by year five and holds it in 0.0%. In the');
lines.push('    market the same strategy goes bankrupt in 61% of seeds: full-');
lines.push('    throttle spending is a plan only where revenue cannot surprise you.');
lines.push('  - Sensible improves without topping: market 30.0% improve / 2.0% top;');
lines.push('    scheme 43.4% improve / 0.0% top in 500 seeds. Prudence buys');
lines.push('    survival, not distinction -- more than ever under the Reckoning,');
lines.push('    which hands the hoarding incumbents up to 8 free points.');
lines.push('  - Naive: market 99.6% bankrupt (fixed costs bill the sleeping).');
lines.push('    Scheme: survives in a third of seeds (34.4%) but now tops only');
lines.push('    2.0% (was 18%): rationally-spending rivals no longer leave the');
lines.push('    summit to the idle. The institutional lesson stands where it');
lines.push('    belongs -- where there is no price, there is no selection, and');
lines.push('    the clearing house keeps the asleep alive; it just no longer');
lines.push('    crowns them.');
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
