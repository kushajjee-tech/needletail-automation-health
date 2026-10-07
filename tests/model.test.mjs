// Data-model checks: run with `npm test` (Node 18+, no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const M = createRequire(import.meta.url)('../src/model.js');
const R = M.build();
const months = M.MONTHS.map(m => m.id);

test('data is deterministic', () => {
  const again = M.build();
  assert.equal(again.length, R.length);
  assert.deepEqual(again.slice(0, 50).map(r => [r.id, r.date, r.human, r.payer]), R.slice(0, 50).map(r => [r.id, r.date, r.human, r.payer]));
});

test('September matches the demo scenario', () => {
  const o = M.opportunities(R, '2026-09');
  assert.equal(o.totals.total, 100000);
  assert.equal(o.totals.human, 8000);
  assert.equal(o.totals.fallback, 14000);
  assert.deepEqual(o.ranked.slice(0, 3).map(x => x.id), ['p1', 'p2', 'p3']);
  const p1 = o.ranked[0];
  assert.equal(p1.cases, 2100);
  assert.equal(p1.humanCases, 1722);
  assert.equal(Math.round(p1.hours), 1050);
  assert.ok(Math.abs(p1.caseChange - 0.24) < 0.01, 'member-search cases up about 24% on August');
  assert.ok(o.ranked.find(x => x.id === 'p9').risingFast, 'Guardian login issue flagged as rising fast');
});

for (const m of months) {
  test(`${m}: totals reconcile and contain no invalid numbers`, () => {
    const o = M.opportunities(R, m);
    const human = o.totals.human;
    const byType = M.typeHealth(R, m).reduce((s, t) => s + t.human, 0);
    const byInsurer = M.payerHealth(R, m).reduce((s, p) => s + p.human, 0);
    const byIssue = o.ranked.reduce((s, x) => s + x.humanCases, 0) + (o.other ? o.other.humanCases : 0);
    assert.equal(byType, human);
    assert.equal(byInsurer, human);
    assert.equal(byIssue, human);
    for (const x of o.ranked) for (const k of ['cases', 'humanCases', 'humanRate', 'share', 'repeatability', 'addressable']) assert.ok(Number.isFinite(x[k]), `${x.id}.${k}`);
    for (const p of M.payerHealth(R, m)) assert.ok(p.rate >= 0 && p.rate < 1, p.payer);
  });
}

test('every issue has a recommendation and a failure path', () => {
  for (const p of M.PATTERNS) {
    assert.ok(p.rec && p.rec.length > 10, p.id);
    assert.ok(p.seq.length >= 2, p.id);
  }
});
