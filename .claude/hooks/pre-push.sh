#!/usr/bin/env bash
# PreToolUse hook (Claude Code) — fires before every Bash tool call and gates
# any `git push` against the same CI checks that GitHub Actions runs.
# Wired up in .claude/settings.json with matcher "Bash".
#
# Stdin receives the tool_use payload as JSON ; we extract `tool_input.command`,
# decide whether to gate, run npm run ci:pre-push, and on failure return a
# `permissionDecision: deny` payload on stderr with exit code 2 — Claude Code
# blocks the call and surfaces the script output back to Claude.
#
# Bypass for emergencies : append `--no-verify` or `--dry-run` to the push,
# OR run `git push` from the terminal directly (the hook only fires for the
# Bash tool, not for user-typed `!` commands).

set -u

# Parse tool_input.command. If jq fails (malformed payload), allow through.
COMMAND=$(jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0

# Only gate commands that contain `git push` (anywhere in a chain like
# `git add -A && git commit -m "..." && git push origin main`).
if ! echo "$COMMAND" | grep -qE '(^|[[:space:]&|;])git[[:space:]]+push([[:space:]]|$)'; then
  exit 0
fi

# Bypass when the user explicitly asked for it.
if echo "$COMMAND" | grep -qE '(\-\-no-verify|\-\-dry-run)'; then
  exit 0
fi

# Find the repo root from wherever Claude happened to be. If we're not even
# inside a git repo, let the push fail on its own (don't shadow git's error).
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO_ROOT"

# Only run if the repo actually has a ci:pre-push script wired up.
# (Some sub-repos may not — we never want to block a push that the project
# itself didn't opt into.)
if ! node -e "process.exit(require('./package.json').scripts?.['ci:pre-push'] ? 0 : 1)" 2>/dev/null; then
  exit 0
fi

echo "🔍 [pre-push hook] running CI gates locally before \`git push\`..."
echo

if npm run ci:pre-push; then
  exit 0
fi

# Failure path : tell Claude Code to block the push and explain why.
jq -n --arg reason "ci:pre-push failed — fix the failing gate(s) above and retry, or bypass with --no-verify" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}' >&2
exit 2
