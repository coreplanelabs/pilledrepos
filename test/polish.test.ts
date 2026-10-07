import test from 'node:test';
import assert from 'node:assert/strict';
import { helpPosition } from '../src/tooltip-position.js';
import { parseStarHistory, starMetric } from '../src/star-history.js';
import { AWARD_PALETTE } from '../src/award-palette.js';
import { boardMarkup } from '../src/view.js';
const now = Date.parse('2026-10-07T12:00:00Z');
test('hover explanations stay inside all viewport edges and flip below a top-edge anchor', () => {
  for (const anchor of [{ left: 0, right: 30, top: 2, bottom: 30 }, { left: 360, right: 375, top: 800, bottom: 812 }]) {
    const position = helpPosition(anchor, { width: 320, height: 150 }, { width: 375, height: 812 });
    assert.ok(position.left >= 12 && position.left + 320 <= 363);
    assert.ok(position.top >= 12 && position.top + 150 <= 800);
  }
});
test('star backfill uses daily additions, excludes today, and never turns missing weeks into zero history', () => {
  const week = Date.parse('2026-10-04T00:00:00Z') / 1000;
  const history = parseStarHistory([{ week, total: 28, days: [1, 2, 3, 4, 5, 6, 7] }], now);
  assert.deepEqual(history.days, [{ day: '2026-10-04', added: 1 }, { day: '2026-10-05', added: 2 }, { day: '2026-10-06', added: 3 }]);
  assert.deepEqual(starMetric(history), { added: 6, days: 3 });
  assert.equal(starMetric(parseStarHistory([], now)), null);
  assert.throws(() => parseStarHistory([{ week, total: 3, days: [1, 1, -1, 1, 1, 0, 0] }], now));
});
test('nine award surfaces and accents are distinct', () => {
  assert.equal(new Set(Object.values(AWARD_PALETTE).map(row => row.surface)).size, 9);
  assert.equal(new Set(Object.values(AWARD_PALETTE).map(row => row.accent)).size, 9);
});
test('cast standings represent the repo team with a facepile and no organization as winning author', () => {
  const html = boardMarkup([{ repository: 'team/repo', person: null, cast: [{ id: 1, login: 'one', bot: false }, { id: 2, login: 'two', bot: false }], castCount: 5, repoOwner: { id: 99, login: 'organization', bot: false }, score: 5, value: '5 contributor accounts', source: 'https://github.com/team/repo', capturedAt: '2026-10-06T12:00:00Z', sampled: true, inspected: 10, stars: 100, starAdded: 20, starDays: 30 }]);
  assert.match(html, /board-facepile/); assert.match(html, />\+2</); assert.ok(!html.includes('@organization'));
  assert.match(html, /\+20 \/ 30d/); assert.match(html, /data-help=/); assert.ok(!html.includes('tabindex="0" title='));
});
