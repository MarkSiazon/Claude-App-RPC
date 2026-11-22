/* Shared Ask AI row for the paper pages (home, docs, blog).
   The footer stays on --paper and this site has no theme toggle, so the
   light-surface marks are used. Prompt and hrefs live only in this file. */
(function () {
  var LABEL = 'Ask your AI';
  var ASSET = '/img/platforms/';
  var PROVIDERS = [
    { name: 'ChatGPT', file: 'ask-chatgpt.png', base: 'https://chatgpt.com/' },
    { name: 'Claude', file: 'ask-claude.png', base: 'https://claude.ai/new' },
    { name: 'Gemini', file: 'ask-google.png', base: 'https://gemini.google.com/app' },
    { name: 'Perplexity', file: 'ask-perplexity.png', base: 'https://www.perplexity.ai/search' },
    { name: 'Grok', file: 'ask-grok.png', base: 'https://grok.com/' }
  ];

  var CSS = [
    '[data-ask-ai]{flex:1 0 100%;width:100%;max-width:100%;display:flex;flex-direction:column;align-items:center;gap:8px;margin:0 0 16px;padding:0;background:transparent;color:inherit;box-sizing:border-box;}',
    '[data-ask-ai] .ask-ai-label{margin:0;padding:0;font:inherit;color:var(--ink,#1a1611);line-height:1.3;text-align:center;}',
    '[data-ask-ai] .ask-ai-links{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px;max-width:100%;}',
    '[data-ask-ai] a{position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;min-height:44px;box-sizing:border-box;padding:0;touch-action:manipulation;text-decoration:none;color:inherit;border:2px solid var(--ink,#1a1611);border-radius:0;box-shadow:0 2px 0 var(--ink,#1a1611),0 6px 0 rgba(26,22,17,0.10);transition:opacity 200ms ease;}',
    '[data-ask-ai] a:hover{text-decoration:none;color:inherit;}',
    '[data-ask-ai] a:active{opacity:.55;}',
    '[data-ask-ai] a:focus{outline:2px solid var(--ink,#1a1611);outline-offset:2px;}',
    '[data-ask-ai] a:focus:not(:focus-visible){outline:none;}',
    '[data-ask-ai] a:focus-visible{outline:2px solid var(--ink,#1a1611);outline-offset:2px;}',
    '[data-ask-ai] img{width:100%;height:100%;margin:0;padding:0;display:block;object-fit:fill;border:0;border-radius:0;}',
    '[data-ask-ai] .ask-ai-tip{position:absolute;left:50%;bottom:calc(100% + 8px);transform:translateX(calc(-50% + var(--ask-tip-x, 0px)));width:max-content;max-width:min(11rem,calc(100vw - 16px));padding:3px 7px;border-radius:0;background:var(--ink,#1a1611);color:var(--paper,#f4ede0);font:inherit;font-size:12px;line-height:1.3;text-align:center;opacity:0;pointer-events:none;transition:opacity 200ms ease;}',
    '[data-ask-ai] .ask-ai-tip[data-side="bottom"]{bottom:auto;top:calc(100% + 8px);}',
    '[data-ask-ai] a:hover .ask-ai-tip,[data-ask-ai] a:focus-visible .ask-ai-tip{opacity:1;}',
    '@media (prefers-reduced-motion:reduce){[data-ask-ai] a,[data-ask-ai] .ask-ai-tip{transition:none;}}'
  ].join('');

  function cleanUrl(raw) {
    if (!raw) return '';
    var url = new URL(raw, 'https://claude-rpc.com/');
    url.search = '';
    url.hash = '';
    return url.href;
  }

  function pageUrl() {
    var link = document.querySelector('link[rel="canonical"]');
    var raw = '';
    if (link) raw = link.getAttribute('href') || link.href || '';
    if (!raw && typeof location !== 'undefined' && location && location.href) raw = location.href;
    return cleanUrl(raw);
  }

  function pageTitle() {
    var title = String(document.title || '').trim();
    if (!title) return 'claude-rpc';
    if (!/claude-rpc/i.test(title)) return title + ', claude-rpc';
    return title;
  }

  function buildPrompt(title, url) {
    return 'Read only ' + url + '. Page: ' + title + '. Do not invent anything that page does not say. claude-rpc puts the live Claude Code session on the Discord profile over local IPC: model, project, current tool, tokens, and lifetime stats. Transcripts, local stats, dashboards, and aggregates stay on the machine. Privacy is a one-way valve between that local state and the Discord card and does not change the local stats, dashboards, or aggregates.';
  }

  function hrefFor(base, prompt) {
    var url = new URL(base);
    url.searchParams.set('q', prompt);
    return url.toString();
  }

  function placeAskTip(anchor) {
    var tip = anchor.querySelector('.ask-ai-tip');
    if (!tip || typeof anchor.getBoundingClientRect !== 'function') return;
    var icon = anchor.getBoundingClientRect();
    var width = tip.offsetWidth;
    var height = tip.offsetHeight;
    if (!width || !height) return;
    var margin = 8;
    var ideal = icon.left + icon.width / 2 - width / 2;
    var view = window.innerWidth || 0;
    var left = Math.max(margin, Math.min(ideal, view - margin - width));
    tip.style.setProperty('--ask-tip-x', (left - ideal) + 'px');
    tip.setAttribute('data-side', icon.top < height + margin + 8 ? 'bottom' : 'top');
  }

  function mount() {
    var root = document.querySelector('[data-ask-ai]');
    if (!root || root.getAttribute('data-ask-ai-ready') === '1') return;
    root.setAttribute('data-ask-ai-ready', '1');

    if (!document.querySelector('#ask-ai-style') && document.head) {
      var style = document.createElement('style');
      style.id = 'ask-ai-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    var title = pageTitle();
    var url = pageUrl();
    var prompt = buildPrompt(title, url);

    var label = document.createElement('div');
    label.className = 'ask-ai-label';
    label.textContent = LABEL;

    var group = document.createElement('div');
    group.className = 'ask-ai-links';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', LABEL);

    for (var i = 0; i < PROVIDERS.length; i++) {
      var provider = PROVIDERS[i];
      var link = document.createElement('a');
      link.href = hrefFor(provider.base, prompt);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', provider.name + ', ' + title);

      var img = document.createElement('img');
      img.src = ASSET + provider.file;
      img.setAttribute('alt', '');
      img.setAttribute('width', '40');
      img.setAttribute('height', '40');
      link.appendChild(img);

      var tip = document.createElement('span');
      tip.className = 'ask-ai-tip';
      tip.id = 'ask-ai-tip-' + provider.file.replace('.png', '');
      tip.setAttribute('role', 'tooltip');
      tip.textContent = 'Ask ' + provider.name;
      link.setAttribute('aria-describedby', tip.id);
      link.appendChild(tip);
      (function (anchor) {
        anchor.addEventListener('mouseenter', function () { placeAskTip(anchor); });
        anchor.addEventListener('focus', function () { placeAskTip(anchor); });
      })(link);

      group.appendChild(link);
    }

    root.appendChild(label);
    root.appendChild(group);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
