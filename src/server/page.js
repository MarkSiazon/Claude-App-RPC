// All browser-side assets for the local web dashboard, packaged as JS
// string constants so the bundler picks them up cleanly. Single export
// is `buildHtml({ port })`.
//
// ┌─ TABLE OF CONTENTS ─────────────────────────────────────┐
// │  §1  CSS                — stylesheet (light + dark)     │ ~line 26
// │  §2  LANG_PALETTE       — language → swatch hex         │ ~line 400
// │  §3  buildHtml          — HTML scaffold + interpolation │ ~line 420
// │  §4  HTML_SCRIPT_BODY   — client runtime (SSE, charts,  │ ~line 700
// │                            range selector, drilldowns,  │
// │                            theme toggle, keyboard)      │
// └─────────────────────────────────────────────────────────┘
//
// Each section is just a string constant — no runtime dependencies
// between them. Edit one without re-reading the others.

// ─────────────────────────────────────────────────────────────────────
// §1  CSS
// ─────────────────────────────────────────────────────────────────────

const CSS = `
:root {
  --paper: #f4ede0;
  --paper-dark: #ebe2d2;
  --ink: #1a1611;
  --ink-soft: #2d2520;
  --ink-mute: #5c5147;
  --ink-faint: #8a7c6d;
  
  --rust: #c2491e;
  --tape: #f2d76e;
  --grass: #4a9462;
  
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --font-disp: 'Space Grotesk', sans-serif;
  
  --shadow: 3px 3px 0 var(--ink);
  --shadow-hover: 5px 5px 0 var(--ink);
  --radius: 0;
  
  /* Fallbacks for existing variables used by page.js */
  --bg: var(--paper);
  --text: var(--ink);
  --text-2: var(--ink-soft);
  --text-3: var(--ink-mute);
  --text-4: var(--ink-faint);
  --border: var(--ink);
  --surface: #fff;
  --surface-hover: var(--paper);
  --green: var(--grass);
  --red: #c54a3a;
  --purple: #5865f2; /* using blurple */
  --amber: var(--tape);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
::selection { background: rgba(26,22,17,0.16); }
html, body { background: var(--paper); color: var(--ink); }
body {
  font-family: var(--font-sans);
  font-size: 14px; line-height: 1.5;
  min-height: 100vh;
  background-image: radial-gradient(circle at 1px 1px, rgba(26,22,17,0.07) 1px, transparent 0);
  background-size: 20px 20px;
}
.num { font-variant-numeric: tabular-nums; }
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; background: none; border: none; cursor: pointer; }
h1, h2, h3 { font-family: var(--font-disp); }

.page { max-width: 1000px; margin: 0 auto; padding: 40px 40px 100px; }

/* ── Top bar ─────────────────────────────────────────── */
.topbar {
  display: flex; justify-content: space-between; align-items: center;
  padding-bottom: 24px;
  border-bottom: 2px dashed var(--ink-mute);
  margin-bottom: 40px;
}
.brand {
  display: flex; align-items: center; gap: 12px;
  font-family: var(--font-disp);
  font-weight: 700; font-size: 24px;
}
.brand .mark {
  width: 32px; height: 32px;
  background: var(--ink); color: var(--paper);
  font-family: var(--font-mono); font-size: 14px;
  display: grid; place-items: center;
  border: 2px solid var(--ink);
  box-shadow: 2px 2px 0 var(--rust);
  transform: rotate(-3deg);
}
.brand .sep { display: none; }
.brand .meta { display: none; }
.top-right { margin-left: auto; display: flex; align-items: center; gap: 16px; }

.range-pills {
  display: inline-flex; gap: 4px;
}
.range-pills button {
  font-family: var(--font-mono);
  font-size: 12px; padding: 6px 12px; font-weight: 700;
  border: 2px solid transparent; text-transform: uppercase;
  transition: transform 0.12s;
}
.range-pills button:hover { transform: translateY(-2px); }
.range-pills button.active {
  background: var(--tape);
  border-color: var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
  transform: rotate(2deg);
}

.status {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-mono);
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  background: var(--grass); color: var(--paper);
  padding: 6px 12px; border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink);
  transform: rotate(-2deg);
}
.status .dot { display: none; }
.theme-btn { display: none; } /* Hide theme toggle, we only use paper now */
.model { font-family: var(--font-mono); font-size: 12px; font-weight: 700; background: #fff; padding: 4px 8px; border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); }

/* ── Live rail ───────────────────────────────────────── */
.live-rail {
  display: grid; grid-template-columns: 80px 1fr auto; gap: 24px; align-items: center;
  background: #fff; padding: 24px;
  border: 2px solid var(--ink); box-shadow: var(--shadow);
  margin-bottom: 48px; position: relative;
  transform: rotate(-0.5deg); transition: transform 0.2s, box-shadow 0.2s;
}
.live-rail:hover { transform: rotate(0deg) translate(-2px, -2px); box-shadow: var(--shadow-hover); }
.live-rail::before {
  content: "LIVE PREVIEW"; position: absolute; top: -12px; right: 24px;
  background: var(--tape); font-family: var(--font-mono); font-weight: 700; font-size: 11px;
  padding: 4px 10px; border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); transform: rotate(3deg);
}
.live-rail .avatar {
  width: 80px; height: 80px; background: var(--paper-dark);
  border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink) inset; overflow: hidden;
}
.live-rail .avatar img { width: 100%; height: 100%; object-fit: cover; }
.live-rail .frame-app { display: none; }
.live-rail .frame-details { font-family: var(--font-disp); font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.live-rail .frame-state { font-family: var(--font-mono); font-size: 13px; color: var(--ink-mute); }
.live-rail .right { text-align: right; border-left: 2px dashed var(--ink); padding-left: 24px; }
.live-rail .right .frame-num { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink-mute); margin-bottom: 8px; text-transform: uppercase; }
.live-rail .right .elapsed { font-family: var(--font-mono); font-size: 24px; font-weight: 700; }

/* ── Hero ────────────────────────────────────────────── */
.hero {
  display: grid; grid-template-columns: 1fr 1.4fr; gap: 56px;
  align-items: end; margin-bottom: 48px;
}
.hero .eyebrow {
  font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-mute);
  text-transform: uppercase; margin-bottom: 12px;
  border-bottom: 2px solid var(--rust); display: inline-block; padding-bottom: 4px;
}
.hero .figure { font-family: var(--font-disp); font-size: 86px; font-weight: 700; line-height: 0.92; letter-spacing: -0.05em; }
.hero .unit { font-family: var(--font-mono); font-size: 24px; color: var(--ink-mute); margin-left: 10px; font-weight: 700; }
.hero .caption { margin-top: 20px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); max-width: 380px; }

.chart-block .chart-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; font-family: var(--font-mono); font-weight: 700; }
.chart-block .chart-title { font-size: 12px; color: var(--ink-mute); text-transform: uppercase; }
.chart-block .chart-side  { font-size: 12px; color: var(--ink-mute); }
.chart-block .chart-side strong { color: var(--ink); }
.chart-wrap { position: relative; height: 130px; background: #fff; border: 2px solid var(--ink); box-shadow: var(--shadow); padding: 12px; }
svg.chart { width: 100%; height: 100%; overflow: visible; }
svg.chart .grid { stroke: var(--ink-faint); stroke-width: 1; stroke-dasharray: 2 2; }
svg.chart .area { fill: url(#whiteGrad); }
svg.chart .line { fill: none; stroke: var(--rust); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
svg.chart .dot  { fill: var(--rust); stroke: #fff; stroke-width: 2px; }
svg.chart .ax   { fill: var(--ink-mute); font-size: 10px; font-family: var(--font-mono); font-weight: 700; }

/* ── Stat cards ──────────────────────────────────────── */
.stat-row {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px;
  margin-bottom: 48px;
}
.stat-card {
  background: #fff; border: 2px solid var(--ink); padding: 24px;
  box-shadow: var(--shadow); position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}
.stat-card:hover { transform: translate(-2px, -2px); box-shadow: var(--shadow-hover); }
.stat-card::before {
  content: ''; position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
  width: 40px; height: 16px; background: rgba(0,0,0,0.05); /* tape piece effect */
}
.stat-card .label { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink-mute); text-transform: uppercase; border-bottom: 2px solid var(--rust); display: inline-block; padding-bottom: 4px; }
.stat-card .value { margin-top: 16px; display: flex; align-items: baseline; gap: 6px; font-family: var(--font-disp); font-size: 36px; font-weight: 700; line-height: 1; }
.stat-card .value .unit { font-family: var(--font-mono); font-size: 16px; color: var(--ink-mute); font-weight: 700; }
.stat-card .meta { margin-top: 12px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-mute); font-weight: 500; }
.delta { font-weight: 700; }
.delta.up   { color: var(--grass); }
.delta.down { color: var(--rust); }
.delta.flat { color: var(--ink-mute); }

/* ── Split: cost + languages ─────────────────────── */
.split-row { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; margin-bottom: 48px; }
.card { background: #fff; border: 2px solid var(--ink); padding: 24px; box-shadow: var(--shadow); position: relative; }
.card-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; font-family: var(--font-mono); font-weight: 700; }
.card-h h3 { font-size: 14px; text-transform: uppercase; border-bottom: 2px solid var(--rust); display: inline-block; padding-bottom: 4px; }
.card-h .meta { font-size: 11px; color: var(--ink-mute); }

.cost-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; align-items: center; }
.cost-figure { font-family: var(--font-disp); font-size: 48px; font-weight: 700; line-height: 1; }
.cost-sub { font-family: var(--font-mono); color: var(--ink-mute); font-size: 12px; margin-top: 8px; font-weight: 700; }
.cost-bars { display: grid; gap: 12px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; }
.cost-bar { display: grid; grid-template-columns: 60px 1fr auto; gap: 8px; align-items: center; }
.cost-bar .name { color: var(--ink-soft); }
.cost-bar .track { height: 8px; background: var(--paper-dark); border: 1.5px solid var(--ink); overflow: hidden; }
.cost-bar .fill { height: 100%; background: var(--purple); border-right: 1.5px solid var(--ink); }
.cost-bar .val { color: var(--ink); }

.lang-stack { display: flex; height: 16px; background: var(--paper-dark); border: 2px solid var(--ink); margin-bottom: 20px; box-shadow: 2px 2px 0 var(--ink); }
.lang-stack > span { display: block; border-right: 1.5px solid var(--ink); }
.lang-stack > span:last-child { border-right: none; }
.lang-list { display: grid; gap: 8px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; }
.lang-list .row { display: grid; grid-template-columns: 14px 1fr auto; gap: 10px; align-items: center; }
.lang-list .swatch { width: 14px; height: 14px; border: 2px solid var(--ink); }
.lang-list .val { color: var(--ink-mute); }

/* ── Code churn ──────────────────────────────────── */
.churn-row { display: grid; grid-template-columns: 1fr 200px; gap: 32px; align-items: center; }
.churn-spark svg { width: 100%; height: 60px; display: block; overflow: visible; }
.churn-spark .add { fill: var(--grass); stroke: var(--ink); stroke-width: 1.5; }
.churn-spark .rem { fill: var(--rust); stroke: var(--ink); stroke-width: 1.5; }
.churn-numbers { display: grid; gap: 8px; font-family: var(--font-mono); font-size: 13px; font-weight: 700; }
.churn-numbers .row { display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1.5px dashed var(--ink-faint); }
.churn-numbers .row:last-child { border-bottom: none; }
.churn-numbers .label { color: var(--ink-mute); }
.churn-numbers .added { color: var(--grass); }
.churn-numbers .removed { color: var(--rust); }
.churn-numbers .net { color: var(--ink); }

/* ── Section heading ─────────────────────────────────── */
.section-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px; font-family: var(--font-mono); font-weight: 700; }
.section-head h2 { font-size: 16px; text-transform: uppercase; background: var(--tape); display: inline-block; padding: 4px 12px; border: 2px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); transform: rotate(-1deg); }
.section-head .right { font-size: 12px; color: var(--ink-mute); }
section { margin-bottom: 48px; }

/* ── Leaderboards ────────────────────────────────────── */
.lb-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.lb { background: #fff; border: 2px solid var(--ink); box-shadow: var(--shadow); position: relative; }
.lb-h { display: flex; justify-content: space-between; align-items: baseline; padding: 16px 20px 12px; font-family: var(--font-mono); font-weight: 700; border-bottom: 2px solid var(--ink); background: var(--paper-dark); }
.lb-h .t { font-size: 13px; text-transform: uppercase; }
.lb-h .s { font-size: 11px; color: var(--ink-mute); }
.lb table { width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-weight: 600; font-size: 12px; }
.lb td { padding: 10px 20px; border-bottom: 1.5px dashed var(--ink-faint); }
.lb tr:last-child td { border-bottom: none; }
.lb tr:hover td { background: var(--paper); }
.lb td.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 1px; color: var(--ink); }
.lb td.val  { color: var(--ink-soft); text-align: right; white-space: nowrap; }
.lb td.name .ico { width: 12px; height: 12px; border: 1.5px solid var(--ink); margin-right: 8px; vertical-align: -2px; }

/* ── Discord card ────────────────────────────────────── */
.discord { background: #fff; border: 2px solid var(--ink); padding: 32px; box-shadow: var(--shadow); position: relative; }
.discord-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; font-family: var(--font-mono); font-weight: 700; }
.discord-h .t { font-size: 14px; text-transform: uppercase; border-bottom: 2px solid var(--rust); padding-bottom: 4px; }
.live-frame { padding: 24px 0; border-top: 2px solid var(--ink); border-bottom: 2px dashed var(--ink); }
.live-frame .label-tag { font-family: var(--font-mono); font-size: 11px; font-weight: 700; background: var(--grass); color: #fff; padding: 4px 8px; border: 1.5px solid var(--ink); box-shadow: 2px 2px 0 var(--ink); display: inline-block; margin-bottom: 12px; transform: rotate(-2deg); }
.live-frame .label-tag::before { display: none; }
.live-frame .details { font-family: var(--font-disp); font-size: 24px; font-weight: 700; margin-bottom: 4px; }
.live-frame .state { font-family: var(--font-mono); font-size: 13px; color: var(--ink-soft); font-weight: 600; }
.rotation-list { list-style: none; margin-top: 24px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 24px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; }
.rotation-list li { display: flex; align-items: center; gap: 10px; color: var(--ink-soft); }
.rotation-list li .pip { width: 8px; height: 8px; background: var(--paper-dark); border: 1.5px solid var(--ink); flex-shrink: 0; }
.rotation-list li.live .pip { background: var(--grass); }
.rotation-list li.current { color: var(--ink); }
.rotation-list li.current .pip { background: var(--ink); box-shadow: 2px 2px 0 var(--ink); }

/* ── Achievements, Insights, Modals ─────────────────── */
.achievements { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 48px; }
.achievement { background: #fff; border: 2px dashed var(--ink-faint); padding: 16px; text-align: center; opacity: 0.5; transition: all 0.2s; }
.achievement.unlocked { opacity: 1; border: 2px solid var(--ink); box-shadow: var(--shadow); transform: rotate(1deg); }
.achievement .ico { font-size: 24px; margin-bottom: 8px; display: block; }
.achievement .t { font-family: var(--font-mono); font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
.achievement .s { font-size: 11px; color: var(--ink-mute); }

.insights { background: #fff; border: 2px solid var(--ink); padding: 24px; margin-bottom: 48px; box-shadow: var(--shadow); display: grid; gap: 12px; }
.insights .insight { display: flex; align-items: baseline; gap: 12px; font-family: var(--font-mono); font-size: 13px; font-weight: 600; }
.insights .insight::before { content: '→'; color: var(--rust); font-weight: 700; }

.scrim { position: fixed; inset: 0; background: rgba(26,22,17,0.4); backdrop-filter: blur(2px); display: none; z-index: 50; }
.scrim.open { display: block; }
.drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 100%; background: var(--paper); border-left: 2px solid var(--ink); transform: translateX(100%); transition: transform 0.2s ease; z-index: 60; padding: 40px; overflow-y: auto; box-shadow: -10px 0 30px rgba(0,0,0,0.1); }
.drawer.open { transform: translateX(0); }
.drawer h3 { font-family: var(--font-disp); font-size: 28px; margin-bottom: 8px; }
.drawer .sub { font-family: var(--font-mono); color: var(--ink-mute); font-weight: 700; margin-bottom: 32px; }

.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.96); background: var(--paper); border: 2px solid var(--ink); padding: 40px; box-shadow: 10px 10px 0 var(--ink); z-index: 60; opacity: 0; pointer-events: none; transition: all 0.2s; }
.modal.open { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }
.modal h4 { font-family: var(--font-disp); font-size: 24px; margin-bottom: 8px; }

footer { margin-top: 60px; padding-top: 32px; border-top: 2px dashed var(--ink); display: flex; justify-content: space-between; align-items: center; font-family: var(--font-mono); font-weight: 700; font-size: 12px; color: var(--ink-mute); }
footer .pulse-dot { background: var(--grass); border: 1.5px solid var(--ink); }

/* ── Heatmap ─────────────────────────────────────────── */
.heatmap-card { padding: 20px 22px; }
.heatmap { display: grid; grid-template-columns: 20px 1fr; gap: 6px; }
.heatmap .day-labels { display: grid; grid-template-rows: repeat(7, 12px); gap: 3px; font-size: 9px; color: var(--text-3); padding-top: 14px; }
.heatmap .grid {
  display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 12px); gap: 3px;
  font-size: 0;
}
.heatmap .cell { width: 12px; height: 12px; border-radius: 2px; background: rgba(0,0,0,0.06); cursor: pointer; transition: transform 0.1s; }
.heatmap .cell:hover { transform: scale(1.4); outline: 1px solid var(--text); }

/* ── Help overlay ────────────────────────────────────── */
.help { position: fixed; inset: 0; background: rgba(26,22,17,0.7); display: none; z-index: 70; align-items: center; justify-content: center; }
.help.open { display: flex; }
.help-card { background: var(--paper); border: 2px solid var(--ink); box-shadow: var(--shadow); padding: 28px 32px; max-width: 420px; width: 90%; }
.help-card h4 { font-family: var(--font-disp); font-size: 20px; margin-bottom: 16px; }
.help-card .kbd { display: inline-block; padding: 2px 6px; border: 1.5px solid var(--ink); background: #fff; font-size: 11px; font-family: var(--font-mono); margin-right: 8px; font-weight: 700; box-shadow: 1.5px 1.5px 0 var(--ink); }
.help-card .row { display: flex; padding: 8px 0; border-top: 1.5px dashed var(--ink-faint); font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-soft); }
.help-card .row:first-of-type { border-top: 0; }
.help-card .keys { width: 110px; }

/* ── Responsive ──────────────────────────────────────── */
@media (max-width: 1100px) {
  .stat-row { grid-template-columns: repeat(2, 1fr); }
  .split-row { grid-template-columns: 1fr; }
  .achievements { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 760px) {
  .hero { grid-template-columns: 1fr; gap: 28px; }
  .lb-grid { grid-template-columns: 1fr; }
  .rotation-list { grid-template-columns: 1fr; }
  .drawer { width: 100%; }
}
`;

// ─────────────────────────────────────────────────────────────────────
// §2  LANG_PALETTE — language → swatch hex
// ─────────────────────────────────────────────────────────────────────
//
// Stable across renders. Embedded as a JS object literal inside the
// client script template; the client parses it once at startup.

const LANG_PALETTE = `{
  'JavaScript': '#f7df1e', 'TypeScript': '#3178c6', 'Python': '#3776ab', 'Rust': '#dea584',
  'Go': '#00add8', 'Ruby': '#cc342d', 'Java': '#b07219', 'Kotlin': '#a97bff',
  'C': '#555', 'C++': '#f34b7d', 'C#': '#178600', 'PHP': '#4f5b93',
  'Swift': '#ffac45', 'HTML': '#e34c26', 'CSS': '#563d7c', 'SCSS': '#c6538c',
  'Markdown': '#888', 'JSON': '#888', 'Shell': '#89e051', 'YAML': '#cb171e',
  'Vue': '#41b883', 'Svelte': '#ff3e00', 'Notebook': '#da5b0b', 'SQL': '#dad8d8',
  'GraphQL': '#e10098', 'Dockerfile': '#384d54', 'Make': '#427819', 'CMake': '#da3434',
  'Lua': '#000080', 'Dart': '#00b4ab', 'Elm': '#60b5cc', 'Elixir': '#6e4a7e',
  'Erlang': '#a90533', 'Haskell': '#5d4f85', 'OCaml': '#3be133', 'Clojure': '#db5855',
  'ClojureScript': '#db5855', 'R': '#198ce7', 'Julia': '#a270ba', 'Zig': '#ec915c',
  'PowerShell': '#012456', 'Batch': '#c1f12e', 'TOML': '#9c4221', 'INI': '#888',
  'XML': '#0060ac', 'Protobuf': '#888', 'LaTeX': '#3D6117', 'Text': '#888',
  'reStructuredText': '#888', 'Lockfile': '#444', 'Gradle': '#02303a',
  'Crystal': '#000100', 'Nim': '#ffc200', 'V': '#4f87c4', 'Objective-C': '#438eff',
  'Objective-C++': '#6866fb', 'Sass': '#a53b70', 'Less': '#1d365d', 'Vue': '#41b883',
  'Scala': '#c22d40', 'Groovy': '#4298b8', 'Interface Builder': '#888', 'Env': '#888',
  'Config': '#888', 'Git': '#f1502f',
}`;

// ─────────────────────────────────────────────────────────────────────
// §3  buildHtml — HTML scaffold + interpolation
// ─────────────────────────────────────────────────────────────────────
//
// Returns the full HTML string. The only dynamic value is the port,
// which is fixed at server startup, so this is composed once and reused
// for every request (see src/server/index.js).

function buildHtml({ port }) {
  const PORT = port;
  return String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Claude</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<main class="page">

  <!-- ── Top bar ─────────────────────────────────────── -->
  <header class="topbar">
    <div class="brand">
      <span class="mark">◆</span>
      <span>Claude</span>
      <span class="sep">·</span>
      <span class="meta" id="meta">—</span>
    </div>
    <div class="top-right">
      <div class="range-pills" id="range-pills">
        <button data-range="7d">7d</button>
        <button data-range="30d">30d</button>
        <button data-range="90d" class="active">90d</button>
        <button data-range="1y">1y</button>
        <button data-range="all">All</button>
      </div>
      <button class="theme-btn" id="theme-btn" title="Toggle theme">◐</button>
      <span class="model" id="model">—</span>
      <span class="status"><span class="dot" id="dot"></span><span id="statustext">—</span></span>
    </div>
  </header>

  <!-- ── Live rail ───────────────────────────────────── -->
  <section class="live-rail" id="live-rail">
    <div class="avatar" id="live-avatar"></div>
    <div>
      <div class="frame-app">Claude Code</div>
      <div class="frame-details" id="frame-details">—</div>
      <div class="frame-state" id="frame-state">—</div>
    </div>
    <div class="right">
      <div class="frame-num" id="frame-num">—</div>
      <div class="elapsed" id="elapsed">—</div>
    </div>
  </section>

  <!-- ── Insights ────────────────────────────────────── -->
  <section class="insights" id="insights"><div class="insight">Loading…</div></section>

  <!-- ── Hero ────────────────────────────────────────── -->
  <section class="hero">
    <div>
      <div class="eyebrow">Active time</div>
      <div><span class="figure" id="hero-num">—</span><span class="unit" id="hero-unit">hours</span></div>
      <div class="caption" id="hero-caption">—</div>
    </div>
    <div class="chart-block">
      <div class="chart-head">
        <span class="chart-title" id="chart-title">Last 90 days</span>
        <span class="chart-side"><strong id="chart-total">—</strong> <span style="color: var(--text-4); margin: 0 6px;">·</span> peak <strong id="chart-peak">—</strong></span>
      </div>
      <div class="chart-wrap">
        <svg id="chart" class="chart" viewBox="0 0 800 130" preserveAspectRatio="none">
          <defs>
            <linearGradient id="whiteGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--text)" stop-opacity="0.14"/>
              <stop offset="100%" stop-color="var(--text)" stop-opacity="0"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  </section>

  <!-- ── Stat row ────────────────────────────────────── -->
  <section class="stat-row">
    <div class="stat-card">
      <div class="label">Today</div>
      <div class="value"><span id="today-num">—</span><span class="unit" id="today-unit">hrs</span></div>
      <div class="meta"><span class="delta" id="today-delta">—</span> <span id="today-sub" class="num">—</span></div>
    </div>
    <div class="stat-card">
      <div class="label">This range</div>
      <div class="value"><span id="range-num">—</span><span class="unit" id="range-unit">hrs</span></div>
      <div class="meta"><span class="delta" id="range-delta">—</span> <span id="range-sub" class="num">—</span></div>
    </div>
    <div class="stat-card">
      <div class="label">Streak</div>
      <div class="value"><span id="streak-num">—</span><span class="unit">days</span></div>
      <div class="meta"><span id="streak-sub">—</span></div>
    </div>
    <div class="stat-card">
      <div class="label">Cost · range</div>
      <div class="value"><span id="cost-num">—</span></div>
      <div class="meta"><span id="cost-sub">—</span></div>
    </div>
  </section>

  <!-- ── Achievements ────────────────────────────────── -->
  <section class="achievements" id="achievements"></section>

  <!-- ── Heatmap ─────────────────────────────────────── -->
  <section>
    <div class="section-head">
      <h2>Activity</h2>
      <div class="right" id="heatmap-meta">click a day for details</div>
    </div>
    <div class="card heatmap-card">
      <div class="heatmap">
        <div class="day-labels"><span></span><span>M</span><span></span><span>W</span><span></span><span>F</span><span></span></div>
        <div class="grid" id="heatmap-grid"></div>
      </div>
    </div>
  </section>

  <!-- ── Split: cost + languages ─────────────────────── -->
  <section class="split-row">
    <div class="card">
      <div class="card-h"><h3>Cost</h3><div class="meta" id="cost-card-meta">approximate · range</div></div>
      <div class="cost-grid">
        <div>
          <div class="cost-figure" id="cost-figure">—</div>
          <div class="cost-sub" id="cost-figure-sub">—</div>
        </div>
        <div class="cost-bars" id="cost-bars"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h3>Languages</h3><div class="meta" id="lang-meta">by edits</div></div>
      <div class="lang-stack" id="lang-stack"></div>
      <div class="lang-list" id="lang-list"></div>
    </div>
  </section>

  <!-- ── Code churn ──────────────────────────────────── -->
  <section class="card" style="margin-bottom: 28px;">
    <div class="card-h"><h3>Code churn</h3><div class="meta" id="churn-meta">lines added / removed · range</div></div>
    <div class="churn-row">
      <div class="churn-spark">
        <svg id="churn-svg" viewBox="0 0 800 60" preserveAspectRatio="none"></svg>
      </div>
      <div class="churn-numbers">
        <div class="row"><span class="label">Added</span><span class="added" id="churn-added">—</span></div>
        <div class="row"><span class="label">Removed</span><span class="removed" id="churn-removed">—</span></div>
        <div class="row"><span class="label">Net</span><span class="net" id="churn-net">—</span></div>
      </div>
    </div>
  </section>

  <!-- ── Tokens ──────────────────────────────────────── -->
  <section>
    <div class="section-head">
      <h2>Tokens</h2>
      <div class="right"><span id="tok-cache-pct">—</span> from cache</div>
    </div>
    <div class="stat-row" style="margin-bottom: 0; grid-template-columns: repeat(3, 1fr);">
      <div class="stat-card"><div class="label">Grand total</div><div class="value"><span id="tok-grand">—</span></div><div class="meta"><span class="num" id="tok-grand-sub">in + out + cache</span></div></div>
      <div class="stat-card"><div class="label">Output</div><div class="value"><span id="tok-out">—</span></div><div class="meta"><span class="num" id="tok-in-sub">input —</span></div></div>
      <div class="stat-card"><div class="label">Cache</div><div class="value"><span id="tok-cache">—</span></div><div class="meta"><span class="num" id="tok-cache-sub">read — · write —</span></div></div>
    </div>
  </section>

  <!-- ── Leaderboards ────────────────────────────────── -->
  <section>
    <div class="section-head">
      <h2>Projects · tools · files</h2>
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

  <!-- ── More leaderboards: bash + domains + subagents ─ -->
  <section>
    <div class="section-head">
      <h2>Shell · web · subagents</h2>
      <div class="right"><span id="mcp-label">—</span></div>
    </div>
    <div class="lb-grid">
      <div class="lb">
        <div class="lb-h"><span class="t">Bash commands</span><span class="s">by invocations</span></div>
        <table id="bash-tbl"></table>
      </div>
      <div class="lb">
        <div class="lb-h"><span class="t">WebFetch domains</span><span class="s">by hits</span></div>
        <table id="domains-tbl"></table>
      </div>
      <div class="lb">
        <div class="lb-h"><span class="t">Subagents</span><span class="s">by invocations</span></div>
        <table id="subagents-tbl"></table>
      </div>
    </div>
  </section>

  <!-- ── Discord card ────────────────────────────────── -->
  <section>
    <div class="section-head">
      <h2>Discord presence</h2>
      <div class="right"><span id="frames-live">—</span> live · <span id="frames-total">—</span> total</div>
    </div>
    <div class="discord">
      <div class="discord-h"><span class="t">Now showing</span><span class="s" id="frame-no">—</span></div>
      <div class="live-frame">
        <div class="label-tag">On air</div>
        <div class="details" id="frame-details-2">—</div>
        <div class="state" id="frame-state-2">—</div>
      </div>
      <ul class="rotation-list" id="rotation-list"></ul>
    </div>
  </section>

  <footer>
    <span class="pulse"><span class="pulse-dot"></span><span id="conn-state">live</span></span>
    <span>
      <a href="/api/badge.svg?metric=hours&range=7d" target="_blank">badges</a>
      ·
      <span>127.0.0.1:${PORT}</span>
      ·
      <span style="color: var(--text-4);">?</span> for help
    </span>
  </footer>
</main>

<!-- Drawer (project drilldown) -->
<div class="scrim" id="scrim"></div>
<div class="drawer" id="drawer">
  <button class="close" id="drawer-close">×</button>
  <h3 id="drawer-title">—</h3>
  <div class="sub" id="drawer-sub">—</div>
  <div class="grid" id="drawer-body"></div>
</div>

<!-- Modal (day detail) -->
<div class="modal" id="modal">
  <button class="close" id="modal-close">×</button>
  <h4 id="modal-title">—</h4>
  <div class="sub" id="modal-sub">—</div>
  <div id="modal-body"></div>
</div>

<!-- Keyboard help -->
<div class="help" id="help">
  <div class="help-card">
    <h4>Keyboard shortcuts</h4>
    <div class="row"><span class="keys"><span class="kbd">1</span><span class="kbd">5</span></span><span>switch range</span></div>
    <div class="row"><span class="keys"><span class="kbd">t</span></span><span>toggle theme</span></div>
    <div class="row"><span class="keys"><span class="kbd">esc</span></span><span>close drawer / modal</span></div>
    <div class="row"><span class="keys"><span class="kbd">?</span></span><span>this help</span></div>
  </div>
</div>

<script>
${HTML_SCRIPT_PLACEHOLDER()}
</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────
// §4  HTML_SCRIPT_BODY — client runtime
// ─────────────────────────────────────────────────────────────────────
//
// Returned as a string and inlined into the HTML at the bottom of the
// document. Vanilla browser JS — no bundler, no framework, no npm. The
// IIFE keeps all locals out of window.
//
// Sub-structure within the IIFE:
//   • $              — DOM accessor
//   • LANGS          — parsed language palette
//   • Utilities      — fmtH / fmtN / fmtCost / escape / etc.
//   • State buckets  — liveData / aggData / allFrames / rotationTimer
//   • Range pills    — active selector + delta vs previous range
//   • Charts         — area chart, sparkline, heatmap, lang stack
//   • Drilldowns     — project drawer + day-detail modal
//   • SSE wiring     — EventSource('/events') → refresh handlers
//   • Keyboard       — 1..5 range, t theme, esc close, ? help

function HTML_SCRIPT_PLACEHOLDER() {
  return `(() => {
  const $ = (id) => document.getElementById(id);
  const LANGS = ${LANG_PALETTE};

  let range = '90d';
  let liveData = null;
  let aggData = null;
  let allFrames = [];
  let currentLiveIdx = 0;
  let rotationTimer = null;

  // ── Utilities ───────────────────────────────────────────
  const fmtH = (ms) => {
    if (!ms) return '0h';
    const h = ms / 3_600_000;
    if (h < 1) return Math.round(h * 60) + 'm';
    if (h < 10) return h.toFixed(1) + 'h';
    return Math.round(h) + 'h';
  };
  const fmtN = (n) => {
    if (!n) return '0';
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1e3).toFixed(1) + 'k';
    if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
    return (n / 1e9).toFixed(2) + 'B';
  };
  const fmtCost = (usd) => {
    if (!usd) return '$0';
    if (usd < 0.01) return '$' + usd.toFixed(4);
    if (usd < 100) return '$' + usd.toFixed(2);
    if (usd < 1000) return '$' + Math.round(usd);
    if (usd < 10000) return '$' + (usd / 1000).toFixed(2) + 'k';
    return '$' + (usd / 1000).toFixed(1) + 'k';
  };
  const dayKey = (ts) => {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const splitTime = (s) => {
    if (!s) return ['—', ''];
    const m = String(s).match(/^([\\d.]+)([a-z]*)$/i);
    return m ? [m[1], m[2]] : [s, ''];
  };
  const setDelta = (node, ms, suffix) => {
    if (ms === 0) { node.className = 'delta flat'; node.textContent = '—'; return; }
    const sign = ms > 0 ? 'up' : 'down';
    const arrow = ms > 0 ? '↑' : '↓';
    node.className = 'delta ' + sign;
    node.textContent = arrow + ' ' + fmtH(Math.abs(ms)) + (suffix ? ' ' + suffix : '');
  };
  const elapsedStr = (start) => {
    if (!start) return '—';
    const s = Math.floor((Date.now() - start) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) return h + 'h ' + m + 'm';
    return m + 'm ' + (s % 60) + 's';
  };

  // ── Theme ───────────────────────────────────────────────
  function applyTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.classList.toggle('light', saved === 'light');
  }
  $('theme-btn').addEventListener('click', () => {
    const cur = localStorage.getItem('theme') || 'dark';
    localStorage.setItem('theme', cur === 'dark' ? 'light' : 'dark');
    applyTheme();
  });
  applyTheme();

  // ── Range pills ─────────────────────────────────────────
  document.querySelectorAll('#range-pills button').forEach((b) => {
    b.addEventListener('click', () => {
      range = b.dataset.range;
      for (const x of document.querySelectorAll('#range-pills button')) x.classList.toggle('active', x === b);
      $('chart-title').textContent = range === 'all' ? 'All time' : 'Last ' + range;
      fetchAggregate();
    });
  });

  // ── Chart ───────────────────────────────────────────────
  function renderChart(byDay, days) {
    const svg = $('chart');
    [...svg.querySelectorAll('.dyn')].forEach((n) => n.remove());
    const ns = 'http://www.w3.org/2000/svg';
    const VIEW_W = 800, VIEW_H = 130, PAD_T = 6, PAD_B = 16;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ms = (byDay[dayKey(d.getTime())] || {}).activeMs || 0;
      series.push({ d, ms });
    }
    const max = Math.max(...series.map((p) => p.ms), 1);
    const h = VIEW_H - PAD_T - PAD_B;
    const xAt = (i) => series.length > 1 ? (i / (series.length - 1)) * VIEW_W : VIEW_W / 2;
    const yAt = (ms) => PAD_T + h - (ms / max) * h;
    for (let r = 1; r <= 3; r++) {
      const y = PAD_T + (h / 3) * r;
      const ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', 0); ln.setAttribute('x2', VIEW_W);
      ln.setAttribute('y1', y); ln.setAttribute('y2', y);
      ln.setAttribute('class', 'grid dyn');
      svg.appendChild(ln);
    }
    let path = '';
    series.forEach((p, i) => {
      const x = xAt(i), y = yAt(p.ms);
      path += (i === 0 ? 'M' : ' L') + x.toFixed(1) + ',' + y.toFixed(1);
    });
    const area = document.createElementNS(ns, 'path');
    area.setAttribute('d', path + ' L' + xAt(series.length - 1).toFixed(1) + ',' + (PAD_T + h) + ' L0,' + (PAD_T + h) + ' Z');
    area.setAttribute('class', 'area dyn');
    svg.appendChild(area);
    const line = document.createElementNS(ns, 'path');
    line.setAttribute('d', path);
    line.setAttribute('class', 'line dyn');
    svg.appendChild(line);
    const last = series[series.length - 1];
    if (last.ms > 0) {
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', xAt(series.length - 1));
      dot.setAttribute('cy', yAt(last.ms));
      dot.setAttribute('r', 3);
      dot.setAttribute('class', 'dot dyn');
      svg.appendChild(dot);
    }
    const totalMs = series.reduce((s, p) => s + p.ms, 0);
    const peakDay = series.reduce((m, p) => p.ms > m.ms ? p : m, { ms: 0, d: null });
    $('chart-total').textContent = fmtH(totalMs) + ' total';
    $('chart-peak').textContent = peakDay.ms > 0 ? fmtH(peakDay.ms) + ' on ' + peakDay.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
  }

  // ── Heatmap ─────────────────────────────────────────────
  function renderHeatmap(byDay) {
    const grid = $('heatmap-grid');
    grid.innerHTML = '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let start = new Date(today); start.setDate(start.getDate() - 90);
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);
    let max = 0;
    for (let k in byDay) max = Math.max(max, byDay[k].activeMs || 0);
    const cur = new Date(start);
    while (cur <= today) {
      const k = dayKey(cur.getTime());
      const ms = (byDay[k] || {}).activeMs || 0;
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (ms > 0) {
        const lvl = Math.min(1, ms / max);
        cell.style.background = 'rgba(74, 222, 128, ' + (0.18 + lvl * 0.72).toFixed(2) + ')';
      }
      cell.title = k + ' · ' + fmtH(ms);
      cell.addEventListener('click', () => openDay(k));
      grid.appendChild(cell);
      cur.setDate(cur.getDate() + 1);
    }
  }

  // ── Churn sparkline ─────────────────────────────────────
  function renderChurn(byDay, days) {
    const svg = $('churn-svg');
    svg.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const W = 800, H = 60;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const day = byDay[dayKey(d.getTime())] || {};
      series.push({ add: day.linesAdded || 0, rem: day.linesRemoved || 0 });
    }
    const maxAdd = Math.max(1, ...series.map((s) => s.add));
    const maxRem = Math.max(1, ...series.map((s) => s.rem));
    const maxBoth = Math.max(maxAdd, maxRem);
    const half = H / 2;
    const bw = W / series.length;
    series.forEach((s, i) => {
      const ah = (s.add / maxBoth) * (half - 2);
      const rh = (s.rem / maxBoth) * (half - 2);
      const a = document.createElementNS(ns, 'rect');
      a.setAttribute('x', (i * bw + 0.5).toFixed(1));
      a.setAttribute('y', (half - ah).toFixed(1));
      a.setAttribute('width', (bw - 1).toFixed(1));
      a.setAttribute('height', ah.toFixed(1));
      a.setAttribute('class', 'add');
      svg.appendChild(a);
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', (i * bw + 0.5).toFixed(1));
      r.setAttribute('y', half.toFixed(1));
      r.setAttribute('width', (bw - 1).toFixed(1));
      r.setAttribute('height', rh.toFixed(1));
      r.setAttribute('class', 'rem');
      svg.appendChild(r);
    });
  }

  // ── Tables ──────────────────────────────────────────────
  function renderTable(target, rows, opts = {}) {
    const tbl = $(target);
    tbl.innerHTML = '';
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="name" style="color: var(--text-3);">—</td><td class="val">—</td>';
      tbl.appendChild(tr);
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      if (r.onClick) tr.classList.add('clickable');
      const ico = r.color ? '<span class="ico" style="background:' + r.color + '"></span>' : '';
      const nameHtml = opts.mono
        ? '<code style="font-family: JetBrains Mono, monospace; font-size: 12px;">' + ico + r.name + '</code>'
        : ico + r.name;
      tr.innerHTML = '<td class="name">' + nameHtml + '</td>' +
                     '<td class="val">' + r.val + (r.unit ? '<span class="u">' + r.unit + '</span>' : '') + '</td>';
      if (r.onClick) tr.addEventListener('click', r.onClick);
      tbl.appendChild(tr);
    });
  }

  // ── Achievements ────────────────────────────────────────
  function renderAchievements(a) {
    const list = [
      { t: 'First session',   ok: (a.sessions || 0) >= 1,   s: '1', ico: '◉' },
      { t: 'Week streak',     ok: (a.longestStreak || 0) >= 7,  s: '7 days', ico: '◆' },
      { t: 'Month streak',    ok: (a.longestStreak || 0) >= 30, s: '30 days', ico: '◇' },
      { t: '1k prompts',      ok: (a.userMessages || 0) >= 1000, s: '1k', ico: '◈' },
      { t: '10k lines',       ok: (a.linesAdded || 0) >= 10000, s: '10k', ico: '◍' },
      { t: '100 sessions',    ok: (a.sessions || 0) >= 100, s: '100', ico: '◎' },
    ];
    const root = $('achievements');
    root.innerHTML = '';
    for (const it of list) {
      const el = document.createElement('div');
      el.className = 'achievement' + (it.ok ? ' unlocked' : '');
      el.innerHTML = '<span class="ico">' + it.ico + '</span><div class="t">' + it.t + '</div><div class="s">' + it.s + '</div>';
      root.appendChild(el);
    }
  }

  // ── Cost panel ──────────────────────────────────────────
  function renderCost(a) {
    $('cost-figure').textContent = fmtCost(a.estimatedCost || 0);
    const hours = (a.activeMs || 0) / 3_600_000;
    const perHour = hours > 0.05 ? a.estimatedCost / hours : 0;
    $('cost-figure-sub').textContent = (perHour ? fmtCost(perHour) + ' / hour' : 'across the range');
    const byModel = a.costByModel || {};
    const entries = Object.entries(byModel).sort((x, y) => y[1] - x[1]).slice(0, 6);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    const bars = $('cost-bars');
    bars.innerHTML = '';
    for (const [model, cost] of entries) {
      const w = Math.max(2, (cost / total) * 100);
      const row = document.createElement('div');
      row.className = 'cost-bar';
      row.innerHTML = '<span class="name">' + model + '</span>' +
        '<span class="track"><span class="fill" style="width:' + w.toFixed(0) + '%"></span></span>' +
        '<span class="val">' + fmtCost(cost) + '</span>';
      bars.appendChild(row);
    }
    if (!entries.length) bars.innerHTML = '<div style="color: var(--text-3); font-size: 12px;">No data in range</div>';
  }

  // ── Languages panel ─────────────────────────────────────
  function renderLanguages(langs) {
    const entries = Object.entries(langs || {}).sort((x, y) => y[1].edits - x[1].edits).slice(0, 5);
    const total = entries.reduce((s, [, v]) => s + v.edits, 0) || 1;
    const stack = $('lang-stack');
    stack.innerHTML = '';
    for (const [name, v] of entries) {
      const span = document.createElement('span');
      span.style.background = LANGS[name] || '#888';
      span.style.width = ((v.edits / total) * 100).toFixed(2) + '%';
      span.title = name + ' · ' + v.edits;
      stack.appendChild(span);
    }
    const list = $('lang-list');
    list.innerHTML = '';
    for (const [name, v] of entries) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<span class="swatch" style="background:' + (LANGS[name] || '#888') + '"></span>' +
        '<span class="name">' + name + '</span>' +
        '<span class="val">' + fmtN(v.edits) + ' edits · ' + fmtN(v.files) + ' files</span>';
      list.appendChild(row);
    }
    if (!entries.length) list.innerHTML = '<div style="color: var(--text-3); font-size: 12px;">No language data yet</div>';
  }

  // ── Discord rotation ────────────────────────────────────
  function renderRotation() {
    const live = allFrames.filter((f) => f.passes);
    if (live.length) {
      currentLiveIdx = currentLiveIdx % live.length;
      const f = live[currentLiveIdx];
      const liveOrder = allFrames.map((af, i) => af.passes ? i : -1).filter((i) => i >= 0);
      const allIdx = liveOrder[currentLiveIdx];
      // Mirror to both the top live rail and the bottom Discord card.
      $('frame-details').textContent = f.details || '—';
      $('frame-state').textContent = f.state || '—';
      $('frame-details-2').textContent = f.details || '—';
      $('frame-state-2').textContent = f.state || '—';
      $('frame-num').textContent = 'Frame ' + (allIdx + 1) + '/' + allFrames.length;
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
      li.className = isCurrent ? 'current' : f.passes ? 'live' : 'skip';
      const summary = f.passes ? ((f.details || '—') + (f.state ? ' · ' + f.state : '')) : (f.details || '—');
      li.innerHTML = '<span class="pip"></span><span class="frame-text">' + summary + '</span>';
      ul.appendChild(li);
    });
  }

  // ── Drawer (project) ────────────────────────────────────
  async function openProject(name) {
    location.hash = '#projects/' + encodeURIComponent(name);
    const p = (aggData?.projects || {})[name];
    if (!p) return;
    $('drawer-title').textContent = name;
    $('drawer-sub').textContent = p.sessions + ' sessions · ' + fmtH(p.activeMs) + ' active';
    $('drawer-body').innerHTML = [
      ['Active time', fmtH(p.activeMs)],
      ['Prompts', fmtN(p.userMessages)],
      ['Tool calls', fmtN(p.toolCalls)],
      ['Lines added', fmtN(p.linesAdded || 0)],
      ['Lines removed', fmtN(p.linesRemoved || 0)],
      ['Estimated cost', fmtCost(p.cost || 0)],
      ['Tokens in', fmtN(p.inputTokens)],
      ['Tokens out', fmtN(p.outputTokens)],
    ].map(([k, v]) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>').join('');
    $('scrim').classList.add('open');
    $('drawer').classList.add('open');
  }
  function closeDrawer() {
    $('scrim').classList.remove('open');
    $('drawer').classList.remove('open');
    if (location.hash.startsWith('#projects/')) location.hash = '';
  }
  $('scrim').addEventListener('click', closeDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);

  // ── Modal (day) ─────────────────────────────────────────
  async function openDay(k) {
    location.hash = '#days/' + k;
    const day = (aggData?.byDay || {})[k];
    if (!day) {
      $('modal-title').textContent = k;
      $('modal-sub').textContent = 'No activity';
      $('modal-body').innerHTML = '';
    } else {
      $('modal-title').textContent = new Date(k + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      $('modal-sub').textContent = fmtH(day.activeMs) + ' active · ' + (day.sessions || 0) + ' sessions';
      $('modal-body').innerHTML = [
        ['Prompts', fmtN(day.userMessages)],
        ['Tool calls', fmtN(day.toolCalls)],
        ['Lines added', fmtN(day.linesAdded || 0)],
        ['Lines removed', fmtN(day.linesRemoved || 0)],
        ['Cost', fmtCost(day.cost || 0)],
        ['Tokens', fmtN((day.inputTokens || 0) + (day.outputTokens || 0) + (day.cacheReadTokens || 0) + (day.cacheWriteTokens || 0))],
        ['Notifications', day.notifications || 0],
      ].map(([k, v]) => '<div class="kv" style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;"><span style="color:var(--text-3);">' + k + '</span><span style="font-weight:500;">' + v + '</span></div>').join('');
    }
    $('modal').classList.add('open');
    $('scrim').classList.add('open');
  }
  function closeModal() {
    $('modal').classList.remove('open');
    $('scrim').classList.remove('open');
    if (location.hash.startsWith('#days/')) location.hash = '';
  }
  $('modal-close').addEventListener('click', closeModal);
  $('scrim').addEventListener('click', closeModal);

  // ── Help ────────────────────────────────────────────────
  $('help').addEventListener('click', () => $('help').classList.remove('open'));
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '?') { e.preventDefault(); $('help').classList.toggle('open'); }
    if (e.key === 'Escape') { closeDrawer(); closeModal(); $('help').classList.remove('open'); }
    if (e.key === 't') {
      const cur = localStorage.getItem('theme') || 'dark';
      localStorage.setItem('theme', cur === 'dark' ? 'light' : 'dark'); applyTheme();
    }
    if (e.key >= '1' && e.key <= '5') {
      const pills = ['7d', '30d', '90d', '1y', 'all'];
      const target = document.querySelector('[data-range="' + pills[parseInt(e.key, 10) - 1] + '"]');
      if (target) target.click();
    }
  });

  // ── State refresh ───────────────────────────────────────
  async function fetchAggregate() {
    try {
      const r = await fetch('/api/aggregate?range=' + range, { cache: 'no-store' });
      aggData = await r.json();
      drawAggregate();
    } catch (e) { console.error(e); }
  }

  async function fetchInsights() {
    try {
      const r = await fetch('/api/insights');
      const j = await r.json();
      const root = $('insights');
      root.innerHTML = '';
      for (const line of (j.insights || [])) {
        const el = document.createElement('div');
        el.className = 'insight';
        el.textContent = line;
        root.appendChild(el);
      }
      if (!(j.insights || []).length) root.innerHTML = '<div class="insight">Keep working — insights appear once you have a few days of activity.</div>';
    } catch (e) { console.error(e); }
  }

  function drawAggregate() {
    if (!aggData) return;
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '1y' ? 365 : range === 'all' ? 365 : 90;
    renderChart(aggData.byDay || {}, days);
    renderHeatmap(aggData.byDay || {});
    renderChurn(aggData.byDay || {}, Math.min(days, 90));
    renderCost(aggData);
    renderLanguages(aggData.languages);
    renderAchievements(aggData);

    // Range stat card
    const [rn, ru] = splitTime(fmtH(aggData.activeMs || 0));
    $('range-num').textContent = rn;
    $('range-unit').textContent = ru === 'h' ? 'hrs' : ru;
    $('range-sub').textContent = fmtN(aggData.userMessages || 0) + ' prompts · ' + fmtN(aggData.grandTokens || 0) + ' tok';

    // Range delta vs prior identical window
    // (approximation: today's value minus same-day-of-week last range)
    setDelta($('range-delta'), 0, 'range');

    // Cost card
    $('cost-num').textContent = fmtCost(aggData.estimatedCost || 0);
    $('cost-sub').textContent = fmtN(aggData.grandTokens || 0) + ' tokens';

    // Lifetime tokens card
    const grand = (aggData.inputTokens || 0) + (aggData.outputTokens || 0) + (aggData.cacheReadTokens || 0) + (aggData.cacheWriteTokens || 0);
    $('tok-grand').textContent = fmtN(grand);
    $('tok-out').textContent = fmtN(aggData.outputTokens || 0);
    const cache = (aggData.cacheReadTokens || 0) + (aggData.cacheWriteTokens || 0);
    $('tok-cache').textContent = fmtN(cache);
    $('tok-in-sub').textContent = 'input ' + fmtN(aggData.inputTokens || 0);
    $('tok-cache-sub').textContent = 'read ' + fmtN(aggData.cacheReadTokens || 0) + ' · write ' + fmtN(aggData.cacheWriteTokens || 0);
    $('tok-cache-pct').textContent = grand ? Math.round((cache / grand) * 100) + '%' : '0%';

    // Code churn numbers
    $('churn-added').textContent = '+' + fmtN(aggData.linesAdded || 0);
    $('churn-removed').textContent = '−' + fmtN(aggData.linesRemoved || 0);
    const net = (aggData.linesAdded || 0) - (aggData.linesRemoved || 0);
    $('churn-net').textContent = (net >= 0 ? '+' : '−') + fmtN(Math.abs(net));

    // Leaderboards
    const projs = Object.entries(aggData.projects || {}).sort((x, y) => y[1].activeMs - x[1].activeMs).slice(0, 8);
    renderTable('projects-tbl', projs.map(([name, p]) => {
      const h = p.activeMs / 3_600_000;
      const val = h < 1 ? Math.round(h * 60) : h < 10 ? h.toFixed(1) : Math.round(h);
      return { name, val: String(val), unit: h < 1 ? 'm' : 'h', onClick: () => openProject(name) };
    }));
    const tools = Object.entries(aggData.toolBreakdown || {}).sort((x, y) => y[1] - x[1]).slice(0, 8);
    renderTable('tools-tbl', tools.map(([name, count]) => ({ name, val: fmtN(count), unit: '' })), { mono: true });
    const files = (aggData.topEditedFiles || []).slice(0, 8);
    renderTable('files-tbl', files.map((f) => ({ name: f.file || (f.path || '').split('/').pop(), val: fmtN(f.count), unit: '' })), { mono: true });

    // Bash / domains / subagents
    const bash = Object.entries(aggData.bashCommands || {}).sort((x, y) => y[1] - x[1]).slice(0, 8);
    renderTable('bash-tbl', bash.map(([name, count]) => ({ name, val: fmtN(count), unit: '' })), { mono: true });
    const domains = Object.entries(aggData.webDomains || {}).sort((x, y) => y[1] - x[1]).slice(0, 8);
    renderTable('domains-tbl', domains.map(([name, count]) => ({ name, val: fmtN(count), unit: '' })), { mono: true });
    const sa = Object.entries(aggData.subagents || {}).sort((x, y) => y[1] - x[1]).slice(0, 8);
    renderTable('subagents-tbl', sa.map(([name, count]) => ({ name, val: fmtN(count), unit: '' })));

    const tot = (aggData.mcpToolCalls || 0) + (aggData.builtinToolCalls || 0);
    $('mcp-label').textContent = tot ? Math.round(((aggData.mcpToolCalls || 0) / tot) * 100) + '% MCP · ' + Math.round(((aggData.builtinToolCalls || 0) / tot) * 100) + '% built-in' : '—';

    $('lb-sessions').textContent = fmtN(aggData.sessions || 0);
  }

  function drawState() {
    if (!liveData) return;
    const a = liveData.aggregate;
    const v = liveData.vars;
    const s = liveData.state;

    // Top bar
    const now = new Date();
    $('meta').textContent = 'No. ' + (v.daysSinceFirst || '—') + ' · ' + now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    $('model').textContent = v.modelPretty;
    $('statustext').textContent = v.statusVerbose;
    $('dot').className = 'dot ' + (s.status === 'working' || s.status === 'thinking' ? '' : s.status === 'idle' ? 'idle' : 'stale');

    // Live avatar
    const cfgAvatar = (s.status && liveData.config?.statusAssets?.[s.status]) || '';
    $('live-avatar').innerHTML = cfgAvatar
      ? '<img src="' + cfgAvatar.replace(/"/g, '&quot;') + '" alt="" />'
      : '';
    $('elapsed').textContent = elapsedStr(s.sessionStart);

    // Hero
    const [hn, hu] = splitTime(v.allHours);
    $('hero-num').textContent = hn;
    $('hero-unit').textContent = hu === 'h' ? 'hours' : hu === 'm' ? 'minutes' : hu;
    $('hero-caption').innerHTML =
      'on Claude Code · day <strong>' + (v.daysSinceFirst || 1) + '</strong> · ' +
      '<strong>' + (a.sessions || 0).toLocaleString() + '</strong> sessions · ' +
      '<strong>' + (a.userMessages || 0).toLocaleString() + '</strong> prompts.';

    // Today
    const [tn, tu] = splitTime(v.todayHours);
    $('today-num').textContent = tn;
    $('today-unit').textContent = tu === 'h' ? 'hrs' : tu;
    $('today-sub').textContent = (v.todayPrompts || 0) + ' prompts · ' + (v.todayTokensFmt || '0');

    const todayMs = ((a.byDay || {})[dayKey(Date.now())] || {}).activeMs || 0;
    const yest = new Date(); yest.setHours(0,0,0,0); yest.setDate(yest.getDate() - 1);
    const yMs = ((a.byDay || {})[dayKey(yest.getTime())] || {}).activeMs || 0;
    setDelta($('today-delta'), todayMs - yMs, 'vs yest.');

    // Streak
    $('streak-num').textContent = v.streak;
    $('streak-sub').textContent = 'Longest ' + v.longestStreak + ' · best ' + (v.bestDayHours || '—');

    // Discord
    allFrames = liveData.frames || [];
    renderRotation();
  }

  // ── SSE ────────────────────────────────────────────────
  function startSse() {
    try {
      const ev = new EventSource('/events');
      ev.onmessage = async (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === 'state') await refreshState();
          if (d.type === 'aggregate') {
            await refreshState();
            await fetchAggregate();
            await fetchInsights();
          }
        } catch { /* malformed SSE frame — wait for the next one */ }
      };
      ev.onerror = () => { $('conn-state').textContent = 'reconnecting'; setTimeout(() => { $('conn-state').textContent = 'live'; }, 4000); };
    } catch { /* EventSource constructor failed (very old browser) — dashboard falls back to one-shot fetches */ }
  }

  async function refreshState() {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      liveData = await r.json();
      drawState();
    } catch (e) { console.error(e); }
  }

  // Elapsed tick — light, just updates the number.
  setInterval(() => {
    if (liveData?.state?.sessionStart) $('elapsed').textContent = elapsedStr(liveData.state.sessionStart);
  }, 1000);

  // Rotation cycle
  rotationTimer = setInterval(() => { currentLiveIdx++; renderRotation(); }, 4000);

  // Initial load.
  (async () => {
    await refreshState();
    await fetchAggregate();
    await fetchInsights();
    startSse();
    // Restore deep link.
    if (location.hash.startsWith('#projects/')) openProject(decodeURIComponent(location.hash.slice(10)));
    else if (location.hash.startsWith('#days/')) openDay(location.hash.slice(6));
  })();
})();`;
}

export { buildHtml };
