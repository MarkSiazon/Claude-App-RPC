// State derivation for the Claude Desktop App.
//
// Unlike Claude Code (which fires lifecycle hooks with rich metadata), the
// desktop app exposes only three signals: process presence, window title, and
// start time. This module converts those into a state object compatible with
// the daemon's existing presence pipeline.
//
// State transitions:
//   process running + title changed recently  → 'active'
//   process running + title unchanged > idle  → 'idle'
//   process not detected                      → 'stale'
//
// The module is pure — no IO, no timers. The daemon calls deriveDesktopState()
// on each poll tick with the latest detection result and previous state.

import { localDateStamp } from './fmt.js';

// Internal memory (module-scoped, not persisted across daemon restarts).
let lastTitle = null;
let lastTitleChangeAt = null;
let sessionStartAt = null;
let wasRunning = false;

// Aggregate accumulator (passed back so daemon can persist to aggregate.json).
let pendingActiveMs = 0;
let lastTickAt = null;

// Reset internal state (exported for tests).
export function resetDesktopState() {
  lastTitle = null;
  lastTitleChangeAt = null;
  sessionStartAt = null;
  wasRunning = false;
  pendingActiveMs = 0;
  lastTickAt = null;
}

// Derive state from the latest detection result.
//
// detection: { running: bool|null, windowTitle: string|null, startTime: Date|null }
// config:    full config object (uses .desktop and .idleThresholdSec)
//
// Returns: { state, aggregate }
//   state: object compatible with the daemon's state schema
//   aggregate: { deltaMs, sessionEnded, day } for the daemon to persist
export function deriveDesktopState(detection, config = {}) {
  const now = Date.now();
  const idleMs = (config.idleThresholdSec ?? 60) * 1000;
  const detectTitle = config.desktop?.detectWindowTitle !== false;

  const agg = { deltaMs: 0, sessionEnded: false, day: localDateStamp(new Date()) };

  // Unknown state (detection failed) — keep previous, don't transition.
  if (detection.running === null) {
    return {
      state: buildState('idle', now),
      aggregate: agg,
    };
  }

  // Process not running → stale.
  if (!detection.running) {
    if (wasRunning && lastTickAt) {
      // Flush remaining active time from last tick.
      agg.deltaMs = now - lastTickAt;
      agg.sessionEnded = true;
    }
    wasRunning = false;
    sessionStartAt = null;
    lastTitle = null;
    lastTitleChangeAt = null;
    lastTickAt = null;

    return {
      state: buildState('stale', now),
      aggregate: agg,
    };
  }

  // Process IS running.
  // Accumulate active time since last tick.
  if (lastTickAt && wasRunning) {
    agg.deltaMs = now - lastTickAt;
  }
  lastTickAt = now;

  // New session? (wasn't running before, or first poll)
  if (!wasRunning) {
    wasRunning = true;
    sessionStartAt = detection.startTime ? detection.startTime.getTime() : now;
    lastTitleChangeAt = now;
    lastTitle = detection.windowTitle;
    agg.sessionEnded = false; // new session starting

    return {
      state: buildState('active', now),
      aggregate: { ...agg, newSession: true },
    };
  }

  // Ongoing session — check for title changes to detect activity.
  let status;
  if (!detectTitle) {
    // When title detection is off, process running = always active (no idle).
    lastTitleChangeAt = now;
    status = 'active';
  } else {
    if (detection.windowTitle !== null && detection.windowTitle !== lastTitle) {
      lastTitle = detection.windowTitle;
      lastTitleChangeAt = now;
    }
    // Determine active vs idle based on time since last title change.
    const sinceTitleChange = now - (lastTitleChangeAt || sessionStartAt || now);
    status = sinceTitleChange >= idleMs ? 'idle' : 'active';
  }

  return {
    state: buildState(status, now),
    aggregate: agg,
  };
}

function buildState(status, now) {
  return {
    status,
    sessionStart: sessionStartAt || now,
    lastActivity: lastTitleChangeAt || sessionStartAt || now,
    model: null,
    cwd: null,
    messages: 0,
    tools: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    claudeClosed: status === 'stale',
    _desktopMode: true,
  };
}
