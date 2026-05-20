import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { CLAUDE_PROJECTS, SCAN_CACHE_PATH, AGGREGATE_PATH, DATA_DIR } from './paths.js';

// Cap counted gap between consecutive timestamps. Anything larger is treated
// as the user walking away — we count only what's plausibly active time.
const ACTIVE_GAP_CAP_MS = 5 * 60 * 1000;

// Local-time YYYY-MM-DD key for bucketing.
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ISO week key like "2026-W21" using local time. Monday-start.
function weekKey(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  // ISO 8601: week starts Monday; week 1 contains Jan 4.
  const day = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - day + 3); // move to Thursday of this week
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - firstThursday) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function hourKey(ts) {
  return new Date(ts).getHours();
}

const EDITING_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

// Trailing ISO-ish datetime suffix (e.g. "-2026-04-25T185311Z"). When a cwd's
// basename ends with one of these, collapse it so all "archive-*" snapshots
// aggregate under a single project name.
export const DATE_SUFFIX_RE = /[-_.]\d{4}[-_.]?\d{2}[-_.]?\d{2}(?:[Tt._-]?\d{0,6})?Z?$/;
export function cleanProjectName(name) {
  if (!name) return name;
  return name.replace(DATE_SUFFIX_RE, '') || name;
}

function blankDay() {
  return {
    activeMs: 0,
    userMessages: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    sessions: 0,
  };
}

function mergeDay(target, src) {
  target.activeMs += src.activeMs || 0;
  target.userMessages += src.userMessages || 0;
  target.toolCalls += src.toolCalls || 0;
  target.inputTokens += src.inputTokens || 0;
  target.outputTokens += src.outputTokens || 0;
  target.cacheReadTokens += src.cacheReadTokens || 0;
  target.cacheWriteTokens += src.cacheWriteTokens || 0;
  target.sessions += src.sessions || 0;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function safeJson(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function isRealUserMessage(record) {
  if (record.type !== 'user' || record.isMeta) return false;
  const c = record.message?.content;
  if (typeof c === 'string') {
    if (c.startsWith('<local-command') || c.startsWith('<system-reminder') || c.startsWith('<command-')) return false;
    return c.trim().length > 0;
  }
  if (Array.isArray(c)) {
    const hasToolResult = c.some((b) => b.type === 'tool_result');
    if (hasToolResult) return false;
    return c.some((b) => b.type === 'text' && String(b.text || '').trim().length > 0);
  }
  return false;
}

function collectFilePath(input = {}) {
  return input.file_path || input.path || input.notebook_path || null;
}

// Parse a single transcript JSONL into a per-file summary.
export function parseTranscript(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split('\n');
  const summary = {
    sessionId: null,
    project: null,
    cwd: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    userMessages: 0,
    toolCalls: 0,
    toolBreakdown: {},
    files: [],
    firstTs: null,
    lastTs: null,
    activeMs: 0,
    byDay: {},     // day-key → blankDay
    byWeek: {},    // ISO week key → blankDay
    byHour: {},    // hour-of-day (0..23) → blankDay
    fileEdits: {}, // absolute path → edit count
  };
  const fileSet = new Set();
  // Records in their original order, retaining timestamps for per-day bucketing.
  const records = [];

  for (const line of lines) {
    if (!line) continue;
    const r = safeJson(line);
    if (!r) continue;
    if (r.sessionId && !summary.sessionId) summary.sessionId = r.sessionId;
    if (r.cwd && !summary.cwd) {
      summary.cwd = r.cwd;
      summary.project = cleanProjectName(basename(r.cwd));
    }
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : null;
    const day = ts ? dayKey(ts) : null;
    const week = ts ? weekKey(ts) : null;
    const hour = ts ? hourKey(ts) : null;
    const dayBucket  = day  ? (summary.byDay[day]   ||= blankDay()) : null;
    const weekBucket = week ? (summary.byWeek[week] ||= blankDay()) : null;
    const hourBucket = hour !== null ? (summary.byHour[hour] ||= blankDay()) : null;
    const allBuckets = [dayBucket, weekBucket, hourBucket].filter(Boolean);

    if (r.type === 'assistant') {
      const u = r.message?.usage;
      if (u) {
        summary.inputTokens += u.input_tokens || 0;
        summary.outputTokens += u.output_tokens || 0;
        summary.cacheReadTokens += u.cache_read_input_tokens || 0;
        summary.cacheWriteTokens += u.cache_creation_input_tokens || 0;
        for (const bucket of allBuckets) {
          bucket.inputTokens += u.input_tokens || 0;
          bucket.outputTokens += u.output_tokens || 0;
          bucket.cacheReadTokens += u.cache_read_input_tokens || 0;
          bucket.cacheWriteTokens += u.cache_creation_input_tokens || 0;
        }
      }
      if (r.message?.model && !summary.model) summary.model = r.message.model;
      const blocks = r.message?.content || [];
      for (const b of blocks) {
        if (b.type === 'tool_use') {
          summary.toolCalls += 1;
          summary.toolBreakdown[b.name] = (summary.toolBreakdown[b.name] || 0) + 1;
          for (const bucket of allBuckets) bucket.toolCalls += 1;
          const f = collectFilePath(b.input);
          if (f) {
            fileSet.add(f);
            if (EDITING_TOOLS.has(b.name)) {
              summary.fileEdits[f] = (summary.fileEdits[f] || 0) + 1;
            }
          }
        }
      }
    } else if (isRealUserMessage(r)) {
      summary.userMessages += 1;
      for (const bucket of allBuckets) bucket.userMessages += 1;
    }
    if (ts) records.push({ ts, day, week, hour });
  }

  summary.files = Array.from(fileSet);
  if (records.length) {
    records.sort((a, b) => a.ts - b.ts);
    summary.firstTs = records[0].ts;
    summary.lastTs = records[records.length - 1].ts;
    let active = 0;
    for (let i = 1; i < records.length; i++) {
      const prev = records[i - 1];
      const gap = records[i].ts - prev.ts;
      if (gap > 0 && gap < ACTIVE_GAP_CAP_MS) {
        active += gap;
        // Charge the gap's active time to the day/week/hour of the earlier record.
        if (prev.day)  (summary.byDay[prev.day]   ||= blankDay()).activeMs += gap;
        if (prev.week) (summary.byWeek[prev.week] ||= blankDay()).activeMs += gap;
        if (prev.hour !== null && prev.hour !== undefined) {
          (summary.byHour[prev.hour] ||= blankDay()).activeMs += gap;
        }
      }
    }
    summary.activeMs = active;
  }
  return summary;
}

function listTranscripts(projectsDir) {
  if (!existsSync(projectsDir)) return [];
  const results = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith('.jsonl')) results.push(full);
    }
  };
  walk(projectsDir);
  return results;
}

function isSubagentPath(p) {
  return /[\\/]subagents[\\/]/.test(p);
}

// Pull the real cwd from the head of a transcript so live sessions can show
// "my-app" instead of the slugified directory name.
const cwdCache = new Map(); // path → { mtime, cwd }
function readTranscriptCwd(path, mtimeMs) {
  const cached = cwdCache.get(path);
  if (cached && cached.mtime === mtimeMs) return cached.cwd;
  let cwd = null;
  try {
    const head = readFileSync(path, 'utf8').split('\n', 25);
    for (const line of head) {
      if (!line) continue;
      const r = safeJson(line);
      if (r?.cwd) { cwd = r.cwd; break; }
    }
  } catch {}
  cwdCache.set(path, { mtime: mtimeMs, cwd });
  return cwd;
}

// Detect live sessions by transcript mtime. Returns array of { path, project, cwd, mtime, ageSec }.
// A session is "live" if its .jsonl was modified within thresholdMs.
export function findLiveSessions({ projectsDir = CLAUDE_PROJECTS, thresholdMs = 90_000 } = {}) {
  if (!existsSync(projectsDir)) return [];
  const now = Date.now();
  const live = [];
  for (const proj of readdirSync(projectsDir)) {
    const projPath = join(projectsDir, proj);
    let entries;
    try { entries = readdirSync(projPath, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      // Only top-level transcripts count as sessions, not subagent files.
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
      const full = join(projPath, e.name);
      let st;
      try { st = statSync(full); } catch { continue; }
      const age = now - st.mtimeMs;
      if (age <= thresholdMs) {
        const cwd = readTranscriptCwd(full, st.mtimeMs);
        const project = cleanProjectName(cwd ? basename(cwd) : proj);
        live.push({ path: full, project, cwd: cwd || '', mtime: st.mtimeMs, ageSec: Math.round(age / 1000) });
      }
    }
  }
  live.sort((a, b) => b.mtime - a.mtime);
  return live;
}

function readCache() {
  ensureDataDir();
  if (!existsSync(SCAN_CACHE_PATH)) return { files: {} };
  try { return JSON.parse(readFileSync(SCAN_CACHE_PATH, 'utf8')); }
  catch { return { files: {} }; }
}

function writeCache(cache) {
  ensureDataDir();
  const tmp = SCAN_CACHE_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, SCAN_CACHE_PATH);
}

function writeAggregate(agg) {
  ensureDataDir();
  const tmp = AGGREGATE_PATH + '.tmp';
  writeFileSync(tmp, JSON.stringify(agg, null, 2));
  renameSync(tmp, AGGREGATE_PATH);
}

export function readAggregate() {
  if (!existsSync(AGGREGATE_PATH)) return null;
  try { return JSON.parse(readFileSync(AGGREGATE_PATH, 'utf8')); }
  catch { return null; }
}

export { dayKey, weekKey, hourKey };

function aggregateFrom(cache) {
  const agg = {
    sessions: 0,
    subagentRuns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    userMessages: 0,
    toolCalls: 0,
    toolBreakdown: {},
    projects: {},
    activeMs: 0,
    wallMs: 0,
    uniqueFiles: 0,
    firstTs: null,
    lastTs: null,
    byDay: {},
    byWeek: {},
    byHour: {},
    fileEdits: {},
    streak: 0,
    longestStreak: 0,
    daysSinceFirst: 0,
    bestDay: null,
    peakHour: null,
    topEditedFiles: [],
    generatedAt: Date.now(),
  };
  const fileSet = new Set();
  for (const [path, summary] of Object.entries(cache.files)) {
    if (!summary) continue;
    const isSub = summary.isSubagent ?? isSubagentPath(path);
    // Tokens and tools always count.
    agg.inputTokens += summary.inputTokens || 0;
    agg.outputTokens += summary.outputTokens || 0;
    agg.cacheReadTokens += summary.cacheReadTokens || 0;
    agg.cacheWriteTokens += summary.cacheWriteTokens || 0;
    agg.toolCalls += summary.toolCalls || 0;
    for (const [name, count] of Object.entries(summary.toolBreakdown || {})) {
      agg.toolBreakdown[name] = (agg.toolBreakdown[name] || 0) + count;
    }
    for (const f of summary.files || []) fileSet.add(f);
    if (isSub) {
      agg.subagentRuns += 1;
      // Subagents still contribute tokens/tools to per-day/week/hour buckets.
      const mergeSubBuckets = (srcMap, destMap) => {
        for (const [k, src] of Object.entries(srcMap || {})) {
          const target = destMap[k] ||= blankDay();
          target.inputTokens += src.inputTokens || 0;
          target.outputTokens += src.outputTokens || 0;
          target.cacheReadTokens += src.cacheReadTokens || 0;
          target.cacheWriteTokens += src.cacheWriteTokens || 0;
          target.toolCalls += src.toolCalls || 0;
        }
      };
      mergeSubBuckets(summary.byDay, agg.byDay);
      mergeSubBuckets(summary.byWeek, agg.byWeek);
      mergeSubBuckets(summary.byHour, agg.byHour);
      // Subagent file edits also count toward hotspots.
      for (const [f, n] of Object.entries(summary.fileEdits || {})) {
        agg.fileEdits[f] = (agg.fileEdits[f] || 0) + n;
      }
    } else {
      // Top-level sessions only — these are the real "chats".
      agg.sessions += 1;
      agg.userMessages += summary.userMessages || 0;
      agg.activeMs += summary.activeMs || 0;
      if (summary.firstTs && summary.lastTs) agg.wallMs += summary.lastTs - summary.firstTs;
      if (summary.project) {
        const p = agg.projects[summary.project] = agg.projects[summary.project] || {
          sessions: 0, activeMs: 0, inputTokens: 0, outputTokens: 0, userMessages: 0, toolCalls: 0,
        };
        p.sessions += 1;
        p.activeMs += summary.activeMs || 0;
        p.inputTokens += summary.inputTokens || 0;
        p.outputTokens += summary.outputTokens || 0;
        p.userMessages += summary.userMessages || 0;
        p.toolCalls += summary.toolCalls || 0;
      }
      if (summary.firstTs) agg.firstTs = agg.firstTs ? Math.min(agg.firstTs, summary.firstTs) : summary.firstTs;
      if (summary.lastTs) agg.lastTs = agg.lastTs ? Math.max(agg.lastTs, summary.lastTs) : summary.lastTs;
      // Full per-day/week/hour merge for top-level sessions.
      for (const [k, day] of Object.entries(summary.byDay || {})) {
        mergeDay(agg.byDay[k] ||= blankDay(), day);
      }
      for (const [k, w] of Object.entries(summary.byWeek || {})) {
        mergeDay(agg.byWeek[k] ||= blankDay(), w);
      }
      for (const [k, h] of Object.entries(summary.byHour || {})) {
        mergeDay(agg.byHour[k] ||= blankDay(), h);
      }
      // Bump session count on the day, week, and hour where the session started.
      if (summary.firstTs) {
        (agg.byDay[dayKey(summary.firstTs)]   ||= blankDay()).sessions += 1;
        (agg.byWeek[weekKey(summary.firstTs)] ||= blankDay()).sessions += 1;
        (agg.byHour[hourKey(summary.firstTs)] ||= blankDay()).sessions += 1;
      }
      // File hotspots — top-level sessions.
      for (const [f, n] of Object.entries(summary.fileEdits || {})) {
        agg.fileEdits[f] = (agg.fileEdits[f] || 0) + n;
      }
    }
  }
  agg.uniqueFiles = fileSet.size;

  // Derived: streak (consecutive days with activity ending today or yesterday),
  // longest streak, days since first, best day.
  const days = Object.keys(agg.byDay).sort();
  if (days.length) {
    // Best day by activeMs.
    let best = null;
    for (const k of days) {
      const d = agg.byDay[k];
      if (!best || d.activeMs > best.activeMs) best = { day: k, ...d };
    }
    agg.bestDay = best;

    // Days since first.
    const firstDay = new Date(days[0] + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    agg.daysSinceFirst = Math.floor((today - firstDay) / 86_400_000) + 1;

    // Current streak: walk back from today.
    const has = (offset) => {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      return !!agg.byDay[dayKey(d)];
    };
    let streak = 0;
    let offset = has(0) ? 0 : 1; // if no activity today, start from yesterday
    while (has(offset)) { streak += 1; offset += 1; }
    agg.streak = streak;

    // Longest streak across all history.
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const k of days) {
      if (prev) {
        const d1 = new Date(prev + 'T00:00:00');
        const d2 = new Date(k + 'T00:00:00');
        const diff = Math.round((d2 - d1) / 86_400_000);
        run = diff === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = k;
    }
    agg.longestStreak = longest;
  }

  // Peak hour-of-day across all-time (by activeMs).
  const hourEntries = Object.entries(agg.byHour);
  if (hourEntries.length) {
    let bestHour = null;
    for (const [h, data] of hourEntries) {
      if (!bestHour || data.activeMs > bestHour.activeMs) bestHour = { hour: Number(h), ...data };
    }
    agg.peakHour = bestHour;
  }

  // Top edited files (paths + counts), descending.
  agg.topEditedFiles = Object.entries(agg.fileEdits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([path, count]) => ({ path, count }));

  return agg;
}

// Incremental scan: re-parse only changed files. Returns {aggregate, scanned, skipped, removed}.
export function scan({ projectsDir = CLAUDE_PROJECTS, onProgress, force = false } = {}) {
  const cache = readCache();
  cache.files = cache.files || {};
  const seen = new Set();
  const transcripts = listTranscripts(projectsDir);
  let scanned = 0;
  let skipped = 0;
  for (const fp of transcripts) {
    seen.add(fp);
    let st;
    try { st = statSync(fp); } catch { continue; }
    const sig = `${st.mtimeMs}:${st.size}`;
    if (!force && cache.files[fp]?._sig === sig) {
      skipped += 1;
      continue;
    }
    try {
      const summary = parseTranscript(fp);
      summary._sig = sig;
      summary.isSubagent = isSubagentPath(fp);
      cache.files[fp] = summary;
      scanned += 1;
      if (onProgress) onProgress({ scanned, skipped, total: transcripts.length, file: fp });
    } catch (e) {
      // skip corrupt file but keep prior cache entry
    }
  }
  // Remove cache entries for deleted transcripts
  let removed = 0;
  for (const key of Object.keys(cache.files)) {
    if (!seen.has(key)) { delete cache.files[key]; removed += 1; }
  }
  writeCache(cache);
  const aggregate = aggregateFrom(cache);
  writeAggregate(aggregate);
  return { aggregate, scanned, skipped, removed, total: transcripts.length };
}
