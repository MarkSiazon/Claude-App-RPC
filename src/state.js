import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import { STATE_PATH, STATE_DIR } from './paths.js';

const DEFAULT_STATE = {
  sessionStart: null,
  lastActivity: null,
  lastUserPrompt: null,
  lastNotification: null,
  status: 'idle',
  currentTool: null,
  currentFile: null,
  // Set by PreCompact, cleared by PostCompact. While non-null the daemon
  // renders the `compacting` frame so the card never reads "thinking"
  // during a context squeeze (which is mechanically distinct from reasoning).
  compactStartedAt: null,
  compactTrigger: null,
  // Set by PreToolUse, cleared by PostToolUse. format.js derives {toolElapsed}
  // from this when the working tool has been running long enough to be
  // worth surfacing (>5s by default — quick reads don't flicker on the card).
  toolStartedAt: null,
  // Set by PostToolUse when a `git push` or `git commit` is observed.
  // format.applyShipped promotes status to 'shipped' for shippedFrameSec
  // (default 60s) after this timestamp, so the card briefly celebrates
  // a ship instead of immediately returning to "Working in <project>".
  justShipped: null,
  justShippedKind: null,     // 'push' | 'commit'
  justShippedSubject: null,
  justShippedBranch: null,
  model: 'claude',
  cwd: process.cwd(),
  messages: 0,
  tools: 0,
  filesOpened: [],
  filesEdited: [],
  filesRead: [],
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  toolBreakdown: {},
  // Set true by the SessionEnd hook; cleared by any other hook event.
  // When true, the daemon goes stale instantly instead of waiting on the
  // staleSessionMin timeout — the cleanest "Claude is closed" signal we have.
  claudeClosed: false,
};

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function readState() {
  ensureDir();
  if (!existsSync(STATE_PATH)) return { ...DEFAULT_STATE };
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeState(next) {
  ensureDir();
  const tmp = STATE_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(next, null, 2));
  renameSync(tmp, STATE_PATH);
}

export function updateState(mutator) {
  const current = readState();
  const next = mutator({ ...current }) ?? current;
  writeState(next);
  return next;
}

export function resetState(seed = {}) {
  const fresh = { ...DEFAULT_STATE, sessionStart: Date.now(), lastActivity: Date.now(), ...seed };
  writeState(fresh);
  return fresh;
}

export function pushUnique(arr, value, max = 50) {
  if (!value) return arr;
  const filtered = arr.filter((v) => v !== value);
  filtered.unshift(value);
  return filtered.slice(0, max);
}

export function shortFile(path) {
  if (!path) return null;
  return basename(path);
}
