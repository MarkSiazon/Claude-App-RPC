// Worker-side profile stat-card SVG — the live sibling of the local
// `claude-rpc github-stat` card (src/profile.js), rendered from the FOUR
// metrics a public profile stores (tokens, sessions, activeMs, streak) plus
// identity. Served at GET /card/<handle>.svg so a README can embed an
// always-current card with no gist and no local daemon — it refreshes itself
// as the profile flushes.
//
// Visual language mirrors the signature poster card (src/card.js): cream paper
// with a dot-grid + grain, a gold "tape sticker", and tilted drop-shadow stat
// boxes with mono-caps labels and accent values. Everything is hand-drawn
// vectors (icons, verified mark) so it's font-independent under GitHub's camo,
// which serves the SVG as an <img> and won't fetch web fonts. Dep-free.

import { fmtNum, fmtHours } from './badge.js';

const W = 480;
const H = 252;
const PALETTE = {
  paper: '#f4ede0', paper2: '#ebe2d2', paper3: '#e1d6c0',
  ink: '#1a1611', inkMute: '#5c5147', inkFaint: '#8a7c6d',
  rust: '#c2491e', amber: '#c0851f', blue: '#3f6f9f', grass: '#4a9462', tape: '#f2d76e',
};

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── vector marks (all symmetric about cx, sized ~ s) ─────────────────────

function spark(cx, cy, r, fill) {
  const i = r * 0.16;
  return `<path d="M ${cx} ${cy - r} C ${cx + i} ${cy - i} ${cx + i} ${cy - i} ${cx + r} ${cy} C ${cx + i} ${cy + i} ${cx + i} ${cy + i} ${cx} ${cy + r} C ${cx - i} ${cy + i} ${cx - i} ${cy + i} ${cx - r} ${cy} C ${cx - i} ${cy - i} ${cx - i} ${cy - i} ${cx} ${cy - r} Z" fill="${fill}"/>`;
}

// Speech bubble with a centred tail (sessions = conversations).
function iconBubble(cx, cy, color) {
  return `<g fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round">
    <rect x="${cx - 8.5}" y="${cy - 7}" width="17" height="12.5" rx="3.5"/>
    <path d="M ${cx - 2.5} ${cy + 5} L ${cx} ${cy + 8.5} L ${cx + 2.5} ${cy + 5}"/>
    <circle cx="${cx - 3.5}" cy="${cy - 1}" r="0.9" fill="${color}" stroke="none"/>
    <circle cx="${cx}" cy="${cy - 1}" r="0.9" fill="${color}" stroke="none"/>
    <circle cx="${cx + 3.5}" cy="${cy - 1}" r="0.9" fill="${color}" stroke="none"/>
  </g>`;
}

// Clock (hours).
function iconClock(cx, cy, color) {
  return `<g fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round">
    <circle cx="${cx}" cy="${cy}" r="8"/>
    <path d="M ${cx} ${cy} L ${cx} ${cy - 4.8}"/>
    <path d="M ${cx} ${cy} L ${cx + 3.8} ${cy + 1.8}"/>
  </g>`;
}

// Flame (streak) — symmetric teardrop with an inner highlight.
function iconFlame(cx, cy, color) {
  return `<path d="M ${cx} ${cy - 9} C ${cx + 7} ${cy - 2} ${cx + 6} ${cy + 5} ${cx} ${cy + 8} C ${cx - 6} ${cy + 5} ${cx - 7} ${cy - 2} ${cx} ${cy - 9} Z" fill="${color}"/>
    <path d="M ${cx} ${cy - 1} C ${cx + 3.4} ${cy + 1.5} ${cx + 2.6} ${cy + 5.4} ${cx} ${cy + 5.4} C ${cx - 2.6} ${cy + 5.4} ${cx - 3.4} ${cy + 1.5} ${cx} ${cy - 1} Z" fill="${PALETTE.paper}" opacity="0.5"/>`;
}

// GitHub-style verified stamp.
function verifiedStamp(x, y) {
  return `<g transform="translate(${x} ${y})">
    <circle r="11" fill="${PALETTE.grass}"/>
    <path d="M -4.6 0 L -1.4 3.4 L 5 -4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// Gold tape sticker, matches the poster card's signature flourish.
function tapeSticker(x, y, text, rotate) {
  const pad = 11, fs = 11;
  const w = text.length * 7.1 + pad * 2;
  const h = fs + 11;
  return `<g transform="translate(${x} ${y}) rotate(${rotate})">
    <rect x="0" y="0" width="${w}" height="${h}" fill="${PALETTE.tape}" stroke="${PALETTE.ink}" stroke-width="1.5"/>
    <rect x="2" y="2" width="${w}" height="${h}" fill="none" stroke="${PALETTE.ink}" stroke-width="1.5" opacity="0.18"/>
    <text x="${w / 2}" y="${h / 2 + 4}" font-family="JetBrains Mono, ui-monospace, monospace"
          font-size="${fs}" font-weight="700" letter-spacing="1.4" text-anchor="middle" fill="${PALETTE.ink}">${escapeXml(text.toUpperCase())}</text>
  </g>`;
}

// One tilted, drop-shadow stat box (poster idiom): icon, big accent value,
// mono-caps label. Content is centred on the box so values of any width sit
// straight.
function statBox(x, value, label, color, iconFn, tilt) {
  const w = 100, h = 96, cx = w / 2;
  return `<g transform="translate(${x} 100) rotate(${tilt} ${cx} ${h / 2})">
    <rect x="2" y="3" width="${w}" height="${h}" fill="${PALETTE.ink}"/>
    <rect x="0" y="0" width="${w}" height="${h}" fill="${PALETTE.paper2}" stroke="${PALETTE.ink}" stroke-width="1.5"/>
    ${iconFn(cx, 30, color)}
    <text x="${cx}" y="66" text-anchor="middle" font-family="Space Grotesk, Inter, system-ui, sans-serif"
          font-size="25" font-weight="800" letter-spacing="-0.5" fill="${color}">${escapeXml(value)}</text>
    <text x="${cx}" y="84" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace"
          font-size="9.5" font-weight="700" letter-spacing="1.4" fill="${PALETTE.inkMute}">${escapeXml(label.toUpperCase())}</text>
  </g>`;
}

// p: the publicProfile shape { handle, displayName, githubUser, verified,
// tokens, sessions, activeMs, streak } — or null for an unknown handle, which
// renders a neutral placeholder card (a README <img> still shows something).
export function renderProfileCard(p) {
  const has = !!p;
  const rawName = has ? (p.displayName || `@${p.handle}`) : 'claude-rpc';
  // displayNames are cleaned to ≤40 chars server-side, still wide at 27px —
  // clip the rendered title so it can't run under the verified stamp.
  const name = rawName.length > 22 ? `${rawName.slice(0, 21)}…` : rawName;
  const verified = has && !!p.verified;
  const sub = has ? (verified ? 'Claude Code · verified' : 'Claude Code') : 'no public profile yet';
  const gh = has && p.githubUser ? `github.com/${p.githubUser}` : 'claude-rpc.com';
  const dim = PALETTE.inkFaint;

  const boxes = has
    ? [
        statBox(28,  fmtNum(p.tokens || 0),     'tokens',   PALETTE.rust,  (a, b, c) => spark(a, b, 8, c), -1.4),
        statBox(136, fmtNum(p.sessions || 0),   'sessions', PALETTE.blue,  iconBubble, 1.0),
        statBox(244, fmtHours(p.activeMs || 0), 'hours',    PALETTE.amber, iconClock, -0.9),
        statBox(352, `${p.streak || 0}d`,       'streak',   PALETTE.grass, iconFlame, 1.3),
      ]
    : [
        statBox(28,  '—', 'tokens',   dim, (a, b, c) => spark(a, b, 8, c), -1.4),
        statBox(136, '—', 'sessions', dim, iconBubble, 1.0),
        statBox(244, '—', 'hours',    dim, iconClock, -0.9),
        statBox(352, '—', 'streak',   dim, iconFlame, 1.3),
      ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Claude Code stats: ${escapeXml(name)}">
  <defs>
    <pattern id="dg" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${PALETTE.ink}" opacity="0.07"/>
    </pattern>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0"/>
    </filter>
  </defs>
  <rect x="3" y="4" width="${W - 6}" height="${H - 7}" fill="${PALETTE.ink}"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="${H - 9}" fill="${PALETTE.paper}" stroke="${PALETTE.ink}" stroke-width="2"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="${H - 9}" fill="url(#dg)"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="${H - 9}" filter="url(#grain)" opacity="0.55"/>

  ${spark(40, 49, 11, PALETTE.rust)}
  <text x="62" y="48" font-family="Space Grotesk, Inter, system-ui, sans-serif"
        font-size="27" font-weight="800" letter-spacing="-1" fill="${PALETTE.ink}">${escapeXml(name)}</text>
  <text x="63" y="70" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="12" fill="${PALETTE.inkMute}">${escapeXml(sub)}</text>
  ${verified ? verifiedStamp(W - 38, 46) : ''}

  ${boxes.join('')}

  <text x="30" y="${H - 22}" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="11" fill="${PALETTE.inkFaint}">${escapeXml(gh)}</text>
  ${tapeSticker(W - 132, H - 36, 'claude-rpc', -3)}
</svg>`;
}

// ── Claude Wrapped share card ─────────────────────────────────────────────
//
// The year-in-review social object: GET /wrapped/<handle>.svg. Rendered from
// the published (opt-in, privacy-valved) wrapped payload — same poster
// language as the profile card, sized for link unfurls and README embeds.
// `data` is the sanitized wrapped blob or null (placeholder — never a broken
// <img>); `meta` carries { handle, displayName, verified, year }.

const WW = 640;
const WH = 336;

export function renderWrappedCard(data, meta = {}) {
  const has = !!data;
  const year = meta.year || new Date().getUTCFullYear();
  const rawName = meta.displayName || (meta.handle ? `@${meta.handle}` : 'claude-rpc');
  const name = rawName.length > 24 ? `${rawName.slice(0, 23)}…` : rawName;
  const dim = PALETTE.inkFaint;

  const v = (x) => has ? x : '—';
  const topProject = has && data.topProjects?.[0]?.name ? data.topProjects[0].name : null;
  // topLanguages entries are { name, edits } since v1.2.1 (plain strings before).
  const tl = has ? data.topLanguages?.[0] : null;
  const topLanguage = typeof tl === 'string' ? tl : (tl?.name || null);
  const chips = [
    topProject ? `top project · ${topProject}` : null,
    topLanguage ? `top language · ${topLanguage}` : null,
    has && data.daysActive ? `${data.daysActive} days active` : null,
    has && data.ships ? `${fmtNum(data.ships)} ships` : null,
  ].filter(Boolean).slice(0, 3);

  const chipRow = chips.map((text, i) => {
    const x = 32 + chips.slice(0, i).reduce((acc, t) => acc + t.length * 7.4 + 34, 0);
    const w = text.length * 7.4 + 22;
    return `<g transform="translate(${x} ${WH - 84})">
      <rect x="1.5" y="2" width="${w}" height="26" fill="${PALETTE.ink}"/>
      <rect x="0" y="0" width="${w}" height="26" fill="${PALETTE.paper2}" stroke="${PALETTE.ink}" stroke-width="1.4"/>
      <text x="${w / 2}" y="17.5" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace"
            font-size="11" font-weight="700" fill="${PALETTE.inkMute}">${escapeXml(text)}</text>
    </g>`;
  }).join('');

  const boxes = [
    statBox(42,  v(fmtHours(data?.activeMs || 0)),  'hours',    has ? PALETTE.amber : dim, iconClock, -1.2),
    statBox(190, v(fmtNum(data?.sessions || 0)),    'sessions', has ? PALETTE.blue : dim,  iconBubble, 0.9),
    statBox(338, v(fmtNum(data?.tokens || 0)),      'tokens',   has ? PALETTE.rust : dim,  (a, b, c) => spark(a, b, 8, c), -0.8),
    statBox(486, v(`${data?.streakBest || 0}d`),    'best streak', has ? PALETTE.grass : dim, iconFlame, 1.2),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WW} ${WH}" width="${WW}" height="${WH}" role="img" aria-label="Claude Wrapped ${year}: ${escapeXml(name)}">
  <defs>
    <pattern id="dg" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${PALETTE.ink}" opacity="0.07"/>
    </pattern>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0"/>
    </filter>
  </defs>
  <rect x="3" y="4" width="${WW - 6}" height="${WH - 7}" fill="${PALETTE.ink}"/>
  <rect x="0.75" y="0.75" width="${WW - 7}" height="${WH - 9}" fill="${PALETTE.paper}" stroke="${PALETTE.ink}" stroke-width="2"/>
  <rect x="0.75" y="0.75" width="${WW - 7}" height="${WH - 9}" fill="url(#dg)"/>
  <rect x="0.75" y="0.75" width="${WW - 7}" height="${WH - 9}" filter="url(#grain)" opacity="0.55"/>

  ${spark(46, 52, 12, PALETTE.rust)}
  <text x="70" y="50" font-family="Space Grotesk, Inter, system-ui, sans-serif"
        font-size="28" font-weight="800" letter-spacing="-1" fill="${PALETTE.ink}">Claude Wrapped ${year}</text>
  <text x="71" y="73" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="12.5" fill="${PALETTE.inkMute}">${escapeXml(has ? name : 'no wrapped published yet')}</text>
  ${meta.verified ? verifiedStamp(WW - 42, 50) : ''}

  ${boxes.join('')}

  ${chipRow}

  <text x="32" y="${WH - 24}" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="11" fill="${PALETTE.inkFaint}">claude-rpc.com/wrapped${meta.handle ? '/' + escapeXml(meta.handle) : ''}</text>
  ${tapeSticker(WW - 148, WH - 40, 'claude-rpc', -3)}
</svg>`;
}
