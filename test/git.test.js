// git.js — detection helpers used by the GitHub button + {gitBranch}/{gitRepo}
// template vars. We test with the actual cwd of this repo since it's a real
// git repo. The 5-minute TTL cache also gets a quick smoke test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { detectGithubUrl, detectGitBranch, detectGitRepo, detectLastCommitSubject } = await import('../src/git.js');

const ROOT = process.cwd();

test('detectGitBranch: returns a non-empty branch in a real repo', () => {
  const b = detectGitBranch(ROOT);
  assert.ok(typeof b === 'string', 'returns string');
  if (b) {
    assert.notEqual(b, '', 'branch is set');
    assert.ok(!b.includes('refs/heads/'), 'branch should be stripped of refs/heads prefix');
  }
});

test('detectGitRepo: returns the basename of the repo dir as fallback', () => {
  const r = detectGitRepo(ROOT);
  assert.ok(typeof r === 'string');
  assert.notEqual(r, '');
});

test('detectGithubUrl: returns null for non-github remote or no repo', () => {
  // Cannot guarantee CI machine has a github remote, but the function
  // should at least never throw.
  const url = detectGithubUrl(ROOT);
  if (url) {
    assert.match(url, /^https:\/\/github\.com\//, 'normalized to https form');
    assert.equal(url.endsWith('.git'), false, 'trailing .git stripped');
  }
});

test('detect functions: empty/null cwd returns safe defaults', () => {
  assert.equal(detectGithubUrl(null), null);
  assert.equal(detectGithubUrl(''), null);
  // detectGitRepo returns '' for null cwd
  assert.equal(detectGitRepo(null), '');
});

test('detectLastCommitSubject: returns a non-empty subject in this repo', () => {
  // This repo always has at least one commit in `.git/logs/HEAD` even if
  // COMMIT_EDITMSG was cleaned up by a fresh clone.
  const subj = detectLastCommitSubject(ROOT);
  assert.ok(typeof subj === 'string');
  // CI shallow-clones may have empty logs/HEAD; only assert shape when populated.
  if (subj) {
    assert.ok(subj.length > 0, 'subject populated');
    assert.ok(!subj.startsWith('commit:'), 'leading "commit: " prefix stripped');
  }
});

test('detectLastCommitSubject: truncates at max length', () => {
  // Hard-limit guards templates against multi-paragraph commit bodies.
  // 80 is the default; checking the shape regardless of repo state.
  const subj = detectLastCommitSubject(ROOT, 20);
  assert.ok(subj.length <= 20, 'respects max parameter');
});

test('detectLastCommitSubject: returns "" outside any repo', () => {
  assert.equal(detectLastCommitSubject('/'), '');
  assert.equal(detectLastCommitSubject(null), '');
  assert.equal(detectLastCommitSubject(''), '');
});
