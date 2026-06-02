// Outbound side-effects on status transitions: a native desktop notification
// (so a permission prompt isn't missed) and a fire-and-forget status webhook
// (Slack / Discord channel / custom). Both best-effort — they must never throw
// into the daemon's render loop. The decision helpers are pure + tested.

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

// Best-effort native desktop notification. Never throws.
export function desktopNotify(title, body = '') {
  try {
    const p = platform();
    if (p === 'darwin') {
      const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
      spawn('osascript', ['-e', script], { stdio: 'ignore', detached: true }).unref();
    } else if (p === 'win32') {
      const script = `Add-Type -AssemblyName System.Windows.Forms;`
        + `$n=New-Object System.Windows.Forms.NotifyIcon;`
        + `$n.Icon=[System.Drawing.SystemIcons]::Information;$n.Visible=$true;`
        + `$n.ShowBalloonTip(5000, ${JSON.stringify(title)}, ${JSON.stringify(body)}, 'Info')`;
      spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', detached: true, windowsHide: true }).unref();
    } else {
      spawn('notify-send', ['-a', 'Claude Code', title, body], { stdio: 'ignore', detached: true }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

// Fire-and-forget JSON POST. Never throws. Uses global fetch (Node 18+).
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

// Should a status transition fire the webhook? Pure — exported for tests.
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
