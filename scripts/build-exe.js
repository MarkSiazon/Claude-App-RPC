// Builds dist/claude-rpc.exe using Node SEA (Single Executable Apps).
// Pipeline:
//   1. esbuild bundles bin/claude-rpc.js → dist/bundle.cjs (CJS, single file)
//   2. node --experimental-sea-config sea-config.json → dist/sea-prep.blob
//   3. copy the running node.exe → dist/claude-rpc.exe
//   4. postject injects the SEA blob into the exe copy
//   5. (optional) strip the now-invalid Authenticode signature so Defender
//      isn't suspicious of a "signed" binary whose signature doesn't verify.
//
// SEA exes are dramatically less likely than pkg ones to trigger false
// positives in Windows Defender / Smartscreen because they are literally
// Node.js with a blob appended — no third-party loader code, no bytecode
// patterns that AV products have learned to flag.

import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
process.chdir(ROOT);

const exeOut = 'dist/claude-rpc.exe';
const seaBlob = 'dist/sea-prep.blob';

function run(label, cmd) {
  console.log(`\n→ ${label}`);
  execSync(cmd, { stdio: 'inherit', shell: true });
}

mkdirSync('dist', { recursive: true });
if (existsSync(exeOut)) rmSync(exeOut);
if (existsSync(seaBlob)) rmSync(seaBlob);

run(
  '1/4  esbuild bundle',
  `npx esbuild bin/claude-rpc.js --bundle --platform=node --target=node20 --format=cjs --outfile=dist/bundle.cjs --banner:js="const __filename_url=require('url').pathToFileURL(__filename).toString();" --define:import.meta.url=__filename_url`
);

run(
  '2/4  SEA blob',
  `node --experimental-sea-config sea-config.json`
);

console.log('\n→ 3/4  Copy node.exe → dist/claude-rpc.exe');
copyFileSync(process.execPath, exeOut);

run(
  '4/4  Inject blob into exe',
  `npx postject ${exeOut} NODE_SEA_BLOB ${seaBlob} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`
);

// Strip the (now-invalid) Authenticode signature if signtool is available.
// Skipping is fine; the exe still runs. But invalid sigs spook some AVs.
try {
  execSync(`signtool remove /s "${exeOut}"`, { stdio: 'pipe', shell: true });
  console.log('\n→ 5/5  Stripped invalid Authenticode signature (signtool)');
} catch {
  console.log('\n  (signtool not available — leaving invalid signature, exe still runs)');
}

const size = statSync(exeOut).size;
console.log(`\n✓ ${exeOut} ready (${(size / 1024 / 1024).toFixed(1)} MB)`);
