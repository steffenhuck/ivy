'use strict';
/* ============================================================================
 * Scripted player strategies for the calibration harness.
 * Each factory returns { admissions(pre), spend(pre, rep) } with private
 * state, mirroring how a human player interacts with the Game class.
 * ========================================================================= */
const { maintInvest, clamp } = require('./engine.js');

/* 1. NAIVE: static mid-range fees/thresholds; spreads a fixed share of the
 * available funds evenly across all four qualities. Never adapts. */
function naive() {
  return {
    admissions() {
      return { feeS: 10, thrS: 55, feeH: 10, thrH: 55 };
    },
    spend(pre, rep) {
      const each = Math.max(0, rep.net) * 0.6 / 4;
      return { IRS: each, ITS: each, IRH: each, ITH: each };
    },
  };
}

/* 2. SENSIBLE: basic adaptation of fees to realized demand (raise when full,
 * cut when empty); maintains all four qualities against decay and spreads
 * half the surplus; keeps a cash reserve. */
function sensible(P) {
  const st = { fee: { S: 9, H: 9 }, thr: { S: 55, H: 55 }, last: null };
  return {
    admissions() {
      if (st.last) {
        for (const f of ['S', 'H']) {
          const d = st.last[f];
          if (d.matric > 8) { st.fee[f] += 1; st.thr[f] += 3; }
          else if (d.matric <= 3) { st.fee[f] -= 1; st.thr[f] -= 2; }
          if (d.offers > 12) st.thr[f] += 2;
          if (d.applied === 0) st.fee[f] -= 1;
          st.fee[f] = clamp(st.fee[f], 4.5, 18);
          st.thr[f] = clamp(st.thr[f], 45, 70);
        }
      }
      return { feeS: st.fee.S, thrS: st.thr.S, feeH: st.fee.H, thrH: st.thr.H };
    },
    spend(pre, rep, uni) {
      st.last = rep;
      const book = rep.S.offers + rep.H.offers;
      const avail = Math.max(0, rep.net - 30 - 3 * Math.max(0, book - 14));
      const want = {
        IRS: maintInvest(uni.RS, P), ITS: maintInvest(uni.TS, P),
        IRH: maintInvest(uni.RH, P), ITH: maintInvest(uni.TH, P),
      };
      let tot = want.IRS + want.ITS + want.IRH + want.ITH;
      if (tot > avail && tot > 0) {
        const k = avail / tot;
        for (const q in want) want[q] *= k;
        tot = avail;
      }
      const leftover = (avail - tot) * 0.7;
      for (const q in want) want[q] += leftover / 4;
      return want;
    },
  };
}

/* 3. SHARP: exploits the structure.
 *  - Prices low early to capture the budget segment rivals price out, and
 *    the sub-threshold students rivals reject, building volume income.
 *  - Steers thresholds up whenever volume allows, farming the intake-quality
 *    feedback (kappa) into teaching, which raises appeal, which raises
 *    demand, which lets it raise fees — a compounding loop.
 *  - Invests teaching-first early (teaching enters every student's utility
 *    with weight 1, research only with theta), then rebalances toward
 *    research for league points; spends aggressively and dumps its whole
 *    reserve in the final rounds (the final table counts post-round-20
 *    state, so late investment still scores).
 *  - Targets 7-8 matriculants per department: full capacity, no overage. */
function sharp(P) {
  // The worst-ranked university is a local monopolist over students every
  // rival rejects (sub-threshold scores) or prices out (small budgets).
  // Sharp opens with a LOW threshold (volume from the reject pool) but a
  // mid fee, then hill-climbs each field's fee on realized revenue —
  // learning the captive segment's demand curve. As quality compounds it
  // ratchets thresholds up, converting volume into intake quality (kappa
  // feeds teaching, teaching feeds demand, demand feeds fees).
  const st = {
    fee: { S: 7, H: 7 }, thr: { S: 42, H: 42 }, last: null,
    dir: { S: 1, H: 1 }, lastRev: { S: null, H: null },
  };
  return {
    admissions(pre) {
      // Own league rank (harness plays university index 3).
      const me = pre.table.find(r => r.index === 3);
      const myRank = me.rank;
      // Yield forecast: offers convert in proportion to how many rivals we
      // now match or beat in the table — a quality crossing turns a lazy
      // 30%-yield offer book into a 90% one overnight. Cap the book
      // accordingly BEFORE the surge, not after.
      const beat = pre.table.filter(r => r.index !== 3 && (r.broke || r.total < me.total + 5)).length;
      const yieldFloor = 0.35 + 0.18 * beat;
      if (st.last) {
        for (const f of ['S', 'H']) {
          const d = st.last[f];
          const rev = d.income - d.overage;
          const yf = Math.max(yieldFloor, d.offers > 0 ? d.matric / d.offers : 0);
          const offerCap = Math.round(8 / yf) + 1;
          if (d.offers > offerCap) st.thr[f] += 3;
          if (d.matric > 8) {
            // Overage is expensive: choke demand immediately.
            st.fee[f] += 1.5; st.thr[f] += 3;
          } else if (myRank <= 2) {
            // At the top every offer converts: ration admission. Shrink
            // the offer book toward capacity and charge what the market
            // will bear.
            if (d.offers > 10) st.thr[f] += 3;
            if (d.matric >= 7) st.fee[f] += 1.5;
            else if (d.matric >= 5) st.fee[f] += 0.75;
            else if (d.matric <= 2) { st.fee[f] -= 1; st.thr[f] -= 1; }
          } else {
            // Fee: pure revenue hill-climb. Students choosing among offers
            // ignore fees (only affordability matters), so losing contested
            // students is never a reason to discount — the fee's only job
            // is to price the captive segment optimally.
            if (st.lastRev[f] !== null && rev < st.lastRev[f]) st.dir[f] = -st.dir[f];
            st.fee[f] += 0.75 * st.dir[f];
            // Stuck pricing above the whole captive segment: snap down.
            if (d.matric <= 1 && st.fee[f] > 8) { st.fee[f] -= 1.5; st.dir[f] = -1; }
            // Threshold handles volume vs intake quality; retreat fast
            // when starved (a rival may be undercutting the segment).
            if (d.matric >= 7) st.thr[f] += 2;
            else if (d.matric >= 6) st.thr[f] += 1;
            else if (d.matric <= 1) { st.thr[f] -= 3; st.fee[f] -= 0.5; }
            else if (d.matric <= 2) st.thr[f] -= 2;
            else if (d.matric <= 3) st.thr[f] -= 1;
          }
          st.lastRev[f] = rev;
          st.fee[f] = clamp(st.fee[f], 4, 20);
          st.thr[f] = clamp(st.thr[f], 34, 72);
        }
        // Cross-field exposure: two simultaneous surges are lethal.
        if (st.last.S.offers + st.last.H.offers > 28) { st.thr.S += 2; st.thr.H += 2; }
      }
      return { feeS: st.fee.S, thrS: st.thr.S, feeH: st.fee.H, thrH: st.thr.H };
    },
    spend(pre, rep, uni) {
      st.last = rep;
      const t = pre.round;
      // Hold a cash cushion against an overage surprise, scaled to the
      // size of the current offer book; only the very last spend is
      // all-in (overage for the round is already paid by then, and the
      // final table counts post-round-20 state).
      const book = rep.S.offers + rep.H.offers;
      const reserve = t >= P.rounds ? 0 : Math.min(60, 30 + 3.5 * Math.max(0, book - 15));
      let budget = Math.max(0, rep.net - reserve);
      // Concave g: spreading spend across rounds beats lump-dumping the
      // opening endowment. Cap early rounds; income smooths this later.
      if (t <= 3) budget = Math.min(budget, 40);
      // Mild teaching tilt: T enters every student's utility with weight 1
      // (R only theta-weighted) and carries the kappa intake bonus — but R
      // is still ~60% of attraction and half the league score, so the tilt
      // stays modest.
      const teachShare = 0.58;
      const tea = budget * teachShare, res = budget - tea;
      // Weight investment toward the field that is actually earning —
      // build strength where the market seam is, not symmetrically.
      const revS = rep.S.income - rep.S.overage, revH = rep.H.income - rep.H.overage;
      const wS = (Math.max(0, revS) + 12) / (Math.max(0, revS) + Math.max(0, revH) + 24);
      return { IRS: res * wS, IRH: res * (1 - wS), ITS: tea * wS, ITH: tea * (1 - wS) };
    },
  };
}

module.exports = { naive, sensible, sharp };
