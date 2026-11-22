// Static pages: home, docs, and blog mount the Ask AI group. Leaderboard does not.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(join(root, 'site', 'ask-ai.js'), 'utf8');

const PRESENT = [
  'site/index.html',
  'site/docs.html',
  'site/blog.html',
  'site/blog/how-it-works.html',
  'site/blog/now-a-plugin.html',
  'site/blog/ship-week.html',
  'site/blog/three-weeks.html',
  'site/blog/zero-deps.html',
];

const ABSENT = [
  'site/leaderboard.html',
  'site/wrapped.html',
  'site/u.html',
  'site/squad.html',
  'site/squads.html',
];

const BASES = [
  'https://chatgpt.com/',
  'https://claude.ai/new',
  'https://gemini.google.com/app',
  'https://www.perplexity.ai/search',
  'https://grok.com/',
];

const NAMES = ['ChatGPT', 'Claude', 'Gemini', 'Perplexity', 'Grok'];

const LIGHT_FILES = [
  'ask-chatgpt.png',
  'ask-claude.png',
  'ask-google.png',
  'ask-perplexity.png',
  'ask-grok.png',
];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function matches(node, sel) {
  if (!node || !node.tagName) return false;
  if (sel.startsWith('#')) return node.attrs.id === sel.slice(1);
  if (sel.startsWith('.'))
    return String(node.className || '')
      .split(/\s+/)
      .includes(sel.slice(1));
  if (sel === '[data-ask-ai]')
    return Object.prototype.hasOwnProperty.call(node.attrs, 'data-ask-ai');
  if (sel === '[role="group"]') return node.attrs.role === 'group';
  if (sel === 'link[rel="canonical"]')
    return node.tagName === 'LINK' && node.attrs.rel === 'canonical';
  if (sel === 'a') return node.tagName === 'A';
  if (sel === 'img') return node.tagName === 'IMG';
  return false;
}

function walk(node, out = []) {
  out.push(node);
  for (const child of node.children || []) walk(child, out);
  return out;
}

function select(node, sel) {
  return walk(node).filter((item) => matches(item, sel));
}

function createElement(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    attrs: Object.create(null),
    children: [],
    className: '',
    _text: '',
    parentNode: null,
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    querySelector(sel) {
      return select(this, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return select(this, sel);
    },
  };
  Object.defineProperty(node, 'textContent', {
    get() {
      if (this.children.length) return this.children.map((child) => child.textContent).join('');
      return this._text;
    },
    set(value) {
      this._text = value == null ? '' : String(value);
      this.children = [];
    },
  });
  Object.defineProperty(node, 'id', {
    get() {
      return this.attrs.id || '';
    },
    set(value) {
      this.attrs.id = String(value);
    },
  });
  Object.defineProperty(node, 'href', {
    get() {
      return this.attrs.href || '';
    },
    set(value) {
      this.attrs.href = String(value);
    },
  });
  Object.defineProperty(node, 'src', {
    get() {
      return this.attrs.src || '';
    },
    set(value) {
      this.attrs.src = String(value);
    },
  });
  Object.defineProperty(node, 'rel', {
    get() {
      return this.attrs.rel || '';
    },
    set(value) {
      this.attrs.rel = String(value);
    },
  });
  Object.defineProperty(node, 'target', {
    get() {
      return this.attrs.target || '';
    },
    set(value) {
      this.attrs.target = String(value);
    },
  });
  return node;
}

function render(html, overrides = {}) {
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i);
  const title = overrides.title ?? (titleMatch ? titleMatch[1] : '');
  const canonical = overrides.canonical ?? (canonicalMatch ? canonicalMatch[1] : '');

  const head = createElement('head');
  const body = createElement('body');
  const footer = createElement('footer');
  const mount = createElement('div');
  mount.setAttribute('data-ask-ai', '');
  footer.appendChild(mount);
  body.appendChild(footer);

  const canonicalLink = createElement('link');
  canonicalLink.setAttribute('rel', 'canonical');
  canonicalLink.setAttribute('href', canonical);
  head.appendChild(canonicalLink);

  const document = {
    title,
    readyState: 'complete',
    head,
    body,
    createElement,
    addEventListener() {},
    querySelector(sel) {
      return select(head, sel)[0] || select(body, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return select(head, sel).concat(select(body, sel));
    },
  };

  const location = {
    href: overrides.locationHref || `${canonical}?ref=badge#token=secret`,
    search: '?ref=badge',
    hash: '#token=secret',
  };

  const sandbox = {
    URL,
    String,
    RegExp,
    Object,
    document,
    location,
  };
  const context = createContext(sandbox);
  runInContext(script, context);

  const group = mount.querySelector('[role="group"]');
  const links = mount.querySelectorAll('a');
  const style = head.querySelector('#ask-ai-style');
  return {
    title,
    label: mount.children[0] ? mount.children[0].textContent : '',
    groupLabel: group ? group.getAttribute('aria-label') : '',
    links,
    style: style ? style.textContent : '',
    prompt: links[0] ? new URL(links[0].getAttribute('href')).searchParams.get('q') : '',
  };
}

test('home, docs, and blog HTML contain the Ask AI group, and leaderboard does not', () => {
  for (const rel of PRESENT) {
    const html = read(rel);
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/i);
    assert.ok(footer, `${rel} has a footer`);
    assert.match(footer[0], /<div data-ask-ai><\/div>/, `${rel} footer mounts Ask AI`);
    assert.match(html, /<script src="\/ask-ai\.js"><\/script>/, `${rel} loads ask-ai.js`);

    const view = render(html);
    assert.equal(view.label, 'Ask your AI', rel);
    assert.equal(view.groupLabel, 'Ask your AI', rel);
    assert.equal(view.links.length, 5, rel);

    const parsedCanonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)[1];
    const clean = new URL(parsedCanonical);
    clean.search = '';
    clean.hash = '';
    assert.match(
      view.prompt,
      new RegExp(`Read only ${clean.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`),
    );
    assert.match(view.prompt, /Page: /);
    assert.doesNotMatch(view.prompt, /ref=badge|token=secret|#token|\?ref/);
    assert.match(view.style, /width:44px/);
    assert.match(view.style, /gap:8px/);
    assert.match(view.style, /touch-action:manipulation/);
    assert.match(view.style, /prefers-reduced-motion:reduce/);
    assert.match(view.style, /a:active\{opacity:/);
    assert.doesNotMatch(view.style, /scale\(/);
    assert.doesNotMatch(script, /-dark\.png/);

    view.links.forEach((link, index) => {
      const href = link.getAttribute('href');
      const url = new URL(href);
      assert.equal(`${url.origin}${url.pathname}`, BASES[index], rel);
      assert.equal(url.searchParams.get('q'), view.prompt, rel);
      assert.equal([...url.searchParams.keys()].join(','), 'q', rel);
      assert.equal(link.getAttribute('target'), '_blank', rel);
      assert.equal(link.getAttribute('rel'), 'noopener noreferrer', rel);
      assert.equal(link.getAttribute('aria-label'), `${NAMES[index]}, ${view.title}`, rel);
      assert.equal(link.querySelector('.ask-ai-tip').textContent, `Ask ${NAMES[index]}`, rel);
      assert.doesNotMatch(link.querySelector('.ask-ai-tip').textContent, /Ask AI/);
      assert.equal(
        link.querySelector('img').getAttribute('src'),
        `/img/platforms/${LIGHT_FILES[index]}`,
        rel,
      );
      assert.equal(link.querySelector('img').getAttribute('alt'), '', rel);
    });
  }

  for (const rel of ABSENT) {
    const html = read(rel);
    assert.doesNotMatch(html, /data-ask-ai/, `${rel} must not mount Ask AI`);
    assert.doesNotMatch(html, /ask-ai\.js/, `${rel} must not load ask-ai.js`);
    assert.doesNotMatch(html, /Ask your AI/, `${rel} must not show the Ask AI label`);
  }
});

test('Ask AI prompt strips search and hash from the canonical URL', () => {
  const html = read('site/docs.html');
  const view = render(html, {
    canonical: 'https://claude-rpc.com/docs?utm=newsletter#privacy',
    locationHref: 'https://claude-rpc.com/docs?ref=badge#token=secret',
  });
  assert.match(view.prompt, /Read only https:\/\/claude-rpc\.com\/docs\./);
  assert.doesNotMatch(view.prompt, /utm|newsletter|#privacy|ref=badge|token=secret/);
});
