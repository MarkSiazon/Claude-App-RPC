#!/bin/sh
# claude-rpc installer
#   curl -fsSL https://claude-rpc.com/install | sh
#
# Strategy, in order of preference:
#   1. Node 18+ present  → install the npm package globally (works everywhere).
#   2. Apple Silicon, no Node → download the prebuilt SEA binary from the
#      pinned GitHub release after verifying its published SHA-256 digest.
#   3. Otherwise → tell the user to install Node 18+ (or grab a release).
# Then runs `claude-rpc setup` to wire Claude Code's hooks and start the daemon.
set -eu

REPO="rar-file/claude-rpc"
BIN="claude-rpc"
VERSION="1.4.2"
# Published asset digest for rar-file/claude-rpc v1.4.2 (Apple Silicon SEA).
MACOS_BINARY_SHA256="571d49aed6c1e80f1c2d4e7c7cbbc120f202be4b01350b14f5abb2297b571921"
CLI="$BIN"   # how we invoke it after install (may become an absolute path)

say() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; }

have_node18() {
  command -v node >/dev/null 2>&1 || return 1
  major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [ "${major:-0}" -ge 18 ] 2>/dev/null
}

install_via_npm() {
  command -v npm >/dev/null 2>&1 || {
    err "node is present but npm is missing — install npm (or Node 18+) from https://nodejs.org"
    exit 1
  }
  say "→ installing $BIN globally via npm…"
  npm install -g "$BIN@$VERSION"
  # Prefer the PATH-resolved bin; fall back to npm's global prefix if the
  # current shell hasn't picked it up yet.
  if ! command -v "$BIN" >/dev/null 2>&1; then
    prefix=$(npm prefix -g 2>/dev/null || echo "")
    [ -n "$prefix" ] && [ -x "$prefix/bin/$BIN" ] && CLI="$prefix/bin/$BIN"
  fi
}

install_macos_binary() {
  command -v shasum >/dev/null 2>&1 || {
    err "shasum is required to verify the prebuilt binary; refusing an unverified install"
    exit 1
  }
  url="https://github.com/$REPO/releases/download/v$VERSION/$BIN"
  download_dir=$(mktemp -d)
  download="$download_dir/$BIN"
  say "→ downloading pinned $BIN v$VERSION for checksum verification…"
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL "$url" -o "$download"
  actual_sha256=$(shasum -a 256 "$download" | awk '{print $1}')
  [ "$actual_sha256" = "$MACOS_BINARY_SHA256" ] || {
    err "prebuilt binary checksum mismatch; refusing installation and setup"
    exit 1
  }
  dest_dir="/usr/local/bin"
  [ -w "$dest_dir" ] 2>/dev/null || dest_dir="$HOME/.local/bin"
  mkdir -p "$dest_dir"
  say "→ installing verified binary to $dest_dir/$BIN…"
  install -m 755 "$download" "$dest_dir/$BIN"
  CLI="$dest_dir/$BIN"
  case ":$PATH:" in
    *":$dest_dir:"*) : ;;
    *) say "  note: $dest_dir isn't on your PATH — add it to use \`$BIN\` directly" ;;
  esac
}

main() {
  os=$(uname -s 2>/dev/null || echo unknown)
  arch=$(uname -m 2>/dev/null || echo unknown)
  say "claude-rpc installer  ($os/$arch)"

  if have_node18; then
    install_via_npm
  elif [ "$os" = "Darwin" ] && { [ "$arch" = "arm64" ] || [ "$arch" = "aarch64" ]; }; then
    install_macos_binary
  else
    err "no Node 18+ found, and no prebuilt binary for $os/$arch."
    say "  install Node 18+ (https://nodejs.org) and re-run, or grab a release:"
    say "  https://github.com/$REPO/releases/tag/v$VERSION"
    exit 1
  fi

  say "→ wiring Claude Code hooks + starting the daemon…"
  "$CLI" setup || { err "setup failed — run \`$BIN doctor\` to diagnose"; exit 1; }

  say ""
  say "✓ done. open Claude Code and the card appears within a second."
  say "  trouble? run:  $BIN doctor   (auto-repair with  $BIN doctor --fix)"
}

main "$@"
