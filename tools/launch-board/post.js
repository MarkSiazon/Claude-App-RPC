// CLI poster — lets Claude (or you) post from the terminal using the same
// credentials and queue the board uses. The board is for composing; this is
// the "I post" half of "you auth, I post".
//
//   node tools/launch-board/post.js "your tweet text"   # post text directly
//   node tools/launch-board/post.js --next              # post the next queued item
//   node tools/launch-board/post.js --list              # show the queue
//
// Credentials come from ./.data/creds.json (created when you Connect in the
// board). Never commits — .data/ is gitignored.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postTweet } from './x.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '.data');
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(join(DATA, p), 'utf8')); } catch { return fb; } };

const creds = readJson('creds.json', null);
const args = process.argv.slice(2);

if (args[0] === '--list') {
  const q = readJson('queue.json', []);
  if (!q.length) console.log('(queue empty)');
  else q.forEach((x, i) => console.log(`${i + 1}. [${x.id}] ${x.text.replace(/\n/g, ' ⏎ ')}`));
  process.exit(0);
}

if (!creds) {
  console.error('No X credentials. Run the board (node tools/launch-board/server.js), Connect your account, then retry.');
  process.exit(1);
}

let text, popId = null;
if (args[0] === '--next') {
  const q = readJson('queue.json', []);
  if (!q.length) { console.error('Queue is empty.'); process.exit(1); }
  text = q[0].text; popId = q[0].id;
} else {
  text = args.join(' ').trim();
}
if (!text) { console.error('Nothing to post. Pass text or --next.'); process.exit(1); }

const r = await postTweet(text, creds);
if (!r.ok) { console.error('✗ post failed:', r.error); process.exit(1); }
console.log('✓ posted →', r.url);
if (popId) {
  const q = readJson('queue.json', []).filter((x) => x.id !== popId);
  writeFileSync(join(DATA, 'queue.json'), JSON.stringify(q, null, 2));
  console.log('  (removed from queue)');
}
