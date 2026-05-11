#!/usr/bin/env bash
# scripts/seed-local.sh — seed a test trainer in the locally-running worker
# so the arena (or curl) can hit it as a real Bearer-authed user without
# debugging in prod.
#
# Workflow (two terminals) :
#   t1$ cd api && npm run dev                # wrangler dev on :8787
#   t2$ cd arena && npm run dev              # nuxt on :3000 (reads .env → localhost:8787)
#   t2$ bash ../claude-pokemon/api/scripts/seed-local.sh
#
# The script :
#   1. Picks a random 8-hex anon_id (fresh trainer every run — no KV state collision)
#   2. POSTs /v1/arena/enable on $BASE (default http://localhost:8787)
#   3. Prints the arena_secret + a one-liner you paste in the browser
#      devtools console to teleport the arena into "paired" mode.
#
# Env vars :
#   BASE     — worker URL (default http://localhost:8787)
#   LEVEL    — starter level (default 50, high enough to unlock most zones)
#   LINEAGE  — fire | water | grass | electric | special (default fire)
#   SHINY    — true | false (default false)

set -euo pipefail

BASE="${BASE:-http://localhost:8787}"
LEVEL="${LEVEL:-50}"
LINEAGE="${LINEAGE:-fire}"
SHINY="${SHINY:-false}"

# 8 hex chars from /dev/urandom — matches ANON_ID_RE
ANON_ID=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')

echo "→ POST $BASE/v1/arena/enable"
echo "  anon_id=$ANON_ID lineage=$LINEAGE level=$LEVEL shiny=$SHINY"
echo

PAYLOAD=$(cat <<EOF
{
  "anon_id": "$ANON_ID",
  "display_name": "LocalTester",
  "lineage": "$LINEAGE",
  "level": $LEVEL,
  "is_shiny": $SHINY,
  "origin": "web"
}
EOF
)

RESP=$(curl -sS -X POST "$BASE/v1/arena/enable" \
  -H 'content-type: application/json' \
  -d "$PAYLOAD")

# Extract arena_secret without jq dependency
SECRET=$(printf '%s' "$RESP" | grep -oE '"arena_secret":"[a-f0-9]+"' | cut -d'"' -f4 || true)

if [[ -z "$SECRET" ]]; then
  echo "✗ enable failed. Worker said :"
  echo "$RESP"
  exit 1
fi

NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

cat <<EOF
✓ Seeded trainer in local worker
  anon_id      : $ANON_ID
  arena_secret : $SECRET
  base URL     : $BASE

Paste this in the browser devtools console on http://localhost:3000 :
─────────────────────────────────────────────────────────────────────
localStorage.setItem('arena-session-v1', JSON.stringify({anon_id:'$ANON_ID',arena_secret:'$SECRET',paired_at:'$NOW'})); location.reload()
─────────────────────────────────────────────────────────────────────

Or hit the worker directly :
  curl -H "authorization: Bearer $SECRET" \\
       -H 'content-type: application/json' \\
       -d '{"anon_id":"$ANON_ID"}' \\
       $BASE/v1/zone/route-1/explore
EOF
