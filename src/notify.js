// Outbound side-effects on status transitions: a native desktop notification
// (so a permission prompt isn't missed) and a fire-and-forget status webhook
// (Slack / Discord channel / custom). Both best-effort — they must never throw
// into the daemon's render loop. The decision helpers are pure + tested.

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Best-effort native desktop notification (osascript / PowerShell / notify-send).
 * Never throws — a missing notifier binary is swallowed.
 * @param {string} title - Notification title.
 * @param {string} [body] - Notification body text.
 * @returns {boolean} true if a notifier was spawned, false on failure.
 */
export function desktopNotify(title, body = '') {
  try {
    const p = platform();
    // A missing notifier binary (e.g. no `notify-send`) makes spawn emit an
    // async 'error' event — with no listener that surfaces as an UNCAUGHT
    // exception that the sync try/catch below can't stop, which would crash
    // the daemon's render loop. The no-op 'error' listener keeps the promise
    // in this function ("never throws") actually true.
    const swallow = (child) => {
      child.on('error', () => {});
      child.unref();
    };
    if (p === 'darwin') {
      const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
      swallow(spawn('osascript', ['-e', script], { stdio: 'ignore', detached: true }));
    } else if (p === 'win32') {
      const script = `Add-Type -AssemblyName System.Windows.Forms;`
        + `$n=New-Object System.Windows.Forms.NotifyIcon;`
        + `$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;`
        + `$n.ShowBalloonTip(5000, ${JSON.stringify(title)}, ${JSON.stringify(body)}, 'Info')`;
      swallow(spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', detached: true, windowsHide: true }));
    } else {
      swallow(spawn('notify-send', ['-a', 'Claude Code', title, body], { stdio: 'ignore', detached: true }));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget JSON POST. Never throws; rejections are swallowed.
 * Uses global fetch (Node 18+).
 * @param {string} url - Webhook endpoint. Falsy → no-op.
 * @param {unknown} payload - JSON-serializable body.
 * @returns {void}
 */
export function postWebhook(url, payload) {
  try {
    if (!url || typeof fetch !== 'function') return;
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}

/**
 * Should a status transition fire the webhook? Pure — exported for tests.
 * @param {{url?: string, on?: string[]}} webhookCfg - Webhook config.
 * @param {string} prevStatus - Previous presence status.
 * @param {string} newStatus - Incoming presence status.
 * @returns {boolean}
 */
export function shouldWebhook(webhookCfg, prevStatus, newStatus) {
  if (!webhookCfg || !webhookCfg.url) return false;
  if (prevStatus === newStatus) return false;
  const on = Array.isArray(webhookCfg.on) ? webhookCfg.on : [];
  return on.includes(newStatus);
}

// Should a status transition raise a desktop notification? Pure — tested.
export function shouldNotify(notifyCfg, prevStatus, newStatus) {
  if (!notifyCfg || !notifyCfg.enabled) return false;
  if (prevStatus === newStatus) return false;
  return notifyCfg.onNotification !== false && newStatus === 'notification';
}
