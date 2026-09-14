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
  const st = { fee: { S: 7, H: 7 }, thr: { S: 55, H: 55 }, last: null };
  return {
    admissions() {
      if (st.last) {
        for (const f of ['S', 'H']) {
          const d = st.last[f];
          if (d.matric > 8) { st.fee[f] += 1; st.thr[f] += 3; }
          else if (d.matric <= 3) { st.fee[f] -= 1; st.thr[f] -= 2; }
          if (d.offers > 12) st.thr[f] += 2;
          if (d.applied === 0) st.fee[f] -= 1;
          st.fee[f] = clamp(st.fee[f], 4.5, P.feeCap - 2);
          st.thr[f] = clamp(st.thr[f], 45, 70);
        }
      }
      return { feeS: st.fee.S, thrS: st.thr.S, feeH: st.fee.H, thrH: st.thr.H };
    },
    spend(pre, rep, uni) {
      st.last = rep;
      const book = rep.S.offers + rep.H.offers;
      const avail = Math.max(0, rep.net - 34 - 3 * Math.max(0, book - 14));
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
    fee: { S: 4.5, H: 4.5 }, thr: { S: 38, H: 38 }, last: null,
    dir: { S: 1, H: 1 }, lastRev: { S: null, H: null },
  };
  return {
    // Cards: at a heavy investor's margins bought quality is cheap — accept
    // everything except the consultancy, whose odds fail the arithmetic,
    // gated by liquidity (the overage cushion is not for spending).
    choose(pre) {
      const c = pre.choice;
      if (c.id === 'consult') return false;
      if (pre.round < 4) return c.id === 'donor' || c.id === 'storm' || c.id === 'pilot';
      const cost = (c.accept && c.accept.cost) || 0;
      return pre.E >= cost + 40;
    },
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
          st.fee[f] = clamp(st.fee[f], 4, P.feeCap);
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
      if (t <= 3) budget = Math.min(budget, 65);
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

/* ============================================================================
 * Scheme-world scripted strategies (fixed regulated fee, deferred
 * acceptance, declared quotas with per-seat costs).
 * ========================================================================= */

/* 1. NAIVE (scheme): declares every seat every year at a static mid
 * threshold, spreads investment evenly. From the bottom, thr 55 rejects the
 * leftover students DA would send it, so it pays a full seats bill for a
 * near-empty hall. */
function naiveScheme() {
  return {
    admissions() {
      return { qS: 8, thrS: 45, qH: 8, thrH: 45 };
    },
    // Static bookkeeping: keep a fixed float the size of the seats bill,
    // spread 60% of the rest evenly. (A reserve is not adaptation.)
    spend(pre, rep) {
      const each = Math.max(0, rep.net - 20) * 0.6 / 4;
      return { IRS: each, ITS: each, IRH: each, ITH: each };
    },
  };
}

/* 2. SENSIBLE (scheme): quotas track realized fill (declared seats cost
 * money), thresholds unbend when the hall is empty; maintains qualities. */
function sensibleScheme(P) {
  const st = { q: { S: 4, H: 4 }, thr: { S: 45, H: 45 }, last: null };
  return {
    admissions() {
      if (st.last) {
        for (const f of ['S', 'H']) {
          const d = st.last[f];
          st.q[f] = d.matric < d.offers - 1
            ? clamp(d.matric + 1, 2, P.capacity)                       // empty seats: shrink to fill
            : (d.applied > 2 * d.offers
                ? clamp(st.q[f] + 1, 2, P.capacity) : st.q[f]);        // expand only under real demand
          if (d.matric <= 1) st.thr[f] -= 3;
          else if (d.matric <= st.q[f] - 2) st.thr[f] -= 1;
          else if (d.matric === d.offers) st.thr[f] += 1;
          // A sensible house keeps SOME standards; the open-door dive to
          // the floor of the score distribution is the sharp move, not
          // the default one.
          st.thr[f] = clamp(st.thr[f], 36, 70);
        }
      }
      return { qS: st.q.S, thrS: st.thr.S, qH: st.q.H, thrH: st.thr.H };
    },
    spend(pre, rep, uni) {
      st.last = rep;
      // Rent-aware float: the seats bill arrives every year regardless.
      const avail = Math.max(0, rep.net - 30);
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
      const leftover = (avail - tot) * 0.35;
      for (const q in want) want[q] += leftover / 4;
      return want;
    },
  };
}

/* 3. SHARP (scheme), second edition. The first edition's Sonmez selectivity
 * phase (small quotas, high calibre) is no longer best play: with rivals
 * spending like rationals and the Reckoning crediting their hoards, the
 * fee income a small quota forgoes is worth more than the calibre it buys.
 * The second edition's sharp is VOLUME-FIRST:
 *  - The quota is a free report: declare all 8 seats, always. Income is
 *    the war chest; DA's rejection cascade keeps the hall full from the
 *    bottom of the table.
 *  - The THRESHOLD is the selectivity instrument: whenever the hall fills,
 *    ratchet the bar and let DA deliver the same volume at higher calibre
 *    (kappa feeds teaching, teaching feeds demand); unbend fast when the
 *    hall empties.
 *  - Scholarships in the overtaking fight: once within striking distance
 *    of the summit, standing merit pots steer the bright marginal student
 *    — the only price competition the Scheme permits.
 *  - Choice cards: accept everything except the consultancy (at a heavy
 *    investor's margins, bought quality is cheap; the consultancy's odds
 *    are the one price that fails the arithmetic).
 *  - Spend everything by the end; the Reckoning is for rivals' hoards. */
function sharpScheme(P) {
  const st = { thr: { S: 34, H: 34 }, last: null };
  return {
    // Cards by phase and liquidity: early on, cash is for compounding —
    // take only money and insurance (donor, pilot, storm). From mid-game,
    // buy everything the arithmetic supports; never the consultancy, and
    // never a purchase that would gut the investment budget.
    choose(pre) {
      const c = pre.choice;
      if (c.id === 'consult') return false;
      if (pre.round < 5) return c.id === 'donor' || c.id === 'storm' || c.id === 'pilot';
      const cost = (c.accept && c.accept.cost) || 0;
      return pre.E >= cost + 25;
    },
    admissions(pre) {
      const me = pre.table.find(r => r.index === 3);
      const gapUp = pre.table.filter(r => r.index !== 3 && !r.broke && r.total > me.total)
        .reduce((a, r) => Math.min(a, r.total - me.total), Infinity);
      if (st.last) {
        for (const f of ['S', 'H']) {
          const d = st.last[f];
          if (d.matric >= P.capacity) st.thr[f] += 2;      // full: harvest calibre
          else if (d.matric >= P.capacity - 1) st.thr[f] += 1;
          else if (d.matric <= 2) st.thr[f] -= 4;          // empty: unbend fast
          else if (d.matric <= P.capacity - 3) st.thr[f] -= 2;
          st.thr[f] = clamp(st.thr[f], 30, 72);
        }
      }
      // Merit pots ONLY in a genuine summit fight: second place, the
      // leader within bonus-reach, and cash to spare. From further down a
      // stipend flatters nobody — the bright student's next-best option
      // is simply better than you, pot or no pot.
      const fighting = me.rank === 2 && gapUp < 18 && pre.E > 40;
      const pot = fighting ? Math.min(8, P.schMax) : 0;
      return {
        qS: P.capacity, thrS: st.thr.S, qH: P.capacity, thrH: st.thr.H,
        schS: pot, schH: pot,
      };
    },
    spend(pre, rep, uni) {
      st.last = rep;
      const t = pre.round;
      // Guaranteed income, self-inflicted bills: reserves stay thin — just
      // enough to keep next year's rent and pots payable.
      const reserve = t >= P.rounds ? 0 : 12;
      let budget = Math.max(0, rep.net - reserve);
      if (t <= 3) budget = Math.min(budget, 65);
      const teachShare = 0.58;
      const tea = budget * teachShare, res = budget - tea;
      const revS = rep.S.income - rep.S.overage, revH = rep.H.income - rep.H.overage;
      const wS = (Math.max(0, revS) + 12) / (Math.max(0, revS) + Math.max(0, revH) + 24);
      return { IRS: res * wS, IRH: res * (1 - wS), ITS: tea * wS, ITH: tea * (1 - wS) };
    },
  };
}

/* PROBE (both worlds): RUSTAM — the strategy our first reviewer found.
 * "Spend the full budget equally across the four areas." Admissions are
 * competent but unremarkable (a sensible-style tracker); ALL available
 * funds beyond a thin float go into quality, split four ways, every year.
 * In the Scheme as shipped this reaches the top by ~year five and coasts:
 * the calibration target for the second edition is that it no longer does. */
function rustam(P) {
  const st = { fee: { S: 7, H: 7 }, thr: { S: 50, H: 50 }, last: null };
  return {
    admissions() {
      if (st.last) {
        for (const f of ['S', 'H']) {
          const d = st.last[f];
          if (d.matric > 8) { st.fee[f] += 1; st.thr[f] += 3; }
          else if (d.matric <= 3) { st.fee[f] -= 1; st.thr[f] -= 2; }
          if (d.offers > 12) st.thr[f] += 2;
          st.fee[f] = clamp(st.fee[f], 4.5, P.feeCap - 2);
          st.thr[f] = clamp(st.thr[f], 40, 70);
        }
      }
      return { feeS: st.fee.S, thrS: st.thr.S, feeH: st.fee.H, thrH: st.thr.H };
    },
    spend(pre, rep) {
      st.last = rep;
      // Full budget, equal split; only a thin float against the seats bill.
      const each = Math.max(0, rep.net - 18) / 4;
      return { IRS: each, ITS: each, IRH: each, ITH: each };
    },
  };
}
function rustamScheme(P) {
  const st = { thr: { S: 42, H: 42 }, last: null };
  return {
    admissions() {
      if (st.last) {
        for (const f of ['S', 'H']) {
          const d = st.last[f];
          if (d.matric <= 2) st.thr[f] -= 3;
          else if (d.matric === d.offers) st.thr[f] += 1;
          st.thr[f] = clamp(st.thr[f], 34, 66);
        }
      }
      // The quota is a free report: declare everything, always.
      return { qS: P.capacity, thrS: st.thr.S, qH: P.capacity, thrH: st.thr.H };
    },
    spend(pre, rep) {
      st.last = rep;
      // No oversubscription risk, so no reserve beyond next year's rent.
      const each = Math.max(0, rep.net - 14) / 4;
      return { IRS: each, ITS: each, IRH: each, ITH: each };
    },
  };
}

/* PROBE (both worlds): the SCHOLAR — tests whether the merit scholarship
 * pot can simply buy the league. Sensible-style admissions, but a heavy
 * standing pot in both fields every year plus high thresholds to harvest
 * the calibre it attracts (kappa feeds teaching). If scholarships are
 * calibrated right this improves on sensible without beating sharp. */
function scholar(P) {
  const base = sensible(P);
  return {
    admissions() {
      const d = base.admissions();
      d.thrS = Math.max(d.thrS, 60); d.thrH = Math.max(d.thrH, 60);
      d.schS = 12; d.schH = 12;
      return d;
    },
    spend: (pre, rep, uni) => base.spend(pre, rep, uni),
  };
}
function scholarScheme(P) {
  const base = sensibleScheme(P);
  return {
    admissions() {
      const d = base.admissions();
      d.thrS = Math.max(d.thrS, 60); d.thrH = Math.max(d.thrH, 60);
      d.schS = 12; d.schH = 12;
      return d;
    },
    spend: (pre, rep, uni) => base.spend(pre, rep, uni),
  };
}

/* PROBE (both worlds): the GAMBLER — accepts every choice card the paper
 * prints, on an otherwise sensible game. If accept-everything reliably
 * beats decline-everything (plain sensible), the cards are underpriced. */
function gambler(P) {
  const base = sensible(P);
  return {
    admissions: () => base.admissions(),
    spend: (pre, rep, uni) => base.spend(pre, rep, uni),
    choose: () => true,
  };
}
function gamblerScheme(P) {
  const base = sensibleScheme(P);
  return {
    admissions: () => base.admissions(),
    spend: (pre, rep, uni) => base.spend(pre, rep, uni),
    choose: () => true,
  };
}

/* PROBE (market, unified-cost experiments): the OVERBOOKER tries to make
 * overflow a business model. It prices just above the overage cost c (so
 * every student beyond capacity is nominally profitable), drops its bar,
 * never rations, and spends aggressively. If Steffen's conjecture holds --
 * demand thins out above the budget distribution and maintenance eats the
 * margin -- this strategy should fail even where fee > c is feasible. */
function overbooker(P) {
  const st = { last: null };
  return {
    admissions() {
      const fee = clamp(P.cOver + 3, 4, P.feeCap);
      return { feeS: fee, thrS: 35, feeH: fee, thrH: 35 };
    },
    spend(pre, rep, uni) {
      st.last = rep;
      const avail = Math.max(0, rep.net - 20);
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

module.exports = {
  naive, sensible, sharp,
  naiveScheme, sensibleScheme, sharpScheme,
  rustam, rustamScheme,
  scholar, scholarScheme,
  gambler, gamblerScheme,
  overbooker,
};
