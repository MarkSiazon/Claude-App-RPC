// Crash-proof stdio. Node's process.stdout / process.stderr / process.stdin
// are LAZY getters that construct the stream on first access — and on Windows
// that construction can THROW (EBADF / EINVAL / ENOTSOCK) when the inherited
// handle is invalid or of a type the probe mishandles: children of
// GUI-subsystem parents (the packaged Electron dashboard), services, some
// terminal emulators. Because src/ui.js probes `process.stdout.isTTY` at
// module load, that throw used to kill the ENTIRE CLI before main() ran —
// the shipped Windows SEA exe died on startup whenever stdio was a pipe in
// such contexts, which is exactly how the dashboard and Claude Code's hook
// runner invoke it.
//
// Import this module FIRST from every entrypoint (bin, hook, daemon). It
// probes each stream once; a stream whose getter throws is replaced with a
// silent sink (stdout/stderr) or an already-ended reader (stdin). Output is
// dropped instead of fatal — on a broken handle it was going nowhere anyway.
// On healthy systems the probe succeeds and NOTHING is replaced.
import { Writable, Readable } from 'node:stream';

function replaceWritable(name, fd) {
  const sink = new Writable({ write(chunk, enc, cb) { cb(); } });
  // The shape console/readline/ui.js expect from a stdio stream:
  sink.isTTY = false;
  sink.columns = 80;
  sink.rows = 24;
  sink.fd = fd;
  Object.defineProperty(process, name, { configurable: true, get: () => sink });
}

function replaceReadable(name) {
  const empty = new Readable({ read() { this.push(null); } });
  empty.isTTY = false;
  empty.fd = 0;
  empty.setRawMode = () => empty;
  Object.defineProperty(process, name, { configurable: true, get: () => empty });
}

try { void process.stdout.isTTY; } catch { replaceWritable('stdout', 1); }
try { void process.stderr.isTTY; } catch { replaceWritable('stderr', 2); }
try { void process.stdin.isTTY; } catch { replaceReadable('stdin'); }
