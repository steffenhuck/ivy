'use strict';
/* ============================================================================
 * THE LEAGUE — headless calibration harness.
 * Runs each scripted strategy from the worst-ranked university over many
 * seeds and reports final-rank / score distributions.
 *   node harness.js [nSeeds] [--params '{"delta":0.9}']
 * ========================================================================= */
const { Game, DEFAULT_PARAMS } = require('./engine.js');
const strategies = require('./strategies.js');

function runOne(stratName, seed, paramsOverride) {
  const g = new Game({ seed, playerIndex: 3, params: paramsOverride });
  const strat = strategies[stratName](g.P);
  for (;;) {
    const pre = g.startRound();
    const dec = strat.admissions(pre);
    const rep = g.submitAdmissions(dec);
    if (g.phase === 'bankrupt') break;
    const inv = strat.spend(pre, rep, g.unis[g.playerIndex]);
    const res = g.submitSpend(inv);
    if (res.done) break;
  }
  return {
    finalRank: g.finalRank, score: g.score, bankrupt: !!g.bankrupt,
    initialRank: g.initialRank,
    endowment: g.unis[3].E,
    total: g.unis[3].RS + g.unis[3].TS + g.unis[3].RH + g.unis[3].TH,
  };
}

function summarize(name, results) {
  const n = results.length;
  const ranks = [0, 0, 0, 0];
  let bank = 0, scoreSum = 0;
  const scoreDist = {};
  for (const r of results) {
    ranks[r.finalRank - 1]++;
    if (r.bankrupt) bank++;
    scoreSum += r.score;
    scoreDist[r.score] = (scoreDist[r.score] || 0) + 1;
  }
  const pct = x => (100 * x / n).toFixed(1).padStart(5) + '%';
  return {
    name,
    meanScore: (scoreSum / n).toFixed(2),
    rankPct: ranks.map(x => pct(x)),
    score3: pct(scoreDist[3] || 0),
    scoreGe1: pct(results.filter(r => r.score >= 1).length),
    scoreLe0: pct(results.filter(r => r.score <= 0).length),
    bankrupt: pct(bank),
    meanTotal: (results.reduce((a, r) => a + r.total, 0) / n).toFixed(1),
    meanE: (results.reduce((a, r) => a + r.endowment, 0) / n).toFixed(0),
  };
}

function main() {
  const args = process.argv.slice(2);
  let nSeeds = 500, paramsOverride = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--params') paramsOverride = JSON.parse(args[++i]);
    else nSeeds = parseInt(args[i], 10) || nSeeds;
  }
  const names = ['naive', 'sensible', 'sharp'];
  const rows = [];
  for (const name of names) {
    const results = [];
    for (let seed = 1; seed <= nSeeds; seed++) results.push(runOne(name, seed, paramsOverride));
    rows.push(summarize(name, results));
  }
  const P = Object.assign({}, DEFAULT_PARAMS, paramsOverride || {});
  console.log(`seeds=${nSeeds}  rounds=${P.rounds}  delta=${P.delta} gamma=${P.gamma} kappa=${P.kappa} cOver=${P.cOver} r=${P.interest}`);
  console.log('strategy  | meanScore | rank1  rank2  rank3  rank4 | score=3 | score>=1 | score<=0 | bankrupt | meanQ  meanE');
  for (const r of rows) {
    console.log(
      r.name.padEnd(9) + ' | ' + String(r.meanScore).padStart(9) + ' | ' +
      r.rankPct.join(' ') + ' | ' + r.score3.padStart(7) + ' | ' + r.scoreGe1.padStart(8) +
      ' | ' + r.scoreLe0.padStart(8) + ' | ' + r.bankrupt.padStart(8) +
      ' | ' + String(r.meanTotal).padStart(5) + ' ' + String(r.meanE).padStart(6));
  }
}

if (require.main === module) main();
module.exports = { runOne, summarize };
