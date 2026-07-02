// afterPack hook: ad-hoc sign the macOS app bundle (free — no Apple account).
//
// With `identity: null`, electron-builder skips signing entirely. That shipped
// a bundle with NO _CodeSignature anywhere and a stale linker stub in the main
// binary — and Apple Silicon refuses to launch such apps at all: users got
// "'Claude RPC' is damaged and can't be opened. You should move it to the
// Trash." with no Open Anyway escape hatch. An ad-hoc signature (`codesign -s -`)
// is the strongest thing available without a paid Developer ID: the app
// launches, and Gatekeeper's warning downgrades to "unverified developer" with
// a working System Settings → Privacy & Security → Open Anyway path.
'use strict';
const { execSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
  console.log(`[adhoc-sign] signing ${appPath}`);
  // --deep is fine for ad-hoc: helpers/frameworks get re-signed bottom-up
  // enough for Gatekeeper to consider the bundle intact.
  run(`codesign --force --deep --sign - "${appPath}"`);
  // Fail the BUILD, not the user, if the seal doesn't verify.
  run(`codesign --verify --deep --strict --verbose=2 "${appPath}"`);
  console.log('[adhoc-sign] bundle verified');
};
