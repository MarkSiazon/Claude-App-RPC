// Pure-function coverage for src/gist.js. The spawn/fetch paths are not
// exercised here — they'd require either a real gh CLI + auth or a live
// GitHub token, neither of which is appropriate for the smoke suite. The
// URL parser, raw-URL builder, markdown snippet, and the cheap `hasGh`
// probe are all we can verify hermetically.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { parseGistUrl, rawGistUrl, gistMarkdown, hasGh, publishGistFile } =
  await import('../src/gist.js');

test('parseGistUrl: extracts owner + id from an https URL', () => {
  const r = parseGistUrl('https://gist.github.com/archersimmons/abc123def456789012345678901234567890');
  assert.ok(r);
  assert.equal(r.owner, 'archersimmons');
  assert.equal(r.id, 'abc123def456789012345678901234567890');
});

test('parseGistUrl: handles URLs with trailing slashes / paths', () => {
  const r = parseGistUrl('https://gist.github.com/me/deadbeef1234/');
  assert.equal(r.owner, 'me');
  assert.equal(r.id, 'deadbeef1234');
});

test('parseGistUrl: rejects non-matching input', () => {
  assert.equal(parseGistUrl(''), null);
  assert.equal(parseGistUrl(null), null);
  assert.equal(parseGistUrl('https://github.com/me/repo'), null);
  assert.equal(parseGistUrl('not a url'), null);
});

test('rawGistUrl: builds the gist.githubusercontent.com/<owner>/<id>/raw/<file> form', () => {
  assert.equal(
    rawGistUrl({ owner: 'me', id: 'abc', filename: 'claude.svg' }),
    'https://gist.githubusercontent.com/me/abc/raw/claude.svg',
  );
});

test('gistMarkdown: emits a README-ready image tag', () => {
  const md = gistMarkdown({ owner: 'me', id: 'abc', filename: 'claude.svg', label: 'Claude stats' });
  assert.equal(md, '![Claude stats](https://gist.githubusercontent.com/me/abc/raw/claude.svg)');
});

test('gistMarkdown: defaults the alt-text label', () => {
  const md = gistMarkdown({ owner: 'me', id: 'abc', filename: 'claude.svg' });
  assert.match(md, /^!\[Claude\]/);
});

test('hasGh: probe never throws (returns boolean either way)', () => {
  const r = hasGh();
  assert.equal(typeof r, 'boolean');
});

test('publishGistFile: rejects empty svg with a clear error', async () => {
  await assert.rejects(
    () => publishGistFile({ svg: '' }),
    /svg must be a non-empty string/,
  );
});

test('publishGistFile: no gh + no token throws an actionable error', async (t) => {
  // Force the no-gh path by clearing the env tokens AND only running this
  // when `gh` actually isn't installed. If gh IS present we skip — we'd
  // rather not poke the real GitHub API from a smoke test.
  if (hasGh()) return t.skip('gh available — no-token branch would skip itself');
  const origGh = process.env.GH_TOKEN;
  const origGit = process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  try {
    await assert.rejects(
      () => publishGistFile({ svg: '<svg/>' }),
      /gh.+CLI.+GH_TOKEN/,
    );
  } finally {
    if (origGh !== undefined) process.env.GH_TOKEN = origGh;
    if (origGit !== undefined) process.env.GITHUB_TOKEN = origGit;
  }
});
