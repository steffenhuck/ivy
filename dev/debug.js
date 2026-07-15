'use strict';
/* Trace one game in detail: per-round totals for all unis + player internals. */
const { Game } = require('./engine.js');
const strategies = require('./strategies.js');

const stratName = process.argv[2] || 'sharp';
const seed = parseInt(process.argv[3] || '1', 10);
const paramsOverride = process.argv[4] ? JSON.parse(process.argv[4]) : null;

const g = new Game({ seed, playerIndex: 3, params: paramsOverride });
const strat = strategies[stratName](g.P);
console.log(`strategy=${stratName} seed=${seed}`);
console.log('rnd | totals: Hark Wexf Mill PLYR | plyr rank E    F     C    inv  | S:app/off/mat fee thr sbar | H:app/off/mat fee thr sbar');
for (;;) {
  const pre = g.startRound();
  const dec = strat.admissions(pre);
  const rep = g.submitAdmissions(dec);
  const totals = g.P.unis.map((_, i) => {
    const u = g.unis[i];
    return (u.RS + u.TS + u.RH + u.TH).toFixed(0).padStart(4);
  });
  if (g.phase === 'bankrupt') {
    console.log(`${String(pre.round).padStart(3)} | BANKRUPT net=${rep.net.toFixed(1)} F=${rep.F.toFixed(0)} C=${rep.C}`);
    break;
  }
  const inv = strat.spend(pre, rep, g.unis[g.playerIndex]);
  const invTot = inv.IRS + inv.ITS + inv.IRH + inv.ITH;
  const rank = pre.table.find(r => r.index === 3).rank;
  const fmt = (d, f, t) => `${d.applied}/${d.offers}/${d.matric} ${f.toFixed(1)} ${t.toFixed(0)} ${d.sbar ? d.sbar.toFixed(0) : '--'}`;
  console.log(
    `${String(pre.round).padStart(3)} | ${totals.join(' ')} | r${rank} E=${g.unis[3].E.toFixed(0).padStart(4)} F=${rep.F.toFixed(0).padStart(3)} C=${String(rep.C).padStart(3)} I=${invTot.toFixed(0).padStart(3)}` +
    ` | S ${fmt(rep.S, dec.feeS, dec.thrS)} | H ${fmt(rep.H, dec.feeH, dec.thrH)}`);
  if (process.env.RIVALS) {
    for (const u of g.unis) {
      if (u.index === 3 || u.broke) continue;
      const d = g._decisions[u.index], r = g._reports[u.index];
      console.log(`      ${u.name.slice(0, 8).padEnd(8)} ${u.personality.padEnd(8)} E=${u.E.toFixed(0).padStart(4)} ` +
        `S: fee=${d.feeS.toFixed(1)} thr=${d.thrS.toFixed(0)} mat=${r.S.matric}  H: fee=${d.feeH.toFixed(1)} thr=${d.thrH.toFixed(0)} mat=${r.H.matric}  T=${(u.TS + u.TH).toFixed(0)} R=${(u.RS + u.RH).toFixed(0)}`);
    }
  }
  const res = g.submitSpend(inv);
  if (res.done) {
    console.log(`final rank=${res.finalRank} score=${res.score}`);
    console.log('final table:', res.finalTable.map(r => `${r.name.slice(0, 8)}:${r.total.toFixed(0)}`).join('  '));
    break;
  }
}
