'use strict';
/* ============================================================================
 * Unified cost-function experiment.
 * Both worlds: flat rent rhoFlat on all 8 capacity seats per department,
 * filled or not. Market: enrolment above 8 costs cOver per head. Fee caps
 * raised to 22 (the budget support's edge) so fees CAN sit far above cOver.
 * Probe: the OVERBOOKER prices just above cOver with a low bar and never
 * rations -- if profitable overflow is a real strategy, it should show here.
 *   node exp-cost.js [nSeeds]
 * ========================================================================= */
const { Game } = require('./engine.js');
const strategies = require('./strategies.js');

const N = parseInt(process.argv[2] || '200', 10);

function run(world, tier, seed, rho, c) {
  const params = {
    world, costModel: 'unified', rhoFlat: rho, cOver: c, feeCap: 22,
  };
  const g = new Game({ seed, playerIndex: 3, params });
  const key = world === 'scheme' ? tier + 'Scheme' : tier;
  const strat = strategies[key](g.P);
  let overP = 0, overAI = 0; // overage heads: player, all AIs
  for (;;) {
    const pre = g.startRound();
    const dec = strat.admissions(pre);
    const rep = g.submitAdmissions(dec);
    if (world === 'market') {
      for (const u of g.unis) {
        const r = g._reports[u.index];
        const heads = Math.max(0, r.S.matric - 8) + Math.max(0, r.H.matric - 8);
        if (u.index === 3) overP += heads; else overAI += heads;
      }
    }
    if (g.phase === 'bankrupt') break;
    if (g.submitSpend(strat.spend(pre, rep, g.unis[3])).done) break;
  }
  return { score: g.score, bankrupt: !!g.bankrupt, overP, overAI };
}

function cell(world, tier, rho, c) {
  const rs = [];
  for (let s = 1; s <= N; s++) rs.push(run(world, tier, s, rho, c));
  const pc = f => (100 * rs.filter(f).length / N).toFixed(0);
  const mean = a => (rs.reduce((x, r) => x + a(r), 0) / N).toFixed(1);
  return {
    mean: mean(r => r.score), s3: pc(r => r.score === 3), ge1: pc(r => r.score >= 1),
    bank: pc(r => r.bankrupt), overP: mean(r => r.overP), overAI: mean(r => r.overAI),
  };
}

console.log(`unified cost sweep, ${N} seeds/cell, feeCap=22`);
for (const rho of [0.5, 1.0, 1.5]) {
  for (const c of [8, 12, 16, 20, 24]) {
    const out = [`rho=${rho} c=${String(c).padStart(2)}`];
    for (const tier of ['naive', 'sensible', 'sharp', 'overbooker']) {
      const r = cell('market', tier, rho, c);
      out.push(`M-${tier.slice(0, 4)} s3=${r.s3.padStart(3)} ge1=${r.ge1.padStart(3)} bk=${r.bank.padStart(3)} ovP=${String(r.overP).padStart(5)} ovAI=${String(r.overAI).padStart(5)}`);
    }
    for (const tier of ['naive', 'sensible', 'sharp']) {
      const r = cell('scheme', tier, rho, c);
      out.push(`S-${tier.slice(0, 4)} s3=${r.s3.padStart(3)} ge1=${r.ge1.padStart(3)} bk=${r.bank.padStart(3)}`);
    }
    console.log(out.join(' | '));
  }
}
