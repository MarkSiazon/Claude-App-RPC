#!/usr/bin/env node
// Regenerate homebrew/claude-rpc.rb's url + sha256 from the *published* npm
// tarball for the current package.json version. Run after `npm publish` so the
// formula's checksum matches exactly what the registry serves (a mismatch makes
// `brew install` fail). Prints the updated formula path on success.
//
//   node scripts/brew-formula.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const url = `https://registry.npmjs.org/claude-rpc/-/claude-rpc-${version}.tgz`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`failed to fetch ${url} — is ${version} published yet? (HTTP ${res.status})`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
const sha = createHash('sha256').update(buf).digest('hex');

const formulaPath = join(root, 'homebrew', 'claude-rpc.rb');
let formula = readFileSync(formulaPath, 'utf8');
formula = formula
  .replace(/url ".*"/, `url "${url}"`)
  .replace(/sha256 ".*"/, `sha256 "${sha}"`);
writeFileSync(formulaPath, formula);
console.log(`updated ${formulaPath}\n  url:    ${url}\n  sha256: ${sha}`);
