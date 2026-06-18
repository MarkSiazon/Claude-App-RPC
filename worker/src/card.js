// Worker-side profile stat-card SVG — the live sibling of the local
// `claude-rpc github-stat` card (src/profile.js), rendered from the FOUR
// metrics a public profile stores (tokens, sessions, activeMs, streak) plus
// identity (handle / displayName / verified). Served at GET /card/<handle>.svg
// so a README can embed an always-current card with no gist and no local
// daemon — the card refreshes itself as the profile flushes (~every 30 min),
// exactly like the per-user badge.
//
// Paper/terracotta brand matches src/profile.js. Custom font families degrade
// to the system stacks under GitHub's camo, which serves the SVG as an <img>
// and won't fetch web fonts — so the verified mark is drawn as a <path>, not a
// glyph, to stay font-independent. Kept inline + dep-free (no bundler needed).

import { fmtNum, fmtHours } from './badge.js';

const W = 480;
const H = 200;
const PALETTE = {
  paper: '#f4ede0', ink: '#1a1611', inkMute: '#5c5147', inkFaint: '#8a7c6d',
  rust: '#c2491e', grass: '#4a9462',
};

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// One stat: big value over a mono caps label, centred on cx.
function statCell(cx, value, label, accent) {
  return `
  <text x="${cx}" y="146" text-anchor="middle" font-family="Space Grotesk, Inter, system-ui, sans-serif"
        font-size="30" font-weight="800" letter-spacing="-1" fill="${accent}">${escapeXml(value)}</text>
  <text x="${cx}" y="168" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="11" font-weight="700" letter-spacing="1.5" fill="${PALETTE.inkMute}">${escapeXml(label)}</text>`;
}

// A GitHub-style verified stamp drawn as vectors (no font glyph dependency).
function verifiedStamp(x, y) {
  return `
  <g transform="translate(${x} ${y})">
    <circle r="11" fill="${PALETTE.grass}"/>
    <path d="M -4.6 0 L -1.4 3.4 L 5 -4" fill="none" stroke="#fff" stroke-width="2.4"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// p: the publicProfile shape { handle, displayName, githubUser, verified,
// tokens, sessions, activeMs, streak } — or null for an unknown handle, which
// renders a neutral placeholder card (a README <img> still shows something).
export function renderProfileCard(p) {
  const has = !!p;
  const name = has ? (p.displayName || `@${p.handle}`) : 'claude-rpc';
  const verified = has && !!p.verified;
  const sub = has ? (verified ? 'Claude Code · verified' : 'Claude Code') : 'no public profile yet';
  const cells = has
    ? [
        [fmtNum(p.tokens || 0),     'tokens',   PALETTE.ink],
        [fmtNum(p.sessions || 0),   'sessions', PALETTE.ink],
        [fmtHours(p.activeMs || 0), 'hours',    PALETTE.rust],
        [`${p.streak || 0}d`,       'streak',   PALETTE.grass],
      ]
    : [
        ['—', 'tokens', PALETTE.inkFaint], ['—', 'sessions', PALETTE.inkFaint],
        ['—', 'hours', PALETTE.inkFaint], ['—', 'streak', PALETTE.inkFaint],
      ];
  const C = [87, 189, 291, 393]; // four centred columns

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Claude Code stats: ${escapeXml(name)}">
  <defs>
    <pattern id="dg" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${PALETTE.ink}" opacity="0.06"/>
    </pattern>
  </defs>
  <rect x="3" y="4" width="${W - 6}" height="${H - 7}" fill="${PALETTE.ink}"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="${H - 9}" fill="${PALETTE.paper}" stroke="${PALETTE.ink}" stroke-width="1.5"/>
  <rect x="0.75" y="0.75" width="${W - 7}" height="${H - 9}" fill="url(#dg)"/>

  <text x="36" y="56" font-family="Space Grotesk, Inter, system-ui, sans-serif"
        font-size="28" font-weight="800" letter-spacing="-1" fill="${PALETTE.ink}">${escapeXml(name)}</text>
  <text x="36" y="80" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="13" fill="${PALETTE.inkMute}">${escapeXml(sub)}</text>
  ${verified ? verifiedStamp(W - 34, 36) : ''}

  <line x1="36" y1="100" x2="${W - 36}" y2="100" stroke="${PALETTE.ink}" stroke-width="1" opacity="0.18"/>

  ${cells.map(([v, l, a], i) => statCell(C[i], v, l, a)).join('')}

  <text x="36" y="${H - 14}" font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="11" fill="${PALETTE.inkFaint}">claude-rpc.vercel.app</text>
</svg>`;
}
