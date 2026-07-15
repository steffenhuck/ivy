'use strict';
/* Parameter sweep: evaluate calibration targets across combinations. */
const { runOne } = require('./harness.js');

const N = 200;

function evalConfig(pov) {
  const out = {};
  for (const name of ['naive', 'sensible', 'sharp']) {
    const rs = [];
    for (let seed = 1; seed <= N; seed++) rs.push(runOne(name, seed, pov));
    const n = rs.length;
    out[name] = {
      s3: 100 * rs.filter(r => r.score === 3).length / n,
      ge1: 100 * rs.filter(r => r.score >= 1).length / n,
      le0: 100 * rs.filter(r => r.score <= 0).length / n,
      bank: 100 * rs.filter(r => r.bankrupt).length / n,
      q: rs.reduce((a, r) => a + r.total, 0) / n,
    };
  }
  return out;
}

const grid = [];
for (const gamma of [1.4, 1.5, 1.6]) {
  for (const bNoise of [2.6, 3.6]) {
    for (const caps of [{ aiPrestigeCap: 32, aiCashHi: 20, aiCashLo: 15 },
                        { aiPrestigeCap: 38, aiCashHi: 24, aiCashLo: 18 }]) {
      grid.push(Object.assign({ gamma, bNoise }, caps));
    }
  }
}

console.log('gamma bNoise pCap cHi | sharp: s3 ge1 bank q | sensible: s3 ge1 bank q | naive: le0 q');
for (const cfg of grid) {
  const r = evalConfig(cfg);
  const f = x => x.toFixed(0).padStart(3);
  console.log(
    `${cfg.gamma}   ${cfg.bNoise}    ${cfg.aiPrestigeCap}   ${cfg.aiCashHi} | ` +
    `${f(r.sharp.s3)} ${f(r.sharp.ge1)} ${f(r.sharp.bank)} ${f(r.sharp.q)} | ` +
    `${f(r.sensible.s3)} ${f(r.sensible.ge1)} ${f(r.sensible.bank)} ${f(r.sensible.q)} | ` +
    `${f(r.naive.le0)} ${f(r.naive.q)}`);
}
