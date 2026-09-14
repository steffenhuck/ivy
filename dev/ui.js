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
  const QLABEL = { RS: 'STEM research', TS: 'STEM teaching', RH: 'HSS research', TH: 'HSS teaching' };

  // Flavour selection only — never the game RNG, never rngE.
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* Event narrative, keyed by engine event id. The engine carries only
   * mechanics; all Ledger prose lives here. */
  const EVENT_TEXT = {
    crane: 'Professor Emeritus Aldous Crane has died as he lived, inconveniently — leaving the College £28k and his complete correspondence, which it is legally obliged to catalogue.',
    alumnus: 'An alumnus who ‘owes everything to his College’ has settled the debt at £18k. The Ledger notes the exchange rate on everything.',
    anon: 'An anonymous donor has given £32k, subject to conditions the College describes as ‘none whatsoever’ in a tone the Ledger finds interesting.',
    stair: 'The West Stair is now the Pemberton West Stair. £22k. The stair itself declined to comment.',
    meadow: 'The College has sold a meadow it forgot it owned to a developer who will not say what for. £25k, no questions, none asked.',
    conference: 'The College hosted a conference on Austerity. Catering was minimal, the surplus £12k, the irony unremarked.',
    patent: 'A patent filed decades ago by a chemist nobody remembers has begun, improbably, to pay. £30k, and counsel’s advice not to enquire further.',
    roof: 'The Great Hall’s roof, described in the prospectus as ‘historic’, has clarified what it meant. Repairs: £22k.',
    lawsuit: 'A former lecturer’s suit for constructive dismissal has been settled for £18k and a reference the Ledger has seen and admires.',
    boiler: 'The boiler, installed as a temporary measure during a previous century, has retired. £12k.',
    audit: 'The auditors have found irregularities. The irregularities have found the College £15k poorer and one bursar’s assistant considerably wiser.',
    asbestos: 'A survey of the East Wing has discovered asbestos, damp, and a bicycle registered to a student who matriculated in 1962. Remediation: £26k.',
    clawback: 'A donor has learned what became of his conditions and wants £20k of his generosity returned. The lawyers advise paying. The lawyers, as ever, are paid either way.',
    flood: 'The river has visited the library. The insurance covers acts of God but disputes the attribution. £16k.',
    portrait: 'The outgoing Vice-Chancellor’s portrait has been commissioned, at £8k, by the outgoing Vice-Chancellor.',
    chair: 'A physicist of consequence has accepted a chair, citing ‘the quiet’. The Ledger raises STEM research by three and its eyebrows further.',
    viral: 'A humanities lecture has circulated on the internet for reasons at least partly intended. HSS teaching, +2.',
    prize: 'A College historian has won a prize substantial enough that the College has begun describing him as ‘ours’. HSS research +3.',
    demonstrators: 'A rival’s laboratory closure has scattered its demonstrators; the College caught two. STEM teaching +2.',
    trunk: 'A trunk in the cellar has proved to contain an archive of national importance rather than, as catalogued, ‘a trunk’. HSS research +2.',
    vindicated: 'A researcher turned down by every better house has proved them all wrong within the year. STEM research +4; the letters of rejection are framed.',
    award: 'The national teaching awards have honoured the College, to the visible surprise of the committee that nominated it. STEM teaching +2.',
    poached: 'A rival has poached the College’s best physicist with money, which the Ledger considers cheating, and a laboratory, which it considers worse. STEM research −3.',
    remarks: 'A lecturer’s remarks at a public event have required three apologies, each less convincing than the last. HSS teaching −2.',
    memoirs: 'The historian who was the HSS research entry in all but name has retired to write his memoirs. The College awaits publication calmly. −3.',
    retraction: 'A retraction, in a journal the College had only recently begun mentioning. STEM research −2.',
    exodus: 'Three demonstrators have left for the private sector, which pays. STEM teaching −3.',
    timetable: 'The new timetabling software has scheduled medieval literature in the chemistry basement at dawn. HSS teaching −2; the software reports complete success.',
    strike: 'Industrial action has been resolved amicably, after a term of no teaching whatsoever. Teaching −2, both fields; amity is invoiced separately.',
    inspectorate: 'The quality inspectorate has visited. Its report praises the lawns. HSS teaching −2.',
  };
  /* Choice-card narrative, keyed by engine card id. Mechanics (costs, odds,
   * effects) are rendered from the card definition itself — the Ledger
   * prints the odds it is given, and only the prose is its own. {T} is the
   * victim college where the card names one. */
  const CHOICE_TEXT = {
    poach_rs: {
      head: 'A physicist, approachable',
      body: 'Word reaches the Lodge that {T}&rsquo;s professor of physics &mdash; the one the citations follow &mdash; has quarrelled with his dean about laboratory space, and has let it be known, through channels that do not exist, that he might be approachable. Physicists of consequence enjoy being courted and are under no obligation to conclude.',
      accept: 'Court him', decline: 'Let him quarrel',
      success: 'He arrives before Michaelmas, with two postdoctoral researchers and a grudge. The Ledger reports the appointment as &lsquo;a coup&rsquo;, which for once is the word.',
      fail: 'He has used the College&rsquo;s offer to extract a larger laboratory from his own dean &mdash; which was, the Ledger now understands, the point of the quarrel. Part of the retainer is recovered.',
    },
    poach_rh: {
      head: 'The historian is restless',
      body: 'The historian who is {T}&rsquo;s HSS research entry in all but name has been passed over for their deanship, and dines out on the fact. A discreet approach would cost real money, and historians, unlike physicists, write down what happens to them.',
      accept: 'Make the approach', decline: 'Admire from afar',
      success: 'The historian arrives with nine filing cabinets and a lecture series already titled. {T} describes the departure as &lsquo;amicable&rsquo;; the memoir will say otherwise.',
      fail: 'The historian reads the College&rsquo;s letter aloud at {T}&rsquo;s high table, to applause. Part of the retainer is recovered; the anecdote is theirs forever.',
    },
    poach_ts: {
      head: 'A teacher of reputation',
      body: 'The lecturer who fills {T}&rsquo;s largest theatre &mdash; students transfer courses to be shouted at by him &mdash; is rumoured to be tired of his colleagues. Teaching of that quality moves institutions when it moves at all.',
      accept: 'Tempt him', decline: 'Respect the timetable',
      success: 'He brings his lecture notes, his following, and a list of grievances the College finds instructive. The theatre fills by week two.',
      fail: 'His colleagues, alerted, have made peace with him at some expense. Half the inducement returns; the grievances stay where they were.',
    },
    donor: {
      head: 'A donor, with conditions',
      body: 'An industrialist offers the College &pound;24k, on the sole condition that it adopt his views on the humanities curriculum, which he has had printed and bound. The faculty&rsquo;s view of his views is known. The money, however, is real.',
      accept: 'Take the money', decline: 'Decline, with regret',
      success: 'The cheque clears. The curriculum acquires a chapter the lecturers read aloud in a certain tone; the students notice the tone.',
    },
    scandal: {
      head: 'A matter best not printed',
      body: 'A story concerning a senior member of the College has reached the Ledger&rsquo;s news desk, which has reached, in turn, for the telephone. For &pound;12k the College may purchase the exclusive rights to its own embarrassment &mdash; this newspaper prints commerce above gossip. Otherwise the editors will weigh the public interest, which weighs about even.',
      accept: 'Buy the story', decline: 'Let them print',
      success: 'The story is filed under &lsquo;acquired features, unpublished&rsquo;, the fattest drawer in the building.',
      declineOk: 'The editors, on reflection, spike the story in favour of a livelier one. Nothing appears; nothing was paid.',
      declineFail: 'The story runs on the front page, with a photograph the College considers unflattering and the Ledger considers excellent.',
    },
    pilot: {
      head: 'The Ministry&rsquo;s pilot',
      body: 'The Ministry proposes that the College host a pilot programme in &lsquo;skills&rsquo;: &pound;8k to prepare, a grant of &pound;20k should the inspectors approve, and whatever a Ministry plaque does for the seminars. Inspectors approve roughly two times in three, mostly of the biscuits.',
      accept: 'Host the pilot', decline: 'Return the forms',
      success: 'The inspectors approve. The grant arrives; the plaque is bolted where prospective parents pause.',
      fail: 'The inspectors do not approve. The &pound;8k has become a report, which recommends a further report.',
    },
    congress: {
      head: 'The Congress comes to town',
      body: 'The sector&rsquo;s disciplinary congress seeks a host: a week of porters, halls, name-badges and wine, at the College&rsquo;s expense &mdash; and the College&rsquo;s name on every volume of the proceedings, both fields of research the better for it. Certain, expensive, and remembered.',
      accept: 'Host the Congress', decline: 'Plead the roof',
      success: 'Four hundred scholars attend, two hundred complain about the rooms, and every one of them cites the venue. The proceedings carry the College&rsquo;s crest.',
    },
    consult: {
      head: 'Consultants at the gate',
      body: 'A firm of rankings consultants offers, for &pound;10k, a &lsquo;holistic uplift across all four metrics&rsquo;. The brochure is glossy; the references trail off; the odds, on the Ledger&rsquo;s arithmetic, favour the firm.',
      accept: 'Engage the firm', decline: 'Show them the door',
      success: 'Remarkably, something improves everywhere at once. The firm has already framed the correlation for its next brochure.',
      fail: 'The firm delivers a lever-arch file and an invoice. The metrics remain as audited.',
    },
    storm: {
      head: 'The glass is falling',
      body: 'The insurers offer a rider against the season&rsquo;s storms at &pound;6k. The porter, consulting his knee, rates the chance of a bad blow at two in five. The insurers, consulting their tables, agree with the knee.',
      accept: 'Take the rider', decline: 'Chance the weather',
      success: 'The premium is paid and the weather, knowing this, goes elsewhere.',
      declineOk: 'The storms spend themselves on the neighbouring county, which had insured.',
      declineFail: 'The storm takes slates, fences and the pavilion scoreboard. The builders quote &pound;18k and condolences.',
    },
    stipend: {
      head: 'A prodigy, expensive',
      body: 'A school-leaver of alarming promise will matriculate here &mdash; bringing the seminar culture such students bring &mdash; if endowed with a stipend of &pound;8k and, the letter mentions in passing, a standing desk.',
      accept: 'Endow the stipend', decline: 'Praise economy',
      success: 'The prodigy arrives, corrects a proof in week three, and raises the tone of every room entered. The desk stands.',
    },
    merger: {
      head: 'St Edmund&rsquo;s, available',
      body: 'St Edmund&rsquo;s &mdash; a small private college of good teaching and no money &mdash; approaches with what it calls a partnership and its creditors call a rescue. Its faculty may flourish under the College&rsquo;s roof, or scatter under its lawyers; the Ledger rates the roof at six chances in ten.',
      accept: 'Absorb St Edmund&rsquo;s', decline: 'Send condolences',
      success: 'The absorption holds. St Edmund&rsquo;s tutors arrive with their teaching manners intact and their gratitude nearly so.',
      fail: 'The lawyers find a covenant nobody had read. The faculty scatters; a portion of the outlay is clawed back from the wreckage.',
    },
    archive: {
      head: 'The Marchmont papers',
      body: 'The Marchmont archive &mdash; letters, ledgers, and one improbable diary &mdash; is offered privately at &pound;12k, certain to make the College&rsquo;s HSS research the envy of the sector&rsquo;s footnotes.',
      accept: 'Buy the papers', decline: 'Let the auction have them',
      success: 'The papers arrive in fourteen crates. Three doctorates begin by Christmas; the diary is kept under glass and, prudently, a cloth.',
    },
  };

  /* Mechanics of a card branch, rendered from the engine's own definition
   * — the Ledger prints exactly the odds and sums the engine will use. */
  function describeEffects(eff, targetName) {
    if (!eff) return 'nothing';
    const bits = [];
    if (eff.deltaE) bits.push(`${eff.deltaE > 0 ? '+' : '&minus;'}${money(Math.abs(eff.deltaE))} to the endowment`);
    if (eff.self) for (const [q, d] of Object.entries(eff.self)) bits.push(`your ${QLABEL[q]} ${d > 0 ? '+' : '&minus;'}${Math.abs(d)}`);
    if (eff.target && targetName) for (const [q, d] of Object.entries(eff.target)) bits.push(`${esc(targetName)}&rsquo;s ${QLABEL[q]} ${d > 0 ? '+' : '&minus;'}${Math.abs(d)}`);
    return bits.length ? bits.join(', ') : 'nothing';
  }
  function describeBranch(label, br, targetName) {
    if (!br) return `<tr><td><b>${label}</b></td><td colspan="2">nothing happens</td></tr>`;
    const p = br.p === undefined ? 1 : br.p;
    const cost = br.cost ? `pay ${money(br.cost)}` : 'free';
    const outcome = p >= 1
      ? describeEffects(br.onSuccess, targetName)
      : `${Math.round(p * 100)}%: ${describeEffects(br.onSuccess, targetName)} &middot; else: ${describeEffects(br.onFail, targetName)}`;
    return `<tr><td><b>${label}</b></td><td>${cost}</td><td>${outcome}</td></tr>`;
  }

  const RIVAL_LINES = {
    moneyPlus: [
      '{name} announces a bequest; the flag flies at half-mast, briskly.',
      '{name} has come into money. The Ledger extends congratulations of the usual sincerity.',
    ],
    moneyMinus: [
      '{name} reports ‘a challenging year for the estate’. The estate is a roof.',
      'Builders’ vans at {name}. The Ledger counts four.',
    ],
    qualPlus: [
      '{name} has made an appointment it describes as ‘transformative’. The Ledger will measure.',
    ],
    qualMinus: [
      'A departure at {name}, described as ‘amicable’ by everyone except the departed.',
    ],
  };

  let game = null;          // current Game
  let pre = null;           // startRound() view for the current year
  let rep = null;           // admissions report for the current year
  // Which edition of the world to play. ?world=scheme preselects.
  let chosenWorld = new URLSearchParams(location.search).get('world') === 'scheme' ? 'scheme' : 'market';
  const inScheme = () => game && game.P.world === 'scheme';
  const WORLD_NAME = { market: 'The Open Market', scheme: 'The National Admissions Scheme' };
  let prevRanks = null;     // last year's ranks by uni index (for arrows)
  let dec = { feeS: 8, thrS: 55, feeH: 8, thrH: 55, schS: 0, schH: 0 };   // sticky controls
  let inv = { IRS: 0, ITS: 0, IRH: 0, ITH: 0 };

  /* ------------------------------ helpers ------------------------------ */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money = x => '£' + (Math.round(x * 10) / 10).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k';
  const n1 = x => (Math.round(x * 10) / 10).toFixed(1);
  const ord = r => r + ['st', 'nd', 'rd', 'th'][r - 1];
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

  const THIN_ICE = [
    '(thin ice)',
    '(the bursar opens the post standing up)',
    '(the silver has been counted, twice)',
  ];
  function dateline() {
    const u = game.unis[game.playerIndex];
    return `<div class="dateline">
      <span>Year ${game.round} of ${P.rounds} &middot; ${esc(u.name)} &middot; ${WORLD_NAME[game.P.world]}</span>
      <span>Endowment <b class="num">${money(u.E)}</b>${u.E < 30 ? ` <b class="red">${pick(THIN_ICE)}</b>` : ''}</span>
      <button class="resign" id="resign">resign the post</button>
    </div>`;
  }

  function phaseStrip(active) {
    return `<div class="phase-strip">
      <div class="ph ${active === 1 ? 'on' : ''}">I &middot; The Admissions Desk</div>
      <div class="ph ${active === 2 ? 'on' : ''}">II &middot; The Bursar&rsquo;s Office</div>
      <div class="ph ${active === 3 ? 'on' : ''}">III &middot; The Year in Review</div>
    </div>`;
  }

  /* The morning's news. Built ONCE per round (in nextYear) so the LATE
   * EXTRA interstitial and the in-brief recap card tell the same story —
   * pick() is flavour-only Math.random and must not re-roll between the
   * two surfaces. Neither surface touches the game RNGs. */
  let newsData = null;

  // Effect in bold. Player quality effects use the running form
  // "STEM research −3, from 24.3 to 21.3" — values are read at build time,
  // immediately after startRound, when u[q] is the fresh post-event value.
  function effectHtml(ev) {
    if (ev.deltaE !== undefined) {
      return `<b class="num ${ev.deltaE < 0 ? 'red' : 'green'}">${ev.deltaE < 0 ? '&minus;' : '+'}${money(Math.abs(ev.deltaE))}</b>`;
    }
    const u = game.unis[ev.index];
    return '<b>' + Object.entries(ev.deltaQ).map(([q, d]) => {
      const now = u[q];
      const oldV = Math.max(0, now - d);
      return `${QLABEL[q]} ${d < 0 ? '&minus;' : '+'}${Math.abs(d)}, from ${n1(oldV)} to ${n1(now)}`;
    }).join('; ') + '</b>';
  }

  function buildNews() {
    newsData = (pre.events || []).map(ev => {
      const u = game.unis[ev.index];
      if (ev.index === game.playerIndex) {
        const eff = effectHtml(ev);
        const silver = ev.truncated ? ' The College has sold the silver.' : '';
        return {
          me: true,
          para: `${EVENT_TEXT[ev.id]}${silver} ${eff}`,
          line: `${esc(u.name)} &mdash; ${eff}${ev.truncated ? ' The silver is sold.' : ''}`,
        };
      }
      const positive = ev.deltaE !== undefined
        ? ev.deltaE >= 0
        : Object.values(ev.deltaQ).reduce((a, b) => a + b, 0) >= 0;
      const set = ev.deltaE !== undefined
        ? (positive ? RIVAL_LINES.moneyPlus : RIVAL_LINES.moneyMinus)
        : (positive ? RIVAL_LINES.qualPlus : RIVAL_LINES.qualMinus);
      const line = pick(set).replace('{name}', esc(u.name));
      return { me: false, para: line, line };
    });
    // The College's own news leads the page.
    newsData.sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
  }

  /* LATE EXTRA — full-viewport interstitial shown before the desk in any
   * year with news. Player events as full paragraphs; rivals as their
   * one-liners. Dismiss reveals the admissions desk beneath. */
  function showExtra(then) {
    const stale = document.getElementById('extraBack');
    if (stale) stale.remove();
    // The particulars: who was hit, what changed, by how much. Player
    // effects in full; rivals' quality effects are public (the table
    // prints them), rivals' money stays their business.
    const partRows = (pre.events || []).map(ev => {
      const u = game.unis[ev.index];
      const mine = ev.index === game.playerIndex;
      let effect;
      if (ev.deltaE !== undefined) {
        effect = mine
          ? `endowment ${ev.deltaE < 0 ? '&minus;' : '+'}${money(Math.abs(ev.deltaE))}`
          : (ev.deltaE >= 0 ? 'money in; the sum is theirs to know' : 'money out; the sum is theirs to know');
      } else {
        effect = Object.entries(ev.deltaQ)
          .map(([q, d]) => `${QLABEL[q]} ${d < 0 ? '&minus;' : '+'}${Math.abs(d)}`).join(', ');
      }
      return `<tr class="${mine ? 'me' : ''}"><td>${esc(u.name)}${mine ? ' <b>&#9670;</b>' : ''}</td><td>${effect}</td></tr>`;
    }).join('');
    const particulars = partRows ? `
      <table class="report extra-tbl">
        <thead><tr><th>The particulars</th><th>Effect</th></tr></thead>
        <tbody>${partRows}</tbody>
      </table>` : '';
    const div = document.createElement('div');
    div.className = 'extra-backdrop';
    div.id = 'extraBack';
    div.innerHTML = `
      <div class="extra-card" role="dialog" aria-modal="true" aria-label="Late extra">
        <div class="extra-mast">The Morning Ledger &middot; Late Extra</div>
        <div class="extra-body">
          ${newsData.map(n => n.me
            ? `<p class="news-own">${n.para}</p>`
            : `<p class="news-rival">${n.para}</p>`).join('')}
          ${particulars}
        </div>
        <button class="btn oxblood" id="extraRead">Read on</button>
      </div>`;
    document.body.appendChild(div);
    div.querySelector('#extraRead').addEventListener('click', () => {
      div.remove();
      if (then) then();
    });
  }

  /* The Ledger's post: a choice card. The player decides before the year
   * proceeds; the outcome (from the engine) is shown at once, the desk
   * re-rendered after, since cards move money and quality. */
  function showChoiceCard() {
    const c = pre.choice;
    const txt = CHOICE_TEXT[c.id] || { head: c.id, body: '', accept: 'Accept', decline: 'Decline' };
    const tName = c.target ? c.target.name : null;
    const body = txt.body.replace(/\{T\}/g, tName ? esc(tName) : 'a rival');
    const stale = document.getElementById('choiceBack');
    if (stale) stale.remove();
    const div = document.createElement('div');
    div.className = 'extra-backdrop';
    div.id = 'choiceBack';
    div.innerHTML = `
      <div class="extra-card" role="dialog" aria-modal="true" aria-label="The Ledger's post">
        <div class="extra-mast">The Morning Ledger &middot; By Appointment</div>
        <div class="extra-body">
          <p class="news-own"><b>${txt.head}.</b> ${body}</p>
          <table class="report extra-tbl">
            <thead><tr><th></th><th>Price</th><th>Consequence</th></tr></thead>
            <tbody>
              ${describeBranch(txt.accept, c.accept, tName)}
              ${describeBranch(txt.decline, c.decline, tName)}
            </tbody>
          </table>
        </div>
        <div class="choice-btns">
          <button class="btn oxblood" id="chAccept">${txt.accept}</button>
          <button class="btn" id="chDecline">${txt.decline}</button>
        </div>
      </div>`;
    document.body.appendChild(div);
    const resolve = (accepted) => {
      const rec = game.submitChoice(accepted);
      let outcome;
      if (accepted) outcome = rec.success ? txt.success : txt.fail;
      else if (c.decline) outcome = rec.success ? txt.declineOk : txt.declineFail;
      const numbers = [];
      if (rec.cost) numbers.push(`&minus;${money(rec.cost)}`);
      if (rec.deltaE) numbers.push(`${rec.deltaE > 0 ? '+' : '&minus;'}${money(Math.abs(rec.deltaE))}`);
      if (rec.deltaQ) for (const [q, d] of Object.entries(rec.deltaQ)) numbers.push(`${QLABEL[q]} ${d > 0 ? '+' : '&minus;'}${Math.abs(d)}`);
      if (rec.targetDeltaQ && tName) for (const [q, d] of Object.entries(rec.targetDeltaQ)) numbers.push(`${esc(tName)} ${QLABEL[q]} ${d > 0 ? '+' : '&minus;'}${Math.abs(d)}`);
      const numLine = numbers.length ? ` <b>${numbers.join(' &middot; ')}</b>` : '';
      // The record persists on the desk's in-brief card.
      if (outcome !== undefined) {
        newsData.push({ me: true, para: '', line: `${txt.head} &mdash; ${outcome}${numLine}` });
      }
      if (outcome === undefined) { div.remove(); renderAdmissions(); return; }
      div.querySelector('.extra-body').innerHTML = `<p class="news-own">${outcome}${numLine}</p>`;
      div.querySelector('.choice-btns').innerHTML = `<button class="btn oxblood" id="chRead">Read on</button>`;
      div.querySelector('#chRead').addEventListener('click', () => { div.remove(); renderAdmissions(); });
    };
    div.querySelector('#chAccept').addEventListener('click', () => resolve(true));
    div.querySelector('#chDecline').addEventListener('click', () => resolve(false));
  }

  /* In-brief recap on the desk: one line per event, so the record persists
   * after the extra is dismissed. */
  function newsCard() {
    if (!newsData || !newsData.length) return '';
    const items = newsData.map(n =>
      `<p class="news-line ${n.me ? 'news-own-line' : ''}">${n.line}</p>`).join('');
    return `<section class="card news">
      <div class="card-head"><span>The morning&rsquo;s news &mdash; in brief</span><span class="kicker">Year ${game.round}</span></div>
      <div class="card-body">${items}</div>
    </section>`;
  }

  function leagueTableHtml(table, opts = {}) {
    const hasReckon = table.some(r => r.reckon !== undefined);
    const rows = table.map(r => {
      const me = game && r.index === game.playerIndex;
      let delta = '';
      if (prevRanks) {
        const d = prevRanks[r.index] - r.rank;
        delta = d > 0 ? `<span class="delta up">&#9650;${d}</span>` : d < 0 ? `<span class="delta down">&#9660;${-d}</span>` : '<span class="delta">&ndash;</span>';
      }
      // Overnight-revision daggers: quality cells changed by this morning's
      // events (admissions desk only; opts.daggers maps index -> Set(keys)).
      const dg = q => (opts.daggers && opts.daggers[r.index] && opts.daggers[r.index].has(q))
        ? '<sup class="dag">&dagger;</sup>' : '';
      return `<tr class="${me ? 'me' : ''} ${r.broke ? 'broke' : ''}">
        <td class="rank num">${r.rank}</td>
        <td class="uname">${esc(r.name)}${me ? ' <b>&#9670;</b>' : ''}${r.broke ? ' &dagger;' : ''}</td>
        <td class="num">${n1(r.RS)}${dg('RS')}</td><td class="num">${n1(r.TS)}${dg('TS')}</td>
        <td class="num">${n1(r.RH)}${dg('RH')}</td><td class="num">${n1(r.TH)}${dg('TH')}</td>
        <td class="num total">${n1(r.total)}</td>
        ${hasReckon ? `<td class="num">+${n1(r.reckon)}</td><td class="num total">${n1(r.grand)}</td>` : ''}
        <td>${delta}</td>
      </tr>`;
    }).join('');
    return `<div class="scrollx"><table class="league">
      ${opts.caption ? `<caption>${opts.caption}</caption>` : ''}
      <thead><tr><th>#</th><th>Institution</th><th>R<sub>S</sub></th><th>T<sub>S</sub></th><th>R<sub>H</sub></th><th>T<sub>H</sub></th><th>Total</th>${hasReckon ? '<th>Reckoning</th><th>Grand</th>' : ''}<th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="tbl-foot">Research (R) and Teaching (T) quality by field, as assessed by the Ledger. Rank by ${hasReckon ? 'grand total' : 'total'}; ties broken by matters the Ledger does not discuss.${hasReckon ? ` The Founders&rsquo; Reckoning credits 1 point per ${money(P.reckonPerPoint)} of endowment remaining, to a limit of ${P.reckonCapPoints} &mdash; beyond that, the auditors regard cash as evidence of a want of imagination.` : ''}${opts.daggers ? ' <sup class="dag">&dagger;</sup>&nbsp;revised overnight; see the morning&rsquo;s extra.' : ''}</div>`;
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
      <div class="editions">
        <button class="edition ${chosenWorld === 'market' ? 'on' : ''}" data-w="market">
          <b>The Open Market</b>
          <span>Set your own fees, take everyone who accepts. Applicants go where they can afford; over-offering is the classic way to die.</span>
        </button>
        <button class="edition ${chosenWorld === 'scheme' ? 'on' : ''}" data-w="scheme">
          <b>The National Admissions Scheme</b>
          <span>Fees fixed by the Regulator at ${money(P.schemeFee)} a head. A central match assigns students; you declare a quota and a standard. Same seats, same rent &mdash; but the match never sends you a student too many.</span>
        </button>
      </div>
      <div class="prospect">${rows}</div>
      <details class="rules">
        <summary>How the game is played &mdash; the standing rules</summary>
        <div class="card-body">
          <ul>
            <li><b>Two editions, one cost of seats.</b> In both worlds each department keeps ${P.capacity} seats, and every seat costs <b>${money(P.seatRent)}</b> a year, filled or not. In <b>the Open Market</b> you set fees and thresholds, applicants go where they can afford, and every acceptance must be honoured &mdash; each student beyond the ${P.capacity} seats costs <b>${money(P.cOver)}</b>, and you cannot refuse them. In <b>the National Admissions Scheme</b>, fees are fixed by the Regulator at ${money(P.schemeFee)} for everyone, means do not matter, and a central algorithm (deferred acceptance) assigns each student to the best-ranked department that will hold them: you report a quota (0&ndash;${P.capacity}) and a threshold, and the match never exceeds the quota. Same cost of seats everywhere; the Market can overflow them, the Scheme can only leave them empty.</li>
            <li><b>Each year, two decisions.</b> First the <b>Admissions Desk</b>: for each field (STEM and HSS) you set an entry <b>threshold</b> (every applicant at or above it receives an offer) and a <b>fee</b>. Then the <b>Bursar&rsquo;s Office</b>: you invest in research and teaching quality, per field.</li>
            <li><b>Applicants.</b> Forty fresh school-leavers apply each year. Each has a school score, a preferred field, a taste for research prestige, and a private budget. They apply everywhere they can afford, and enrol wherever their offers look best (teaching quality plus their personal weight on research). They stay one year, pay one fee, and leave.</li>
            <li><b>Capacity.</b> Each department teaches up to <b>8</b> students at no extra cost. You must take everyone who accepts your offer; each student beyond 8 costs <b>${money(P.cOver)}</b> in emergency provision. Over-offering is the classic way to die.</li>
            <li><b>Money.</b> Fees are paid up front &mdash; the year&rsquo;s income sits in the endowment before the Bursar spends a penny, and whatever he does not spend earns ${Math.round(P.interest * 100)}% interest, fees included. If your endowment cannot cover the year&rsquo;s seats bill, the College is bankrupt and the game ends.</li>
            <li><b>Quality.</b> Investment raises quality with diminishing returns, and takes effect the following year. All quality decays ${Math.round((1 - P.delta) * 100)}% a year if unattended. Teaching quality also drifts with the calibre of the students you actually admit, relative to the national average of ${P.sMean}.</li>
            <li><b>Merit scholarships.</b> In either world you may endow an annual scholarship fund per field. It raises your appeal &mdash; but only to students scoring ${P.schBar} or better, only with diminishing returns, and it is spent in full whether any of them comes. The only price competition the Scheme permits; in the Market, a way to buy calibre instead of volume.</li>
            <li><b>The post.</b> Some mornings the Ledger&rsquo;s courier brings the College a proposition &mdash; a restless professor at a rival house, a donor with conditions, an insurer with a barometer. You alone receive these; the odds and sums are printed on the card, and the arithmetic is your business. Ignored post resolves itself, not always kindly.</li>
            <li><b>Fashion.</b> Field preferences drift slowly toward whichever field boasts higher research quality across the sector.</li>
            <li><b>Information.</b> The League table is public. Rivals&rsquo; fees, thresholds, enrolments and endowments are not. The Ledger publishes no figures on family means &mdash; though a shrewd reader may suspect that money and marks travel together, and your own books reveal, year by year, who could afford you.</li>
            <li><b>The end &mdash; the Founders&rsquo; Reckoning.</b> After ${P.rounds} years the final League is printed, and endowments finally count: each house is credited 1 league point per ${money(P.reckonPerPoint)} still in its coffers, to a limit of ${P.reckonCapPoints} points. Money is never worthless &mdash; least of all the incumbents&rsquo; hoards. Score = starting rank &minus; final rank.</li>
          </ul>
        </div>
      </details>
      <div class="footer-note">Determined readers note: add <b>?seed=1234</b> to the address and the Ledger reprints the identical twenty years &mdash; same students, same news, same luck. Practice, in other words, is available.</div>
      <div class="footer-note">The Morning Ledger University Guide &middot; entirely fictional &middot; one file</div>
      <div class="footer-note sig"><a href="https://steffenhuck.github.io">steffen huck</a></div>
    `);
    els('.edition').forEach(b => b.addEventListener('click', () => {
      chosenWorld = b.dataset.w;
      els('.edition').forEach(x => x.classList.toggle('on', x === b));
    }));
    els('.pick-btn').forEach(b => b.addEventListener('click', () => {
      const idx = +b.dataset.idx;
      // Optional ?seed= query parameter makes a season reproducible;
      // otherwise each season is random. The seed in play is printed in
      // the footer either way.
      const seedRaw = new URLSearchParams(location.search).get('seed');
      const seed = seedRaw === null || seedRaw.trim() === ''
        ? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0)
        : (parseInt(seedRaw, 10) >>> 0 || 1);
      startGame(idx, seed);
    }));
  }

  // Opening admissions defaults per college — roughly each house's native
  // AI opening, so year 1 isn't a guaranteed empty hall. (With the old flat
  // fee 8 / threshold 55, the bottom college enrolled nobody in year 1 in
  // 100% of 200 test seeds: every offer was dominated by Millbrook.)
  const OPENING = {
    market: [
      { fee: 11,  thr: 58 },  // Harkness
      { fee: 12,  thr: 62 },  // Wexford
      { fee: 6.5, thr: 45 },  // Millbrook
      { fee: 5.5, thr: 35 },  // Greyfriars
    ],
    scheme: [
      { q: 7, thr: 58 },      // Harkness
      { q: 5, thr: 66 },      // Wexford
      { q: 8, thr: 35 },      // Millbrook
      { q: 6, thr: 35 },      // Greyfriars
    ],
  };

  function startGame(idx, seed) {
    game = new Game({ seed, playerIndex: idx, params: { world: chosenWorld } });
    prevRanks = null;
    const o = OPENING[chosenWorld][idx];
    dec = chosenWorld === 'scheme'
      ? { qS: o.q, thrS: o.thr, qH: o.q, thrH: o.thr, schS: 0, schH: 0 }
      : { feeS: o.fee, thrS: o.thr, feeH: o.fee, thrH: o.thr, schS: 0, schH: 0 };
    nextYear();
  }

  function nextYear() {
    pre = game.startRound();
    rep = null;
    buildNews();
    renderAdmissions();
    // Morning order: the news extra first, then the post (a choice card,
    // if one came); the desk lies rendered beneath and is re-rendered
    // after a card resolves, since cards move money and quality.
    if (newsData.length) showExtra(pre.choice ? showChoiceCard : null);
    else if (pre.choice) showChoiceCard();
  }

  /* ------------------------- my college card --------------------------- */
  function myCard() {
    const u = game.unis[game.playerIndex];
    const qmax = 60;
    const bar = (v, cls) => `<div class="qbar ${cls}"><i style="width:${Math.min(100, 100 * v / qmax)}%"></i></div>`;
    const last = u.lastReport;
    const intake = last ? `
      <table class="report" style="margin-top:10px">
        <thead><tr><th>Last year</th><th>${inScheme() ? 'Proposals' : 'Applied'}</th><th>${inScheme() ? 'Seats' : 'Offers'}</th><th>${inScheme() ? 'Placed' : 'Enrolled'}</th><th>Avg score</th></tr></thead>
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
        <div class="notice">${pick([
          'The Ledger publishes no figures on family means &mdash; though money and marks are rumoured to travel together, and your own books show, year by year, who could afford you.',
          'On applicants&rsquo; means the Ledger is silent, as is proper &mdash; but marks and money keep close company, and your own registry remembers who could afford you last year.',
        ])}</div>
      </div>
    </section>`;
  }

  /* --------------------------- admissions ------------------------------ */
  // Quality cells revised by this morning's events, for the dagger marks.
  function morningDaggers() {
    const map = {};
    for (const ev of (pre.events || [])) {
      if (ev.deltaQ) map[ev.index] = new Set(Object.keys(ev.deltaQ));
    }
    return Object.keys(map).length ? map : null;
  }

  function renderAdmissions() {
    const u = game.unis[game.playerIndex];
    const scheme = inScheme();
    const fieldBox = f => {
      const last = u.lastReport ? u.lastReport[f] : null;
      const secondCtl = scheme
        ? `<div class="ctl">
            <span class="lbl">Quota reported to the Scheme (0&ndash;${P.capacity})</span>
            <div class="stepper" data-kind="q" data-f="${f}">
              <button data-d="-8">&#171;</button><button data-d="-1">&minus;</button>
              <span class="val num" id="q${f}">${dec['q' + f]}</span>
              <button data-d="1">+</button><button data-d="8">&#187;</button>
            </div>
          </div>
          <div class="feefixed">Fee: set by the Regulator at ${money(P.schemeFee)} a head.</div>`
        : `<div class="ctl">
            <span class="lbl">Annual fee</span>
            <div class="stepper" data-kind="fee" data-f="${f}">
              <button data-d="-2">&#171;</button><button data-d="-0.5">&minus;</button>
              <span class="val num" id="fee${f}">${money(dec['fee' + f])}</span>
              <button data-d="0.5">+</button><button data-d="2">&#187;</button>
            </div>
          </div>`;
      const demand = last
        ? (scheme
            ? `Last year: <b class="num">${last.applied}</b> proposed &middot; placed <b class="num">${last.matric}</b> of <b class="num">${last.offers}</b> seats${last.cutoff != null ? ` &middot; cutoff <b class="num">${n1(last.cutoff)}</b>` : ''}${last.matric < last.offers ? ` <b class="red">(${last.offers - last.matric} empty)</b>` : ''}`
            : `Last year: <b class="num">${last.applied}</b> applied &middot; <b class="num">${last.offers}</b> offers out &middot; <b class="num">${last.matric}</b> enrolled${last.matric > P.capacity ? ` <b class="red">(${last.matric - P.capacity} over capacity)</b>` : ''}`)
        : 'No demand history yet.';
      const schCtl = `<div class="ctl">
          <span class="lbl">Merit scholarships (annual fund)</span>
          <div class="stepper" data-kind="sch" data-f="${f}">
            <button data-d="-5">&#171;</button><button data-d="-1">&minus;</button>
            <span class="val num" id="sch${f}">${money(dec['sch' + f])}</span>
            <button data-d="1">+</button><button data-d="5">&#187;</button>
          </div>
        </div>`;
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
        ${secondCtl}
        ${schCtl}
        <div class="demandline">${demand}</div>
      </div>`;
    };
    setView(`
      ${masthead('Published every autumn by The Morning Ledger', true)}
      ${dateline()}
      ${phaseStrip(1)}
      ${newsCard()}
      <div class="cols">
        <div class="stack">
          <section class="card plain">
            <div class="card-head"><span>The League</span><span class="kicker">Year ${game.round}</span></div>
            <div class="card-body">${leagueTableHtml(pre.table, { daggers: morningDaggers() })}</div>
          </section>
          ${cohortCard()}
        </div>
        <div class="stack">
          <section class="card admissions">
            <div class="card-head"><span>Step I &mdash; The Admissions Desk</span><span class="kicker">${scheme ? 'seats &amp; standards' : 'offers &amp; fees'}</span></div>
            <div class="card-body">
              <div class="fields">${fieldBox('S')}${fieldBox('H')}</div>
              <div class="notice warn">${scheme
                ? `The Scheme&rsquo;s algorithm assigns each student to the best-ranked department that will hold them; your quota is never exceeded. The rent &mdash; ${money(P.seatRent)} on each of your ${P.capacity * 2} seats &mdash; falls due regardless: seats the match does not fill are pure loss, and the quota costs nothing to report.`
                : `Capacity is ${P.capacity} per department, and each seat costs ${money(P.seatRent)} a year, filled or not. Every offer that is accepted must be honoured; each enrolee beyond ${P.capacity} costs ${money(P.cOver)}. Applicants who can afford you and clear your threshold get an offer &mdash; all of them.`}</div>
              <div class="notice">${scheme
                ? `<b>How the match reads their minds.</b> Each student ranks the four houses by teaching quality plus their personal taste for research. A merit fund of &pound;F adds ${n1(P.schAlpha)}&middot;&radic;F to your appeal, but only for students scoring ${P.schBar} or better &mdash; and the fund is spent in full whether any of them comes. Your calibre cutoff shows where your appeal ran out.`
                : `<b>How applicants choose.</b> They apply wherever the fee is within their means, and enrol where teaching quality plus their personal taste for research looks best: fees decide who <i>can</i> come, quality decides who <i>does</i>. A merit fund of &pound;F adds ${n1(P.schAlpha)}&middot;&radic;F to your appeal for students scoring ${P.schBar} or better, and is spent in full whether any of them comes.${(!scheme && u.lastReport && (u.lastReport.S.offers + u.lastReport.H.offers) > 0) ? ` Last year <b class="num">${Math.round(100 * (u.lastReport.S.matric + u.lastReport.H.matric) / (u.lastReport.S.offers + u.lastReport.H.offers))}%</b> of your offers were taken up; the rest enrolled where they liked it better.` : ''}`}</div>
              <button class="btn oxblood" id="post">${scheme ? 'File the return with the Scheme' : 'Post the prospectus &amp; make offers'}</button>
            </div>
          </section>
          ${myCard()}
        </div>
      </div>
      <div class="footer-note">Printed under licence &numero; ${game.seed} &middot; The Morning Ledger University Guide</div>
    `);
    els('.stepper button').forEach(b => b.addEventListener('click', () => {
      const box = b.closest('.stepper');
      const f = box.dataset.f, d = parseFloat(b.dataset.d);
      if (box.dataset.kind === 'thr') {
        dec['thr' + f] = Math.max(20, Math.min(100, dec['thr' + f] + d));
        el('#thr' + f).textContent = dec['thr' + f];
      } else if (box.dataset.kind === 'q') {
        dec['q' + f] = Math.max(0, Math.min(P.capacity, Math.round(dec['q' + f] + d)));
        el('#q' + f).textContent = dec['q' + f];
      } else if (box.dataset.kind === 'sch') {
        dec['sch' + f] = Math.max(0, Math.min(P.schMax, Math.round(dec['sch' + f] + d)));
        el('#sch' + f).textContent = money(dec['sch' + f]);
      } else {
        dec['fee' + f] = Math.max(0, Math.min(P.feeCap, Math.round((dec['fee' + f] + d) * 2) / 2));
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

    const QKEY = { IRS: 'RS', ITS: 'TS', IRH: 'RH', ITH: 'TH' };
    const invRow = (key, label, field) => `
      <div class="invrow" data-key="${key}">
        <div class="lbl">${label}<b>${field}</b><span class="upkeep num">upkeep ${money(maintInvest(u[QKEY[key]], P))}</span></div>
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
                <thead><tr><th>Field</th><th>${inScheme() ? 'Proposals' : 'Applied'}</th><th>${inScheme() ? 'Seats' : 'Offers'}</th><th>${inScheme() ? 'Placed' : 'Enrolled'}</th><th>Avg</th><th>Fees</th><th>Seats bill</th></tr></thead>
                <tbody>
                  ${reportRow('S')}${reportRow('H')}
                  ${rep.sch > 0 ? `<tr><td>Scholarship fund</td><td colspan="5"></td><td class="num red">&minus;${money(rep.sch)}</td></tr>` : ''}
                  <tr class="sumrow"><td>Net of the year&rsquo;s bills</td><td colspan="5"></td><td class="num ${rep.F - rep.C < 0 ? 'red' : 'green'}">${money(rep.F - rep.C)}</td></tr>
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
              <div class="budgetline decomp"><span>Endowment ${money(rep.net - rep.F + rep.C)} + the year&rsquo;s fees ${money(rep.F)}${rep.C - rep.sch > 0 ? ` &minus; seats bill ${money(rep.C - rep.sch)}` : ''}${rep.sch > 0 ? ` &minus; scholarships ${money(rep.sch)}` : ''} = funds at hand</span><b class="num">${money(budget)}</b></div>
              <div class="budgetline" style="border-top:1px dotted var(--rule)"><span>Uncommitted (earns ${Math.round(P.interest * 100)}%, fees included, and counts at the Founders&rsquo; Reckoning: 1 league point per ${money(P.reckonPerPoint)} held at the end, to a limit of ${P.reckonCapPoints})</span><b class="num" id="remain">${money(budget)}</b></div>
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
      <div class="footer-note">Printed under licence &numero; ${game.seed} &middot; The Morning Ledger University Guide</div>
    `);

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
        const next = project(key, v);
        const proj = row.querySelector('.proj');
        proj.textContent = `${n1(q)} → ${n1(next)}`;
        proj.classList.toggle('up', next >= q);
        proj.classList.toggle('down', next < q);
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
      // Snapshot before the engine applies decay/investment/intake, so the
      // review can show old -> new with an exact decomposition.
      const uu = game.unis[game.playerIndex];
      const oldQ = { RS: uu.RS, TS: uu.TS, RH: uu.RH, TH: uu.TH };
      const res = game.submitSpend(inv);
      prevRanks = {};
      pre.table.forEach(r => { prevRanks[r.index] = r.rank; });
      renderReview(oldQ, res);
    });
    el('#resign').addEventListener('click', resign);
    refresh();
  }

  /* --------------------------- year in review -------------------------- */
  function renderReview(oldQ, res) {
    const u = game.unis[game.playerIndex];
    const invA = u._lastInv; // investment as actually applied by the engine
    const done = !!(res && res.done);
    const newTable = done ? res.finalTable : game.leagueTable();
    const myOldRank = pre.table.find(r => r.index === game.playerIndex).rank;
    const myNewRank = newTable.find(r => r.index === game.playerIndex).rank;

    const ROWS = [
      ['RS', 'IRS', 'Research &middot; STEM', null],
      ['TS', 'ITS', 'Teaching &middot; STEM', 'S'],
      ['RH', 'IRH', 'Research &middot; HSS', null],
      ['TH', 'ITH', 'Teaching &middot; HSS', 'H'],
    ];
    const rows = ROWS.map(([q, ik, label, fld]) => {
      const oldV = oldQ[q], newV = u[q];
      const decay = -(1 - P.delta) * oldV;
      const invGain = g(invA[ik]);
      const parts = [`decay &minus;${n1(-decay)}`, `investment +${n1(invGain)}`];
      let intake = 0;
      if (fld && rep[fld].matric > 0) {
        intake = P.kappa * (rep[fld].sbar - P.sMean);
        parts.push(`intake ${intake < 0 ? '&minus;' : '+'}${n1(Math.abs(intake))}`);
      }
      if (Math.abs(oldV + decay + invGain + intake - newV) > 1e-6) parts.push('(floored at nought)');
      return `<tr>
        <td>${label}<span class="dcomp">${parts.join(' &middot; ')}</span></td>
        <td class="num">${n1(oldV)}</td><td>&rarr;</td>
        <td class="num ${newV >= oldV ? 'green' : 'red'}"><b>${n1(newV)}</b></td>
      </tr>`;
    }).join('');

    // Money prose (all from the player's own books).
    const spent = invA.IRS + invA.ITS + invA.IRH + invA.ITH;
    const interest = u.E - (rep.net - spent);
    // Opening balance = endowment at the admissions desk (already including
    // any of the morning's money news). opening + F - C - I + interest = E.
    const opening = rep.net - rep.F + rep.C;
    const hadMoneyNews = (pre.events || []).some(e => e.index === game.playerIndex && e.deltaE !== undefined);
    const moneyProse = `The College opened the year with ${money(opening)}; fees brought ${money(rep.F)}${rep.C - rep.sch > 0 ? `, the seats bill took ${money(rep.C - rep.sch)}` : ''}${rep.sch > 0 ? `, the scholarship fund ${money(rep.sch)}` : ''}; the Bursar committed ${money(spent)}, and interest added ${money(Math.max(0, interest))}. The endowment stands at <b class="num">${money(u.E)}</b>.${hadMoneyNews ? ' The opening figure includes the year&rsquo;s news.' : ''}`;

    // Rank prose, with variants; name rivals passed or passing.
    const newRankOf = i => newTable.find(r => r.index === i).rank;
    const oldRankOf = i => pre.table.find(r => r.index === i).rank;
    const rivals = game.unis.filter(x => x.index !== game.playerIndex);
    const overtaken = rivals.filter(x => oldRankOf(x.index) < myOldRank && newRankOf(x.index) > myNewRank);
    const overtakers = rivals.filter(x => oldRankOf(x.index) > myOldRank && newRankOf(x.index) < myNewRank);
    let rankProse;
    if (myNewRank < myOldRank) {
      rankProse = myNewRank === 1
        ? pick([
            'First. The Ledger&rsquo;s position is that it saw promise all along, and its archives are unavailable.',
            'First of the League. Somewhere in the Ledger&rsquo;s offices, a wager is quietly being settled.',
          ])
        : pick([
            `The College rises to ${ord(myNewRank)}. The Ledger has checked its arithmetic twice.`,
            `Up to ${ord(myNewRank)}. The Ledger prints the fact and withholds the adjective.`,
          ]);
      if (overtaken.length) rankProse += ` ${overtaken.map(x => esc(x.name)).join(' and ')} has been passed, and describes the year as &lsquo;transitional&rsquo;.`;
    } else if (myNewRank > myOldRank) {
      rankProse = pick([
        `The College slips to ${ord(myNewRank)}. The Ledger resists satisfaction, briefly.`,
        `Down to ${ord(myNewRank)}. The Ledger&rsquo;s sympathy is sincere, and brief.`,
      ]);
      if (overtakers.length) rankProse += ` ${overtakers.map(x => esc(x.name)).join(' and ')} passes the College, and mentions it.`;
    } else {
      rankProse = pick([
        'The table is unmoved. The Ledger admires consistency, within reason.',
        'No movement in the League. The porter says it could be worse, and the porter is right.',
      ]);
    }

    setView(`
      ${masthead('Published every autumn by The Morning Ledger', true)}
      ${dateline()}
      ${phaseStrip(3)}
      <div class="cols even">
        <div class="stack">
          <section class="card plain">
            <div class="card-head"><span>Step III &mdash; The Year in Review</span><span class="kicker">Year ${game.round}</span></div>
            <div class="card-body">
              <div class="scrollx"><table class="report">
                <thead><tr><th>Quality</th><th>was</th><th></th><th>now</th></tr></thead>
                <tbody>${rows}</tbody>
              </table></div>
            </div>
          </section>
        </div>
        <div class="stack">
          <section class="card plain">
            <div class="card-head"><span>The Ledger&rsquo;s summary</span><span class="kicker">leader column</span></div>
            <div class="card-body">
              <p class="notice" style="margin-top:0">${moneyProse}</p>
              <p class="notice">${rankProse}</p>
              <button class="btn" id="proceed">${done ? 'Read the final edition' : `Proceed to Year ${game.round + 1}`}</button>
            </div>
          </section>
        </div>
      </div>
      <div class="footer-note">Printed under licence &numero; ${game.seed} &middot; The Morning Ledger University Guide</div>
    `);
    el('#proceed').addEventListener('click', () => {
      if (done) renderEnd({ finalTable: res.finalTable });
      else nextYear();
    });
    el('#resign').addEventListener('click', resign);
  }

  function intakeRemark() {
    const bits = [];
    for (const f of ['S', 'H']) {
      const d = rep[f];
      if (d.matric === 0) bits.push(`${FIELD_SHORT[f]} admitted nobody &mdash; no fees, and no effect on teaching either way`);
      else if (d.sbar >= P.sMean + 5) bits.push(`${FIELD_SHORT[f]}&rsquo;s intake (avg ${n1(d.sbar)}) flatters its teaching`);
      else if (d.sbar <= P.sMean - 5) bits.push(`${FIELD_SHORT[f]}&rsquo;s intake (avg ${n1(d.sbar)}) drags teaching by ${n1(P.kappa * (P.sMean - d.sbar))} a year at current calibre`);
    }
    // Scheme: empty declared seats are the ailment (the match never
    // declines an offer — it simply seats students elsewhere).
    if (inScheme()) {
      const empty = ['S', 'H'].filter(f => rep[f].offers >= 4 && rep[f].matric < rep[f].offers / 2);
      if (empty.length) {
        const names = empty.map(f => FIELD_SHORT[f]).join(' and ');
        bits.push(pick([
          `Over half of ${names}&rsquo;s declared seats stood empty &mdash; the algorithm consulted the applicants, and the applicants had other ideas`,
          `${names} reported seats the match did not fill; the rent, the Ledger notes, is indifferent to the distinction`,
        ]));
      }
      return bits.length ? bits.join('; ') + '.' : 'A quiet year for the registry: intake near the national average.';
    }
    // Declined-offers feedback. Uses only the player's own report and the
    // public league table: if some rival's teaching AND research in the
    // field both match or beat ours, the Ledger names the ailment.
    const me = game.unis[game.playerIndex];
    const declined = ['S', 'H'].filter(f => rep[f].offers >= 5 && rep[f].matric < rep[f].offers / 2);
    if (declined.length) {
      const dominated = declined.some(f => pre.table.some(r =>
        r.index !== game.playerIndex && !r.broke &&
        (f === 'S' ? (r.TS >= me.TS && r.RS >= me.RS) : (r.TH >= me.TH && r.RH >= me.RH))));
      const names = declined.map(f => FIELD_SHORT[f]).join('&rsquo;s and ');
      const opener = pick([
        `Most of ${names}&rsquo;s offers were taken up elsewhere`,
        `${names}&rsquo;s offers were, in the main, politely declined`,
      ]);
      bits.push(opener + (dominated
        ? pick([
            ` &mdash; the Ledger observes that ${esc(me.name)} is at present neither the cheapest house nor the best at anything`,
            ` &mdash; a rival, the Ledger notes, currently bests ${esc(me.name)} in both teaching and research there, and the applicants have noticed`,
          ])
        : pick([
            `; applicants with choices exercised them`,
            ` &mdash; the applicants, having choices, chose`,
          ])));
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
      body = `The seats bill could not be met, the doors are chained, and the porters have kept the good chairs. Year ${game.round} of ${P.rounds}.`;
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
      <div class="footer-note">Printed under licence &numero; ${game.seed} &middot; The Morning Ledger University Guide</div>
    `);
    el('#again').addEventListener('click', renderTitle);
  }

  renderTitle();
})();
