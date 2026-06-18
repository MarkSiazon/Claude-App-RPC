// Worker-side profile stat-card SVG — the live sibling of the local
// `claude-rpc github-stat` card (src/profile.js), rendered from the FOUR
// metrics a public profile stores (tokens, sessions, activeMs, streak) plus
// identity (handle / displayName / githubUser / verified). Served at
// GET /card/<handle>.svg so a README can embed an always-current card with no
// gist and no local daemon — it refreshes itself as the profile flushes.
//
// Paper/terracotta brand matching src/profile.js + the site. Everything is
// hand-drawn vectors (brand spark, per-stat icons, verified mark) so it stays
// font-independent under GitHub's camo, which serves the SVG as an <img> and
// won't fetch web fonts. Kept inline + dep-free (no bundler needed).

import { fmtNum, fmtHours } from './badge.js';

const W = 480;
const H = 235;
const PALETTE = {
  paper: '#f4ede0', paper2: '#ece2d1', paper3: '#e3d7c1',
  ink: '#1a1611', inkMute: '#5c5147', inkFaint: '#94897a',
  rust: '#c2491e', amber: '#c0851f', blue: '#3f6f9f', grass: '#4a9462',
};

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── vector marks ─────────────────────────────────────────────────────────

// Concave 4-point sparkle (the brand spark + the tokens icon).
function spark(cx, cy, r, fill) {
  const i = r * 0.16; // waist pull toward centre
  return `<path d="M ${cx} ${cy - r} C ${cx + i} ${cy - i} ${cx + i} ${cy - i} ${cx + r} ${cy} C ${cx + i} ${cy + i} ${cx + i} ${cy + i} ${cx} ${cy + r} C ${cx - i} ${cy + i} ${cx - i} ${cy + i} ${cx - r} ${cy} C ${cx - i} ${cy - i} ${cx - i} ${cy - i} ${cx} ${cy - r} Z" fill="${fill}"/>`;
}

// Terminal glyph — a window with a ">" prompt and caret (sessions).
function iconTerminal(cx, cy, color) {
  return `<g fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
    <rect x="${cx - 9}" y="${cy - 7}" width="18" height="14" rx="2.5"/>
    <path d="M ${cx - 5} ${cy - 1.5} L ${cx - 2} ${cy + 1} L ${cx - 5} ${cy + 3.5}"/>
    <path d="M ${cx + 1} ${cy + 3.5} L ${cx + 5} ${cy + 3.5}"/>
  </g>`;
}

// Clock (hours).
function iconClock(cx, cy, color) {
  return `<g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round">
    <circle cx="${cx}" cy="${cy}" r="8"/>
    <path d="M ${cx} ${cy} L ${cx} ${cy - 4.6}"/>
    <path d="M ${cx} ${cy} L ${cx + 3.6} ${cy + 1.8}"/>
  </g>`;
}

// Flame (streak).
function iconFlame(cx, cy, color) {
  return `<path d="M ${cx} ${cy - 9}
    C ${cx + 6} ${cy - 3} ${cx + 6.5} ${cy + 2} ${cx + 4} ${cy + 5}
    C ${cx + 2.5} ${cy + 7} ${cx - 3} ${cy + 7.5} ${cx - 4.2} ${cy + 3}
    C ${cx - 5} ${cy - 0.2} ${cx - 1.5} ${cy + 1} ${cx - 1} ${cy - 1.5}
    C ${cx - 0.5} ${cy - 4} ${cx - 2} ${cy - 6} ${cx} ${cy - 9} Z"
    fill="${color}"/>
    <path d="M ${cx + 0.5} ${cy + 1}
    C ${cx + 2.5} ${cy + 3} ${cx + 2} ${cy + 5.5} ${cx} ${cy + 5.5}
    C ${cx - 1.8} ${cy + 5.5} ${cx - 2} ${cy + 3} ${cx} ${cy + 1.5} Z"
    fill="${PALETTE.paper2}" opacity="0.55"/>`;
}

// GitHub-style verified stamp.
function verifiedStamp(x, y) {
  return `<g transform="translate(${x} ${y})">
    <circle r="11" fill="${PALETTE.grass}"/>
    <path d="M -4.6 0 L -1.4 3.4 L 5 -4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// One framed stat tile: accent top-bar, icon, big value, mono caps label.
function tile(x, value, label, color, iconFn) {
  const cx = x + 50;
  return `
  <g>
    <rect x="${x}" y="108" width="100" height="84" fill="${PALETTE.paper2}" stroke="${PALETTE.ink}" stroke-width="1.5"/>
    <rect x="${x}" y="108" width="100" height="4" fill="${color}"/>
    ${iconFn(cx, 136, color)}
    <text x="${cx}" y="170" text-anchor="middle" font-family="Space Grotesk, Inter, system-ui, sans-serif"
          font-size="23" font-weight="800" letter-spacing="-0.5" fill="${PALETTE.ink}">${escapeXml(value)}</text>
    <text x="${cx}" y="184" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace"
          font-size="9" font-weight="700" letter-spacing="1.5" fill="${color}">${escapeXml(label.toUpperCase())}</text>
  </g>`;
}

// p: the publicProfile shape { handle, displayName, githubUser, verified,
// tokens, sessions, activeMs, streak } — or null for an unknown handle, which
// renders a neutral placeholder card (a README <img> still shows something).
export function renderProfileCard(p) {
  const has = !!p;
  const rawName = has ? (p.displayName || `@${p.handle}`) : 'claude-rpc';
  // Guard the title against the verified stamp: displayNames are cleaned to ≤40
  // chars server-side, which still overflows at 26px — clip the rendered title.
  const name = rawName.length > 22 ? `${rawName.slice(0, 21)}…` : rawName;
  const verified = has && !!p.verified;
  const sub = has ? (verified ? 'Claude Code · verified' : 'Claude Code') : 'no public profile yet';
  const gh = has && p.githubUser ? `github.com/${p.githubUser}` : 'claude-rpc.vercel.app';

  const tiles = has
    ? [
        tile(28,  fmtNum(p.tokens || 0),     'tokens',   PALETTE.rust,  (a, b, c) => spark(a, b, 8, c)),
        tile(136, fmtNum(p.sessions || 0),   'sessions', PALETTE.blue,  iconTerminal),
        tile(244, fmtHours(p.activeMs || 0), 'hours',    PALETTE.amber, iconClock),
        tile(352, `${p.streak || 0}d`,       'streak',   PALETTE.grass, iconFlame),
      ]
    : [
        tile(28,  '—', 'tokens',   PALETTE.inkFaint, (a, b, c) => spark(a, b, 8, c)),
        tile(136, '—', 'sessions', PALETTE.inkFaint, iconTerminal),
        tile(244, '—', 'hours',    PALETTE.inkFaint, iconClock),
        tile(352, '—', 'streak',   PALETTE.inkFaint, iconFlame),
      ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Claude Code stats: ${escapeXml(name)}">
  <defs>
    <pattern id="dg" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${PALETTE.ink}" opacity="0.06"/>
    </pattern>
  </defs>
  <rect x="3" y="4" width="${W - 6}" height="${H - 7}" fill="${PALETTE.ink}"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="${H - 9}" fill="${PALETTE.paper}" stroke="${PALETTE.ink}" stroke-width="2"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="86" fill="${PALETTE.paper3}"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="${H - 9}" fill="url(#dg)"/>
  <rect x="0.75" y="86" width="${W - 7}" height="3" fill="${PALETTE.rust}"/>

  ${spark(40, 50, 11, PALETTE.rust)}
  <text x="62" y="47" font-family="Space Grotesk, Inter, system-ui, sans-serif"
        font-size="26" font-weight="800" letter-spacing="-1" fill="${PALETTE.ink}">${escapeXml(name)}</text>
  <text x="63" y="69" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="12" fill="${PALETTE.inkMute}">${escapeXml(sub)}</text>
  ${verified ? verifiedStamp(W - 36, 44) : ''}

  ${tiles.join('')}

  ${spark(34, H - 17, 4.5, PALETTE.inkFaint)}
  <text x="44" y="${H - 13}" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="11" fill="${PALETTE.inkFaint}">${escapeXml(gh)}</text>
  <text x="${W - 30}" y="${H - 13}" text-anchor="end" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="10" fill="${PALETTE.inkFaint}">claude-rpc</text>
</svg>`;
}
