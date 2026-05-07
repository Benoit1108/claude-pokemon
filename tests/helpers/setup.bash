# Shared Bats helpers for CLI smoke tests.
# Each test gets an isolated POKEMON_DIR seeded with the dev-build's defaults
# + a known-state state.json. The script-under-test is sourced via the user's
# normal install path semantics : pokemon-status.sh expects the lib in
# $HOME/.claude/pokemon/lib.sh, so we override $HOME for the test.

# Path to the repo root (the directory that contains lib/ and bin/).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && cd .. && pwd)"

# Seed a fresh POKEMON_DIR + a fake $HOME, so each test is hermetic.
# Sets : $TEST_HOME, $POKEMON_DIR, $POKEMON_STATUS_SH (run with `bash …` to
# exercise the actual deployed-style entry point).
seed_pokemon_dir() {
  local default_lineage="${1:-fire}"
  local default_level="${2:-5}"
  local default_xp="${3:-650000}"

  TEST_HOME="$(mktemp -d)"
  export HOME="$TEST_HOME"
  export POKEMON_DIR="$TEST_HOME/.claude/pokemon"
  mkdir -p "$POKEMON_DIR/locales"

  cp "$REPO_ROOT/lib/data.default.json" "$POKEMON_DIR/data.json"
  cp "$REPO_ROOT/lib/locales/fr.json" "$POKEMON_DIR/locales/fr.json"
  cp "$REPO_ROOT/lib/locales/en.json" "$POKEMON_DIR/locales/en.json"
  cp "$REPO_ROOT/lib/lib.sh" "$POKEMON_DIR/lib.sh"

  # Fresh state.json with predictable lineage/level/xp.
  cat > "$POKEMON_DIR/state.json" <<EOF
{
  "version": 2,
  "lineage": "$default_lineage",
  "is_shiny": false,
  "current_level": $default_level,
  "total_xp": $default_xp,
  "evolution_history": [],
  "evolution_flash_remaining": 0,
  "sessions": {},
  "badges": [],
  "team": [],
  "pc_storage": [],
  "pokedex": {},
  "lifetime_stats": {
    "total_tokens": 0,
    "total_evolutions": 0,
    "total_shinies": 0,
    "max_level": $default_level,
    "lineages_completed": [],
    "total_compagnons": 0,
    "first_shiny_at": null
  },
  "created_at": "2026-05-07T00:00:00Z",
  "last_updated": "2026-05-07T00:00:00Z"
}
EOF

  # Mirror the install layout (~/.claude/pokemon-status.sh) so the script's
  # internal paths just work.
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TEST_HOME/.claude/pokemon-status.sh"
  POKEMON_STATUS_SH="$TEST_HOME/.claude/pokemon-status.sh"
  export POKEMON_STATUS_SH
}

cleanup_pokemon_dir() {
  if [ -n "${TEST_HOME:-}" ] && [ -d "$TEST_HOME" ]; then
    rm -rf "$TEST_HOME"
  fi
}

# Strip ANSI escape codes from $output for cleaner pattern matching.
strip_ansi() {
  printf '%s' "$1" | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'
}
