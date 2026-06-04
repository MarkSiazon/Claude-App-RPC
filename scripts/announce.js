// Release-announcement generator. Reads the top entry from CHANGELOG.md and
// produces ready-to-post drafts for the channels claude-rpc gets discovered on
// — Show HN, Reddit, dev.to, X/Twitter, Discord, and GitHub release notes.
//
// NOTHING here posts on its own. The companion workflow (.github/workflows/
// announce.yml) runs this on a vX.Y.Z tag and drops the output into a GitHub
// issue ("Launch kit: vX.Y.Z") for a human to copy/paste and post under their
// own identity. That keeps us on the right side of every platform's rules —
// authentic, human-published, no spam.
//
// Each outbound link carries ?ref=<channel> so the landing-page beacon
// attributes installs back to the channel that drove them (see worker /ref).
//
// Pure functions are exported for tests; the CLI tail reads/writes files.

import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://claude-rpc.vercel.app';
const REPO = 'https://github.com/rar-file/claude-rpc';

// Parse the first "## [x.y.z] - date" section out of a CHANGELOG body.
// Returns { version, date, bullets: [{ title, body }] } or null.
export function parseLatestChangelog(md) {
  const lines = String(md || '').split('\n');
  let i = lines.findIndex((l) => /^##\s+\[?\d+\.\d+\.\d+/.test(l));
  if (i === -1) return null;
  const header = lines[i];
  const version = (header.match(/\d+\.\d+\.\d+/) || [])[0] || '';
  const date = (header.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '';
  // Collect lines until the next version header.
  const body = [];
  for (i += 1; i < lines.length; i++) {
    if (/^##\s+\[?\d+\.\d+\.\d+/.test(lines[i])) break;
    body.push(lines[i]);
  }
  // Pull top-level bullets ("- **Title.** body…"); flatten soft-wrapped text.
  const bullets = [];
  for (const raw of body) {
    const m = raw.match(/^- (.+)/);
    if (m) {
      const text = m[1].trim();
      const tm = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
      if (tm) bullets.push({ title: tm[1].replace(/[.:]$/, ''), body: tm[2].trim() });
      else bullets.push({ title: text.replace(/\*\*/g, ''), body: '' });
    }
  }
  return { version, date, bullets };
}

const ref = (channel) => `${SITE}/?ref=${channel}`;

// Build per-channel drafts. Returns { [channel]: string }.
export function buildAnnouncements({ version, bullets = [] }) {
  const titles = bullets.map((b) => b.title).filter(Boolean);
  const top = titles.slice(0, 5);
  const bulletList = (links) => top.map((t) => `- ${t}`).join('\n')
    + (links ? '' : '');

  const oneLiner = 'Discord Rich Presence for Claude Code — your live model, project, tokens, and lifetime stats on your Discord profile, driven by Claude Code\'s hooks.';
  const install = 'npx claude-rpc setup';

  const showHN = [
    `Show HN: claude-rpc v${version} – Discord Rich Presence for Claude Code`,
    '',
    `${oneLiner}`,
    '',
    `It hooks into the lifecycle events Claude Code already fires (SessionStart, PreToolUse, …) and pushes a live card to your Discord profile — current file, today's hours, lifetime totals, cost. Plus a local web dashboard, a terminal TUI, shareable badges/cards, and "Claude Wrapped".`,
    '',
    `What's new in v${version}:`,
    bulletList(),
    '',
    `Install: \`${install}\``,
    `Repo: ${REPO}`,
    `Site: ${ref('hn')}`,
    '',
    `Built solo. Happy to answer anything about the hook→state→daemon→Discord IPC design.`,
  ].join('\n');

  const reddit = [
    `**claude-rpc v${version} — put your live Claude Code session on your Discord profile**`,
    '',
    `${oneLiner}`,
    '',
    `New in this release:`,
    bulletList(),
    '',
    `One command to try it: \`${install}\``,
    `Site/demo: ${ref('reddit')} · Source (MIT): ${REPO}`,
    '',
    `Community totals are opt-in and anonymous; everything's reversible. Feedback welcome.`,
  ].join('\n');

  const devto = [
    `---`,
    `title: "claude-rpc v${version}: Discord Rich Presence for Claude Code"`,
    `published: false`,
    `tags: claude, discord, opensource, cli`,
    `---`,
    '',
    `${oneLiner}`,
    '',
    `## What's new in v${version}`,
    '',
    top.map((t, i) => `${i + 1}. **${t}** — ${bullets[i]?.body || ''}`).join('\n'),
    '',
    `## Try it`,
    '',
    '```sh',
    install,
    '```',
    '',
    `Source (MIT): ${REPO} · Site: ${ref('devto')}`,
  ].join('\n');

  const twitter = [
    `🧵 claude-rpc v${version} is out — Discord Rich Presence for Claude Code.`,
    '',
    `Your live model, project, tokens & lifetime stats, right on your Discord profile. One command:`,
    '',
    `  ${install}`,
    '',
    `1/ What's new:`,
    ...top.slice(0, 4).map((t, i) => `${i + 2}/ ${t}`),
    '',
    `${top.length + 2}/ Free, MIT, built solo. ${ref('twitter')}`,
  ].join('\n');

  const discord = [
    `**claude-rpc v${version}** is out 🎉`,
    `${oneLiner}`,
    '',
    top.map((t) => `• ${t}`).join('\n'),
    '',
    `Install: \`${install}\`  ·  <${ref('discord')}>`,
  ].join('\n');

  const github = [
    `${oneLiner}`,
    '',
    `### Highlights`,
    bulletList(),
    '',
    `**Install:** \`${install}\``,
  ].join('\n');

  return { showHN, reddit, devto, twitter, discord, github };
}

// Wrap the drafts into a single GitHub-issue body.
export function buildIssueBody({ version, date }, drafts) {
  const section = (title, lang, content) =>
    `## ${title}\n\n\`\`\`${lang}\n${content}\n\`\`\`\n`;
  return [
    `Auto-generated launch kit for **v${version}**${date ? ` (${date})` : ''}. Copy, tweak, and post each under your own account — nothing here is posted automatically.`,
    '',
    `Each link carries \`?ref=<channel>\` so installs are attributed on the [community page](${SITE}/community).`,
    '',
    section('Show HN', '', drafts.showHN),
    section('Reddit (r/ClaudeAI)', '', drafts.reddit),
    section('dev.to', 'md', drafts.devto),
    section('X / Twitter thread', '', drafts.twitter),
    section('Discord', '', drafts.discord),
    section('GitHub release notes', 'md', drafts.github),
  ].join('\n');
}

// ── CLI: node scripts/announce.js [version] [--changelog PATH] [--out PATH] ──
function isMain() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMain()) {
  const args = process.argv.slice(2);
  const get = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
  const changelogPath = get('--changelog', 'CHANGELOG.md');
  const outPath = get('--out', null);
  const md = readFileSync(changelogPath, 'utf8');
  const parsed = parseLatestChangelog(md);
  if (!parsed) { console.error('No version section found in CHANGELOG'); process.exit(1); }
  const drafts = buildAnnouncements(parsed);
  const body = buildIssueBody(parsed, drafts);
  if (outPath) { writeFileSync(outPath, body); console.error(`wrote ${outPath}`); }
  // Always echo the version to stdout so the workflow can read it.
  process.stdout.write(parsed.version);
}
