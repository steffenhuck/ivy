'use strict';
/* ============================================================================
 * THE LEAGUE — headless game engine
 * ----------------------------------------------------------------------------
 * Pure, deterministic (seeded) engine. No DOM, no Date, no Math.random.
 * Used verbatim by both the Node calibration harness and the browser UI.
 *
 * DOCUMENTED MODELLING CHOICES
 * ----------------------------
 * Applicant distribution (drawn jointly, per applicant):
 *   - school score s ~ Normal(sMean, sSd), clamped to [sClampLo, sClampHi].
 *   - budget b = bBase + bSlope*(s - sMean) + Normal(0, bNoise), clamped to
 *     [bMin, bMax]. bSlope > 0 gives the mild positive score/budget
 *     correlation required by the spec (richer students score a bit higher).
 *   - taste weight theta ~ Uniform(thetaMin, thetaMax); student values a
 *     university at T_f + theta * R_f for their preferred field f.
 *   - field preference: STEM with probability pStem (see drift below).
 *
 * Field-preference drift (endogenous, from round 2 onward):
 *   pStem <- clamp(pStem + pStemEta * tanh((avgR_S - avgR_H) / pStemScale),
 *                  pStemMin, pStemMax)
 *   where avgR_S / avgR_H are the mean STEM / HSS research qualities across
 *   all four universities at the start of the round. Gentle (eta small) and
 *   bounded away from 0 and 1 by the clamp.
 *
 * Investment response: g(I) = gamma * sqrt(I)  (concave, diminishing returns).
 *
 * Quality dynamics (per field, applied at end of round):
 *   R' = delta * R + g(I_R)
 *   T' = delta * T + g(I_T) + kappa * (sbarDept - sMean)   [intake term only
 *        if the department admitted >= 1 student this round]
 *   Qualities are floored at 0.
 *
 * Ledger (canonical): E_{t+1} = (E_t + F_t - C_t - I_t) * (1 + r).
 * Bankruptcy: if E_t + F_t - C_t < 0 after market clearing, the university is
 * broke. Player broke => game over immediately. Broke AI (documented choice:
 * the simple option): it stops admitting (makes no offers) and invests
 * nothing; its endowment is frozen where it fell and its qualities keep
 * decaying at delta.
 *
 * Final ranking: the league table computed AFTER round `rounds` quality
 * update (i.e. the table that would open round 21). This means round-20
 * investment still counts, avoiding a degenerate "hoard in the last round"
 * strategy. Score = initial rank - final rank.
 * ========================================================================= */

/* ----------------------------- Seeded RNG ------------------------------- */
function hashStringToInt(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashStringToInt(seed) : (seed >>> 0)) || 1;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/* ----------------------------- Parameters ------------------------------- */
const DEFAULT_PARAMS = {
  rounds: 20,
  nApplicants: 40,
  capacity: 8,          // per department per round, zero marginal cost
  cOver: 24,            // per-head overage penalty above capacity
  interest: 0.05,       // r: interest on funds unspent after investment
  delta: 0.85,          // quality decay factor
  gamma: 1.5,           // g(I) = gamma * sqrt(I)
  kappa: 0.14,          // intake-quality effect on teaching

  // Applicant score distribution
  sMean: 60, sSd: 13, sClampLo: 20, sClampHi: 100,
  // Budgets (mildly correlated with score via bSlope)
  bBase: 10, bSlope: 0.12, bNoise: 2.6, bMin: 3, bMax: 22,
  // Taste for research
  thetaMin: 0, thetaMax: 1.2,
  // STEM preference drift
  pStemStart: 0.5, pStemEta: 0.02, pStemScale: 10, pStemMin: 0.3, pStemMax: 0.7,

  // AI spending discipline (per-round investment budget caps)
  aiPrestigeCap: 32,  // prestige chaser's institutional plan ceiling
  aiCashHi: 16,       // cash cow's upkeep ceiling
  aiCashLo: 11,       // cash cow's upkeep floor (drawn from hoard)

  // Starting universities, ordered by index (initial league rank order).
  // Each has a native AI personality used whenever the player doesn't run it.
  unis: [
    { name: 'Harkness University',    personality: 'balanced', E: 120, RS: 31, TS: 30, RH: 28, TH: 29 },
    { name: 'Wexford Institute',      personality: 'prestige', E: 100, RS: 36, TS: 20, RH: 28, TH: 17 },
    { name: 'Millbrook Metropolitan', personality: 'cashcow',  E: 95,  RS: 18, TS: 24, RH: 16, TH: 25 },
    { name: 'Greyfriars College',     personality: 'cashcow',  E: 85,  RS: 13, TS: 16, RH: 11, TH: 15 },
  ],
};

/* ------------------------- AI opponent heuristics ------------------------
 * All AIs obey the same rules as the player: same capacity, overage cost,
 * decay, investment technology; they see only the public league table, the
 * public cohort statistics, and their own private state/history. They never
 * see the player's current-round choices or the applicant realizations.
 *
 * Personality assignment: the three non-player universities, ordered by
 * initial league position (best first), get: Balanced Incumbent, Prestige
 * Chaser, Cash Cow.
 * ------------------------------------------------------------------------ */

// Maintenance investment that offsets decay for quality Q: g(I) = (1-d)Q.
function maintInvest(Q, P) {
  const need = (1 - P.delta) * Q / P.gamma;
  return need * need;
}

/* The Prestige Chaser: overweights research investment, high fees, high
 * thresholds. Adapts gradually: raises fees when demand is strong, trims
 * fees/thresholds when enrolment collapses. Exploitable: its high prices and
 * standards leave the low end of the market uncontested, and it habitually
 * underfunds teaching, so its student appeal erodes. */
function aiPrestige(P) {
  return {
    init(uni) {
      uni.ai = { fee: { S: 12, H: 12 }, thr: { S: 64, H: 64 } };
    },
    admissions(uni) {
      const a = uni.ai, last = uni.lastReport;
      for (const f of ['S', 'H']) {
        if (last) {
          const d = last[f];
          if (d.matric > P.capacity) { a.fee[f] += 1.0; a.thr[f] += 1; }
          else if (d.matric >= 6) a.fee[f] += 0.5;
          else if (d.matric <= 1) { a.fee[f] -= 1.5; a.thr[f] -= 2; } // starving: correct hard
          else if (d.matric <= 3) { a.fee[f] -= 0.75; a.thr[f] -= 1; }
          else if (d.matric >= 4) a.thr[f] += 0.5; // creeping standards
        }
        a.fee[f] = clamp(a.fee[f], 8, 20);
        a.thr[f] = clamp(a.thr[f], 56, 78);
      }
      return { feeS: a.fee.S, thrS: a.thr.S, feeH: a.fee.H, thrH: a.thr.H };
    },
    // Spends aggressively, tying investment to income flow plus a draw on
    // savings; overweights research, but rescues teaching when its student
    // appeal is visibly collapsing (else it death-spirals).
    spend(uni, net, P2, rep) {
      const investable = Math.max(0, net - 15);
      // Bounded ambition: even flush with cash it won't spend beyond its
      // institutional plan (~48/round) — the headroom a challenger needs.
      const budget = Math.min(investable, 1.2 * rep.F + 0.15 * Math.max(0, uni.E), P2.aiPrestigeCap);
      const teachShare = (uni.TS + uni.TH) < 0.75 * (uni.RS + uni.RH) ? 0.55 : 0.35;
      const tea = budget * teachShare, res = budget - tea;
      return { IRS: res / 2, IRH: res / 2, ITS: tea / 2, ITH: tea / 2 };
    },
  };
}

/* The Cash Cow: low fees, low thresholds, volume strategy, conservative
 * investment. Adapts: raises thresholds/fees when oversubscribed (overage is
 * expensive), lowers fees when halls are empty. Exploitable: chronic
 * underinvestment means its qualities decay, and its low fees can be
 * undercut for the budget segment. */
function aiCashCow(P) {
  return {
    init(uni) {
      uni.ai = { fee: { S: 6.5, H: 6.5 }, thr: { S: 45, H: 45 } };
    },
    admissions(uni) {
      const a = uni.ai, last = uni.lastReport;
      for (const f of ['S', 'H']) {
        if (last) {
          const d = last[f];
          if (d.matric > P.capacity + 2) { a.thr[f] += 2; a.fee[f] += 0.5; }
          else if (d.matric > P.capacity) a.fee[f] += 0.5;
          else if (d.matric < 5) a.fee[f] -= 0.5;
          if (d.matric < 2) a.thr[f] -= 1.5;
        }
        a.fee[f] = clamp(a.fee[f], 5.5, 12);
        a.thr[f] = clamp(a.thr[f], 35, 60);
      }
      return { feeS: a.fee.S, thrS: a.thr.S, feeH: a.fee.H, thrH: a.thr.H };
    },
    // Truly conservative: a modest upkeep budget — 35% of fee income, with
    // a small floor drawn from its hoard when income dips and a hard cap of
    // 34 a round — evenly spread; profits are hoarded. Its qualities
    // therefore plateau in the high 80s — the exploitable seam.
    spend(uni, net, P2, rep) {
      const investable = Math.max(0, net - 15);
      const budget = Math.min(investable, Math.max(0.35 * rep.F, P2.aiCashLo), P2.aiCashHi);
      const each = budget / 4;
      return { IRS: each, ITS: each, IRH: each, ITH: each };
    },
  };
}

/* The Balanced Incumbent: maintains all four qualities against decay, then
 * spreads a share of the surplus; nudges each field's fee in whichever
 * direction improved that field's revenue last round (with safety overrides
 * for over/under-subscription). Exploitable: it defends but rarely grows, so
 * a compounding challenger can walk it down. */
function aiBalanced(P) {
  return {
    init(uni) {
      uni.ai = {
        fee: { S: 11, H: 11 }, thr: { S: 58, H: 58 },
        lastRev: { S: null, H: null }, lastDir: { S: 1, H: 1 },
        // "Roughly maintains all four qualities": steers each quality toward
        // a fixed target a shade above its starting level, rather than
        // compounding its endowment into unbounded growth.
        target: { RS: uni.RS * 1.02, TS: uni.TS * 1.02, RH: uni.RH * 1.02, TH: uni.TH * 1.02 },
      };
    },
    admissions(uni) {
      const a = uni.ai, last = uni.lastReport;
      for (const f of ['S', 'H']) {
        if (last) {
          const d = last[f];
          const rev = d.income - d.overage;
          if (a.lastRev[f] !== null) {
            if (rev < a.lastRev[f]) a.lastDir[f] = -a.lastDir[f];
          }
          a.lastRev[f] = rev;
          a.fee[f] += 0.5 * a.lastDir[f];
          if (d.matric > P.capacity) { a.fee[f] += 0.5; a.thr[f] += 1; }
          else if (d.matric < 3) { a.fee[f] -= 1.0; a.thr[f] -= 1; }
          else if (d.matric >= 6) a.thr[f] += 0.5;
        }
        a.fee[f] = clamp(a.fee[f], 6, 16);
        a.thr[f] = clamp(a.thr[f], 50, 70);
      }
      return { feeS: a.fee.S, thrS: a.thr.S, feeH: a.fee.H, thrH: a.thr.H };
    },
    // Invest exactly enough to steer each quality toward its fixed target
    // (delta*Q + g(I) = target  =>  I = ((target - delta*Q)/gamma)^2),
    // scaled down if funds are short. Surplus endowment simply sits at
    // interest — the complacency a sharp challenger can exploit.
    spend(uni, net, P2) {
      const avail = Math.max(0, net - 20);
      const tgt = uni.ai.target;
      const toward = (Q, T) => {
        const need = (T - P2.delta * Q) / P2.gamma;
        return need > 0 ? need * need : 0;
      };
      const want = {
        IRS: toward(uni.RS, tgt.RS), ITS: toward(uni.TS, tgt.TS),
        IRH: toward(uni.RH, tgt.RH), ITH: toward(uni.TH, tgt.TH),
      };
      const tot = want.IRS + want.ITS + want.IRH + want.ITH;
      if (tot > avail && tot > 0) {
        const k = avail / tot;
        for (const q in want) want[q] *= k;
      }
      return want;
    },
  };
}

const AI_FACTORIES = { balanced: aiBalanced, prestige: aiPrestige, cashcow: aiCashCow };

/* ------------------------------ Game class ------------------------------ */
class Game {
  /**
   * opts: { seed, playerIndex (default 3), params (partial override) }
   */
  constructor(opts = {}) {
    const P = this.P = Object.assign({}, DEFAULT_PARAMS, opts.params || {});
    if (opts.params && opts.params.unis) P.unis = opts.params.unis;
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = makeRng(this.seed);
    this.playerIndex = opts.playerIndex === undefined ? 3 : opts.playerIndex;

    this.unis = P.unis.map((u, i) => ({
      index: i, name: u.name,
      E: u.E, RS: u.RS, TS: u.TS, RH: u.RH, TH: u.TH,
      broke: false, lastReport: null, ai: null, controller: null,
    }));

    // Every university the player doesn't govern runs its native personality.
    for (const uni of this.unis) {
      if (uni.index === this.playerIndex) continue;
      const kind = P.unis[uni.index].personality;
      uni.controller = AI_FACTORIES[kind](P);
      uni.personality = kind;
      uni.controller.init(uni);
    }

    this.round = 0;
    this.pStem = P.pStemStart;
    this.phase = 'pre'; // pre -> admissions -> spend -> (admissions|over|bankrupt)
    this.initialRank = this.rankOf(this.playerIndex);
    this.rankHistory = [this.initialRank]; // rank at start of each round; last entry = final
    this.roundLog = [];
    this.applicants = null;
    this._reports = null;
  }

  /* League table: rank by descending quality sum; ties by endowment (higher
   * first), then by fixed index. Endowments are NOT exposed in the table. */
  leagueTable() {
    const rows = this.unis.map(u => ({
      index: u.index, name: u.name,
      RS: u.RS, TS: u.TS, RH: u.RH, TH: u.TH,
      total: u.RS + u.TS + u.RH + u.TH,
      broke: u.broke,
      _E: u.E,
    }));
    rows.sort((a, b) => (b.total - a.total) || (b._E - a._E) || (a.index - b.index));
    rows.forEach((r, i) => { r.rank = i + 1; delete r._E; });
    return rows;
  }
  rankOf(idx) { return this.leagueTable().find(r => r.index === idx).rank; }

  /* Begin a round: update field-preference drift, draw the fresh cohort,
   * publish the league table and cohort statistics. */
  startRound() {
    if (this.phase !== 'pre' && this.phase !== 'between') throw new Error('bad phase ' + this.phase);
    const P = this.P;
    this.round++;
    if (this.round >= 2) {
      let rs = 0, rh = 0;
      for (const u of this.unis) { rs += u.RS; rh += u.RH; }
      this.pStem = clamp(
        this.pStem + P.pStemEta * Math.tanh((rs / 4 - rh / 4) / P.pStemScale),
        P.pStemMin, P.pStemMax);
    }
    // Draw 40 fresh applicants (students last exactly one round).
    const apps = [];
    for (let i = 0; i < P.nApplicants; i++) {
      const s = clamp(P.sMean + P.sSd * gauss(this.rng), P.sClampLo, P.sClampHi);
      const b = clamp(P.bBase + P.bSlope * (s - P.sMean) + P.bNoise * gauss(this.rng), P.bMin, P.bMax);
      const theta = P.thetaMin + (P.thetaMax - P.thetaMin) * this.rng();
      const f = this.rng() < this.pStem ? 'S' : 'H';
      apps.push({ s, b, theta, f });
    }
    this.applicants = apps;
    const scores = apps.map(a => a.s).sort((x, y) => x - y);
    const n = scores.length;
    const median = n % 2 ? scores[(n - 1) / 2] : (scores[n / 2 - 1] + scores[n / 2]) / 2;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const pctStem = 100 * apps.filter(a => a.f === 'S').length / n;
    this.cohortStats = { median, mean, pctStem };
    const table = this.leagueTable();
    if (this.round > 1) this.rankHistory.push(table.find(r => r.index === this.playerIndex).rank);
    this.phase = 'admissions';
    return { round: this.round, table, cohortStats: this.cohortStats };
  }

  /* Step 1 — Admissions. The player's {feeS, thrS, feeH, thrH} plus each
   * AI's simultaneous choice; then automatic market clearing. */
  submitAdmissions(playerDec) {
    if (this.phase !== 'admissions') throw new Error('bad phase ' + this.phase);
    const P = this.P;
    const decisions = new Array(this.unis.length);
    for (const u of this.unis) {
      if (u.broke) { decisions[u.index] = null; continue; } // broke: stops admitting
      decisions[u.index] = (u.index === this.playerIndex)
        ? {
            feeS: Math.max(0, +playerDec.feeS || 0), thrS: +playerDec.thrS || 0,
            feeH: Math.max(0, +playerDec.feeH || 0), thrH: +playerDec.thrH || 0,
          }
        : u.controller.admissions(u);
    }
    this._decisions = decisions;

    // Market clearing.
    const reports = this.unis.map(() => ({
      S: { applied: 0, offers: 0, matric: 0, income: 0, overage: 0, sSum: 0, sbar: null },
      H: { applied: 0, offers: 0, matric: 0, income: 0, overage: 0, sSum: 0, sbar: null },
    }));
    for (const a of this.applicants) {
      const f = a.f;
      const offers = [];
      for (const u of this.unis) {
        const d = decisions[u.index];
        if (!d) continue;
        const fee = f === 'S' ? d.feeS : d.feeH;
        const thr = f === 'S' ? d.thrS : d.thrH;
        if (fee <= a.b) {
          reports[u.index][f].applied++;
          if (a.s >= thr) { reports[u.index][f].offers++; offers.push(u); }
        }
      }
      if (!offers.length) continue; // exits, no consequence
      let best = [], bestV = -Infinity;
      for (const u of offers) {
        const v = (f === 'S' ? u.TS + a.theta * u.RS : u.TH + a.theta * u.RH);
        if (v > bestV + 1e-12) { bestV = v; best = [u]; }
        else if (Math.abs(v - bestV) <= 1e-12) best.push(u);
      }
      const chosen = best[Math.floor(this.rng() * best.length)];
      const r = reports[chosen.index][f];
      r.matric++;
      r.sSum += a.s;
      r.income += (f === 'S' ? decisions[chosen.index].feeS : decisions[chosen.index].feeH);
    }
    for (const u of this.unis) {
      for (const f of ['S', 'H']) {
        const r = reports[u.index][f];
        r.overage = Math.max(0, r.matric - P.capacity) * P.cOver;
        r.sbar = r.matric > 0 ? r.sSum / r.matric : null;
        delete r.sSum;
      }
      const rep = reports[u.index];
      rep.F = rep.S.income + rep.H.income;
      rep.C = rep.S.overage + rep.H.overage;
      rep.net = u.E + rep.F - rep.C; // funds available for investment
    }
    this._reports = reports;

    // Bankruptcy check (after clearing, before spending).
    for (const u of this.unis) {
      if (!u.broke && reports[u.index].net < 0) {
        u.broke = true;
        // Broke AI: endowment frozen where it fell; stops admitting; invests 0.
        u.E = reports[u.index].net;
        if (u.index === this.playerIndex) {
          this.phase = 'bankrupt';
          this.finalRank = this.rankOf(this.playerIndex);
          this.score = this.initialRank - this.finalRank;
          this.bankrupt = true;
        }
      }
    }
    const playerRep = reports[this.playerIndex];
    if (this.phase !== 'bankrupt') this.phase = 'spend';
    return {
      bankrupt: this.phase === 'bankrupt',
      S: playerRep.S, H: playerRep.H,
      F: playerRep.F, C: playerRep.C, net: playerRep.net,
    };
  }

  /* Step 2 — Spending. Player investments {IRS, ITS, IRH, ITH}; AIs choose
   * theirs from their own report; then the canonical ledger + quality
   * dynamics are applied to everyone. */
  submitSpend(playerInv) {
    if (this.phase !== 'spend') throw new Error('bad phase ' + this.phase);
    const P = this.P;
    for (const u of this.unis) {
      const rep = this._reports[u.index];
      let inv;
      if (u.broke) {
        inv = { IRS: 0, ITS: 0, IRH: 0, ITH: 0 };
      } else if (u.index === this.playerIndex) {
        inv = {
          IRS: Math.max(0, +playerInv.IRS || 0), ITS: Math.max(0, +playerInv.ITS || 0),
          IRH: Math.max(0, +playerInv.IRH || 0), ITH: Math.max(0, +playerInv.ITH || 0),
        };
      } else {
        inv = u.controller.spend(u, rep.net, P, rep);
        for (const k of ['IRS', 'ITS', 'IRH', 'ITH']) inv[k] = Math.max(0, inv[k] || 0);
      }
      // Total investment cannot exceed available funds; scale down if over.
      let tot = inv.IRS + inv.ITS + inv.IRH + inv.ITH;
      const avail = Math.max(0, rep.net);
      if (tot > avail) {
        const k = tot > 0 ? avail / tot : 0;
        for (const q in inv) inv[q] *= k;
        tot = avail;
      }
      // Canonical ledger. Broke unis keep their frozen (negative) endowment.
      if (!u.broke) u.E = (rep.net - tot) * (1 + P.interest);
      // Quality dynamics (investment effects materialize "next round": they
      // enter the state that the next league table is computed from).
      const g = I => P.gamma * Math.sqrt(I);
      u.RS = Math.max(0, P.delta * u.RS + g(inv.IRS));
      u.RH = Math.max(0, P.delta * u.RH + g(inv.IRH));
      let ts = P.delta * u.TS + g(inv.ITS);
      let th = P.delta * u.TH + g(inv.ITH);
      if (rep.S.matric > 0) ts += P.kappa * (rep.S.sbar - P.sMean);
      if (rep.H.matric > 0) th += P.kappa * (rep.H.sbar - P.sMean);
      u.TS = Math.max(0, ts);
      u.TH = Math.max(0, th);
      u.lastReport = rep;
      u._lastInv = inv;
    }
    const pRep = this._reports[this.playerIndex];
    const pInv = this.unis[this.playerIndex]._lastInv;
    const spent = pInv.IRS + pInv.ITS + pInv.IRH + pInv.ITH;
    this.roundLog.push({
      round: this.round, report: pRep, invested: spent,
      E_end: this.unis[this.playerIndex].E,
    });
    if (this.round >= P.rounds) {
      this.phase = 'over';
      const finalTable = this.leagueTable();
      this.finalRank = finalTable.find(r => r.index === this.playerIndex).rank;
      this.rankHistory.push(this.finalRank);
      this.score = this.initialRank - this.finalRank;
      return { done: true, finalTable, finalRank: this.finalRank, score: this.score };
    }
    this.phase = 'between';
    return { done: false };
  }
}

const THE_LEAGUE = { Game, DEFAULT_PARAMS, makeRng, maintInvest, clamp };
if (typeof module !== 'undefined' && module.exports) module.exports = THE_LEAGUE;
if (typeof globalThis !== 'undefined') globalThis.THE_LEAGUE = THE_LEAGUE;
