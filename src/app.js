(function () {
  'use strict';
  const M = window.Model;
  const R = M.build();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = v => Math.round(v).toLocaleString('en-US');
  const pc = (v, d = 0) => `${(v * 100).toFixed(d)}%`;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pd = s => { const [y, m, d] = s.split('-').map(Number); return `${MON[m - 1]} ${d}, ${y}`; };
  const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n0(Math.abs(v));
  const lc = s => s.charAt(0).toLowerCase() + s.slice(1);

  // ---------------- state ----------------
  const S = { view: 'overview', month: '2026-09', issue: null, payer: null, from: null, type: 'All', tour: null };
  let hintDismissed = false; try { hintDismissed = localStorage.getItem('health-tour-seen') === '1'; } catch (e) { /* storage unavailable */ }
  const memo = {};
  const once = (k, f) => (k in memo ? memo[k] : (memo[k] = f()));
  const monthObj = id => M.MONTHS.find(m => m.id === id);
  const prevMonth = id => { const i = M.MONTHS.findIndex(m => m.id === id); return i > 0 ? M.MONTHS[i - 1] : null; };
  const opp = m => once('opp' + m, () => M.opportunities(R, m));
  const rate = T => T.human / T.total;

  // ---------------- derived data ----------------
  function payers(m) {
    return once('pay' + m, () => {
      const cur = M.payerHealth(R, m); const pm = prevMonth(m); const prev = pm ? M.payerHealth(R, pm.id) : null;
      const idx = byPidPayer(m); const ranked = opp(m).ranked.concat(opp(m).other ? [opp(m).other] : []);
      return cur.map(p => {
        const pr = prev && prev.find(x => x.payer === p.payer);
        const issues = ranked.map(o => ({ o, human: (idx[o.id + '|' + p.payer] || {}).human || 0 })).filter(x => x.human > 0).sort((a, b) => b.human - a.human);
        const change = pr ? p.rate - pr.rate : null; const growth = pr && pr.human ? (p.human - pr.human) / pr.human : null;
        const status = p.rate >= 0.09 || (growth != null && growth >= 0.5) ? 'attention' : p.rate >= 0.06 ? 'watch' : 'healthy';
        return { ...p, prev: pr, change, growth, status, issues, top: issues.find(x => !x.o.other) };
      });
    });
  }
  function byPidPayer(m) {
    return once('idx' + m, () => { const idx = {}; R.forEach(r => { if (r.month !== m) return; const k = r.pid + '|' + r.payer; const v = idx[k] = idx[k] || { cases: 0, human: 0 }; v.cases++; if (r.human) v.human++; }); return idx; });
  }
  function weeklyAll() {
    return once('weeklyAll', () => { const w = M.weekly(R, M.PATTERNS[0].id).map(x => ({ start: x.start, human: 0 })); M.PATTERNS.forEach(p => M.weekly(R, p.id).forEach((x, i) => { w[i].human += x.human; })); return w; });
  }
  function health(m) {
    const T = opp(m).totals; const pm = prevMonth(m);
    if (!pm) return { key: 'baseline', label: 'Baseline month', T, prevT: null };
    const PT = opp(pm.id).totals; const d = rate(T) - rate(PT);
    const key = d > 0.002 ? 'slipping' : d < -0.002 ? 'improving' : 'steady';
    return { key, label: { slipping: 'Slipping', improving: 'Improving', steady: 'Steady' }[key], T, PT, d };
  }
  function briefing(m) {
    const h = health(m); const { ranked, totals: T } = opp(m); const mon = monthObj(m).label.split(' ')[0];
    const out = [];
    if (!h.PT) out.push(`In ${mon}, the AI handled ${pc(1 - rate(T))} of verifications end to end; ${pc(rate(T), 1)} needed a human.`);
    else {
      const pmon = prevMonth(m).label.split(' ')[0];
      const verb = h.key === 'slipping' ? 'slipped' : h.key === 'improving' ? 'improved' : 'held steady';
      out.push(`Automation ${verb} in ${mon}: ${pc(rate(T), 1)} of verifications needed a human, ${h.key === 'steady' ? 'about the same as' : h.key === 'slipping' ? `up from ${pc(rate(h.PT), 1)} in` : `down from ${pc(rate(h.PT), 1)} in`} ${h.key === 'steady' ? pmon : pmon}.`);
      const deltas = ranked.filter(o => o.prevHuman != null).map(o => ({ o, d: o.humanCases - o.prevHuman }));
      const ups = deltas.filter(x => x.d >= 100).sort((a, b) => b.d - a.d).slice(0, 2);
      const downs = deltas.filter(x => x.d <= -100).sort((a, b) => a.d - b.d).slice(0, 1);
      const nm = x => `${lc(x.o.reason)} at ${x.o.topPayer && x.o.topPayer.share >= 0.6 ? x.o.topPayer.name : 'several insurers'} (${signed(x.d)} cases)`;
      if (ups.length) out.push(`${ups.length > 1 ? 'Two issues drove the rise' : 'One issue drove the rise'}: ${ups.map(nm).join(' and ')}${downs.length ? `, partly offset by fewer cases of ${nm(downs[0])}` : ''}.`);
      else if (downs.length) out.push(`The biggest improvement: ${nm(downs[0])}.`);
    }
    const top3 = ranked.slice(0, 3); out.push(`Three issues cause ${pc(top3.reduce((s, o) => s + o.humanCases, 0) / T.human)} of all manual work.`);
    return { head: out[0], rest: out.slice(1).join(' ') };
  }
  function attention(m) {
    const { ranked } = opp(m); const cards = []; const used = new Set();
    const rising = ranked.filter(o => o.risingFast).sort((a, b) => (b.humanCases - b.prevHuman) - (a.humanCases - a.prevHuman))[0];
    if (rising) { used.add(rising.id); cards.push({ tone: 'red', tag: 'New and growing fast', title: rising.title, body: `${n0(rising.prevHuman)} → ${n0(rising.humanCases)} human cases in a month. ${rising.cause}.`, open: { issue: rising.id } }); }
    const big = ranked.find(o => !used.has(o.id)); if (big) { used.add(big.id); cards.push({ tone: 'amber', tag: 'Largest source of manual work', title: big.title, body: `${n0(big.humanCases)} human cases, ${pc(big.share)} of all. ${pc(big.repeatability)} fail the same way, so one fix could address most of them.`, open: { issue: big.id } }); }
    const usedPayers = new Set(ranked.filter(o => used.has(o.id)).map(o => o.topPayer && o.topPayer.name));
    const p = payers(m).find(x => !usedPayers.has(x.payer) && x.status !== 'healthy');
    const payerCard = x => ({ tone: x.status === 'attention' ? 'red' : 'amber', tag: 'Insurer to watch', title: x.payer, body: `${pc(x.rate, 1)} of verifications need a human, about 1 in ${Math.round(1 / x.rate)}. Top cause: ${x.top ? lc(x.top.o.reason) : 'mixed issues'}.`, open: { payer: x.payer } });
    if (p) cards.push(payerCard(p));
    if (cards.length < 3) { const p2 = payers(m).find(x => x !== p && !usedPayers.has(x.payer) && x.status !== 'healthy'); if (p2) cards.push(payerCard(p2)); }
    return cards;
  }

  // ---------------- components ----------------
  let tipSeq = 0;
  function info(text, label) { const id = 'tip' + (++tipSeq); return `<span class="tip"><button type="button" class="tip-btn" aria-label="${esc(label || 'More information')}" aria-describedby="${id}" data-tip>i</button><span role="tooltip" id="${id}" class="tip-body">${esc(text)}</span></span>`; }
  const STATUS = { attention: ['Needs attention', 'red'], watch: ['Watch', 'amber'], healthy: ['Healthy', 'green'], slipping: ['Slipping', 'amber'], improving: ['Improving', 'green'], steady: ['Steady', 'grey'], baseline: ['Baseline month', 'grey'] };
  const pill = k => `<span class="pill ${STATUS[k][1]}"><i aria-hidden="true"></i>${STATUS[k][0]}</span>`;
  const prio = p => `<span class="prio p-${p.toLowerCase()}"><i aria-hidden="true"></i>${p}</span>`;
  function ptsChange(d, goodWhenDown) {
    if (d == null) return '<span class="d muted">No prior month</span>';
    const up = d > 0.0005, down = d < -0.0005; const cls = !up && !down ? 'muted' : (goodWhenDown ? (down ? 'good' : 'bad') : (up ? 'good' : 'bad'));
    return `<span class="d ${cls}">${up ? '▲' : down ? '▼' : '■'} ${(Math.abs(d) * 100).toFixed(1)} pts vs ${esc(prevMonth(S.month).short)}</span>`;
  }
  function pctChange(c, goodWhenDown) {
    if (c == null) return '<span class="d muted">No prior month</span>';
    const up = c > 0.005, down = c < -0.005; const cls = !up && !down ? 'muted' : (goodWhenDown ? (down ? 'good' : 'bad') : (up ? 'good' : 'bad'));
    return `<span class="d ${cls}">${up ? '▲' : down ? '▼' : '■'} ${pc(Math.abs(c))} vs ${esc(prevMonth(S.month).short)}</span>`;
  }
  function trend(o) {
    if (o.humanChange == null) return '<span class="muted small">—</span>';
    const c = o.humanChange; const lab = o.risingFast ? 'Rising fast' : c > 0.1 ? 'Increasing' : c < -0.1 ? 'Decreasing' : 'Stable';
    return `<span class="trend t-${lab.split(' ')[0].toLowerCase()}">${lab} <span class="muted">${c > 0 ? '+' : ''}${pc(c)}</span></span>`;
  }
  function spark(values, w = 220, h = 48) {
    const max = Math.max(...values, 1), min = Math.min(...values) * 0.9; const sx = i => 4 + i * (w - 8) / (values.length - 1); const sy = v => h - 4 - (v - min) / (max - min || 1) * (h - 8);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d} L${sx(values.length - 1)},${h} L${sx(0)},${h} Z" class="sa"/><path d="${d}" class="sl"/><circle cx="${sx(values.length - 1)}" cy="${sy(values[values.length - 1])}" r="3" class="sd"/></svg>`;
  }
  function crumbs(items) { return `<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) => i < items.length - 1 ? `<button type="button" class="link" ${it.attr}>${esc(it.t)}</button><span aria-hidden="true">›</span>` : `<span aria-current="page">${esc(it.t)}</span>`).join('')}</nav>`; }

  // ---------------- shell ----------------
  const app = document.getElementById('app');
  const TABS = [['overview', 'Overview'], ['payers', 'Insurers'], ['issues', 'Issues']];
  const tabOf = v => ({ payer: 'payers', issue: S.from && S.from.payer ? 'payers' : 'issues' }[v] || v);
  function render() {
    tipSeq = 0;
    app.innerHTML = `
    <header class="top">
      <div class="brand"><b>Automation health</b><span>Where verification still needs a human. A concept for Needletail AI.</span></div>
      <nav class="tabs" aria-label="Sections">${TABS.map(([k, t]) => `<button type="button" data-go="${k}" ${tabOf(S.view) === k ? 'aria-current="page"' : ''}>${t}</button>`).join('')}</nav>
      <div class="top-right">
        <label class="period">Month <select data-month aria-label="Month">${M.MONTHS.slice().reverse().map(m => `<option value="${m.id}" ${m.id === S.month ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
        <button type="button" class="btn primary" data-tour-start>Take the tour</button>
      </div>
    </header>
    <main class="wrap" id="main" tabindex="-1">${({ overview: vOverview, payers: vPayers, payer: vPayer, issues: vIssues, issue: vIssue })[S.view]()}</main>
    <footer class="foot">Synthetic data for a concept prototype. Not Needletail's real numbers, insurers' real behaviour or real customers. The split between AI, voice AI and human follows the shape of Needletail's public Q1 2026 figures.</footer>
    ${S.tour != null ? vTour() : ''}`;
    if (S.tour != null) spotlight();
  }

  // ---------------- 1. overview ----------------
  function vOverview() {
    const h = health(S.month); const T = h.T; const { ranked } = opp(S.month);
    const wk = weeklyAll(); const PT = h.PT;
    const pay = payers(S.month); const att = attention(S.month);
    const avgMin = T.hours * 60 / T.human;
    return `
    ${!hintDismissed && S.tour == null ? `<div class="hint"><span>New here? A one-minute tour shows how to read this dashboard.</span><button type="button" class="btn primary sm" data-tour-start>Take the tour</button><button type="button" class="link" data-hint-close>Dismiss</button></div>` : ''}
    <section class="status" id="t-status">
      <div class="status-top"><span class="eyebrow-free">${esc(monthObj(S.month).label)}</span>${pill(h.key)}</div>
      ${(() => { const b = briefing(S.month); return `<p class="brief">${esc(b.head)} ${b.rest ? info(b.rest, 'What drove the change') : ''}</p>`; })()}
    </section>

    <section class="kpis4" id="t-kpis">
      <div class="kpi"><span class="kl">Handled end to end by AI</span><b>${pc(1 - rate(T), 1)}</b>${PT ? ptsChange(-(rate(T) - rate(PT)), false) : ptsChange(null)}<span class="kx">${n0(T.total - T.human)} of ${n0(T.total)} verifications</span></div>
      <div class="kpi"><span class="kl">Needed a human</span><b>${n0(T.human)}</b>${PT ? pctChange((T.human - PT.human) / PT.human, true) : pctChange(null)}<span class="kx">${pc(rate(T), 1)} of verifications</span></div>
      <div class="kpi"><span class="kl">Human hours ${info(`Every time a person handles a case, we log the time from pickup to close, then add those times up. Average this month: ${Math.round(avgMin)} minutes a case. Everything else on this dashboard counts cases, not hours.`, 'How human hours are calculated')}</span><b>${n0(T.hours)}</b>${PT ? pctChange((T.hours - PT.hours) / PT.hours, true) : pctChange(null)}<span class="kx">about ${Math.round(T.hours / 160)} full-time people</span></div>
      <div class="kpi"><span class="kl">Human cases per week</span>${spark(wk.map(w => w.human))}<span class="kx">${MON[wk[0].start.getUTCMonth()]} ${wk[0].start.getUTCDate()} to ${MON[wk[wk.length - 1].start.getUTCMonth()]} ${wk[wk.length - 1].start.getUTCDate()}: ${n0(wk[0].human)} → ${n0(wk[wk.length - 1].human)} a week</span></div>
    </section>

    <section class="block" id="t-attention">
      <h2>Needs attention</h2>
      <div class="sig">${att.map(c => `<button type="button" class="sigcard ${c.tone}" ${c.open.issue ? `data-issue="${c.open.issue}"` : `data-payer="${esc(c.open.payer)}"`}>
        <span class="sigtag">${esc(c.tag)}</span><b>${esc(c.title)}</b><span class="sigbody">${esc(c.body)}</span><span class="sigmore">Dig in →</span></button>`).join('')}</div>
    </section>

    <section class="lenses block" id="t-lenses">
      <div class="panel">
        <div class="ph"><h2>By insurer</h2><button type="button" class="link" data-go="payers">All insurers →</button></div>
        <p class="sub">Share of each insurer's verifications that needed a human.</p>
        ${pay.map(p => `<button type="button" class="lrow" data-payer="${esc(p.payer)}"><span class="dot ${STATUS[p.status][1]}" aria-hidden="true"></span><span class="ln">${esc(p.payer)}</span><span class="bar wide" aria-hidden="true"><i class="${STATUS[p.status][1]}" style="width:${p.rate / pay[0].rate * 100}%"></i></span><b>${pc(p.rate, 1)}</b><span class="lc">${p.change == null ? '' : ptsChange(p.change, true)}</span></button>`).join('')}
        <p class="legend-s"><span class="li"><span class="dot red"></span>Needs attention: 9%+ or human cases up 50%+</span><span class="li"><span class="dot amber"></span>Watch: 6–9%</span><span class="li"><span class="dot green"></span>Healthy: under 6%</span></p>
      </div>
      <div class="panel">
        <div class="ph"><h2>By issue</h2><button type="button" class="link" data-go="issues">All issues →</button></div>
        <p class="sub">The issues that send the most cases to a human.</p>
        ${ranked.slice(0, 6).map(o => `<button type="button" class="lrow" data-issue="${o.id}"><span class="rk">${o.rank}</span><span class="ln">${esc(o.title)}<span class="lsub">${esc(o.cause)}</span></span><span class="bar wide" aria-hidden="true"><i style="width:${o.humanCases / ranked[0].humanCases * 100}%"></i></span><b>${n0(o.humanCases)}</b><span class="lc">${trend(o)}</span></button>`).join('')}
      </div>
    </section>`;
  }

  // ---------------- 2. payers ----------------
  function vPayers() {
    const pay = payers(S.month);
    const counts = { attention: 0, watch: 0, healthy: 0 }; pay.forEach(p => counts[p.status]++);
    return `<div id="t-payers">
    <h1 class="pg">Insurers</h1>
    <p class="sub">How often each insurer's verifications need a human, and what causes it. ${counts.attention} need attention, ${counts.watch} to watch, ${counts.healthy} healthy. Click an insurer to dig in.</p>
    <div class="ptiles">${pay.map(p => `<button type="button" class="ptile ${STATUS[p.status][1]}" data-payer="${esc(p.payer)}">
      <span class="pt-top"><b>${esc(p.payer)}</b>${pill(p.status)}</span>
      <span class="pt-num">${pc(p.rate, 1)}</span>
      <span class="pt-sub">needed a human, ${n0(p.human)} of ${n0(p.volume)}</span>
      ${p.change == null ? '' : ptsChange(p.change, true)}
      <span class="pt-cause">${p.top ? `Top cause: ${esc(p.top.o.reason.toLowerCase())} (${pc(p.top.human / p.human)} of its human cases)` : ''}</span>
    </button>`).join('')}</div>
    <p class="legend-s"><span class="li"><span class="dot red"></span>Needs attention: 9%+ or human cases up 50%+</span><span class="li"><span class="dot amber"></span>Watch: 6–9%</span><span class="li"><span class="dot green"></span>Healthy: under 6%</span></p>
    </div>`;
  }
  function vPayer() {
    const pay = payers(S.month); const p = pay.find(x => x.payer === S.payer);
    if (!p) return `<p>Insurer not found. <button type="button" class="link" data-go="payers">Back to insurers</button></p>`;
    const PR = R.filter(r => r.month === S.month && r.payer === p.payer && r.human);
    const group = key => { const c = {}; PR.forEach(r => { const k = key === 'customer' ? M.CUST[r.customer].name : r[key]; c[k] = (c[k] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1]); };
    const months = M.MONTHS.map(m => { const x = payers(m.id).find(y => y.payer === p.payer); return { m, rate: x.rate, human: x.human }; });
    const maxIssue = p.issues[0] ? p.issues[0].human : 1;
    return `${crumbs([{ t: 'Insurers', attr: 'data-go="payers"' }, { t: p.payer }])}
    <div id="t-payer">
      <div class="dhead"><h1>${esc(p.payer)}</h1>${pill(p.status)}</div>
      <p class="chain"><b>${n0(p.volume)}</b> verifications <span aria-hidden="true">→</span> <b>${n0(p.human)}</b> needed a human <span aria-hidden="true">→</span> <b>${pc(p.rate, 1)}</b>, about 1 in ${Math.round(1 / p.rate)} ${p.change == null ? '' : ptsChange(p.change, true)}</p>
      <section class="panel"><h2>What drives manual work at ${esc(p.payer)}</h2><p class="sub">Issues ranked by human cases from this insurer. Click one to see the full picture.</p>
        ${p.issues.map(x => x.o.other ? `<div class="lrow static nolead"><span class="ln muted">${esc(x.o.title)}</span><span class="bar wide" aria-hidden="true"><i class="grey" style="width:${x.human / maxIssue * 100}%"></i></span><b class="muted">${n0(x.human)}</b><span class="lc muted">${pc(x.human / p.human)}</span></div>`
          : `<button type="button" class="lrow nolead" data-issue="${x.o.id}" data-from-payer="${esc(p.payer)}"><span class="ln">${esc(x.o.reason)}<span class="lsub">${esc(x.o.cause)}</span></span><span class="bar wide" aria-hidden="true"><i style="width:${x.human / maxIssue * 100}%"></i></span><b>${n0(x.human)}</b><span class="lc">${pc(x.human / p.human)} of ${esc(p.payer)}</span></button>`).join('')}
      </section>
    </div>
    <div class="three block">
      <section class="panel"><h2>Last three months</h2>${months.map(x => `<div class="mrow ${x.m.id === S.month ? 'on' : ''}"><span>${x.m.label}</span><span class="bar wide" aria-hidden="true"><i style="width:${x.rate / Math.max(...months.map(y => y.rate)) * 100}%"></i></span><b>${pc(x.rate, 1)}</b></div>`).join('')}<p class="small muted">Share of verifications that needed a human.</p></section>
      <section class="panel"><h2>Portals and phone lines</h2>${group('workflow').slice(0, 5).map(([k, v]) => `<div class="mrow"><span class="trunc" title="${esc(k)}">${esc(k)}</span><b>${n0(v)}</b></div>`).join('')}<p class="small muted">Human cases by insurer portal or phone line.</p></section>
      <section class="panel"><h2>Customers most affected</h2>${group('customer').slice(0, 5).map(([k, v]) => `<div class="mrow"><span class="trunc" title="${esc(k)}">${esc(k)}</span><b>${n0(v)}</b></div>`).join('')}<p class="small muted">Human cases by customer.</p></section>
    </div>`;
  }

  // ---------------- 3. issues ----------------
  function vIssues() {
    const { ranked, other } = opp(S.month); const types = M.typeHealth(R, S.month);
    let rows = ranked.slice(); if (S.type !== 'All') rows = rows.filter(o => o.category === S.type);
    const showOther = other && (S.type === 'All' || S.type === 'Other');
    const max = Math.max(...ranked.map(o => o.humanCases));
    return `<div id="t-issues"><h1 class="pg">Issues</h1>
    <p class="sub">Every recurring reason a verification needed a human, ranked by how many cases one fix could address. Click a row for the full picture.</p>
    <div class="seg" role="group" aria-label="Type of issue"><button type="button" data-type="All" aria-pressed="${S.type === 'All'}">All</button>${types.map(t => `<button type="button" data-type="${esc(t.type)}" aria-pressed="${S.type === t.type}">${esc(t.type)} <span class="segn">${n0(t.human)}</span></button>`).join('')}</div>
    <div class="tbl"><table>
      <thead><tr><th scope="col">#</th><th scope="col">Issue</th><th scope="col" class="r">Needed a human</th><th scope="col" class="r">Share of all</th><th scope="col" class="r">Human rate ${info('Of the cases where the portal AI got stuck for this reason, the share the voice AI could not rescue.', 'About human rate')}</th><th scope="col" class="r">Same failure path ${info('Share of these cases that got stuck at exactly the same steps. High means one fix is likely to work.', 'About same failure path')}</th><th scope="col">Trend</th><th scope="col">Priority ${info('Ranked by human cases × same failure path. High: one fix could address at least 10% of all human cases. Medium: at least 4%. Issues whose human cases grew 50% or more (and by at least 100) are raised to at least Medium.', 'How priority is set')}</th></tr></thead>
      <tbody>${rows.map(o => `<tr class="row" data-issue="${o.id}" tabindex="0" aria-label="Open ${esc(o.title)}">
        <td class="muted">${o.rank}</td><td><span class="tlink">${esc(o.title)}</span><div class="small muted">${esc(o.cause)}</div></td>
        <td class="r"><span class="bar" aria-hidden="true"><i style="width:${o.humanCases / max * 100}%"></i></span><b>${n0(o.humanCases)}</b></td><td class="r">${pc(o.share)}</td><td class="r">${pc(o.humanRate)}</td><td class="r">${pc(o.repeatability)}</td><td class="nw">${trend(o)}</td><td class="nw">${prio(o.priority)}</td></tr>`).join('')}
      ${showOther ? `<tr class="muted"><td></td><td>${esc(other.title)}<div class="small">${esc(other.cause)}</div></td><td class="r">${n0(other.humanCases)}</td><td class="r">${pc(other.share)}</td><td class="r">${pc(other.humanRate)}</td><td class="r">—</td><td></td><td class="small">Not ranked</td></tr>` : ''}
      ${!rows.length && !showOther ? '<tr><td colspan="8" class="empty-cell">No issues of this type this month.</td></tr>' : ''}</tbody></table></div>
    <p class="note">A case counts toward the issue that finally sent it to a human. Earlier failures in the same case show on its detail page.</p></div>`;
  }
  function insights(o) {
    const out = [];
    const wf = M.breakdown(R, S.month, o.id, 'workflow'); const pay = M.breakdown(R, S.month, o.id, 'payer');
    const pms = M.breakdown(R, S.month, o.id, 'pms'); const cust = M.breakdown(R, S.month, o.id, 'customer');
    if (pay[0] && pay[0].share >= 0.6) { const n = wf.filter(w => w.name.startsWith(pay[0].name)).length; out.push(`Concentrated in ${pay[0].name}: ${pc(pay[0].share)} of cases${n > 1 ? `, across ${n} ${pay[0].name} portals` : ''}.`); }
    else if (pay[0]) out.push(`Spread across insurers: the largest, ${pay[0].name}, is only ${pc(pay[0].share)} of cases. A fix for one insurer will not solve it.`);
    const top2 = cust.slice(0, 2); if (top2.length === 2 && top2[0].share + top2[1].share >= 0.5) out.push(`${pc(top2[0].share + top2[1].share)} of cases come from two customers, ${top2[0].name} and ${top2[1].name}. Likely a data-entry issue at the practice, not an AI failure.`);
    if (pms[0] && pms[0].share >= 0.45) out.push(`${pc(pms[0].share)} come through ${pms[0].name}.`);
    if (o.p.fixedOn) { const ba = M.beforeAfter(R, o.id, o.p.fixedOn); out.push(`Human rate dropped from ${pc(ba.before)} to ${pc(ba.after)} from ${pd(o.p.fixedOn).replace(', 2026', '')}. Worth confirming what changed before treating it as solved.`); }
    if (o.humanChange != null) out.push(o.risingFast ? `New and growing: human cases up ${pc(o.humanChange)} on the prior month.` : `Human cases ${o.humanChange >= 0 ? 'up' : 'down'} ${pc(Math.abs(o.humanChange))} on the prior month.`);
    return out;
  }
  function vIssue() {
    const { ranked } = opp(S.month); const o = ranked.find(x => x.id === S.issue);
    if (!o) return `<p>Issue not found. <button type="button" class="link" data-go="issues">Back to issues</button></p>`;
    const payer = o.topPayer && o.topPayer.share >= 0.6 ? o.topPayer.name : 'these insurers';
    const rec = o.p.rec.replace(/\{payer\}/g, payer);
    const dims = [['workflow', 'Insurer portal or line'], ['customer', 'Customer'], ['pms', 'Practice management system'], ['state', 'State'], ['vtype', 'Verification type']];
    const seqs = M.sequences(R, S.month, o.id).slice(0, 3);
    const ex = R.filter(r => r.month === S.month && r.pid === o.id && r.human).slice(0, 6);
    const path = S.from && S.from.payer ? [{ t: 'Insurers', attr: 'data-go="payers"' }, { t: S.from.payer, attr: `data-payer="${esc(S.from.payer)}"` }, { t: o.title }] : [{ t: 'Issues', attr: 'data-go="issues"' }, { t: o.title }];
    return `${crumbs(path)}
    <div id="t-issue">
      <div class="dhead"><h1>${esc(o.title)}</h1>${prio(o.priority)}</div><p class="cause big">${esc(o.cause)}</p>
      <p class="chain"><b>${n0(o.cases)}</b> times the AI got stuck <span aria-hidden="true">→</span> <b>${n0(o.humanCases)}</b> needed a human (${pc(o.humanRate)}) <span aria-hidden="true">→</span> <b>${pc(o.share)}</b> of all human cases</p>
      <div class="two">
        <section class="panel"><h2>What the data says</h2><ul class="ins">${insights(o).map(i => `<li>${esc(i)}</li>`).join('')}</ul></section>
        <section class="panel rec"><h2>Suggested automation fix</h2><p>${esc(rec)}</p><p class="small muted">A starting point from a simple rule for this issue type, for the team to validate. ${pc(o.repeatability)} of cases fail the same way, so one fix could address about ${n0(o.addressable)} cases a month.</p></section>
      </div>
    </div>
    <section class="block"><h2>How the AI gets stuck</h2><p class="sub">The steps the automation went through before a human stepped in.</p>
      ${seqs.map(sq => `<div class="seq"><div class="seq-share"><b>${pc(sq.share)}</b><span>${n0(sq.cases)} cases</span></div><div><ol>${sq.steps.map(s => `<li>${esc(s)}</li>`).join('')}<li class="human">${pc(sq.humanShare)} then needed a human</li></ol>${sq.fix ? `<p class="small muted seq-fix">The human usually: ${esc(sq.fix)}</p>` : ''}</div></div>`).join('')}
    </section>
    <section class="panel"><h2>Human cases per week</h2>${weekChart(o)}</section>
    <section class="block"><h2>Where it happens</h2><div class="dims">${dims.map(([k, t]) => dimTable(o.id, k, t)).join('')}</div></section>
    <section class="block"><h2>Example cases</h2><div class="tbl"><table><thead><tr><th scope="col">ID</th><th scope="col">Date</th><th scope="col">Insurer portal or line</th><th scope="col">Customer</th><th scope="col">System</th><th scope="col">Type</th><th scope="col">What the human did</th></tr></thead><tbody>
      ${ex.map(r => `<tr><td class="mono nw">${r.id}</td><td class="nw">${pd(r.date)}</td><td>${esc(r.workflow)}</td><td>${esc(M.CUST[r.customer].name)}</td><td>${esc(r.pms)}</td><td>${esc(r.vtype)}</td><td>${esc(r.resolution)}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  }
  function dimTable(pid, key, title) { const rows = M.breakdown(R, S.month, pid, key).slice(0, 5); return `<div class="dim"><h3>${title}</h3>${rows.map(r => `<div class="dimrow"><span class="dn" title="${esc(r.name)}">${esc(r.name)}</span><span class="bar" aria-hidden="true"><i style="width:${r.share * 100}%"></i></span><span class="dv">${pc(r.share)}</span></div>`).join('')}</div>`; }
  function weekChart(o) {
    const w = M.weekly(R, o.id); const W = 760, H = 200, pl = 40, pb = 28, pt = 10;
    const max = Math.max(...w.map(x => x.human), 1); const nice = Math.ceil(max / 50) * 50 || 10;
    const bw = (W - pl - 10) / w.length; const y = v => pt + (H - pt - pb) * (1 - v / nice); const sel = M.MONTHS.findIndex(m => m.id === S.month);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Human cases per week. ${esc(w.map(x => `${MON[x.start.getUTCMonth()]} ${x.start.getUTCDate()}: ${x.human}`).join(', '))}">
      ${[0, nice / 2, nice].map(t => `<line x1="${pl}" x2="${W - 10}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pl - 6}" y="${y(t) + 4}" text-anchor="end">${n0(t)}</text>`).join('')}
      ${w.map((x, i) => `<rect x="${pl + i * bw + 3}" y="${y(x.human)}" width="${bw - 6}" height="${y(0) - y(x.human)}" class="${x.start.getUTCMonth() === sel + 6 ? 'b-on' : 'b-off'}"><title>Week of ${MON[x.start.getUTCMonth()]} ${x.start.getUTCDate()}: ${n0(x.human)} human cases</title></rect>${i % 2 === 0 ? `<text x="${pl + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${MON[x.start.getUTCMonth()]} ${x.start.getUTCDate()}</text>` : ''}`).join('')}
    </svg><p class="small muted">Full weeks only. Darker bars are weeks starting in ${esc(monthObj(S.month).label)}.</p>`;
  }

  // ---------------- tour ----------------
  const TOUR = [
    { go: { view: 'overview' }, target: '#t-status', title: 'The one-line answer', text: 'A status and one sentence written from the data: is automation getting better or worse? Hover the "i" to see which issues drove the change.' },
    { go: { view: 'overview' }, target: '#t-kpis', title: 'The numbers behind it', text: 'How much the AI handled end to end, how many cases needed a human, and the weekly trend. Hover the "i" to see how human hours are counted.' },
    { go: { view: 'overview' }, target: '#t-attention', title: 'What needs attention', text: 'The few things worth your time this month: a new issue growing fast, the largest source of manual work, and an insurer to watch. Click any card to dig in.' },
    { go: { view: 'overview' }, target: '#t-lenses', title: 'Two ways to dig deeper', text: 'Look at manual work by insurer (who causes it) or by issue (what causes it). Colours show health; click any row.' },
    { go: { view: 'payers' }, target: '#t-payers', title: 'Insurer health', text: 'Each insurance company as a card: how often it needs a human, the change on last month, and its main cause.' },
    { go: { view: 'payer', payer: 'Delta Dental' }, target: '#t-payer', title: 'Inside an insurer', text: 'What drives manual work at this insurer, ranked. Click an issue to see exactly where the AI gets stuck.' },
    { go: { view: 'issue', issue: 'p1', from: { payer: 'Delta Dental' } }, target: '#t-issue', title: 'Inside an issue', text: 'Where it is concentrated, a suggested fix, and below: the exact steps where the AI gets stuck, the weekly trend and example cases.' },
  ];
  function vTour() { const st = TOUR[S.tour]; return `<div class="tour" role="dialog" aria-live="polite" aria-label="Guided walkthrough"><div class="tour-step">Step ${S.tour + 1} of ${TOUR.length}</div><h3>${esc(st.title)}</h3><p>${esc(st.text)}</p><div class="tour-nav"><button type="button" class="btn ghost" data-tour="close">Close</button>${S.tour > 0 ? '<button type="button" class="btn ghost" data-tour="back">Back</button>' : ''}<button type="button" class="btn light" data-tour="next">${S.tour === TOUR.length - 1 ? 'Finish' : 'Next'}</button></div></div>`; }
  function tourGo(i) {
    const st = TOUR[i]; S.tour = i; S.view = st.go.view; S.payer = st.go.payer || S.payer; S.issue = st.go.issue || S.issue; S.from = st.go.from || null;
    render(); const t = document.querySelector(st.target);
    if (t) t.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const n = document.querySelector('[data-tour="next"]'); if (n) n.focus({ preventScroll: true });
  }
  function spotlight() { const t = document.querySelector(TOUR[S.tour].target); if (t) t.classList.add('spot'); }
  function dismissHint() { hintDismissed = true; try { localStorage.setItem('health-tour-seen', '1'); } catch (e) { /* ignore */ } }

  // ---------------- events ----------------
  function nav(patch) { Object.assign(S, patch); render(); window.scrollTo(0, 0); const m = document.getElementById('main'); if (m) m.focus({ preventScroll: true }); }
  function closeTips(except) { document.querySelectorAll('.tip.open').forEach(t => { if (t !== except) t.classList.remove('open'); }); }
  document.addEventListener('click', e => {
    const tipBtn = e.target.closest('[data-tip]');
    if (tipBtn) { e.stopPropagation(); const tip = tipBtn.parentElement; closeTips(tip); tip.classList.toggle('open'); return; }
    closeTips();
    const t = e.target.closest('[data-go],[data-issue],[data-payer],[data-type],[data-tour],[data-tour-start],[data-hint-close]'); if (!t) return;
    const d = t.dataset;
    if (d.tourStart !== undefined) { S.month = '2026-09'; dismissHint(); return tourGo(0); }
    if (d.tour) { if (d.tour === 'next') { if (S.tour < TOUR.length - 1) tourGo(S.tour + 1); else nav({ tour: null, view: 'overview' }); } else if (d.tour === 'back') tourGo(Math.max(0, S.tour - 1)); else { S.tour = null; render(); } return; }
    if (d.hintClose !== undefined) { dismissHint(); render(); return; }
    S.tour = null;
    if (d.issue) return nav({ view: 'issue', issue: d.issue, from: d.fromPayer ? { payer: d.fromPayer } : null });
    if (d.payer) return nav({ view: 'payer', payer: d.payer, from: null });
    if (d.go) return nav({ view: d.go, from: null });
    if (d.type) { S.type = d.type; render(); }
  });
  document.addEventListener('change', e => { if (e.target.matches('[data-month]')) { S.month = e.target.value; S.tour = null; render(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (document.querySelector('.tip.open')) closeTips(); else if (S.tour != null) { S.tour = null; render(); } }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr.row')) { e.preventDefault(); S.tour = null; nav({ view: 'issue', issue: e.target.dataset.issue, from: null }); }
  });
  render();
})();
