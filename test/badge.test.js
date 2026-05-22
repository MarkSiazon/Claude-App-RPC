// badge.js + card.js. Range parsing covers the new named tokens
// (year/month/week) introduced for the poster.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { badgeSvg, rangeToDays, rangeLabel } = await import('../src/badge.js');
const { renderCard } = await import('../src/card.js');

const fakeAgg = {
  activeMs: 100 * 3_600_000,
  sessions: 50,
  userMessages: 1000,
  inputTokens: 1_000_000,
  outputTokens: 200_000,
  cacheReadTokens: 500_000,
  cacheWriteTokens: 50_000,
  linesAdded: 24_000,
  linesRemoved: 6_000,
  estimatedCost: 89.42,
  streak: 23,
  longestStreak: 30,
  daysSinceFirst: 53,
  topEditedFiles: [{ path: 'src/scanner.js', count: 32 }],
  languages: { JavaScript: { edits: 200, files: 12 }, TypeScript: { edits: 90, files: 5 } },
  byDay: {
    '2026-05-22': { activeMs: 4 * 3_600_000, userMessages: 18, linesAdded: 320, cost: 1.23, inputTokens: 12000, outputTokens: 6000, cacheReadTokens: 4000, cacheWriteTokens: 0, sessions: 1 },
    '2026-05-21': { activeMs: 2 * 3_600_000, userMessages: 8, linesAdded: 150, cost: 0.55, inputTokens: 8000, outputTokens: 3000, cacheReadTokens: 0, cacheWriteTokens: 0, sessions: 1 },
  },
  byWeekday: {
    1: { activeMs: 12 * 3_600_000 },   // Monday
    2: { activeMs: 8 * 3_600_000 },
  },
  peakHour: { hour: 14, activeMs: 20 * 3_600_000 },
};

// ── rangeToDays / rangeLabel ──────────────────────────────────────────

test('rangeToDays handles named tokens', () => {
  assert.equal(rangeToDays('year'), 365);
  assert.equal(rangeToDays('month'), 30);
  assert.equal(rangeToDays('week'), 7);
  assert.equal(rangeToDays('day'), 1);
  assert.equal(rangeToDays('all'), null);
});

test('rangeToDays handles numeric forms', () => {
  assert.equal(rangeToDays('30'), 30);
  assert.equal(rangeToDays('7d'), 7);
  assert.equal(rangeToDays('365'), 365);
});

test('rangeToDays: garbage → null', () => {
  assert.equal(rangeToDays('garbage'), null);
  assert.equal(rangeToDays(''), null);
  assert.equal(rangeToDays(null), null);
});

test('rangeLabel: pretty form for badges', () => {
  assert.equal(rangeLabel('year'), 'year');
  assert.equal(rangeLabel('month'), 'month');
  assert.equal(rangeLabel('week'), 'week');
  assert.equal(rangeLabel('all'), 'all-time');
  // '30' matches the month regex (`30d?`) so it normalizes to 'month'.
  // Numeric forms outside the named windows get the 'Nd' shape.
  assert.equal(rangeLabel('14'), '14d');
});

// ── badgeSvg ──────────────────────────────────────────────────────────

test('badgeSvg: produces an SVG string with the metric value', () => {
  const svg = badgeSvg({ aggregate: fakeAgg, metric: 'streak' });
  assert.match(svg, /^<svg/);
  assert.ok(svg.includes('23 days'), 'streak value rendered');
});

test('badgeSvg: handles year range', () => {
  const svg = badgeSvg({ aggregate: fakeAgg, metric: 'hours', range: 'year' });
  assert.ok(svg.includes('year'), 'range label visible in badge text');
});

test('badgeSvg: falls back gracefully for unknown metric', () => {
  const svg = badgeSvg({ aggregate: fakeAgg, metric: 'whatever' });
  assert.match(svg, /^<svg/);
});

// ── renderCard ────────────────────────────────────────────────────────

test('renderCard: produces a valid-shaped SVG', () => {
  const svg = renderCard(fakeAgg, { range: 'year' });
  assert.match(svg, /^<svg/);
  assert.match(svg, /<\/svg>$/);
  assert.ok(svg.includes('TIME WITH CLAUDE'), 'hero card label present');
  assert.ok(svg.includes('JavaScript') || svg.includes('TypeScript'), 'top language rendered');
});

test('renderCard: title varies by range', () => {
  assert.ok(renderCard(fakeAgg, { range: 'year' }).includes('year on claude'));
  assert.ok(renderCard(fakeAgg, { range: 'month' }).includes('month on claude'));
  assert.ok(renderCard(fakeAgg, { range: 'week' }).includes('week on claude'));
  assert.ok(renderCard(fakeAgg, { range: 'all' }).includes('on claude'));
});

test('renderCard: empty aggregate doesn\'t crash', () => {
  const svg = renderCard({}, { range: 'year' });
  assert.match(svg, /^<svg/);
});
