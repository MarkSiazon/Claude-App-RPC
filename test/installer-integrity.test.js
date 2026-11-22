import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const installer = readFileSync(new URL('../site/install.sh', import.meta.url), 'utf8');

test('installer pins one release and a published binary digest', () => {
  assert.match(installer, /^VERSION="1\.4\.2"$/m);
  assert.match(installer, /^MACOS_BINARY_SHA256="[a-f0-9]{64}"$/m);
  assert.match(installer, /npm install -g "\$BIN@\$VERSION"/);
  assert.match(installer, /releases\/download\/v\$VERSION\/\$BIN/);
  assert.doesNotMatch(installer, /releases\/latest\/download/);
});

test('prebuilt download is checked before installation or setup', () => {
  const download = installer.indexOf('curl --proto');
  const verify = installer.indexOf('[ "$actual_sha256" = "$MACOS_BINARY_SHA256" ]');
  const install = installer.indexOf('install -m 755');
  const setup = installer.indexOf('"$CLI" setup');
  assert.ok(download > -1 && download < verify && verify < install && install < setup);
  assert.match(installer, /command -v shasum/);
  assert.match(installer, /checksum mismatch; refusing installation and setup/);
  assert.match(installer, /download_dir=\$\(mktemp -d\)/);
  assert.match(installer, /--proto '=https' --proto-redir '=https'/);
});
