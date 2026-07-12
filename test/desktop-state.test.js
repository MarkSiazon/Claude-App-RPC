import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { deriveDesktopState, resetDesktopState } from '../src/desktop-state.js';

const defaultConfig = {
  idleThresholdSec: 60,
  desktop: { detectWindowTitle: true, showWindowTitle: false },
};

describe('deriveDesktopState', () => {
  beforeEach(() => {
    resetDesktopState();
  });

  it('returns stale when process is not running', () => {
    const { state } = deriveDesktopState({ running: false, windowTitle: null, startTime: null }, defaultConfig);
    assert.equal(state.status, 'stale');
    assert.equal(state.claudeClosed, true);
    assert.equal(state._desktopMode, true);
  });

  it('returns active when process first detected', () => {
    const { state, aggregate } = deriveDesktopState(
      { running: true, windowTitle: 'Claude', startTime: new Date() },
      defaultConfig,
    );
    assert.equal(state.status, 'active');
    assert.equal(state.claudeClosed, false);
    assert.equal(aggregate.newSession, true);
  });

  it('stays active when window title changes', () => {
    // First detection — new session.
    deriveDesktopState({ running: true, windowTitle: 'Claude', startTime: new Date() }, defaultConfig);
    // Second detection — title changed.
    const { state } = deriveDesktopState(
      { running: true, windowTitle: 'Claude - New Chat', startTime: new Date() },
      defaultConfig,
    );
    assert.equal(state.status, 'active');
  });

  it('transitions to idle after idleThresholdSec with no title change', () => {
    // Use a very short idle threshold for testing.
    const config = { ...defaultConfig, idleThresholdSec: 0 };
    // First tick.
    deriveDesktopState({ running: true, windowTitle: 'Claude', startTime: new Date() }, config);
    // Second tick — same title, threshold is 0 so immediately idle.
    const { state } = deriveDesktopState(
      { running: true, windowTitle: 'Claude', startTime: new Date() },
      config,
    );
    assert.equal(state.status, 'idle');
  });

  it('transitions to stale when process disappears', () => {
    // Start running.
    deriveDesktopState({ running: true, windowTitle: 'Claude', startTime: new Date() }, defaultConfig);
    // Process gone.
    const { state, aggregate } = deriveDesktopState(
      { running: false, windowTitle: null, startTime: null },
      defaultConfig,
    );
    assert.equal(state.status, 'stale');
    assert.equal(aggregate.sessionEnded, true);
  });

  it('starts new session when process reappears after stale', () => {
    // Running → gone → running again.
    deriveDesktopState({ running: true, windowTitle: 'Claude', startTime: new Date() }, defaultConfig);
    deriveDesktopState({ running: false, windowTitle: null, startTime: null }, defaultConfig);
    const { state, aggregate } = deriveDesktopState(
      { running: true, windowTitle: 'Claude', startTime: new Date() },
      defaultConfig,
    );
    assert.equal(state.status, 'active');
    assert.equal(aggregate.newSession, true);
  });

  it('returns idle state when detection is null (unknown)', () => {
    const { state } = deriveDesktopState({ running: null, windowTitle: null, startTime: null }, defaultConfig);
    assert.equal(state.status, 'idle');
  });

  it('accumulates deltaMs between ticks when running', () => {
    deriveDesktopState({ running: true, windowTitle: 'Claude', startTime: new Date() }, defaultConfig);
    // Small delay simulation — in tests this is near-zero, but the field should exist.
    const { aggregate } = deriveDesktopState(
      { running: true, windowTitle: 'Claude', startTime: new Date() },
      defaultConfig,
    );
    assert.equal(typeof aggregate.deltaMs, 'number');
    assert.ok(aggregate.deltaMs >= 0);
  });

  it('treats process as always active when detectWindowTitle is off', () => {
    const config = { idleThresholdSec: 0, desktop: { detectWindowTitle: false } };
    deriveDesktopState({ running: true, windowTitle: 'Claude', startTime: new Date() }, config);
    // Even with idleThreshold=0, title detection off means always "active".
    const { state } = deriveDesktopState(
      { running: true, windowTitle: 'Claude', startTime: new Date() },
      config,
    );
    assert.equal(state.status, 'active');
  });

  it('state includes expected fields', () => {
    const { state } = deriveDesktopState(
      { running: true, windowTitle: 'Claude', startTime: new Date() },
      defaultConfig,
    );
    assert.equal(state.model, null);
    assert.equal(state.cwd, null);
    assert.equal(state.messages, 0);
    assert.equal(state.tools, 0);
    assert.ok(state.tokens);
    assert.equal(state._desktopMode, true);
    assert.ok(state.sessionStart > 0);
    assert.ok(state.lastActivity > 0);
  });
});
