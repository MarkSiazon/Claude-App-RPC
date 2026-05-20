#!/usr/bin/env node
// Local web dashboard for Claude RPC. Zero deps; opens automatically.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { basename } from 'node:path';
import { readState } from './state.js';
import { buildVars, fillTemplate, applyIdle, framePasses } from './format.js';
import { readAggregate, findLiveSessions } from './scanner.js';
import { CONFIG_PATH } from './paths.js';

const PORT = Number(process.env.CLAUDE_RPC_PORT) || 47474;

function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

function snapshot() {
  const config = loadConfig();
  const live = findLiveSessions({ thresholdMs: 90_000 });
  let state = readState();
  state.liveSessions = live;
  state = applyIdle(state, config);
  const aggregate = readAggregate() || {};
  const vars = buildVars(state, config, aggregate);
  const p = config.presence || {};
  const frames = (p.rotation || []).map((f) => ({
    details: fillTemplate(f.details || '', vars),
    state: fillTemplate(f.state || '', vars),
    passes: framePasses(f, vars),
    requires: f.requires || null,
  }));
  return {
    now: Date.now(),
    state,
    aggregate: {
      sessions: aggregate.sessions,
      subagentRuns: aggregate.subagentRuns,
      userMessages: aggregate.userMessages,
      toolCalls: aggregate.toolCalls,
      uniqueFiles: aggregate.uniqueFiles,
      activeMs: aggregate.activeMs,
      wallMs: aggregate.wallMs,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      cacheReadTokens: aggregate.cacheReadTokens,
      cacheWriteTokens: aggregate.cacheWriteTokens,
      byDay: aggregate.byDay || {},
      byHour: aggregate.byHour || {},
      projects: aggregate.projects || {},
      toolBreakdown: aggregate.toolBreakdown || {},
      topEditedFiles: (aggregate.topEditedFiles || []).slice(0, 10).map((e) => ({ file: basename(e.path), count: e.count })),
      streak: aggregate.streak,
      longestStreak: aggregate.longestStreak,
      daysSinceFirst: aggregate.daysSinceFirst,
      bestDay: aggregate.bestDay,
      peakHour: aggregate.peakHour,
    },
    vars,
    frames,
  };
}

const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Claude</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0a0a;
    --surface: rgba(255,255,255,0.025);
    --surface-hover: rgba(255,255,255,0.045);
    --border: rgba(255,255,255,0.08);
    --text: #ffffff;
    --text-2: rgba(255,255,255,0.62);
    --text-3: rgba(255,255,255,0.36);
    --text-4: rgba(255,255,255,0.16);
    --green: #4ade80;
    --amber: #fbbf24;
    --radius: 14px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::selection { background: rgba(255,255,255,0.16); }
  html, body { background: var(--bg); color: var(--text); }
  body {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    font-feature-settings: 'cv11','ss01';
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    font-variant-numeric: tabular-nums;
    min-height: 100vh;
  }
  .num { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
  a { color: inherit; text-decoration: none; }

  /* ── Layout ────────────────────────────────────────────── */
  .page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 40px 80px;
  }

  /* ── Top bar ───────────────────────────────────────────── */
  .topbar {
    display: flex; align-items: center; gap: 16px;
    padding-bottom: 16px;
    margin-bottom: 64px;
    border-bottom: 1px solid var(--border);
  }
  .brand {
    display: flex; align-items: center; gap: 10px;
    font-weight: 500; font-size: 15px;
    letter-spacing: -0.01em;
  }
  .brand .mark {
    width: 22px; height: 22px;
    display: inline-grid; place-items: center;
    background: linear-gradient(135deg, #ffffff 0%, #c0c0c0 100%);
    color: #0a0a0a; border-radius: 6px;
    font-weight: 700; font-size: 12px;
  }
  .brand .sep { color: var(--text-4); margin: 0 4px; }
  .brand .meta { color: var(--text-3); font-weight: 400; font-size: 13px; }
  .top-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .status {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--text-2);
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .status .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 3px rgba(74,222,128,0.16);
    animation: pulse 2s ease-in-out infinite;
  }
  .status .dot.idle { background: var(--amber); box-shadow: 0 0 0 3px rgba(251,191,36,0.16); animation: none; }
  .status .dot.stale { background: var(--text-4); box-shadow: none; animation: none; }
  @keyframes pulse {
    0%,100% { box-shadow: 0 0 0 3px rgba(74,222,128,0.16); }
    50%     { box-shadow: 0 0 0 6px rgba(74,222,128,0.04); }
  }
  .model {
    font-size: 13px; color: var(--text-3);
  }

  /* ── Hero (single-row, asymmetric) ─────────────────────── */
  .hero {
    display: grid;
    grid-template-columns: 1fr 1.4fr;
    gap: 64px;
    align-items: end;
    margin-bottom: 64px;
  }
  .hero .num-block {
    display: flex; flex-direction: column;
  }
  .hero .num-block .eyebrow {
    font-size: 12px; color: var(--text-3);
    text-transform: uppercase; letter-spacing: 0.12em;
    font-weight: 500;
    margin-bottom: 18px;
  }
  .hero .num-block .stat {
    display: flex; align-items: baseline; gap: 12px;
    font-weight: 600; line-height: 0.92;
    letter-spacing: -0.05em;
    color: var(--text);
  }
  .hero .num-block .stat .figure {
    font-size: 96px;
    font-weight: 600;
  }
  .hero .num-block .stat .unit {
    font-size: 22px;
    color: var(--text-2);
    font-weight: 400;
    letter-spacing: -0.01em;
  }
  .hero .num-block .caption {
    margin-top: 22px;
    color: var(--text-2);
    font-size: 14px;
    line-height: 1.55;
    max-width: 360px;
  }
  .hero .num-block .caption strong { color: var(--text); font-weight: 500; }

  /* Inline activity chart in the hero */
  .hero .chart-block {
    display: flex; flex-direction: column;
  }
  .hero .chart-block .chart-head {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 14px;
  }
  .hero .chart-block .chart-title {
    font-size: 12px; color: var(--text-3);
    text-transform: uppercase; letter-spacing: 0.12em;
    font-weight: 500;
  }
  .hero .chart-block .chart-side {
    font-size: 12px; color: var(--text-3);
  }
  .hero .chart-block .chart-side strong { color: var(--text-2); font-weight: 500; }
  .chart-wrap { position: relative; height: 140px; }
  svg.chart { width: 100%; height: 100%; display: block; overflow: visible; }
  svg.chart .grid { stroke: var(--border); stroke-width: 1; }
  svg.chart .area { fill: url(#whiteGrad); }
  svg.chart .line { fill: none; stroke: var(--text); stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  svg.chart .dot  { fill: var(--text); }
  svg.chart .ax   { fill: var(--text-3); font-size: 10px; font-family: 'Inter', sans-serif; font-weight: 500; letter-spacing: 0.04em; }

  /* ── Stat row (3 cards) ────────────────────────────────── */
  .stat-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 64px;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px 24px;
    transition: background 0.18s, border-color 0.18s;
  }
  .stat-card:hover { background: var(--surface-hover); border-color: rgba(255,255,255,0.12); }
  .stat-card .label {
    font-size: 12px; color: var(--text-3);
    text-transform: uppercase; letter-spacing: 0.1em;
    font-weight: 500;
  }
  .stat-card .value {
    margin-top: 14px;
    display: flex; align-items: baseline; gap: 8px;
    font-size: 36px; font-weight: 600;
    letter-spacing: -0.035em;
    line-height: 1;
  }
  .stat-card .value .unit { font-size: 15px; color: var(--text-3); font-weight: 400; letter-spacing: 0; }
  .stat-card .meta {
    margin-top: 14px;
    font-size: 13px; color: var(--text-2);
    display: flex; align-items: center; gap: 8px;
  }
  .delta {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 12px; font-weight: 500;
    padding: 2px 7px;
    background: rgba(255,255,255,0.04);
    border-radius: 4px;
  }
  .delta.up   { color: var(--green); background: rgba(74,222,128,0.08); }
  .delta.down { color: #f87171; background: rgba(248,113,113,0.08); }
  .delta.flat { color: var(--text-3); }

  /* ── Section heading ───────────────────────────────────── */
  .section-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 22px;
  }
  .section-head h2 {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-3);
    text-transform: uppercase; letter-spacing: 0.12em;
  }
  .section-head .right {
    font-size: 12px; color: var(--text-3);
  }
  section { margin-bottom: 64px; }

  /* ── Compact tables (leaderboards) ─────────────────────── */
  .lb-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  }
  .lb {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .lb-h {
    display: flex; justify-content: space-between; align-items: baseline;
    padding: 16px 18px 12px;
  }
  .lb-h .t  { font-size: 13px; color: var(--text); font-weight: 500; }
  .lb-h .s  { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
  .lb table { width: 100%; border-collapse: collapse; }
  .lb td { padding: 9px 18px; font-size: 13px; }
  .lb tr { border-top: 1px solid var(--border); }
  .lb td.name { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 1px; }
  .lb td.val  { color: var(--text-2); text-align: right; white-space: nowrap; }
  .lb td.val .u { color: var(--text-3); margin-left: 3px; font-size: 12px; }
  .lb tr:hover td { background: rgba(255,255,255,0.02); }

  /* ── Discord card ──────────────────────────────────────── */
  .discord {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 32px;
  }
  .discord-h {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 20px;
  }
  .discord-h .t { font-size: 13px; color: var(--text); font-weight: 500; }
  .discord-h .s { font-size: 12px; color: var(--text-3); }
  .live-frame {
    padding: 28px 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  .live-frame .label-tag {
    font-size: 10px; color: var(--green);
    letter-spacing: 0.16em; text-transform: uppercase;
    font-weight: 600;
    margin-bottom: 10px;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .live-frame .label-tag::before {
    content: ''; width: 4px; height: 4px; border-radius: 50%;
    background: var(--green); box-shadow: 0 0 0 2px rgba(74,222,128,0.2);
  }
  .live-frame .details {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.2;
    color: var(--text);
    margin-bottom: 4px;
  }
  .live-frame .state {
    font-size: 14px; color: var(--text-2);
  }
  .rotation-list {
    list-style: none;
    margin-top: 18px;
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 18px;
  }
  .rotation-list li {
    display: flex; align-items: center; gap: 10px;
    font-size: 12.5px; color: var(--text-2);
    padding: 6px 0;
  }
  .rotation-list li .pip {
    width: 4px; height: 4px; border-radius: 50%;
    background: var(--text-4); flex-shrink: 0;
  }
  .rotation-list li.live .pip   { background: var(--green); }
  .rotation-list li.skip        { color: var(--text-3); }
  .rotation-list li.current     { color: var(--text); }
  .rotation-list li.current .pip { background: var(--text); box-shadow: 0 0 0 2px rgba(255,255,255,0.2); }
  .rotation-list li .frame-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }

  footer {
    margin-top: 64px; padding-top: 22px;
    border-top: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px; color: var(--text-3);
  }
  footer .pulse {
    display: inline-flex; align-items: center; gap: 6px;
  }
  footer .pulse-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--green); opacity: 0.6;
  }

  /* ── Responsive ────────────────────────────────────────── */
  @media (max-width: 960px) {
    .hero { grid-template-columns: 1fr; gap: 48px; }
    .stat-row { grid-template-columns: 1fr; }
    .lb-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) {
    .page { padding: 24px 20px 56px; }
    .hero .num-block .stat .figure { font-size: 72px; }
    .topbar { flex-wrap: wrap; }
    .rotation-list { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<main class="page">

  <header class="topbar">
    <div class="brand">
      <span class="mark">◆</span>
      <span>Claude</span>
      <span class="sep">·</span>
      <span class="meta" id="meta">—</span>
    </div>
    <div class="top-right">
      <span class="model" id="model">—</span>
      <span class="status"><span class="dot" id="dot"></span><span id="statustext">—</span></span>
    </div>
  </header>

  <section class="hero">
    <div class="num-block">
      <div class="eyebrow">Active time</div>
      <div class="stat">
        <span class="figure" id="hero-num">—</span>
        <span class="unit" id="hero-unit">hours</span>
      </div>
      <div class="caption" id="hero-caption">—</div>
    </div>

    <div class="chart-block">
      <div class="chart-head">
        <span class="chart-title">Last 90 days</span>
        <span class="chart-side"><strong id="chart-total">—</strong> <span style="color: var(--text-4); margin: 0 6px;">·</span> peak <strong id="chart-peak">—</strong></span>
      </div>
      <div class="chart-wrap">
        <svg id="chart" class="chart" viewBox="0 0 800 140" preserveAspectRatio="none">
          <defs>
            <linearGradient id="whiteGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stop-color="#ffffff" stop-opacity="0.14"/>
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  </section>

  <section class="stat-row">
    <div class="stat-card">
      <div class="label">Today</div>
      <div class="value"><span id="today-num">—</span><span class="unit" id="today-unit">hrs</span></div>
      <div class="meta">
        <span class="delta" id="today-delta">—</span>
        <span id="today-sub" class="num">—</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="label">This week</div>
      <div class="value"><span id="week-num">—</span><span class="unit" id="week-unit">hrs</span></div>
      <div class="meta">
        <span class="delta" id="week-delta">—</span>
        <span id="week-sub" class="num">—</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="label">Streak</div>
      <div class="value"><span id="streak-num">—</span><span class="unit">days</span></div>
      <div class="meta">
        <span id="streak-sub">—</span>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>Tokens</h2>
      <div class="right"><span id="tok-cache-pct">—</span> from cache</div>
    </div>
    <div class="stat-row" style="margin-bottom: 0;">
      <div class="stat-card">
        <div class="label">Grand total</div>
        <div class="value"><span id="tok-grand">—</span></div>
        <div class="meta"><span class="num" id="tok-grand-sub">in + out + cache</span></div>
      </div>
      <div class="stat-card">
        <div class="label">Output</div>
        <div class="value"><span id="tok-out">—</span></div>
        <div class="meta"><span class="num" id="tok-in-sub">input —</span></div>
      </div>
      <div class="stat-card">
        <div class="label">Cache</div>
        <div class="value"><span id="tok-cache">—</span></div>
        <div class="meta"><span class="num" id="tok-cache-sub">read — · write —</span></div>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>Top projects · tools · files</h2>
      <div class="right" id="lb-meta">across <span id="lb-sessions">—</span> sessions</div>
    </div>
    <div class="lb-grid">
      <div class="lb">
        <div class="lb-h"><span class="t">Projects</span><span class="s">by hours</span></div>
        <table id="projects-tbl"></table>
      </div>
      <div class="lb">
        <div class="lb-h"><span class="t">Tools</span><span class="s">by calls</span></div>
        <table id="tools-tbl"></table>
      </div>
      <div class="lb">
        <div class="lb-h"><span class="t">Files</span><span class="s">by edits</span></div>
        <table id="files-tbl"></table>
      </div>
    </div>
  </section>

  <section>
    <div class="section-head">
      <h2>Discord presence</h2>
      <div class="right"><span id="frames-live">—</span> live · <span id="frames-total">—</span> total</div>
    </div>
    <div class="discord">
      <div class="discord-h">
        <span class="t">Now showing</span>
        <span class="s" id="frame-no">—</span>
      </div>
      <div class="live-frame">
        <div class="label-tag">On air</div>
        <div class="details" id="frame-details">—</div>
        <div class="state" id="frame-state">—</div>
      </div>
      <ul class="rotation-list" id="rotation-list"></ul>
    </div>
  </section>

  <footer>
    <span class="pulse"><span class="pulse-dot"></span>auto · 2s</span>
    <span>127.0.0.1:${PORT}</span>
  </footer>
</main>

<script>
(() => {
  const $ = (id) => document.getElementById(id);

  const dayKey = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  };
  const splitTime = (s) => {
    if (!s) return ['—', ''];
    const m = String(s).match(/^([\d.]+)([a-z]*)$/i);
    return m ? [m[1], m[2]] : [s, ''];
  };
  const parseShort = (s) => {
    if (!s) return 0;
    const m = String(s).match(/^([\d.]+)\s*([kMBT]?)$/);
    if (!m) return 0;
    const mult = { '': 1, k: 1e3, M: 1e6, B: 1e9, T: 1e12 }[m[2]] || 1;
    return parseFloat(m[1]) * mult;
  };
  const fmtH = (ms) => {
    if (!ms) return '0h';
    const h = ms / 3_600_000;
    if (h < 1) return Math.round(h * 60) + 'm';
    if (h < 10) return h.toFixed(1) + 'h';
    return Math.round(h) + 'h';
  };
  const fmtDelta = (ms) => {
    const sign = ms >= 0 ? '+' : '−';
    return sign + fmtH(Math.abs(ms));
  };
  const setDelta = (node, ms, suffix) => {
    if (ms === 0) {
      node.className = 'delta flat';
      node.textContent = '—';
      return;
    }
    const sign = ms > 0 ? 'up' : 'down';
    const arrow = ms > 0 ? '↑' : '↓';
    node.className = 'delta ' + sign;
    node.textContent = arrow + ' ' + fmtH(Math.abs(ms)) + (suffix ? ' ' + suffix : '');
  };

  // ── SVG area chart for 90 days ────────────────────────────
  function renderChart(byDay) {
    const svg = $('chart');
    [...svg.querySelectorAll('.dyn')].forEach((n) => n.remove());
    const ns = 'http://www.w3.org/2000/svg';

    const VIEW_W = 800, VIEW_H = 140;
    const PAD_T = 8, PAD_B = 18;

    const today = new Date(); today.setHours(0,0,0,0);
    const series = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ms = (byDay[dayKey(d.getTime())] || {}).activeMs || 0;
      series.push({ d, ms });
    }
    const max = Math.max(...series.map((p) => p.ms), 1);
    const h = VIEW_H - PAD_T - PAD_B;

    const xAt = (i) => (i / (series.length - 1)) * VIEW_W;
    const yAt = (ms) => PAD_T + h - (ms / max) * h;

    // 3 subtle grid lines
    for (let r = 1; r <= 3; r++) {
      const y = PAD_T + (h / 3) * r;
      const ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('x2', VIEW_W);
      ln.setAttribute('y1', y); ln.setAttribute('y2', y);
      ln.setAttribute('class', 'grid dyn');
      svg.appendChild(ln);
    }

    // Build path
    let path = '';
    series.forEach((p, i) => {
      const x = xAt(i), y = yAt(p.ms);
      path += (i === 0 ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1);
    });

    // Area
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', path + ' L' + xAt(series.length - 1).toFixed(1) + ',' + (PAD_T + h) + ' L0,' + (PAD_T + h) + ' Z');
    area.setAttribute('class', 'area dyn');
    svg.appendChild(area);

    // Line
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', path);
    line.setAttribute('class', 'line dyn');
    svg.appendChild(line);

    // Last point dot
    const last = series[series.length - 1];
    if (last.ms > 0) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', xAt(series.length - 1));
      dot.setAttribute('cy', yAt(last.ms));
      dot.setAttribute('r', 3);
      dot.setAttribute('class', 'dot dyn');
      svg.appendChild(dot);
    }

    // Month axis labels
    let lastMonth = -1;
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    series.forEach((p, i) => {
      if (p.d.getMonth() !== lastMonth && p.d.getDate() <= 7) {
        lastMonth = p.d.getMonth();
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', xAt(i) + 4);
        t.setAttribute('y', VIEW_H - 4);
        t.setAttribute('class', 'ax dyn');
        t.textContent = months[p.d.getMonth()];
        svg.appendChild(t);
      }
    });

    // Compute summary
    const totalMs = series.reduce((s, p) => s + p.ms, 0);
    const peakDay = series.reduce((m, p) => p.ms > m.ms ? p : m, { ms: 0, d: null });
    $('chart-total').textContent = fmtH(totalMs) + ' total';
    $('chart-peak').textContent = peakDay.ms > 0 ? fmtH(peakDay.ms) + ' on ' + peakDay.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  }

  // ── Tables ────────────────────────────────────────────────
  function renderTable(target, rows, opts = {}) {
    const tbl = $(target);
    tbl.innerHTML = '';
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="name">' + (opts.mono ? '<code style="font-family: inherit;">' + r.name + '</code>' : r.name) + '</td>' +
        '<td class="val">' + r.val + (r.unit ? '<span class="u">' + r.unit + '</span>' : '') + '</td>';
      tbl.appendChild(tr);
    });
  }

  // ── Discord rotation ──────────────────────────────────────
  let allFrames = [];
  let currentLiveIdx = 0;
  function renderRotation() {
    const live = allFrames.filter((f) => f.passes);
    if (live.length) {
      currentLiveIdx = currentLiveIdx % live.length;
      const f = live[currentLiveIdx];
      $('frame-details').textContent = f.details || '—';
      $('frame-state').textContent = f.state || '—';
      const liveOrder = allFrames.map((af, i) => af.passes ? i : -1).filter((i) => i >= 0);
      const allIdx = liveOrder[currentLiveIdx];
      $('frame-no').textContent = 'Frame ' + (allIdx + 1) + ' of ' + allFrames.length;
    }
    $('frames-live').textContent = live.length;
    $('frames-total').textContent = allFrames.length;

    const ul = $('rotation-list');
    ul.innerHTML = '';
    const liveOrder = allFrames.map((af, i) => af.passes ? i : -1).filter((i) => i >= 0);
    const onAir = liveOrder[currentLiveIdx];
    allFrames.forEach((f, i) => {
      const li = document.createElement('li');
      const isCurrent = i === onAir;
      const cls = isCurrent ? 'current' : f.passes ? 'live' : 'skip';
      li.className = cls;
      const summary = f.passes
        ? (f.details || '—') + (f.state ? ' · ' + f.state : '')
        : (f.details || '—');
      li.innerHTML = '<span class="pip"></span><span class="frame-text">' + summary + '</span>';
      ul.appendChild(li);
    });
  }

  async function tick() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      const data = await r.json();
      const a = data.aggregate;
      const v = data.vars;
      const s = data.state;

      // ── Top bar
      const now = new Date();
      $('meta').textContent = 'No. ' + (v.daysSinceFirst || '—') + ' · ' + now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      $('model').textContent = v.modelPretty;
      $('statustext').textContent = v.statusVerbose;
      $('dot').className = 'dot ' + (s.status === 'working' || s.status === 'thinking' ? '' : s.status === 'idle' ? 'idle' : 'stale');

      // ── Hero
      const [hn, hu] = splitTime(v.allHours);
      $('hero-num').textContent = hn;
      $('hero-unit').textContent = hu === 'h' ? 'hours' : hu === 'm' ? 'minutes' : hu;
      const sessionsStr = (a.sessions || 0).toLocaleString();
      const promptsStr  = (a.userMessages || 0).toLocaleString();
      $('hero-caption').innerHTML =
        'on Claude Code · day <strong>' + (v.daysSinceFirst || 1) + '</strong> · ' +
        '<strong>' + sessionsStr + '</strong> sessions · ' +
        '<strong>' + promptsStr + '</strong> prompts answered.';

      // ── Chart
      renderChart(a.byDay || {});

      // ── Today / Week / Streak
      const [tn, tu] = splitTime(v.todayHours);
      $('today-num').textContent = tn;
      $('today-unit').textContent = tu === 'h' ? 'hrs' : tu;
      $('today-sub').textContent = (v.todayPrompts || 0) + ' prompts · ' + (v.todayTokensFmt || '0');

      const today = new Date(); today.setHours(0,0,0,0);
      const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
      const tMs = (a.byDay[dayKey(today.getTime())] || {}).activeMs || 0;
      const yMs = (a.byDay[dayKey(yest.getTime())]  || {}).activeMs || 0;
      setDelta($('today-delta'), tMs - yMs, 'vs yest.');

      const [wn, wu] = splitTime(v.weekHours);
      $('week-num').textContent = wn;
      $('week-unit').textContent = wu === 'h' ? 'hrs' : wu;
      $('week-sub').textContent = (v.weekPrompts || 0) + ' prompts · ' + (v.weekTokensFmt || '0');

      let last7 = 0, prev7 = 0;
      for (let i = 0; i < 7; i++) {
        const a1 = new Date(today); a1.setDate(a1.getDate() - i);
        const b1 = new Date(today); b1.setDate(b1.getDate() - i - 7);
        last7 += (a.byDay[dayKey(a1.getTime())] || {}).activeMs || 0;
        prev7 += (a.byDay[dayKey(b1.getTime())] || {}).activeMs || 0;
      }
      setDelta($('week-delta'), last7 - prev7, 'vs prev 7d');

      $('streak-num').textContent = v.streak;
      $('streak-sub').textContent = 'Longest ' + v.longestStreak + ' · best day ' + (v.bestDayHours || '—');

      // ── Tokens
      $('tok-grand').textContent = v.allTokensFmt;
      $('tok-out').textContent = v.allOutputTokens;
      const cache = parseShort(v.allCacheReadTokens) + parseShort(v.allCacheWriteTokens);
      $('tok-cache').textContent = fmtShort(cache);
      $('tok-in-sub').textContent = 'input ' + v.allInputTokens;
      $('tok-cache-sub').textContent = 'read ' + v.allCacheReadTokens + ' · write ' + v.allCacheWriteTokens;
      const total = parseShort(v.allTokensFmt) || 1;
      $('tok-cache-pct').textContent = Math.round((cache / total) * 100) + '%';

      // ── Leaderboards
      const projs = Object.entries(a.projects || {})
        .sort((x, y) => y[1].activeMs - x[1].activeMs).slice(0, 6);
      renderTable('projects-tbl', projs.map(([name, p]) => {
        const h = p.activeMs / 3_600_000;
        const val = h < 1 ? Math.round(h * 60) : (h < 10 ? h.toFixed(1) : Math.round(h));
        return { name, val: String(val), unit: h < 1 ? 'm' : 'h' };
      }));

      const tools = Object.entries(a.toolBreakdown || {})
        .sort((x, y) => y[1] - x[1]).slice(0, 6);
      renderTable('tools-tbl', tools.map(([name, count]) => ({
        name, val: count.toLocaleString(), unit: '',
      })), { mono: true });

      const files = (a.topEditedFiles || []).slice(0, 6);
      renderTable('files-tbl', files.map((f) => ({
        name: f.file, val: f.count.toLocaleString(), unit: '',
      })), { mono: true });

      $('lb-sessions').textContent = (a.sessions || 0).toLocaleString();

      // ── Discord
      allFrames = data.frames || [];
      renderRotation();
    } catch (e) {
      console.error(e);
    }
  }

  function fmtShort(n) {
    if (n < 1000) return String(n);
    if (n < 1e6)  return (n / 1e3).toFixed(1) + 'k';
    if (n < 1e9)  return (n / 1e6).toFixed(2) + 'M';
    return (n / 1e9).toFixed(2) + 'B';
  }

  tick();
  setInterval(tick, 2000);
  setInterval(() => { currentLiveIdx++; renderRotation(); }, 4000);
})();
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  if (req.url === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(snapshot()));
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(HTML);
    return;
  }
  res.writeHead(404).end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`◆ Claude RPC dashboard: ${url}`);
  console.log('  Ctrl-C to stop.');
  const opener = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(opener, () => {});
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
