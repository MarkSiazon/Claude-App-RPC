# Homebrew formula for claude-rpc.
#
# This file is the source of truth. To publish it as a tap so users can run
#   brew install rar-file/claude-rpc/claude-rpc
# create a repo named `homebrew-claude-rpc` under the rar-file org and drop this
# file in as `Formula/claude-rpc.rb`. After every npm release, regenerate the
# url + sha256 with `node scripts/brew-formula.mjs` and commit it to that tap.
class ClaudeRpc < Formula
  desc "Discord Rich Presence for Claude Code — live model, project, tokens & lifetime stats"
  homepage "https://claude-rpc.com"
  url "https://registry.npmjs.org/claude-rpc/-/claude-rpc-1.1.2.tgz"
  sha256 "5408dac2e1322aba30765db442ba227f8ae6b0dc2834e61dbd60d9ba1d6b11f2"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/claude-rpc --version")
  end
end
