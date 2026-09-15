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
 *     [bMin, bMax] (bMax = feeCap: nothing but demand polices high fees).
 *     bSlope > 0 gives the mild positive score/budget
 *     correlation required by the spec (richer students score a bit higher).
 *   - taste weight theta ~ Uniform(thetaMin, thetaMax); student values a
 *     university at T_f + theta * R_f for their preferred field f.
 *   - field preference: stratified, not Bernoulli — exactly
 *     Math.round(pStem * nApplicants) applicants prefer STEM each round,
 *     the rest HSS. Scores, budgets and theta stay iid; only the field
 *     composition is deterministic given pStem (see drift below).
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
 * Random events (from round 1): each university, in index order, draws an
 * occurrence and a selection number at the very top of every round from a
 * SEPARATE seeded stream (rngE = makeRng(seed + '/events')) — events never
 * consume the main rng, so the applicant stream is unaffected by them.
 * With probability 1/3 an event from the weighted EVENTS table applies
 * immediately, before the round's league table is computed (the table
 * reflects the morning's news). Money losses never push E below 5: the
 * loss is truncated to max(0, E - 5) and the record flagged truncated.
 * Quality effects are floored at 0. Broke universities draw and discard
 * both numbers (stream stability), and receive no events.
 *
 * TWO WORLDS (params.world):
 *   'market' (default) — the original economy: per-field fees and
 *     thresholds, applicants apply where affordable, every acceptance must
 *     be honoured, intake above capacity pays the overage penalty.
 *   'scheme' — the National Admissions Scheme: fees are fixed by the
 *     regulator (schemeFee, one flat rate for everything), budgets are
 *     irrelevant (the Scheme is means-blind), and matriculation is decided
 *     by student-proposing deferred acceptance (Gale-Shapley), run
 *     independently per field. Each university declares a quota per
 *     department (0..capacity seats) and a threshold below which
 *     applicants are unacceptable; department preferences are by school
 *     score. DA never over-fills a quota. The quota is a PURE REPORT to
 *     the clearing house: it carries no cost of its own (capacity
 *     manipulation a la Sonmez, undiluted). In scheme reports, 'applied'
 *     counts distinct students who proposed to the department at any point
 *     of the match, 'offers' echoes the declared quota, and 'cutoff' is
 *     the lowest admitted score (null if none). Student preference ties
 *     are broken by tiny rng perturbations; the scheme consumes the main
 *     rng differently from the market, so the two worlds are separate
 *     reproducibility universes (same seed + same world => same game).
 *
 * UNIFIED COST FUNCTION (identical in both worlds): each department's
 * admissions cost is  C_dept = capacity * seatRent + cOver * max(0, m - capacity),
 * where m is enrolment — rent on all 8 capacity seats, filled or not,
 * plus a steep per-head price above capacity. Deferred acceptance never
 * over-fills, so the second term is reachable only in the market. Fees may
 * exceed cOver (feeCap > cOver): overflow-for-profit is priced but, as the
 * calibration shows, demand thins out far below the fee cap and quality
 * maintenance eats the margin — the temptation exists, the customers do not.
 *
 * Ledger (canonical): E_{t+1} = (E_t + F_t - C_t - I_t) * (1 + r).
 * Bankruptcy: if E_t + F_t - C_t < 0 after market clearing, the university is
 * broke. Player broke => game over immediately. Broke AI (documented choice:
 * the simple option): it stops admitting (makes no offers) and invests
 * nothing; its endowment is frozen where it fell and its qualities keep
 * decaying at delta.
 *
 * Final ranking — the FOUNDERS' RECKONING: the league table computed AFTER
 * round `rounds` quality update (so round-20 investment still counts), with
 * one addition announced in the rules from year one: each university's
 * remaining endowment converts into league-table quality at the steep rate
 * of 1 point per reckonPerPoint (default 15) — max(0, E) / reckonPerPoint,
 * identical in both worlds. Money is never worthless, hoards finally count,
 * and spend-now-versus-save is a real choice (at the margin, investment
 * dominates until I ~ (gamma * reckonPerPoint / 2)^2 per field). Rows carry
 * total (quality), reckon (the conversion) and grand (their sum); ranking is
 * by grand. Score = initial rank - final rank. A player bankruptcy ends the
 * game where it fell, on the plain table — the Reckoning is for survivors.
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
  world: 'market',      // 'market' | 'scheme' (see header comment)
  rounds: 20,
  nApplicants: 40,
  capacity: 8,          // per department per round, zero marginal cost
  cOver: 24,            // per-head cost of enrolment above capacity (market only)
  schemeFee: 5.5,       // regulated flat fee, all fields (scheme)
  seatRent: 0.75,       // annual cost per capacity seat, filled or not, BOTH worlds
  feeCap: 25,           // maximum chargeable fee (also strategies' clamp ceiling)
  interest: 0.05,       // r: interest on funds unspent after investment
  delta: 0.87,          // quality decay factor
  gamma: 1.5,           // g(I) = gamma * sqrt(I)
  kappa: 0.14,          // intake-quality effect on teaching

  // Applicant score distribution
  sMean: 60, sSd: 13, sClampLo: 20, sClampHi: 100,
  // Budgets (mildly correlated with score via bSlope)
  bBase: 10, bSlope: 0.12, bNoise: 3.8, bMin: 3, bMax: 25,
  // Taste for research
  thetaMin: 0, thetaMax: 1.2,
  // STEM preference drift
  pStemStart: 0.5, pStemEta: 0.02, pStemScale: 10, pStemMin: 0.3, pStemMax: 0.7,

  // AI spending discipline (per-round investment budget caps)
  aiPrestigeCap: 32,  // prestige chaser's institutional plan ceiling
  aiBalancedCap: 46,  // balanced incumbent's total plan ceiling (even in defense)
  aiCashHi: 11,       // cash cow's upkeep ceiling
  aiCashLo: 8,        // cash cow's upkeep floor (drawn from hoard)
  // Scheme rationality: with fee income guaranteed by the clearing house,
  // precautionary cash floats are pointless — scheme-world AIs keep only
  // this thin float instead of their market-bred reserves (15-20), and
  // their institutional spending caps loosen by the same logic (a plan
  // ceiling calibrated against market risk is too timid where revenue
  // cannot surprise you).
  aiSchemeFloat: 8,
  aiSchemeCapMult: 1.35,

  // Choice cards (player-only): per-round offer probability and the first
  // round the paper prints one (year one is confusing enough).
  choiceProb: 0.3,
  choiceFromRound: 2,

  // Merit scholarships (both worlds), third edition of the instrument:
  // PER-HEAD stipends. For each field the administrator sets a stipend
  // sch (per student, per year, capped at schMax) and a qualifying bar
  // bar (school score, clamped to [schBarLo, schBarHi]). Every enrolling
  // student at or above the bar is paid the stipend; the bill is
  // sch * (qualifying matriculants), known only AFTER clearing — promise
  // generously at a low bar and the match takes you at your word (a
  // scholarship bill can bankrupt). The stipend's channel differs by
  // world, on principle: cash nets against a price where a price exists —
  // in the market it counts toward the fee (a student with s >= bar can
  // afford the college if fee - sch <= b; choice among offers stays
  // quality-only, exactly as fees themselves never sway choice) — and
  // where no price exists it is a side payment: in the scheme a
  // qualifying student values the college schAlpha * sch utility points
  // higher in her preference list. AI colleges run stipends of zero.
  schAlpha: 1.0,
  schMax: 20,
  schBarLo: 40,
  schBarHi: 95,
  schBarDefault: 70,

  // Founders' Reckoning: endowment per league point at the final table,
  // and the most points the credit can be worth (the auditors regard cash
  // beyond that as evidence of a want of imagination). The cap is what
  // keeps the incumbents' thousand-k hoards from drowning the quality race.
  reckonPerPoint: 15,
  reckonCapPoints: 8,

  // Starting universities, ordered by index (initial league rank order).
  // Each has a native AI personality used whenever the player doesn't run it.
  unis: [
    { name: 'Harkness University',    personality: 'balanced', E: 120, ES: 120, RS: 31, TS: 30, RH: 28, TH: 29 },
    { name: 'Wexford Institute',      personality: 'prestige', E: 100, ES: 100, RS: 36, TS: 20, RH: 28, TH: 17 },
    { name: 'Millbrook Metropolitan', personality: 'cashcow',  E: 130, ES: 95,  RS: 18, TS: 24, RH: 16, TH: 25 },
    { name: 'Greyfriars College',     personality: 'cashcow',  E: 145, ES: 105, RS: 13, TS: 16, RH: 11, TH: 15 },
  ],
};

/* ------------------------------ Events ----------------------------------
 * Mechanics only — all narrative text lives in the UI layer, keyed by id.
 * kind 'money': deltaE applied to the endowment (losses truncated at E=5).
 * kind 'quality': effects map applied to the named qualities (floor 0). */
const EVENTS = [
  // money, positive
  { id: 'crane',        kind: 'money', deltaE: +28, weight: 1 },
  { id: 'alumnus',      kind: 'money', deltaE: +18, weight: 2 },
  { id: 'anon',         kind: 'money', deltaE: +32, weight: 1 },
  { id: 'stair',        kind: 'money', deltaE: +22, weight: 2 },
  { id: 'meadow',       kind: 'money', deltaE: +25, weight: 1 },
  { id: 'conference',   kind: 'money', deltaE: +12, weight: 3 },
  { id: 'patent',       kind: 'money', deltaE: +30, weight: 1 },
  // money, negative
  { id: 'roof',         kind: 'money', deltaE: -22, weight: 2 },
  { id: 'lawsuit',      kind: 'money', deltaE: -18, weight: 2 },
  { id: 'boiler',       kind: 'money', deltaE: -12, weight: 3 },
  { id: 'audit',        kind: 'money', deltaE: -15, weight: 2 },
  { id: 'asbestos',     kind: 'money', deltaE: -26, weight: 1 },
  { id: 'clawback',     kind: 'money', deltaE: -20, weight: 1 },
  { id: 'flood',        kind: 'money', deltaE: -16, weight: 2 },
  { id: 'portrait',     kind: 'money', deltaE: -8,  weight: 2 },
  // quality, positive
  { id: 'chair',        kind: 'quality', effects: { RS: +3 }, weight: 2 },
  { id: 'viral',        kind: 'quality', effects: { TH: +2 }, weight: 2 },
  { id: 'prize',        kind: 'quality', effects: { RH: +3 }, weight: 2 },
  { id: 'demonstrators',kind: 'quality', effects: { TS: +2 }, weight: 2 },
  { id: 'trunk',        kind: 'quality', effects: { RH: +2 }, weight: 2 },
  { id: 'vindicated',   kind: 'quality', effects: { RS: +4 }, weight: 1 },
  { id: 'award',        kind: 'quality', effects: { TS: +2 }, weight: 2 },
  // quality, negative
  { id: 'poached',      kind: 'quality', effects: { RS: -3 }, weight: 2 },
  { id: 'remarks',      kind: 'quality', effects: { TH: -2 }, weight: 2 },
  { id: 'memoirs',      kind: 'quality', effects: { RH: -3 }, weight: 2 },
  { id: 'retraction',   kind: 'quality', effects: { RS: -2 }, weight: 2 },
  { id: 'exodus',       kind: 'quality', effects: { TS: -3 }, weight: 2 },
  { id: 'timetable',    kind: 'quality', effects: { TH: -2 }, weight: 2 },
  { id: 'strike',       kind: 'quality', effects: { TS: -2, TH: -2 }, weight: 1 },
  { id: 'inspectorate', kind: 'quality', effects: { TH: -2 }, weight: 2 },
];
const EVENTS_TOTAL_WEIGHT = EVENTS.reduce((a, e) => a + e.weight, 0);
function pickEvent(r) {
  let x = r * EVENTS_TOTAL_WEIGHT;
  for (const e of EVENTS) { x -= e.weight; if (x < 0) return e; }
  return EVENTS[EVENTS.length - 1];
}

/* --------------------------- Choice cards --------------------------------
 * A second class of event, PLAYER-ONLY: the paper prints a situation and
 * the player must decide before the year proceeds. Mechanics only —
 * narrative lives in the UI, keyed by id. Drawn on the same separate
 * events stream (three draws per round, consumed unconditionally, so the
 * shock stream and cohort stream are untouched by whatever the player
 * decides). Each card is offered at most once per game.
 *
 * Branch normal form: accept / decline each carry
 *   { cost, p, onSuccess: {deltaE, self, target}, onFail: {...} }
 * cost is paid whenever the branch is taken; with probability p the
 * onSuccess effects apply, else onFail (p omitted = 1). decline omitted
 * means "nothing happens" — and decline is also the automatic resolution
 * when nobody answers the paper (an unattended college buys no insurance).
 * targetBy names the quality by which the victim rival is picked (the
 * non-broke leader in that field). minE gates the OFFER: a card whose
 * price the player plainly cannot pay is never printed.
 *
 * PRICING DISCIPLINE: money buys quality at g(I) = gamma*sqrt(I) through
 * the ordinary investment channel, so a quality-for-money card is only
 * ever interesting if its yield beats ~1.5*sqrt(cost) (poaches add the
 * zero-sum premium: the victim's loss is worth a rank at the margin).
 * One card (consult) is deliberately priced below the technology — the
 * reader who checks the arithmetic keeps their money. */
const CHOICE_CARDS = [
  { id: 'poach_rs', weight: 2, targetBy: 'RS', minE: 25,
    accept: { cost: 15, p: 0.55, onSuccess: { self: { RS: +4 }, target: { RS: -4 } }, onFail: { deltaE: +7 } } },
  { id: 'poach_rh', weight: 2, targetBy: 'RH', minE: 25,
    accept: { cost: 15, p: 0.55, onSuccess: { self: { RH: +4 }, target: { RH: -4 } }, onFail: { deltaE: +7 } } },
  { id: 'poach_ts', weight: 2, targetBy: 'TS', minE: 20,
    accept: { cost: 10, p: 0.6, onSuccess: { self: { TS: +3 }, target: { TS: -3 } }, onFail: { deltaE: +5 } } },
  { id: 'donor',    weight: 2, minE: 0,
    accept: { onSuccess: { deltaE: +24, self: { TH: -3 } } } },
  { id: 'scandal',  weight: 2, minE: 22,
    accept: { cost: 12, onSuccess: {} },
    decline: { p: 0.5, onSuccess: {}, onFail: { self: { TH: -3, RH: -2 } } } },
  { id: 'pilot',    weight: 2, minE: 18,
    accept: { cost: 8, p: 0.65, onSuccess: { deltaE: +20, self: { TS: +1 } }, onFail: {} } },
  { id: 'congress', weight: 1, minE: 24,
    accept: { cost: 14, onSuccess: { self: { RS: +4, RH: +4 } } } },
  { id: 'consult',  weight: 2, minE: 20,
    accept: { cost: 10, p: 0.35, onSuccess: { self: { RS: +1, TS: +1, RH: +1, TH: +1 } }, onFail: {} } },
  { id: 'storm',    weight: 2, minE: 16,
    accept: { cost: 6, onSuccess: {} },
    decline: { p: 0.6, onSuccess: {}, onFail: { deltaE: -18 } } },
  { id: 'stipend',  weight: 2, minE: 18,
    accept: { cost: 8, onSuccess: { self: { TS: +4, RS: +1 } } } },
  { id: 'merger',   weight: 1, minE: 30,
    accept: { cost: 20, p: 0.6, onSuccess: { self: { TH: +7, RH: +5 } }, onFail: { deltaE: +10 } } },
  { id: 'archive',  weight: 1, minE: 22,
    accept: { cost: 12, onSuccess: { self: { RH: +6 } } } },
];

/* -------------------- Scheme world: deferred acceptance -------------------
 * Student-proposing DA for one field. Students rank the four departments by
 * T_f + theta * R_f, plus schAlpha * stipend for departments whose merit
 * bar they meet (ties broken by tiny rng perturbation); departments
 * rank acceptable students (s >= threshold) by school score and hold at
 * most their declared quota. Terminates in <= 4 proposals per student and
 * yields the student-optimal stable matching. */
function runDA(field, students, decisions, unis, rng, P) {
  const n = unis.length;
  const proposers = students.map(a => {
    const order = unis
      .map(u => {
        const d = decisions[u.index];
        const sch = d ? (field === 'S' ? d.schS : d.schH) : 0;
        const bar = d ? (field === 'S' ? d.barS : d.barH) : Infinity;
        const merit = (P && sch > 0 && a.s >= bar) ? P.schAlpha * sch : 0;
        return { i: u.index, v: (field === 'S' ? u.TS + a.theta * u.RS : u.TH + a.theta * u.RH) + merit + rng() * 1e-9 };
      })
      .sort((x, y) => y.v - x.v)
      .map(x => x.i);
    return { a, order, next: 0 };
  });
  const held = Array.from({ length: n }, () => []);
  const proposedTo = Array.from({ length: n }, () => new Set());
  const queue = proposers.slice();
  while (queue.length) {
    const p = queue.shift();
    if (p.next >= p.order.length) continue; // exhausted: unmatched, exits
    const idx = p.order[p.next++];
    proposedTo[idx].add(p);
    const d = decisions[idx];
    const q = d ? (field === 'S' ? d.qS : d.qH) : 0;
    const thr = d ? (field === 'S' ? d.thrS : d.thrH) : Infinity;
    if (!d || q <= 0 || p.a.s < thr) { queue.push(p); continue; } // rejected outright
    held[idx].push(p);
    if (held[idx].length > q) {
      held[idx].sort((x, y) => y.a.s - x.a.s);
      queue.push(held[idx].pop()); // displace the weakest held student
    }
  }
  return { held, proposedTo };
}

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
      uni.ai = P.world === 'scheme'
        ? { q: { S: 5, H: 5 }, thr: { S: 66, H: 66 } }
        : { fee: { S: 12, H: 12 }, thr: { S: 64, H: 64 } };
    },
    // Scheme persona: small, selective, slow to unbend. Trims its standards
    // only when the hall is nearly empty; never grows beyond 6 seats.
    schemeAdmissions(uni) {
      const a = uni.ai, last = uni.lastReport;
      for (const f of ['S', 'H']) {
        if (last) {
          const d = last[f];
          if (d.matric <= 1) { a.thr[f] -= 2; if (d.matric === 0) a.q[f] -= 1; }
          else if (d.matric === a.q[f]) { a.thr[f] += 1; if (d.applied > 2 * a.q[f]) a.q[f] += 1; }
          a.q[f] = clamp(a.q[f], 3, 6);
          a.thr[f] = clamp(a.thr[f], 56, 78);
        }
      }
      return { qS: a.q.S, thrS: a.thr.S, qH: a.q.H, thrH: a.thr.H };
    },
    admissions(uni) {
      if (P.world === 'scheme') return this.schemeAdmissions(uni);
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
    // Scheme only: prestige wounded in the published table opens the
    // war chest — quality is the only competition the Scheme permits.
    spend(uni, net, P2, rep) {
      const investable = Math.max(0, net - (P2.world === 'scheme' ? P2.aiSchemeFloat : 15));
      const wounded = P2.world === 'scheme' && (uni.rank >= 3 || uni.gapBelow < 5);
      const drawE = wounded ? 0.3 : 0.15;
      let cap = wounded ? P2.aiPrestigeCap + 18 : P2.aiPrestigeCap;
      if (P2.world === 'scheme') cap *= P2.aiSchemeCapMult;
      // Bounded ambition: even flush with cash it won't spend beyond its
      // institutional plan (~48/round) — the headroom a challenger needs.
      const budget = Math.min(investable, 1.2 * rep.F + drawE * Math.max(0, uni.E), cap);
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
      uni.ai = P.world === 'scheme'
        ? { q: { S: P.capacity, H: P.capacity }, thr: { S: 35, H: 35 } }
        : { fee: { S: 6.5, H: 6.5 }, thr: { S: 45, H: 45 } };
    },
    // Scheme persona: every seat declared, every year, standards nominal.
    // Volume is the business model; the seats bill is the cost of doing it.
    schemeAdmissions(uni) {
      const a = uni.ai, last = uni.lastReport;
      for (const f of ['S', 'H']) {
        if (last) {
          const d = last[f];
          if (d.matric < 6) a.thr[f] -= 2;
          else if (d.matric === a.q[f]) a.thr[f] += 1;
          a.thr[f] = clamp(a.thr[f], 30, 50);
        }
        a.q[f] = P.capacity;
      }
      return { qS: a.q.S, thrS: a.thr.S, qH: a.q.H, thrH: a.thr.H };
    },
    admissions(uni) {
      if (P.world === 'scheme') return this.schemeAdmissions(uni);
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
    // Scheme only: with no price lever to defend its volume, a Cash Cow
    // that has been overtaken in the table fights back from the hoard.
    spend(uni, net, P2, rep) {
      const investable = Math.max(0, net - (P2.world === 'scheme' ? P2.aiSchemeFloat : 15));
      const fight = P2.world === 'scheme' && (uni.rank >= 4 || uni.gapBelow < 4);
      let lo = fight ? P2.aiCashLo + 18 : P2.aiCashLo;
      let hi = fight ? P2.aiCashHi + 24 : P2.aiCashHi;
      if (P2.world === 'scheme') { lo *= P2.aiSchemeCapMult; hi *= P2.aiSchemeCapMult; }
      const budget = Math.min(investable, Math.max(0.35 * rep.F, lo), hi);
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
        q: { S: 7, H: 7 },
        lastRev: { S: null, H: null }, lastDir: { S: 1, H: 1 },
        // "Roughly maintains all four qualities": steers each quality toward
        // a fixed target a shade above its starting level, rather than
        // compounding its endowment into unbounded growth. In the scheme,
        // with no price competition to manage, the incumbent runs a
        // slightly more ambitious plan.
        target: (m => ({ RS: uni.RS * m, TS: uni.TS * m, RH: uni.RH * m, TH: uni.TH * m }))(P.world === 'scheme' ? 1.06 : 1.02),
      };
    },
    // Scheme persona: prudent house-keeping — quotas track realized demand
    // (empty seats are money), standards drift with fill.
    schemeAdmissions(uni) {
      const a = uni.ai, last = uni.lastReport;
      for (const f of ['S', 'H']) {
        if (last) {
          const d = last[f];
          if (d.matric <= a.q[f] - 3) { a.q[f] -= 1; a.thr[f] -= 1; }
          else if (d.matric <= a.q[f] - 2) a.thr[f] -= 1;
          else if (d.matric === a.q[f]) {
            a.thr[f] += 0.5;
            if (d.applied > 2 * a.q[f]) a.q[f] += 1;
          }
          a.q[f] = clamp(a.q[f], 4, P.capacity);
          a.thr[f] = clamp(a.thr[f], 50, 70);
        }
      }
      return { qS: a.q.S, thrS: a.thr.S, qH: a.q.H, thrH: a.thr.H };
    },
    admissions(uni) {
      if (P.world === 'scheme') return this.schemeAdmissions(uni);
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
      const avail = Math.max(0, net - (P2.world === 'scheme' ? P2.aiSchemeFloat : 20));
      let tgt = uni.ai.target;
      // Scheme only: the summit defends itself against whoever is coming.
      // The league table is public, so the incumbent can see the nearest
      // challenger's total (own total minus the published gap) and aims a
      // margin above it, hoard permitting — a reaction function in quality,
      // price being confiscated.
      if (P2.world === 'scheme' && (uni.rank >= 2 || uni.gapBelow < 12)) {
        const ownTotal = uni.RS + uni.TS + uni.RH + uni.TH;
        const challenger = uni.rank >= 2 ? ownTotal + uni.gapAbove : ownTotal - uni.gapBelow;
        const perQ = Math.max((challenger + 10) / 4, 0);
        tgt = {
          RS: Math.max(tgt.RS, perQ), TS: Math.max(tgt.TS, perQ),
          RH: Math.max(tgt.RH, perQ), TH: Math.max(tgt.TH, perQ),
        };
      }
      const toward = (Q, T) => {
        const need = (T - P2.delta * Q) / P2.gamma;
        return need > 0 ? need * need : 0;
      };
      const want = {
        IRS: toward(uni.RS, tgt.RS), ITS: toward(uni.TS, tgt.TS),
        IRH: toward(uni.RH, tgt.RH), ITH: toward(uni.TH, tgt.TH),
      };
      let tot = want.IRS + want.ITS + want.IRH + want.ITH;
      // Even Harkness has a senate: the plan, defensive or not, is capped.
      const planCap = P2.world === 'scheme' ? P2.aiBalancedCap * P2.aiSchemeCapMult : P2.aiBalancedCap;
      const cap = Math.min(avail, planCap);
      if (tot > cap && tot > 0) {
        const k = cap / tot;
        for (const q in want) want[q] *= k;
        tot = cap;
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
    // Separate event stream: events never consume the main rng.
    this.rngE = makeRng(String(this.seed) + '/events');
    this.playerIndex = opts.playerIndex === undefined ? 3 : opts.playerIndex;

    this.unis = P.unis.map((u, i) => ({
      index: i, name: u.name,
      E: (P.world === 'scheme' && u.ES !== undefined) ? u.ES : u.E,
      RS: u.RS, TS: u.TS, RH: u.RH, TH: u.TH,
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
    this._choiceOffered = new Set();
    this.choiceLog = [];
    this.pendingChoice = null;
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

  /* The Founders' Reckoning: the final table, with remaining endowment
   * converted to quality at 1 point per reckonPerPoint. Ties by quality
   * total, then endowment, then index. */
  finalReckoning() {
    const P = this.P;
    const rows = this.unis.map(u => ({
      index: u.index, name: u.name,
      RS: u.RS, TS: u.TS, RH: u.RH, TH: u.TH,
      total: u.RS + u.TS + u.RH + u.TH,
      reckon: Math.min(P.reckonCapPoints, Math.max(0, u.E) / P.reckonPerPoint),
      broke: u.broke,
      _E: u.E,
    }));
    for (const r of rows) r.grand = r.total + r.reckon;
    rows.sort((a, b) => (b.grand - a.grand) || (b.total - a.total) || (b._E - a._E) || (a.index - b.index));
    rows.forEach((r, i) => { r.rank = i + 1; delete r._E; });
    return rows;
  }

  /* Begin a round: update field-preference drift, draw the fresh cohort,
   * publish the league table and cohort statistics. */
  startRound() {
    if (this.phase !== 'pre' && this.phase !== 'between') throw new Error('bad phase ' + this.phase);
    const P = this.P;
    this.round++;
    // The morning's news: events fire before the pStem update and before
    // the league table is computed, so the year's table reflects them.
    // Every university draws two numbers (occurrence, selection) from the
    // event stream in index order, even when unused — stream stability.
    const events = [];
    for (const u of this.unis) {
      const rOcc = this.rngE(), rSel = this.rngE();
      if (u.broke) continue; // draws discarded
      if (rOcc < 1 / 3) {
        const ev = pickEvent(rSel);
        const rec = { index: u.index, id: ev.id };
        if (ev.kind === 'money') {
          let d = ev.deltaE;
          if (d < 0 && -d > Math.max(0, u.E - 5)) {
            d = -Math.max(0, u.E - 5); // a loss may never push E below 5
            rec.truncated = true;
          }
          u.E += d;
          rec.deltaE = d;
        } else {
          rec.deltaQ = {};
          rec.fields = Object.keys(ev.effects);
          for (const q of rec.fields) {
            u[q] = Math.max(0, u[q] + ev.effects[q]);
            rec.deltaQ[q] = ev.effects[q];
          }
        }
        events.push(rec);
      }
    }
    this.events = events;
    // The player's post: a choice card may be offered (player-only). Three
    // numbers — occurrence, selection, success — are drawn every round
    // unconditionally, so the shock stream and the cohort stream are
    // identical whatever the player decides. The success roll is drawn
    // EAGERLY, at offer time, and used only if the gamble is taken.
    const rCOcc = this.rngE(), rCSel = this.rngE(), rCSucc = this.rngE();
    this.pendingChoice = null;
    if (this.round >= P.choiceFromRound && rCOcc < P.choiceProb) {
      const me = this.unis[this.playerIndex];
      const pool = CHOICE_CARDS.filter(c => !this._choiceOffered.has(c.id)
        && me.E >= c.minE
        && (!c.targetBy || this.unis.some(u => u.index !== this.playerIndex && !u.broke)));
      const tw = pool.reduce((a, c) => a + c.weight, 0);
      if (tw > 0 && !me.broke) {
        let x = rCSel * tw, card = pool[pool.length - 1];
        for (const c of pool) { x -= c.weight; if (x < 0) { card = c; break; } }
        let target = null;
        if (card.targetBy) {
          for (const u of this.unis) {
            if (u.index === this.playerIndex || u.broke) continue;
            if (!target || u[card.targetBy] > target[card.targetBy]) target = u;
          }
        }
        this._choiceOffered.add(card.id);
        this.pendingChoice = { card, target, rSucc: rCSucc };
      }
    }
    if (this.round >= 2) {
      let rs = 0, rh = 0;
      for (const u of this.unis) { rs += u.RS; rh += u.RH; }
      this.pStem = clamp(
        this.pStem + P.pStemEta * Math.tanh((rs / 4 - rh / 4) / P.pStemScale),
        P.pStemMin, P.pStemMax);
    }
    // Draw 40 fresh applicants (students last exactly one round). Field
    // assignment is stratified: exactly round(pStem * n) prefer STEM.
    const apps = [];
    const nStem = Math.round(this.pStem * P.nApplicants);
    for (let i = 0; i < P.nApplicants; i++) {
      const s = clamp(P.sMean + P.sSd * gauss(this.rng), P.sClampLo, P.sClampHi);
      const b = clamp(P.bBase + P.bSlope * (s - P.sMean) + P.bNoise * gauss(this.rng), P.bMin, P.bMax);
      const theta = P.thetaMin + (P.thetaMax - P.thetaMin) * this.rng();
      const f = i < nStem ? 'S' : 'H';
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
    // Each university knows its own published rank and the gap to the
    // college directly below it (both public information).
    for (const row of table) {
      const u = this.unis[row.index];
      u.rank = row.rank;
      const below = table.find(r => r.rank === row.rank + 1);
      u.gapBelow = below ? row.total - below.total : Infinity;
      const above = table.find(r => r.rank === row.rank - 1);
      u.gapAbove = above ? above.total - row.total : 0;
    }
    if (this.round > 1) this.rankHistory.push(table.find(r => r.index === this.playerIndex).rank);
    this.phase = 'admissions';
    const pc = this.pendingChoice;
    const choice = pc ? {
      id: pc.card.id,
      accept: pc.card.accept, decline: pc.card.decline || null,
      target: pc.target ? { index: pc.target.index, name: pc.target.name } : null,
    } : null;
    // The player's own endowment is their private information — published
    // to them (and only them) at the desk, where scholarship and card
    // decisions are made.
    return {
      round: this.round, table, cohortStats: this.cohortStats, events, choice,
      E: this.unis[this.playerIndex].E,
    };
  }

  /* Resolve the round's choice card (see CHOICE_CARDS). Must be called in
   * the admissions phase; submitAdmissions auto-declines an unanswered
   * card. The effects — money and quality, self and victim — apply
   * immediately, before the year's market/match runs. */
  submitChoice(accepted) {
    if (this.phase !== 'admissions') throw new Error('bad phase ' + this.phase);
    const pc = this.pendingChoice;
    if (!pc) throw new Error('no pending choice');
    this.pendingChoice = null;
    const me = this.unis[this.playerIndex];
    const branch = accepted ? pc.card.accept : (pc.card.decline || null);
    const rec = {
      round: this.round, id: pc.card.id, accepted: !!accepted,
      target: pc.target ? { index: pc.target.index, name: pc.target.name } : null,
    };
    if (branch) {
      if (branch.cost) { me.E -= branch.cost; rec.cost = branch.cost; }
      const p = branch.p === undefined ? 1 : branch.p;
      rec.success = pc.rSucc < p;
      const eff = (rec.success ? branch.onSuccess : branch.onFail) || {};
      if (eff.deltaE) {
        let d = eff.deltaE;
        if (d < 0 && -d > Math.max(0, me.E - 5)) { d = -Math.max(0, me.E - 5); rec.truncated = true; }
        me.E += d;
        rec.deltaE = d;
      }
      if (eff.self) {
        rec.deltaQ = {};
        for (const q in eff.self) { me[q] = Math.max(0, me[q] + eff.self[q]); rec.deltaQ[q] = eff.self[q]; }
      }
      if (eff.target && pc.target) {
        rec.targetDeltaQ = {};
        for (const q in eff.target) { pc.target[q] = Math.max(0, pc.target[q] + eff.target[q]); rec.targetDeltaQ[q] = eff.target[q]; }
      }
    }
    this.choiceLog.push(rec);
    this.lastChoice = rec;
    return rec;
  }

  /* Step 1 — Admissions. The player's {feeS, thrS, feeH, thrH} plus each
   * AI's simultaneous choice; then automatic market clearing. */
  submitAdmissions(playerDec) {
    if (this.phase !== 'admissions') throw new Error('bad phase ' + this.phase);
    if (this.pendingChoice) this.submitChoice(false); // the paper goes unanswered
    const P = this.P;
    const scheme = P.world === 'scheme';
    const decisions = new Array(this.unis.length);
    for (const u of this.unis) {
      if (u.broke) { decisions[u.index] = null; continue; } // broke: stops admitting
      decisions[u.index] = (u.index === this.playerIndex)
        ? (scheme
            ? {
                qS: clamp(Math.round(+playerDec.qS || 0), 0, P.capacity), thrS: +playerDec.thrS || 0,
                qH: clamp(Math.round(+playerDec.qH || 0), 0, P.capacity), thrH: +playerDec.thrH || 0,
              }
            : {
                feeS: Math.max(0, +playerDec.feeS || 0), thrS: +playerDec.thrS || 0,
                feeH: Math.max(0, +playerDec.feeH || 0), thrH: +playerDec.thrH || 0,
              })
        : u.controller.admissions(u);
      // Merit stipends (both worlds): every decision carries a per-head
      // stipend and a qualifying bar per field; AIs that don't set them
      // run stipends of zero.
      const d = decisions[u.index];
      const src = (u.index === this.playerIndex) ? playerDec : d;
      d.schS = clamp(+src.schS || 0, 0, P.schMax);
      d.schH = clamp(+src.schH || 0, 0, P.schMax);
      d.barS = clamp(+src.barS || P.schBarDefault, P.schBarLo, P.schBarHi);
      d.barH = clamp(+src.barH || P.schBarDefault, P.schBarLo, P.schBarHi);
    }
    this._decisions = decisions;

    const reports = this.unis.map(() => ({
      S: { applied: 0, offers: 0, matric: 0, income: 0, overage: 0, sSum: 0, sbar: null, schN: 0 },
      H: { applied: 0, offers: 0, matric: 0, income: 0, overage: 0, sSum: 0, sbar: null, schN: 0 },
    }));

    if (scheme) {
      // National Admissions Scheme: per-field deferred acceptance. Fees are
      // the regulated flat rate; the per-field 'overage' slot carries the
      // seats bill (seatCost x declared quota, filled or not), so the
      // ledger and bankruptcy code below are identical across worlds.
      for (const f of ['S', 'H']) {
        const students = this.applicants.filter(a => a.f === f);
        const { held, proposedTo } = runDA(f, students, decisions, this.unis, this.rng, P);
        for (const u of this.unis) {
          const r = reports[u.index][f];
          const d = decisions[u.index];
          const q = d ? (f === 'S' ? d.qS : d.qH) : 0;
          r.applied = proposedTo[u.index].size;
          r.offers = q; // declared quota
          r.matric = held[u.index].length;
          r.income = r.matric * P.schemeFee;
          r.overage = P.capacity * P.seatRent; // rent on all capacity seats, report-independent
          const bar = d ? (f === 'S' ? d.barS : d.barH) : Infinity;
          for (const p of held[u.index]) {
            r.sSum += p.a.s;
            if (p.a.s >= bar) r.schN++; // stipend owed to each qualifying matriculant
          }
          r.cutoff = r.matric > 0 ? Math.min(...held[u.index].map(p => p.a.s)) : null;
        }
      }
    } else {
      // Market clearing.
      for (const a of this.applicants) {
      const f = a.f;
      const offers = [];
      for (const u of this.unis) {
        const d = decisions[u.index];
        if (!d) continue;
        const fee = f === 'S' ? d.feeS : d.feeH;
        const thr = f === 'S' ? d.thrS : d.thrH;
        // The stipend counts toward the fee for qualifying students:
        // merit aid as a targeted price cut to the bright. Choice among
        // offers below stays quality-only, exactly as fees themselves
        // never sway choice — cash nets against the price at the gate.
        const sig = (a.s >= (f === 'S' ? d.barS : d.barH)) ? (f === 'S' ? d.schS : d.schH) : 0;
        if (fee - sig <= a.b) {
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
      const dch = decisions[chosen.index];
      const r = reports[chosen.index][f];
      r.matric++;
      r.sSum += a.s;
      r.income += (f === 'S' ? dch.feeS : dch.feeH);
      if (a.s >= (f === 'S' ? dch.barS : dch.barH)) r.schN++; // stipend owed
      }
    }
    for (const u of this.unis) {
      for (const f of ['S', 'H']) {
        const r = reports[u.index][f];
        if (!scheme) {
          r.overage = P.capacity * P.seatRent
            + Math.max(0, r.matric - P.capacity) * P.cOver;
        }
        r.sbar = r.matric > 0 ? r.sSum / r.matric : null;
        delete r.sSum;
      }
      const rep = reports[u.index];
      const d = this._decisions[u.index];
      // The stipend bill settles with the intake: sch per qualifying
      // matriculant, per field. It is part of C, so it can bankrupt.
      rep.S.schPaid = d ? d.schS * rep.S.schN : 0;
      rep.H.schPaid = d ? d.schH * rep.H.schN : 0;
      rep.F = rep.S.income + rep.H.income;
      rep.sch = rep.S.schPaid + rep.H.schPaid;
      rep.C = rep.S.overage + rep.H.overage + rep.sch;
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
      F: playerRep.F, C: playerRep.C, sch: playerRep.sch, net: playerRep.net,
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
      const finalTable = this.finalReckoning();
      this.finalRank = finalTable.find(r => r.index === this.playerIndex).rank;
      this.rankHistory.push(this.finalRank);
      this.score = this.initialRank - this.finalRank;
      return { done: true, finalTable, finalRank: this.finalRank, score: this.score };
    }
    this.phase = 'between';
    return { done: false };
  }
}

const THE_LEAGUE = { Game, DEFAULT_PARAMS, EVENTS, CHOICE_CARDS, makeRng, maintInvest, clamp };
if (typeof module !== 'undefined' && module.exports) module.exports = THE_LEAGUE;
if (typeof globalThis !== 'undefined') globalThis.THE_LEAGUE = THE_LEAGUE;
