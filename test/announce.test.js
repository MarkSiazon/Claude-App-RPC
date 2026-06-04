// scripts/announce.js — CHANGELOG parsing + per-channel draft generation for
// the release-announcement workflow. Pure functions only; no IO here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseLatestChangelog, buildAnnouncements, buildIssueBody } =
  await import('../scripts/announce.js');

const SAMPLE = `# Changelog

## [0.13.0] - 2026-06-04

**Added**

- **First thing.** does a thing for users.
- **Second thing.** another improvement.

**Fixed**

- **A bug.** squashed it.

## [0.12.1] - 2026-06-02

**Added**

- **Old thing.** should not appear.
`;

test('parseLatestChangelog: extracts version, date, and only the top section bullets', () => {
  const p = parseLatestChangelog(SAMPLE);
  assert.equal(p.version, '0.13.0');
  assert.equal(p.date, '2026-06-04');
  const titles = p.bullets.map((b) => b.title);
  assert.deepEqual(titles, ['First thing', 'Second thing', 'A bug']);
  assert.ok(!titles.includes('Old thing'), 'does not bleed into the previous version');
  assert.equal(p.bullets[0].body, 'does a thing for users.');
});

test('parseLatestChangelog: returns null when there is no version section', () => {
  assert.equal(parseLatestChangelog('# Changelog\n\nnothing here'), null);
});

test('buildAnnouncements: produces all channels with version + install command', () => {
  const drafts = buildAnnouncements({ version: '0.13.0', bullets: [{ title: 'First thing', body: 'x' }] });
  for (const k of ['showHN', 'reddit', 'devto', 'twitter', 'discord', 'github']) {
    assert.ok(typeof drafts[k] === 'string' && drafts[k].length, `${k} present`);
    assert.match(drafts[k], /npx claude-rpc setup/, `${k} has install command`);
  }
  assert.match(drafts.showHN, /Show HN: claude-rpc v0\.13\.0/);
  assert.match(drafts.showHN, /First thing/);
});

test('buildAnnouncements: each channel link carries its ?ref= attribution', () => {
  const d = buildAnnouncements({ version: '1.0.0', bullets: [] });
  assert.match(d.showHN, /\?ref=hn/);
  assert.match(d.reddit, /\?ref=reddit/);
  assert.match(d.devto, /\?ref=devto/);
  assert.match(d.twitter, /\?ref=twitter/);
  assert.match(d.discord, /\?ref=discord/);
});

test('buildIssueBody: wraps drafts and states nothing is auto-posted', () => {
  const parsed = { version: '0.13.0', date: '2026-06-04' };
  const body = buildIssueBody(parsed, buildAnnouncements({ version: '0.13.0', bullets: [] }));
  assert.match(body, /v0\.13\.0/);
  assert.match(body, /nothing here is posted automatically/);
  assert.match(body, /## Show HN/);
  assert.match(body, /## Reddit/);
});
