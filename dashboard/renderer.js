const $ = (id) => document.getElementById(id);
let currentConfig = null;

// Sample values used to render frames into something pretty (so users never
// see ugly {variables} unless they explicitly enter edit mode).
const SAMPLES = {
  status: 'working',
  statusVerbose: 'Working',
  statusIcon: 'working',
  project: 'CLAUDE',
  projectPretty: 'CLAUDE',
  model: 'claude-opus-4-7',
  modelPretty: 'Opus 4.7',
  messages: 8,
  messagesLabel: '8 prompts',
  tools: 23,
  toolsLabel: '23 tool calls',
  filesEdited: 3,
  filesEditedLabel: '3 edits',
  filesRead: 4,
  filesReadLabel: '4 file reads',
  filesOpened: 5,
  filesOpenedLabel: '5 files',
  tokens: 2300,
  tokensFmt: '2.3k',
  tokensRealFmt: '1.4k',
  inputTokens: '1.2k',
  outputTokens: '900',
  cacheTokens: '200',
  duration: '12m 5s',
  durationHours: '12m',
  currentTool: 'Edit',
  currentToolPretty: 'Edit',
  currentFile: 'page.tsx',
  currentFilePretty: 'src/app/page.tsx',
  sessionActive: 1,
  concurrent: 2,
  concurrentOther: 1,
  concurrentLabel: '2 live sessions',
  concurrentOtherLabel: '1 other session',
  concurrentListPretty: 'CLAUDE, my-app',
  allTokensFmt: '2.82B',
  allTokensRealFmt: '18M',
  allBillableFmt: '86M',
  allInputTokens: '204k',
  allOutputTokens: '18M',
  allCacheReadTokens: '2.78B',
  allCacheWriteTokens: '67.8M',
  allHours: '52h',
  allWallHours: '231h',
  allMessages: 767,
  allMessagesFmt: '767',
  allTools: 8997,
  allToolsFmt: '8.7k',
  allSessions: 69,
  allSessionsLabel: '69 sessions',
  allSubagentRuns: 44,
  allFiles: 1500,
  allFilesFmt: '1.5k',
  todayActiveMs: 3_360_000,
  todayHours: '56m',
  todayPrompts: 20,
  todayPromptsLabel: '20 prompts',
  todayToolsFmt: '250',
  todayToolsLabel: '250 tool calls',
  todayTokensFmt: '17.2M',
  todayTokensRealFmt: '350k',
  todayCacheTokensFmt: '17M',
  todaySessions: 3,
  streak: 1,
  streakLabel: '1-day streak',
  longestStreak: 9,
  daysSinceFirst: 31,
  daysSinceFirstLabel: 'Day 31',
  bestDayDate: '2026-04-29',
  bestDayHours: '6.3h',
  bestDayPrompts: 48,
  bestDayTokensFmt: '180M',
  weekActiveMs: 11_160_000,
  weekHours: '3.1h',
  weekPrompts: 50,
  weekPromptsLabel: '50 prompts',
  weekToolsFmt: '800',
  weekTokensFmt: '94.6M',
  weekSessions: 8,
  weekSessionsLabel: '8 sessions',
  peakHourNum: 22,
  peakHour: '22:00',
  peakHourHours: '6.6h',
  peakHourActiveLabel: '6.6h there',
  topEditedFile: 'index.html',
  topEditedCount: 73,
  topEditedCountLabel: '73 edits',
  projectHours: '22m',
  projectActiveMs: 1_320_000,
  projectPrompts: 8,
  projectPromptsLabel: '8 prompts',
  projectTools: 80,
  projectSessions: 1,
  projectSessionLabel: 'Session #1',
  streakIsMilestone: 0,
};

function render(template) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (m, key) => {
    if (SAMPLES[key] !== undefined) return String(SAMPLES[key]);
    return m;
  });
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function init() {
  const result = await window.api.loadConfig();
  if (result.error) {
    setStatus(result.error, 'error');
    return;
  }
  currentConfig = result.config;
  populate(result.config);
  updateDaemonStatus();
  setInterval(updateDaemonStatus, 3000);
}

function populate(cfg) {
  for (const row of document.querySelectorAll('.timing .row')) {
    const key = row.dataset.key;
    const mul = Number(row.dataset.mul) || 1;
    const stored = cfg[key];
    const display = stored != null ? stored / mul : '';
    row.querySelector('input').value = display;
  }
  const avatar = (cfg.statusAssets && cfg.statusAssets.working)
    || (cfg.presence && cfg.presence.largeImageKey)
    || '';
  renderFrames((cfg.presence && cfg.presence.rotation) || [], avatar);
}

function renderFrames(frames, avatar) {
  const container = $('frames');
  container.innerHTML = '';
  for (const f of frames) container.appendChild(buildFrameCard(f, avatar));
}

function buildFrameCard(f = {}, avatar = '') {
  const el = document.createElement('div');
  el.className = 'frame';
  el.dataset.mode = 'view';

  const avatarHtml = avatar && /^https?:\/\//i.test(avatar)
    ? `<img src="${escapeAttr(avatar)}" alt="" />`
    : '';

  el.innerHTML = `
    <button class="remove" title="Remove">×</button>
    <div class="view">
      <div class="avatar">${avatarHtml}</div>
      <div class="content">
        <div class="appname">Claude Code</div>
        <div class="details-render"></div>
        <div class="state-render"></div>
      </div>
    </div>
    <div class="edit">
      <label>Top line
        <input class="details-input" placeholder="e.g. Working in {project}" />
      </label>
      <label>Bottom line
        <input class="state-input" placeholder="e.g. {modelPretty}" />
      </label>
      <label>Only show when
        <input class="req-input" placeholder="leave empty for always" />
      </label>
      <div class="edit-actions">
        <button type="button" class="done">Done</button>
      </div>
    </div>
  `;

  const requiresStr = Array.isArray(f.requires) ? f.requires.join(', ') : (f.requires || '');
  el.querySelector('.details-input').value = f.details || '';
  el.querySelector('.state-input').value = f.state || '';
  el.querySelector('.req-input').value = requiresStr;
  refreshRender(el);

  el.querySelector('.remove').addEventListener('click', (e) => {
    e.stopPropagation();
    el.remove();
  });

  el.querySelector('.view').addEventListener('click', () => {
    closeAllEdits(el);
    el.dataset.mode = 'edit';
    setTimeout(() => el.querySelector('.details-input').focus(), 0);
  });

  el.querySelectorAll('.edit input').forEach((inp) => {
    inp.addEventListener('input', () => refreshRender(el));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); exitEdit(el); }
      if (e.key === 'Escape') { e.preventDefault(); exitEdit(el); }
    });
  });

  el.querySelector('.done').addEventListener('click', (e) => {
    e.stopPropagation();
    exitEdit(el);
  });

  return el;
}

function refreshRender(el) {
  const detailsTpl = el.querySelector('.details-input').value;
  const stateTpl = el.querySelector('.state-input').value;
  el.querySelector('.details-render').textContent = render(detailsTpl) || 'Empty card';
  el.querySelector('.state-render').textContent = render(stateTpl);
}

function exitEdit(el) {
  el.dataset.mode = 'view';
  refreshRender(el);
}

function closeAllEdits(except) {
  for (const frame of document.querySelectorAll('.frame[data-mode="edit"]')) {
    if (frame !== except) exitEdit(frame);
  }
}

document.addEventListener('click', (e) => {
  const inFrame = e.target.closest('.frame');
  for (const frame of document.querySelectorAll('.frame[data-mode="edit"]')) {
    if (frame !== inFrame) exitEdit(frame);
  }
});

function collect() {
  const cfg = JSON.parse(JSON.stringify(currentConfig || {}));

  for (const row of document.querySelectorAll('.timing .row')) {
    const key = row.dataset.key;
    const mul = Number(row.dataset.mul) || 1;
    const raw = row.querySelector('input').value;
    if (raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) cfg[key] = Math.round(n * mul);
  }

  cfg.presence = cfg.presence || {};
  const rotation = [];
  for (const frameEl of $('frames').children) {
    const details = frameEl.querySelector('.details-input').value.trim();
    const state = frameEl.querySelector('.state-input').value.trim();
    const requiresStr = frameEl.querySelector('.req-input').value.trim();
    if (!details && !state) continue;
    const frame = {};
    if (details) frame.details = details;
    if (state) frame.state = state;
    if (requiresStr) {
      const parts = requiresStr.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length === 1) frame.requires = parts[0];
      else if (parts.length > 1) frame.requires = parts;
    }
    rotation.push(frame);
  }
  cfg.presence.rotation = rotation;

  return cfg;
}

function setStatus(text, kind) {
  const el = $('saveStatus');
  el.textContent = text;
  el.className = kind || '';
  if (text && kind === 'success') {
    setTimeout(() => { if (el.textContent === text) { el.textContent = ''; el.className = ''; } }, 2200);
  }
}

async function save() {
  if (!currentConfig) {
    setStatus('No config loaded', 'error');
    return;
  }
  setStatus('Saving…');
  const cfg = collect();
  const result = await window.api.saveConfig(cfg);
  if (result.ok) {
    currentConfig = cfg;
    setStatus('Saved', 'success');
  } else {
    setStatus(result.error || 'Error', 'error');
  }
}

async function updateDaemonStatus() {
  const status = await window.api.daemonStatus();
  const badge = $('daemonBadge');
  if (status.running) {
    badge.textContent = 'running';
    badge.className = 'daemon-badge running';
    badge.title = `pid ${status.pid}`;
  } else {
    badge.textContent = 'not running';
    badge.className = 'daemon-badge stopped';
    badge.title = '';
  }
}

$('saveBtn').addEventListener('click', save);
$('addFrameBtn').addEventListener('click', () => {
  const avatar = (currentConfig?.statusAssets?.working)
    || (currentConfig?.presence?.largeImageKey)
    || '';
  const card = buildFrameCard({}, avatar);
  $('frames').appendChild(card);
  closeAllEdits(card);
  card.dataset.mode = 'edit';
  setTimeout(() => card.querySelector('.details-input').focus(), 0);
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    save();
  }
});

init();
