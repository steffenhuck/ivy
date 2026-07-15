'use strict';
/* ============================================================================
 * THE LEAGUE — user interface.
 * The engine above is used exactly as in the calibration harness:
 *   startRound() -> submitAdmissions(dec) -> submitSpend(inv) -> ...
 * The UI never reads private rival state: it shows only the league table,
 * public cohort statistics, and the player's own books. In particular, no
 * budget/affordability information is ever displayed.
 * ========================================================================= */
(function () {
  const { Game, DEFAULT_PARAMS, maintInvest } = globalThis.THE_LEAGUE;
  const P = DEFAULT_PARAMS;
  const app = document.getElementById('app');

  const EPITHETS = [
    'Ancient, assured, and quietly asleep at the wheel.',
    'Citations before students; the common room before the classroom.',
    'Pack them in, pile them high, bank the difference.',
    'Once respectable. Now available.',
  ];
  const FIELD_NAME = { S: 'STEM', H: 'Humanities & Social Sciences' };
  const FIELD_SHORT = { S: 'STEM', H: 'HSS' };

  let game = null;          // current Game
  let pre = null;           // startRound() view for the current year
  let rep = null;           // admissions report for the current year
  let prevRanks = null;     // last year's ranks by uni index (for arrows)
  let dec = { feeS: 8, thrS: 55, feeH: 8, thrH: 55 };   // sticky controls
  let inv = { IRS: 0, ITS: 0, IRH: 0, ITH: 0 };

  /* ------------------------------ helpers ------------------------------ */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money = x => '£' + (Math.round(x * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k';
  const n1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const g = I => P.gamma * Math.sqrt(Math.max(0, I));
  const el = (sel) => app.querySelector(sel);
  const els = (sel) => Array.from(app.querySelectorAll(sel));

  function setView(html) {
    app.innerHTML = html;
    app.firstElementChild && app.firstElementChild.classList.add('fade');
  }

  function masthead(sub, compact) {
    return `<header class="masthead ${compact ? 'compact' : ''}">
      <div class="paper-name">The Morning Ledger</div>
      <h1>The League</h1>
      <div class="standfirst">${sub}</div>
    </header>`;
  }

  function dateline() {
    const u = game.unis[game.playerIndex];
    return `<div class="dateline">
      <span>Year ${game.round} of ${P.rounds} &middot; ${esc(u.name)}</span>
      <span>Endowment <b class="num">${money(u.E)}</b>${u.E < 30 ? ' <b class="red">(thin ice)</b>' : ''}</span>
      <button class="resign" id="resign">resign the post</button>
    </div>`;
  }

  function phaseStrip(active) {
    return `<div class="phase-strip">
      <div class="ph ${active === 1 ? 'on' : ''}">I &middot; The Admissions Desk</div>
      <div class="ph ${active === 2 ? 'on' : ''}">II &middot; The Bursar&rsquo;s Office</div>
    </div>`;
  }

  function leagueTableHtml(table, opts = {}) {
    const rows = table.map(r => {
      const me = game && r.index === game.playerIndex;
      let delta = '';
      if (prevRanks) {
        const d = prevRanks[r.index] - r.rank;
        delta = d > 0 ? `<span class="delta up">&#9650;${d}</span>` : d < 0 ? `<span class="delta down">&#9660;${-d}</span>` : '<span class="delta">&ndash;</span>';
      }
      return `<tr class="${me ? 'me' : ''} ${r.broke ? 'broke' : ''}">
        <td class="rank num">${r.rank}</td>
        <td class="uname">${esc(r.name)}${me ? ' <b>&#9670;</b>' : ''}${r.broke ? ' &dagger;' : ''}</td>
        <td class="num">${n1(r.RS)}</td><td class="num">${n1(r.TS)}</td>
        <td class="num">${n1(r.RH)}</td><td class="num">${n1(r.TH)}</td>
        <td class="num total">${n1(r.total)}</td>
        <td>${delta}</td>
      </tr>`;
    }).join('');
    return `<table class="league">
      ${opts.caption ? `<caption>${opts.caption}</caption>` : ''}
      <thead><tr><th>#</th><th>Institution</th><th>R<sub>S</sub></th><th>T<sub>S</sub></th><th>R<sub>H</sub></th><th>T<sub>H</sub></th><th>Total</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="tbl-foot">Research (R) and Teaching (T) quality by field, as assessed by the Ledger. Rank by total; ties broken by matters the Ledger does not discuss.</div>`;
  }

  /* --------------------------- title screen ---------------------------- */
  function renderTitle() {
    const probe = new Game({ seed: 1 });
    const table = probe.leagueTable();
    prevRanks = null;
    const rows = table.map(r => {
      const maxScore = r.rank - 1;
      const featured = r.rank === 4;
      return `<div class="row ${featured ? 'featured' : ''}">
        <div class="rank num">${r.rank}</div>
        <div class="uni">
          <b>${esc(r.name)}</b>
          <div class="epithet">${EPITHETS[r.index]}</div>
          <div class="scores num">R/T (STEM) ${n1(r.RS)} / ${n1(r.TS)} &middot; R/T (HSS) ${n1(r.RH)} / ${n1(r.TH)} &middot; total ${n1(r.total)}</div>
        </div>
        <div class="pick">
          <button class="btn-ghost pick-btn" data-idx="${r.index}">${featured ? 'Take the post' : 'Govern'}</button>
          <span class="maxnote">max score ${maxScore}</span>
        </div>
      </div>`;
    }).join('');

    setView(`
      ${masthead('A game of university governance, in twenty academic years')}
      <div class="leader">
        <p class="dropcap">Each autumn this newspaper publishes its League of the four universities, and each autumn the same names appear in the same order. The Ledger regards this as proof of the natural order of things.</p>
        <p>At the foot of the table stands <b>Greyfriars College</b> — endowment thin, faculties tired, reputation a rumour. Its governing board, out of options and nearly out of money, is hiring anyone willing to serve as Vice-Chancellor. The Ledger doubts anything can be done. Proving the Ledger wrong is the whole game: take the worst chair in academia and carry it to the top of the table.</p>
        <p>Vacancies exist at better houses, for those who prefer a quieter life. The scoring, note, is unsentimental: your score is how many places you climb. Start high and there is nowhere to go.</p>
      </div>
      <div class="prospect">${rows}</div>
      <div class="seedline">
        <label for="seed">Seed (optional, for a reproducible season):</label>
        <input id="seed" inputmode="numeric" placeholder="random">
      </div>
      <details class="rules">
        <summary>How the game is played &mdash; the standing rules</summary>
        <div class="card-body">
          <ul>
            <li><b>Each year, two decisions.</b> First the <b>Admissions Desk</b>: for each field (STEM and HSS) you set an entry <b>threshold</b> (every applicant at or above it receives an offer) and a <b>fee</b>. Then the <b>Bursar&rsquo;s Office</b>: you invest in research and teaching quality, per field.</li>
            <li><b>Applicants.</b> Forty fresh school-leavers apply each year. Each has a school score, a preferred field, a taste for research prestige, and a private budget. They apply everywhere they can afford, and enrol wherever their offers look best (teaching quality plus their personal weight on research). They stay one year, pay one fee, and leave.</li>
            <li><b>Capacity.</b> Each department teaches up to <b>8</b> students at no extra cost. You must take everyone who accepts your offer; each student beyond 8 costs <b>${money(P.cOver)}</b> in emergency provision. Over-offering is the classic way to die.</li>
            <li><b>Money.</b> Fees are paid up front. Unspent funds earn ${Math.round(P.interest * 100)}% interest. If your endowment cannot cover the year's overage bill, the College is bankrupt and the game ends.</li>
            <li><b>Quality.</b> Investment raises quality with diminishing returns, and takes effect the following year. All quality decays ${Math.round((1 - P.delta) * 100)}% a year if unattended. Teaching quality also drifts with the calibre of the students you actually admit, relative to the national average of ${P.sMean}.</li>
            <li><b>Fashion.</b> Field preferences drift slowly toward whichever field boasts higher research quality across the sector.</li>
            <li><b>Information.</b> The League table is public. Rivals&rsquo; fees, thresholds, enrolments and endowments are not. Nor — the Ledger regrets — is anything about applicants&rsquo; means: you learn the demand curve the hard way.</li>
            <li><b>The end.</b> After ${P.rounds} years the final League is printed. Score = starting rank &minus; final rank.</li>
          </ul>
        </div>
      </details>
      <div class="footer-note">The Morning Ledger University Guide &middot; entirely fictional &middot; no external resources, no network, one file</div>
    `);
    els('.pick-btn').forEach(b => b.addEventListener('click', () => {
      const idx = +b.dataset.idx;
      const seedRaw = el('#seed').value.trim();
      const seed = seedRaw === '' ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) : (parseInt(seedRaw, 10) >>> 0 || 1);
      startGame(idx, seed);
    }));
  }

  function startGame(idx, seed) {
    game = new Game({ seed, playerIndex: idx });
    prevRanks = null;
    dec = { feeS: 8, thrS: 55, feeH: 8, thrH: 55 };
    nextYear();
  }

  function nextYear() {
    pre = game.startRound();
    rep = null;
    renderAdmissions();
  }

  /* ------------------------- my college card --------------------------- */
  function myCard() {
    const u = game.unis[game.playerIndex];
    const qmax = 60;
    const bar = (v, cls) => `<div class="qbar ${cls}"><i style="width:${Math.min(100, 100 * v / qmax)}%"></i></div>`;
    const last = u.lastReport;
    const intake = last ? `
      <table class="report" style="margin-top:10px">
        <thead><tr><th>Last year</th><th>Applied</th><th>Offers</th><th>Enrolled</th><th>Avg score</th></tr></thead>
        <tbody>
          <tr><td>STEM</td><td class="num">${last.S.applied}</td><td class="num">${last.S.offers}</td><td class="num">${last.S.matric}</td><td class="num">${last.S.sbar === null ? '&mdash;' : n1(last.S.sbar)}</td></tr>
          <tr><td>HSS</td><td class="num">${last.H.applied}</td><td class="num">${last.H.offers}</td><td class="num">${last.H.matric}</td><td class="num">${last.H.sbar === null ? '&mdash;' : n1(last.H.sbar)}</td></tr>
        </tbody>
      </table>` : `<div class="notice">No admissions history yet: the books open this year.</div>`;
    return `<section class="card plain">
      <div class="card-head"><span>${esc(u.name)} &mdash; the books</span><span class="kicker">private</span></div>
      <div class="card-body">
        <div class="statline">
          <div class="stat"><span class="lbl">Endowment</span><span class="val num">${money(u.E)}</span></div>
          <div class="stat"><span class="lbl">League position</span><span class="val num">${pre.table.find(r => r.index === game.playerIndex).rank} of 4</span></div>
        </div>
        <div class="qual-grid">
          <div class="qrow"><span class="lbl"><span>Research &middot; STEM</span><b class="num">${n1(u.RS)}</b></span>${bar(u.RS, 'research')}</div>
          <div class="qrow"><span class="lbl"><span>Teaching &middot; STEM</span><b class="num">${n1(u.TS)}</b></span>${bar(u.TS, '')}</div>
          <div class="qrow"><span class="lbl"><span>Research &middot; HSS</span><b class="num">${n1(u.RH)}</b></span>${bar(u.RH, 'research')}</div>
          <div class="qrow"><span class="lbl"><span>Teaching &middot; HSS</span><b class="num">${n1(u.TH)}</b></span>${bar(u.TH, '')}</div>
        </div>
        ${intake}
      </div>
    </section>`;
  }

  function cohortCard() {
    const c = pre.cohortStats;
    return `<section class="card plain">
      <div class="card-head"><span>This year&rsquo;s applicants</span><span class="kicker">${P.nApplicants} school-leavers</span></div>
      <div class="card-body">
        <div class="statline">
          <div class="stat"><span class="lbl">Median score</span><span class="val num">${n1(c.median)}</span></div>
          <div class="stat"><span class="lbl">Mean score</span><span class="val num">${n1(c.mean)}</span></div>
          <div class="stat"><span class="lbl">Prefer STEM</span><span class="val num">${n1(c.pctStem)}%</span></div>
        </div>
        <div class="notice">The Ledger publishes no figures on applicants&rsquo; family means. Price your prospectus accordingly.</div>
      </div>
    </section>`;
  }

  /* --------------------------- admissions ------------------------------ */
  function renderAdmissions() {
    const u = game.unis[game.playerIndex];
    const fieldBox = f => {
      const last = u.lastReport ? u.lastReport[f] : null;
      return `<div class="fieldbox">
        <h4>${FIELD_NAME[f]}</h4>
        <div class="ctl">
          <span class="lbl">Entry threshold (school score)</span>
          <div class="stepper" data-kind="thr" data-f="${f}">
            <button data-d="-5">&#171;</button><button data-d="-1">&minus;</button>
            <span class="val num" id="thr${f}">${dec['thr' + f]}</span>
            <button data-d="1">+</button><button data-d="5">&#187;</button>
          </div>
        </div>
        <div class="ctl">
          <span class="lbl">Annual fee</span>
          <div class="stepper" data-kind="fee" data-f="${f}">
            <button data-d="-2">&#171;</button><button data-d="-0.5">&minus;</button>
            <span class="val num" id="fee${f}">${money(dec['fee' + f])}</span>
            <button data-d="0.5">+</button><button data-d="2">&#187;</button>
          </div>
        </div>
        <div class="demandline">${last
          ? `Last year: <b class="num">${last.applied}</b> applied &middot; <b class="num">${last.offers}</b> offers out &middot; <b class="num">${last.matric}</b> enrolled${last.matric > P.capacity ? ` <b class="red">(${last.matric - P.capacity} over capacity)</b>` : ''}`
          : 'No demand history yet.'}</div>
      </div>`;
    };
    setView(`
      ${masthead('Published every autumn by The Morning Ledger', true)}
      ${dateline()}
      ${phaseStrip(1)}
      <div class="cols">
        <div class="stack">
          <section class="card plain">
            <div class="card-head"><span>The League</span><span class="kicker">Year ${game.round}</span></div>
            <div class="card-body">${leagueTableHtml(pre.table)}</div>
          </section>
          ${cohortCard()}
        </div>
        <div class="stack">
          <section class="card admissions">
            <div class="card-head"><span>Step I &mdash; The Admissions Desk</span><span class="kicker">offers &amp; fees</span></div>
            <div class="card-body">
              <div class="fields">${fieldBox('S')}${fieldBox('H')}</div>
              <div class="notice warn">Capacity is ${P.capacity} per department. Every offer that is accepted must be honoured; each enrolee beyond ${P.capacity} costs ${money(P.cOver)}. Applicants who can afford you and clear your threshold get an offer &mdash; all of them.</div>
              <button class="btn oxblood" id="post">Post the prospectus &amp; make offers</button>
            </div>
          </section>
          ${myCard()}
        </div>
      </div>
      <div class="footer-note">Season seed ${game.seed} &middot; The Morning Ledger University Guide</div>
    `);
    els('.stepper button').forEach(b => b.addEventListener('click', () => {
      const box = b.closest('.stepper');
      const f = box.dataset.f, d = parseFloat(b.dataset.d);
      if (box.dataset.kind === 'thr') {
        dec['thr' + f] = Math.max(20, Math.min(100, dec['thr' + f] + d));
        el('#thr' + f).textContent = dec['thr' + f];
      } else {
        dec['fee' + f] = Math.max(0, Math.min(20, Math.round((dec['fee' + f] + d) * 2) / 2));
        el('#fee' + f).textContent = money(dec['fee' + f]);
      }
    }));
    el('#post').addEventListener('click', () => {
      rep = game.submitAdmissions(dec);
      if (game.phase === 'bankrupt') renderEnd({ bankrupt: true });
      else renderBursar();
    });
    el('#resign').addEventListener('click', resign);
  }

  /* ----------------------------- bursar -------------------------------- */
  function renderBursar() {
    const u = game.unis[game.playerIndex];
    const budget = Math.max(0, rep.net);
    inv = { IRS: 0, ITS: 0, IRH: 0, ITH: 0 };

    const reportRow = (f) => {
      const d = rep[f];
      return `<tr>
        <td>${FIELD_SHORT[f]}</td>
        <td class="num">${d.applied}</td><td class="num">${d.offers}</td><td class="num">${d.matric}</td>
        <td class="num">${d.sbar === null ? '&mdash;' : n1(d.sbar)}</td>
        <td class="num">${money(d.income)}</td>
        <td class="num ${d.overage ? 'red' : ''}">${d.overage ? '&minus;' + money(d.overage) : '&mdash;'}</td>
      </tr>`;
    };

    const invRow = (key, label, field, isTeach) => `
      <div class="invrow" data-key="${key}">
        <div class="lbl">${label}<b>${field}</b></div>
        <input type="range" min="0" max="${Math.ceil(budget)}" step="0.5" value="0">
        <div class="out"><b class="num amt">${money(0)}</b><span class="proj num"></span></div>
      </div>`;

    setView(`
      ${masthead('Published every autumn by The Morning Ledger', true)}
      ${dateline()}
      ${phaseStrip(2)}
      <div class="cols even">
        <div class="stack">
          <section class="card plain">
            <div class="card-head"><span>The year&rsquo;s admissions</span><span class="kicker">confidential</span></div>
            <div class="card-body">
              <div class="scrollx"><table class="report">
                <thead><tr><th>Field</th><th>Applied</th><th>Offers</th><th>Enrolled</th><th>Avg</th><th>Fees</th><th>Overage</th></tr></thead>
                <tbody>
                  ${reportRow('S')}${reportRow('H')}
                  <tr class="sumrow"><td>Net of overage</td><td colspan="5"></td><td class="num ${rep.F - rep.C < 0 ? 'red' : 'green'}">${money(rep.F - rep.C)}</td></tr>
                </tbody>
              </table></div>
              <div class="notice">${intakeRemark()}</div>
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="card bursar">
            <div class="card-head"><span>Step II &mdash; The Bursar&rsquo;s Office</span><span class="kicker">investment</span></div>
            <div class="card-body">
              <div class="budgetline"><span>Funds at hand</span><b class="num">${money(budget)}</b></div>
              <div class="budgetline" style="border-top:1px dotted var(--rule)"><span>Uncommitted (earns ${Math.round(P.interest * 100)}%)</span><b class="num" id="remain">${money(budget)}</b></div>
              ${invRow('IRS', 'Research', 'STEM')}
              ${invRow('ITS', 'Teaching', 'STEM', true)}
              ${invRow('IRH', 'Research', 'HSS')}
              ${invRow('ITH', 'Teaching', 'HSS', true)}
              <div class="presets">
                <button class="btn-ghost" id="pMaintain">Maintain all</button>
                <button class="btn-ghost" id="pEven">Even split, all in</button>
                <button class="btn-ghost" id="pClear">Clear</button>
              </div>
              <div class="notice">Investment bears fruit next year, with diminishing returns; quality decays ${Math.round((1 - P.delta) * 100)}% a year unattended. Teaching also moves with intake calibre (this year&rsquo;s average vs the national ${P.sMean}).</div>
              <button class="btn navy" id="commit">Commit the year&rsquo;s spending</button>
            </div>
          </section>
        </div>
      </div>
      <div class="footer-note">Season seed ${game.seed} &middot; The Morning Ledger University Guide</div>
    `);

    const QKEY = { IRS: 'RS', ITS: 'TS', IRH: 'RH', ITH: 'TH' };
    const project = (key, I) => {
      const q = u[QKEY[key]];
      let next = P.delta * q + g(I);
      if (key === 'ITS' && rep.S.matric > 0) next += P.kappa * (rep.S.sbar - P.sMean);
      if (key === 'ITH' && rep.H.matric > 0) next += P.kappa * (rep.H.sbar - P.sMean);
      return Math.max(0, next);
    };
    const refresh = () => {
      let total = 0;
      els('.invrow').forEach(row => { total += parseFloat(row.querySelector('input').value) || 0; });
      els('.invrow').forEach(row => {
        const key = row.dataset.key;
        const input = row.querySelector('input');
        let v = parseFloat(input.value) || 0;
        if (total > budget) { v = Math.max(0, v - (total - budget)); input.value = v; total = null; }
        inv[key] = v;
        row.querySelector('.amt').textContent = money(v);
        const q = u[QKEY[key]];
        row.querySelector('.proj').textContent = `${n1(q)} → ${n1(project(key, v))}`;
      });
      if (total === null) { total = 0; els('.invrow input').forEach(i => total += parseFloat(i.value) || 0); }
      el('#remain').textContent = money(Math.max(0, budget - total));
    };
    els('.invrow input').forEach(i => i.addEventListener('input', refresh));
    el('#pMaintain').addEventListener('click', () => {
      let left = budget;
      for (const key of ['IRS', 'ITS', 'IRH', 'ITH']) {
        const want = Math.min(left, maintInvest(u[QKEY[key]], P));
        el(`.invrow[data-key=${key}] input`).value = Math.round(want * 2) / 2;
        left -= want;
      }
      refresh();
    });
    el('#pEven').addEventListener('click', () => {
      els('.invrow input').forEach(i => { i.value = Math.floor(budget / 4 * 2) / 2; });
      refresh();
    });
    el('#pClear').addEventListener('click', () => { els('.invrow input').forEach(i => { i.value = 0; }); refresh(); });
    el('#commit').addEventListener('click', () => {
      const res = game.submitSpend(inv);
      prevRanks = {};
      pre.table.forEach(r => { prevRanks[r.index] = r.rank; });
      if (res.done) renderEnd({ finalTable: res.finalTable });
      else nextYear();
    });
    el('#resign').addEventListener('click', resign);
    refresh();
  }

  function intakeRemark() {
    const bits = [];
    for (const f of ['S', 'H']) {
      const d = rep[f];
      if (d.matric === 0) bits.push(`${FIELD_SHORT[f]} admitted nobody &mdash; no fees, and no effect on teaching either way`);
      else if (d.sbar >= P.sMean + 5) bits.push(`${FIELD_SHORT[f]}&rsquo;s intake (avg ${n1(d.sbar)}) flatters its teaching`);
      else if (d.sbar <= P.sMean - 5) bits.push(`${FIELD_SHORT[f]}&rsquo;s intake (avg ${n1(d.sbar)}) will drag on its teaching`);
    }
    return bits.length ? bits.join('; ') + '.' : 'A quiet year for the registry: intake near the national average.';
  }

  /* ---------------------------- end screens ---------------------------- */
  function resign() {
    if (!game || game.phase === 'over') return;
    if (!confirm('Resign the post and let the Ledger print what it will?')) return;
    game.finalRank = game.rankOf(game.playerIndex);
    game.score = game.initialRank - game.finalRank;
    if (game.rankHistory[game.rankHistory.length - 1] !== game.finalRank) game.rankHistory.push(game.finalRank);
    renderEnd({ resigned: true });
  }

  function rankChart() {
    const H = game.rankHistory;
    const W = 620, HT = 220, padL = 46, padR = 16, padT = 18, padB = 34;
    const iw = W - padL - padR, ih = HT - padT - padB;
    const x = i => padL + (H.length === 1 ? 0 : iw * i / (H.length - 1));
    const y = r => padT + ih * (r - 1) / 3;
    const pts = H.map((r, i) => `${x(i).toFixed(1)},${y(r).toFixed(1)}`).join(' ');
    const grid = [1, 2, 3, 4].map(r =>
      `<line x1="${padL}" y1="${y(r)}" x2="${W - padR}" y2="${y(r)}" stroke="#cfc3a8" stroke-dasharray="3 4"/>
       <text x="${padL - 10}" y="${y(r) + 4}" text-anchor="end" font-size="12" fill="#6f6553">${r}${['st', 'nd', 'rd', 'th'][r - 1]}</text>`).join('');
    const xticks = H.map((r, i) => i).filter(i => i % Math.ceil(H.length / 10) === 0 || i === H.length - 1)
      .map(i => `<text x="${x(i)}" y="${HT - 12}" text-anchor="middle" font-size="11" fill="#6f6553">${i === 0 ? 'start' : i}</text>`).join('');
    const dots = H.map((r, i) => `<circle cx="${x(i)}" cy="${y(r)}" r="3.2" fill="#7c2a1e"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${HT}" role="img" aria-label="League position by year">
      <rect x="0" y="0" width="${W}" height="${HT}" fill="none"/>
      ${grid}${xticks}
      <polyline points="${pts}" fill="none" stroke="#7c2a1e" stroke-width="2.5"/>
      ${dots}
      <text x="${(padL + W - padR) / 2}" y="${HT - 0.5}" text-anchor="middle" font-size="11" fill="#6f6553">academic year</text>
    </svg>`;
  }

  function renderEnd(o) {
    const u = game.unis[game.playerIndex];
    const score = game.score;
    let verdict, headline, body;
    if (o.bankrupt) {
      verdict = 'The Ledger regrets to report';
      headline = `${esc(u.name)} is bankrupt`;
      body = `The overage bill could not be met, the doors are chained, and the porters have kept the good chairs. Year ${game.round} of ${P.rounds}.`;
    } else if (o.resigned) {
      verdict = 'From the appointments column';
      headline = 'A resignation at ' + esc(u.name);
      body = `The Vice-Chancellor departs &ldquo;to pursue other interests&rdquo; after ${game.round} year${game.round === 1 ? '' : 's'}.`;
    } else if (score >= 3) {
      verdict = 'The Ledger eats its words';
      headline = `${esc(u.name)}, first of the League`;
      body = 'From the foot of the table to the top of it. This newspaper maintains, without embarrassment, that it saw promise all along.';
    } else if (score >= 1) {
      verdict = 'The Ledger concedes';
      headline = `${esc(u.name)} on the rise`;
      body = 'A creditable ascent, if not yet the summit. The senior common room permits itself one glass of the good sherry.';
    } else if (score === 0) {
      verdict = 'The Ledger observes';
      headline = 'The natural order holds';
      body = 'Twenty years of administration, and the table stands exactly as it did. There is a certain dignity in that. A very small one.';
    } else {
      verdict = 'The Ledger is not surprised';
      headline = `${esc(u.name)} slips`;
      body = 'The governing board thanks the outgoing Vice-Chancellor for their service and asks that the key be left with the porter.';
    }
    const finalTable = o.finalTable || game.leagueTable();
    prevRanks = null;
    setView(`
      ${masthead('The final edition')}
      <section class="card plain">
        <div class="card-body endcard">
          <div class="verdict">${verdict}</div>
          <h2>${headline}</h2>
          <p style="max-width:560px;margin:0 auto">${body}</p>
          <div class="scoreline">Score: <b class="num">${score >= 0 ? score : score}</b> <span style="color:var(--faint)">(started ${game.initialRank}${['st', 'nd', 'rd', 'th'][game.initialRank - 1]}, finished ${game.finalRank}${['st', 'nd', 'rd', 'th'][game.finalRank - 1]})</span></div>
          <div class="chartwrap">${rankChart()}</div>
          <div class="chart-caption">League position of ${esc(u.name)}, by year. The top line is the top of the League.</div>
        </div>
      </section>
      <div style="margin-top:18px">
        <section class="card plain">
          <div class="card-head"><span>The final League</span><span class="kicker">as printed</span></div>
          <div class="card-body">${leagueTableHtml(finalTable)}</div>
        </section>
      </div>
      <button class="btn" id="again" style="max-width:340px;display:block;margin:22px auto 0">Another twenty years</button>
      <div class="footer-note">Season seed ${game.seed} &middot; The Morning Ledger University Guide</div>
    `);
    el('#again').addEventListener('click', renderTitle);
  }

  renderTitle();
})();
