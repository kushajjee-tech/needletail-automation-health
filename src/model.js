/* Automation health: synthetic data model and aggregation. No real patients, insurers or customers. */
(function (root) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const MONTHS = [
    { id: '2026-07', label: 'July 2026', short: 'Jul', days: 31, total: 93000 },
    { id: '2026-08', label: 'August 2026', short: 'Aug', days: 31, total: 96000 },
    { id: '2026-09', label: 'September 2026', short: 'Sep', days: 30, total: 100000 },
  ];

  // customers: home state + PMS (synthetic)
  const CUSTOMERS = [
    { id: 'summit', name: 'Summit Smiles DSO', state: 'TX', pms: 'Denticon', locations: 22 },
    { id: 'lonestar', name: 'Lone Star Family Dental', state: 'TX', pms: 'CareStack', locations: 12 },
    { id: 'pacific', name: 'Pacific Crest Dental', state: 'CA', pms: 'Denticon', locations: 9 },
    { id: 'golden', name: 'Golden Coast Dental Group', state: 'CA', pms: 'Open Dental', locations: 14 },
    { id: 'sunshine', name: 'Sunshine Dental Partners', state: 'FL', pms: 'Eaglesoft', locations: 11 },
    { id: 'empire', name: 'Empire Smiles', state: 'NY', pms: 'Open Dental', locations: 8 },
    { id: 'desert', name: 'Desert Bloom Dental', state: 'AZ', pms: 'Open Dental', locations: 6 },
    { id: 'peach', name: 'Peachtree Dental Group', state: 'GA', pms: 'Curve Dental', locations: 7 },
  ];
  const CUST = Object.fromEntries(CUSTOMERS.map(c => [c.id, c]));
  const ALL = CUSTOMERS.map(c => c.id);
  const EVEN = Object.fromEntries(CUSTOMERS.map(c => [c.id, c.locations]));

  // Each pattern = one specific, recurring cause of fallback work.
  // months: [cases, humanRate] for Jul, Aug, Sep. minutes = average human handling time.
  const PATTERNS = [
    { id: 'p1', reason: 'Member not found', cause: 'Portal search fails on name + date-of-birth match', category: 'Insurer portal', minutes: 1050 * 60 / 1722,
      months: [[1600, .80], [1690, .81], [2100, .82]], repeat: .91,
      workflows: [['Delta Dental', 'Delta Dental of California portal', 40, ['pacific', 'golden']], ['Delta Dental', 'Delta Dental of Texas portal', 22, ['summit', 'lonestar']],
        ['Delta Dental', 'Delta Dental Insurance Co. portal', 14, ['sunshine', 'empire', 'desert', 'peach']], ['MetLife', 'MetLife provider portal', 14], ['Guardian', 'Guardian provider portal', 10]],
      seq: ['Portal agent: member search returned no match', 'Voice agent: IVR asked for member ID not on file', 'Specialist: found member by subscriber ID + group number'],
      variants: [['Portal agent: search returned several possible members', 'Specialist: picked member by address'], ['Portal agent: timeout', 'Portal agent: search returned no match', 'Specialist: found member by subscriber ID + group number']],
      vtype: { Standard: 70, 'Same-day urgent': 12, 'Re-verification': 14, Ortho: 4 },
      rec: 'Retry the {payer} member search with subscriber ID + group number (and name-only) before escalating to a specialist. That is how specialists resolve most of these cases today.' },
    { id: 'p2', reason: 'Portal timeout', cause: 'Session expires on the benefits page before data loads', category: 'Insurer portal', minutes: 750 * 60 / 1200,
      months: [[1480, .79], [1450, .80], [1500, .80]], repeat: .94,
      workflows: [['Aetna', 'Aetna dental provider portal', 92], ['Cigna', 'Cigna for HCP portal', 8]],
      seq: ['Portal agent: benefits page timed out', 'Voice agent: insurer line rejects automated callers', 'Specialist: logged in manually and read benefits'],
      variants: [['Portal agent: benefits page timed out', 'Portal agent: retry timed out', 'Specialist: logged in manually and read benefits']],
      vtype: { Standard: 74, 'Same-day urgent': 10, 'Re-verification': 13, Ortho: 3 },
      rec: 'Add a session keep-alive and resume-from-last-step for the {payer} benefits page, with two timed retries before human review.' },
    { id: 'p3', reason: 'Coordination of benefits missing', cause: 'Insurer does not return primary/secondary order', category: 'Insurer data', minutes: 600 * 60 / 1020,
      months: [[1100, .84], [1150, .85], [1200, .85]], repeat: .66,
      workflows: [['Delta Dental', 'Delta Dental (several portals)', 30], ['MetLife', 'MetLife provider portal', 25], ['Cigna', 'Cigna for HCP portal', 20], ['United Concordia', 'United Concordia portal', 15], ['Guardian', 'Guardian provider portal', 10]],
      seq: ['Portal agent: no coordination-of-benefits data returned', 'Voice agent: call ended before COB question', 'Specialist: called insurer and confirmed COB order'],
      variants: [['Portal agent: timeout', 'Voice agent: no COB data', 'Specialist: called insurer and confirmed COB order'], ['Portal agent: no COB data', 'Specialist: asked practice for secondary card']],
      vtype: { Standard: 68, 'Same-day urgent': 8, 'Re-verification': 20, Ortho: 4 },
      rec: 'Add a coordination-of-benefits question to the voice agent script so the call captures it, instead of sending the case to a specialist afterwards.' },
    { id: 'p4', reason: 'Frequency history unavailable', cause: 'History not on portal and rep cannot see it', category: 'Insurer data', minutes: 28,
      months: [[1350, .46], [1380, .45], [1400, .45]], repeat: .7,
      workflows: [['MetLife', 'MetLife provider portal', 55], ['Cigna', 'Cigna for HCP portal', 45]],
      seq: ['Portal agent: procedure history section empty', 'Voice agent: rep could not see history', 'Specialist: requested history by fax'],
      variants: [['Portal agent: history empty', 'Specialist: called back for a second rep']],
      vtype: { Standard: 80, 'Same-day urgent': 6, 'Re-verification': 12, Ortho: 2 },
      rec: 'Ask {payer} for history through the claims-history page (a different portal path) before calling.' },
    { id: 'p5', reason: 'Subscriber mismatch', cause: 'Subscriber name or relationship differs between PMS and insurer', category: 'Practice data', minutes: 22,
      months: [[880, .50], [870, .52], [900, .52]], repeat: .55,
      workflows: [['Delta Dental', 'Delta Dental (several portals)', 35], ['MetLife', 'MetLife provider portal', 25], ['Aetna', 'Aetna dental provider portal', 20], ['Guardian', 'Guardian provider portal', 20]],
      customers: { empire: 34, desert: 27, golden: 9, summit: 8, lonestar: 6, pacific: 6, sunshine: 5, peach: 5 },
      seq: ['Portal agent: subscriber name does not match', 'Specialist: corrected subscriber details with practice'],
      variants: [['Portal agent: dependent listed as subscriber', 'Specialist: corrected relationship']],
      vtype: { Standard: 82, 'Same-day urgent': 8, 'Re-verification': 8, Ortho: 2 },
      rec: 'This is mostly practice data entry. Validate subscriber name and relationship when the appointment syncs, and send a fix-list to the two customers creating most of these cases.' },
    { id: 'p6', reason: 'Member not found', cause: 'Wrong or outdated member ID sent from the PMS', category: 'Practice data', minutes: 18,
      months: [[760, .60], [790, .60], [800, .60]], repeat: .5,
      workflows: [['Delta Dental', 'Delta Dental (several portals)', 30], ['MetLife', 'MetLife provider portal', 20], ['Aetna', 'Aetna dental provider portal', 20], ['Cigna', 'Cigna for HCP portal', 15], ['Guardian', 'Guardian provider portal', 15]],
      seq: ['Portal agent: member ID not recognised', 'Specialist: asked practice for current insurance card'],
      variants: [['Portal agent: member ID belongs to old plan', 'Specialist: asked practice for current insurance card']],
      vtype: { Standard: 75, 'Same-day urgent': 15, 'Re-verification': 8, Ortho: 2 },
      rec: 'Flag member IDs that fail format checks at sync time and ask the practice for the current card before the verification runs.' },
    { id: 'p7', reason: 'Medicaid plan unclear', cause: 'Unclear which dental vendor manages the Medicaid plan', category: 'Insurer rules', minutes: 40,
      months: [[600, .68], [620, .70], [650, .70]], repeat: .8,
      workflows: [['Texas Medicaid', 'Texas Medicaid managed care', 58, ['summit', 'lonestar']], ['New York Medicaid', 'New York Medicaid managed care', 42, ['empire']]],
      seq: ['Portal agent: plan shows medical MCO only', 'Voice agent: MCO line transferred to dental vendor', 'Specialist: identified dental vendor and verified'],
      variants: [['Portal agent: plan shows medical MCO only', 'Specialist: identified dental vendor and verified']],
      vtype: { Standard: 70, 'Same-day urgent': 20, 'Re-verification': 10, Ortho: 0 },
      rec: 'Add a lookup table from Medicaid managed-care plan to dental vendor for {payer}, so the agent goes straight to the right vendor.' },
    { id: 'p8', reason: 'Caller detected as AI', cause: 'Insurer rep routes the call to a no-automation queue', category: 'Voice / IVR', minutes: 25,
      months: [[900, .38], [1000, .40], [1100, .40]], repeat: .75,
      workflows: [['MetLife', 'MetLife provider line', 55], ['Cigna', 'Cigna provider line', 45]],
      seq: ['Voice agent: rep identified automated caller', 'Specialist: called back on the provider line'],
      variants: [['Voice agent: call dropped after hold', 'Specialist: called back on the provider line']],
      vtype: { Standard: 78, 'Same-day urgent': 8, 'Re-verification': 12, Ortho: 2 },
      rec: 'Shift {payer} cases to portal-first with voice only as a last resort, and test a shorter, more natural opening script.' },
    { id: 'p9', reason: 'Portal login blocked', cause: 'New multi-factor prompt on login', category: 'Insurer portal', minutes: 20,
      months: [[30, .90], [40, .95], [700, .95]], repeat: .97, rising: true,
      workflows: [['Guardian', 'Guardian provider portal', 100]],
      seq: ['Portal agent: login stopped at new verification-code prompt', 'Specialist: logged in with code and verified'],
      variants: [['Portal agent: login loop', 'Specialist: logged in with code and verified']],
      vtype: { Standard: 75, 'Same-day urgent': 10, 'Re-verification': 13, Ortho: 2 },
      rec: 'New in September: route {payer} verification codes to the shared inbox the agent can read, or move these cases to voice until fixed.' },
    { id: 'p10', reason: 'Ortho benefits incomplete', cause: 'Ortho lifetime maximum or age limit missing', category: 'Insurer data', minutes: 30,
      months: [[580, .55], [590, .55], [600, .55]], repeat: .66,
      workflows: [['Delta Dental', 'Delta Dental (several portals)', 40], ['MetLife', 'MetLife provider portal', 30], ['Aetna', 'Aetna dental provider portal', 30]],
      seq: ['Portal agent: ortho section missing lifetime maximum', 'Voice agent: rep unsure of ortho age limit', 'Specialist: confirmed ortho benefits by phone'],
      variants: [['Portal agent: ortho section missing', 'Specialist: confirmed ortho benefits by phone']],
      vtype: { Standard: 20, 'Same-day urgent': 5, 'Re-verification': 10, Ortho: 65 },
      rec: 'Add the ortho questions to the voice script for {payer} and ask them up front for ortho appointments.' },
    { id: 'p11', reason: 'Stale benefits shown', cause: 'Portal shows last plan year', category: 'Insurer portal', minutes: 15,
      months: [[520, .35], [510, .35], [500, .35]], repeat: .8,
      workflows: [['United Concordia', 'United Concordia portal', 50], ['Aetna', 'Aetna dental provider portal', 50]],
      seq: ['QA agent: plan year on page is last year', 'Portal agent: refresh still showed last year', 'Specialist: confirmed current plan year'],
      variants: [['QA agent: plan year on page is last year', 'Specialist: confirmed current plan year']],
      vtype: { Standard: 70, 'Same-day urgent': 5, 'Re-verification': 25, Ortho: 0 },
      rec: 'Clear the {payer} portal cache and request the plan-year view explicitly before escalating.' },
    { id: 'p12', reason: 'Portal session expired', cause: 'Login session expired mid-search', category: 'Insurer portal', minutes: 25,
      months: [[1300, .88], [1280, null], [1250, .24]], repeat: .9, fixedOn: '2026-08-18',
      workflows: [['Cigna', 'Cigna for HCP portal', 100]],
      seq: ['Portal agent: session expired during member search', 'Specialist: logged in again and verified'],
      variants: [['Portal agent: session expired on benefits page', 'Specialist: logged in again and verified']],
      vtype: { Standard: 74, 'Same-day urgent': 10, 'Re-verification': 14, Ortho: 2 },
      rec: 'Refresh the {payer} session before each member search, and retry once on expiry before escalating.' },
    { id: 'p0', reason: 'Other, low volume', cause: 'Many small, unrelated causes', category: 'Other', minutes: 20,
      months: [[1290, .09], [1300, .09], [1300, 115 / 1300]], repeat: .15, other: true,
      workflows: [['Delta Dental', 'Delta Dental (several portals)', 30], ['MetLife', 'MetLife provider portal', 20], ['Aetna', 'Aetna dental provider portal', 20], ['Cigna', 'Cigna for HCP portal', 15], ['Guardian', 'Guardian provider portal', 15]],
      seq: ['Portal agent: unusual page layout', 'Voice agent resolved'],
      variants: [['QA agent: conflicting values', 'Specialist: reviewed and confirmed'], ['Portal agent: document only', 'Voice agent resolved']],
      vtype: { Standard: 75, 'Same-day urgent': 10, 'Re-verification': 12, Ortho: 3 },
      rec: 'No single fix. Review again if any one cause grows.' },
  ];

  // share of all verifications by payer (synthetic), used as the denominator for "human rate by payer"
  const PAYER_SHARE = { 'Delta Dental': .30, MetLife: .17, Aetna: .14, Cigna: .12, Guardian: .10, 'United Concordia': .07, 'Texas Medicaid': .06, 'New York Medicaid': .04 };

  function allocate(n, weights) {
    const keys = Object.keys(weights); const tot = keys.reduce((s, k) => s + weights[k], 0);
    const raw = keys.map(k => n * weights[k] / tot); const out = raw.map(Math.floor);
    let rem = n - out.reduce((s, v) => s + v, 0);
    raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).slice(0, rem).forEach(([, i]) => out[i]++);
    return Object.fromEntries(keys.map((k, i) => [k, out[i]]));
  }
  function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  function build() {
    const rng = mulberry32(42);
    const records = [];
    let seqNo = 0;
    PATTERNS.forEach(p => {
      MONTHS.forEach((m, mi) => {
        const [n, rate] = p.months[mi];
        // payer workflow quotas
        const wq = allocate(n, Object.fromEntries(p.workflows.map((w, i) => [i, w[2]])));
        const rows = [];
        Object.entries(wq).forEach(([i, cnt]) => { for (let k = 0; k < cnt; k++) rows.push({ w: p.workflows[i] }); });
        shuffle(rows, rng);
        // human quota (or date-based for the fixed pattern)
        let humanFlags;
        if (rate == null) humanFlags = null; else { const h = Math.round(n * rate); humanFlags = shuffle(Array.from({ length: n }, (_, i) => i < h), rng); }
        const vt = allocate(n, p.vtype); const vtList = shuffle(Object.entries(vt).flatMap(([k, c]) => Array(c).fill(k)), rng);
        const mainCount = Math.round(n * p.repeat);
        const isMain = shuffle(Array.from({ length: n }, (_, i) => i < mainCount), rng);
        const made = [];
        rows.forEach((r, i) => {
          let day;
          if (p.id === 'p9' && mi === 2) day = 11 + Math.floor(Math.pow(rng(), 0.7) * 20); // starts mid-September
          else day = 1 + Math.floor(rng() * m.days);
          day = Math.min(day, m.days);
          const date = `${m.id}-${String(day).padStart(2, '0')}`;
          const human = humanFlags ? humanFlags[i] : rng() < (date < (p.fixedOn || '0') ? 0.88 : 0.24);
          if (!r.w._wt) { const pool = r.w[3] || ALL; r.w._wt = p.customers ? Object.fromEntries(pool.map(c => [c, p.customers[c] || 1])) : Object.fromEntries(pool.map(c => [c, EVEN[c]])); }
          const cust = weightedPick(r.w._wt, rng);
          let seq = isMain[i] ? p.seq.slice() : p.variants[Math.floor(rng() * p.variants.length)].slice();
          if (!human) seq = seq.filter(s => !s.startsWith('Specialist')).concat(seq[seq.length - 1] === 'Voice agent resolved' ? [] : ['Voice agent resolved']);
          if (human && !seq.some(s => s.startsWith('Specialist'))) seq = seq.filter(s => s !== 'Voice agent resolved').concat(['Specialist: reviewed and confirmed']);
          seqNo++;
          made.push({
            id: 'VR-' + String(seqNo).padStart(6, '0'), date, month: m.id, pid: p.id, payer: r.w[0], workflow: r.w[1],
            customer: cust, pms: CUST[cust].pms, state: CUST[cust].state, vtype: vtList[i], path: human ? 'Portal → Voice → Human' : 'Portal → Voice',
            human, minutes: 0, seq, seqKey: isMain[i] ? 'main' : seq.join(' > '), outcome: 'Verified', resolution: human ? seq[seq.length - 1].replace('Specialist: ', '') : 'Resolved by voice AI',
            automatedInEnd: !human,
          });
        });
        // human minutes: spread around average, then scale so the pattern-month total is exact
        made.forEach(r => records.push(r));
        const hs = made.filter(r => r.human);
        if (hs.length) {
          hs.forEach(r => { r.minutes = p.minutes * (0.45 + rng() * 1.1); });
          const target = Math.round(p.minutes * hs.length);
          const sum = hs.reduce((s, r) => s + r.minutes, 0);
          hs.forEach(r => { r.minutes = r.minutes * target / sum; });
        }
      });
    });
    return records;
  }
  const WP = new WeakMap();
  function weightedPick(w, rng) { let c = WP.get(w); if (!c) { const keys = Object.keys(w); c = { keys, tot: keys.reduce((s, k) => s + w[k], 0) }; WP.set(w, c); } let r = rng() * c.tot; for (const k of c.keys) { r -= w[k]; if (r <= 0) return k; } return c.keys[c.keys.length - 1]; }

  // ---------------- aggregation ----------------
  function monthIndex(id) { return MONTHS.findIndex(m => m.id === id); }

  function totals(records, monthId) {
    const m = MONTHS[monthIndex(monthId)];
    const R = records.filter(r => r.month === monthId);
    const human = R.filter(r => r.human);
    const minutes = human.reduce((s, r) => s + r.minutes, 0);
    return { total: m.total, fallback: R.length, automated: m.total - R.length, voice: R.length - human.length, human: human.length, hours: minutes / 60 };
  }

  function opportunities(records, monthId) {
    const R = records.filter(r => r.month === monthId);
    const tot = totals(records, monthId);
    const mi = monthIndex(monthId);
    const prevId = mi > 0 ? MONTHS[mi - 1].id : null;
    const prevR = prevId ? records.filter(r => r.month === prevId) : [];
    const list = PATTERNS.map(p => {
      const rs = R.filter(r => r.pid === p.id); const hs = rs.filter(r => r.human);
      const hours = hs.reduce((s, r) => s + r.minutes, 0) / 60;
      const prs = prevR.filter(r => r.pid === p.id); const phs = prs.filter(r => r.human);
      const prevHours = prevId ? phs.reduce((s, r) => s + r.minutes, 0) / 60 : null;
      const repeatability = rs.length ? rs.filter(r => r.seqKey === 'main').length / rs.length : 0;
      const top = (key) => { const c = {}; rs.forEach(r => c[r[key]] = (c[r[key]] || 0) + 1); const e = Object.entries(c).sort((a, b) => b[1] - a[1]); return e.length ? { name: e[0][0], share: e[0][1] / rs.length } : null; };
      const topPayer = top('payer');
      const title = !p.other && topPayer && topPayer.share >= 0.6 ? `${p.reason}: ${topPayer.name}` : p.reason;
      return {
        id: p.id, p, title, reason: p.reason, cause: p.cause, category: p.category, cases: rs.length, humanCases: hs.length,
        humanRate: rs.length ? hs.length / rs.length : 0, hours, share: tot.human ? hs.length / tot.human : 0,
        prevHuman: prevId ? phs.length : null, humanChange: prevId && phs.length ? (hs.length - phs.length) / phs.length : null,
        addressable: hs.length * repeatability,
        prevCases: prevId ? prs.length : null, prevHours, change: prevHours ? (hours - prevHours) / prevHours : null,
        caseChange: prevId && prs.length ? (rs.length - prs.length) / prs.length : null,
        repeatability, fixable: hours * repeatability, topPayer, customers: new Set(rs.map(r => r.customer)).size, other: !!p.other,
      };
    });
    const ranked = list.filter(o => !o.other).sort((a, b) => b.addressable - a.addressable);
    ranked.forEach((o, i) => {
      o.rank = i + 1;
      o.priority = o.addressable >= tot.human * 0.10 ? 'High' : o.addressable >= tot.human * 0.04 ? 'Medium' : 'Low';
      o.risingFast = o.prevHuman != null && o.humanCases >= 1.5 * o.prevHuman && o.humanCases - o.prevHuman >= 100;
      if (o.risingFast && o.priority === 'Low') o.priority = 'Medium';
    });
    const other = list.find(o => o.other); if (other) { other.rank = null; other.priority = '—'; }
    return { ranked, other, totals: tot };
  }

  function payerHealth(records, monthId) {
    const m = MONTHS[monthIndex(monthId)];
    const c = {}; records.forEach(r => { if (r.month === monthId && r.human) c[r.payer] = (c[r.payer] || 0) + 1; });
    return Object.entries(PAYER_SHARE).map(([payer, sh]) => { const vol = Math.round(m.total * sh); const h = c[payer] || 0; return { payer, volume: vol, human: h, rate: h / vol }; }).sort((a, b) => b.rate - a.rate);
  }
  function typeHealth(records, monthId) {
    const c = {}; let t = 0;
    records.forEach(r => { if (r.month === monthId && r.human) { const cat = PATTERNS.find(p => p.id === r.pid).category; c[cat] = (c[cat] || 0) + 1; t++; } });
    return Object.entries(c).map(([type, n]) => ({ type, human: n, share: n / t })).sort((a, b) => b.human - a.human);
  }

  function breakdown(records, monthId, pid, key) {
    const rs = records.filter(r => r.month === monthId && r.pid === pid);
    const c = {}; rs.forEach(r => { const k = key === 'customer' ? CUST[r.customer].name : r[key]; c[k] = c[k] || { cases: 0, human: 0, minutes: 0 }; c[k].cases++; if (r.human) { c[k].human++; c[k].minutes += r.minutes; } });
    return Object.entries(c).map(([name, v]) => ({ name, cases: v.cases, share: v.cases / rs.length, hours: v.minutes / 60 })).sort((a, b) => b.cases - a.cases);
  }

  function sequences(records, monthId, pid) {
    const rs = records.filter(r => r.month === monthId && r.pid === pid);
    const c = {};
    rs.forEach(r => {
      const fail = r.seq.filter(x => !x.startsWith('Specialist') && x !== 'Voice agent resolved');
      const k = fail.join(' > ');
      const g = c[k] = c[k] || { steps: fail, cases: 0, human: 0, fixes: {} };
      g.cases++; if (r.human) { g.human++; const f = r.seq[r.seq.length - 1].replace('Specialist: ', ''); g.fixes[f] = (g.fixes[f] || 0) + 1; }
    });
    return Object.values(c).map(g => ({ steps: g.steps, cases: g.cases, share: g.cases / rs.length, humanShare: g.human / g.cases,
      fix: Object.entries(g.fixes).sort((a, b) => b[1] - a[1])[0] ? Object.entries(g.fixes).sort((a, b) => b[1] - a[1])[0][0] : null })).sort((a, b) => b.cases - a.cases);
  }

  // weekly human cases for a pattern (all months), weeks start Monday
  function weekly(records, pid) {
    const start = Date.UTC(2026, 6, 6); // Mon Jul 6, 2026; 12 full weeks to Sun Sep 27
    const weeks = Array.from({ length: 12 }, (_, i) => ({ start: new Date(start + i * 7 * 86400000), human: 0, cases: 0 }));
    records.forEach(r => {
      if (r.pid !== pid) return;
      const [y, m, d] = r.date.split('-').map(Number);
      const w = Math.floor((Date.UTC(y, m - 1, d) - start) / (7 * 86400000));
      if (w >= 0 && w < 12) { weeks[w].cases++; if (r.human) weeks[w].human++; }
    });
    return weeks;
  }
  function beforeAfter(records, pid, fixedOn) {
    const rs = records.filter(r => r.pid === pid);
    const b = rs.filter(r => r.date < fixedOn), a = rs.filter(r => r.date >= fixedOn);
    const rate = x => x.length ? x.filter(r => r.human).length / x.length : 0;
    const p = PATTERNS.find(x => x.id === pid);
    const days = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    const bDays = days('2026-07-01', addDay(fixedOn, -1)), aDays = days(fixedOn, '2026-09-30');
    const bHumanPerMonth = b.filter(r => r.human).length / bDays * 30, aHumanPerMonth = a.filter(r => r.human).length / aDays * 30;
    const savedHours = (bHumanPerMonth - aHumanPerMonth) * p.minutes / 60;
    return { before: rate(b), after: rate(a), reduction: rate(b) ? 1 - rate(a) / rate(b) : 0, savedHours, bCases: b.length, aCases: a.length, afterDays: aDays };
  }
  function addDay(s, n) { const t = new Date(Date.parse(s) + n * 86400000); return t.toISOString().slice(0, 10); }

  const api = { MONTHS, CUSTOMERS, CUST, PATTERNS, PAYER_SHARE, build, totals, opportunities, payerHealth, typeHealth, breakdown, sequences, weekly, beforeAfter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Model = api;
})(typeof window !== 'undefined' ? window : globalThis);
