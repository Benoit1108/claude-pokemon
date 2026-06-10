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

COMMAND=$(jq -r '.tool_input.command // empty' 2>/dev/null) || exit 0

if ! echo "$COMMAND" | grep -qE '(^|[[:space:]&|;])git[[:space:]]+push([[:space:]]|$)'; then
  exit 0
fi

if echo "$COMMAND" | grep -qE '(\-\-no-verify|\-\-dry-run)'; then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO_ROOT"

if ! node -e "process.exit(require('./package.json').scripts?.['ci:pre-push'] ? 0 : 1)" 2>/dev/null; then
  exit 0
fi

echo "🔍 [pre-push hook] running CI gates locally before \`git push\`..."
echo

if npm run ci:pre-push; then
  exit 0
fi

jq -n --arg reason "ci:pre-push failed — fix the failing gate(s) above and retry, or bypass with --no-verify" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: $reason
  }
}' >&2
exit 2
