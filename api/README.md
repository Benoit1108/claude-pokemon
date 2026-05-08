# claude-pokemon-api

Cloudflare Worker exposing the shared anonymous stats endpoint for `claude-pokemon`.

## What lives here

`src/index.js` — the Worker code (single file, ~250 LoC, no dependencies).
`wrangler.toml` — deployment config.

This folder is **not** shipped via `npm pack` (root `package.json` `files` whitelist excludes it).

## Privacy stance

- We do **not** log or store IPs. `cf-connecting-ip` is never read from request headers.
- We do **not** enable Workers Logs (set in CF dashboard + via `[observability] enabled = false` in wrangler.toml).
- `anon_id` is a client-generated 8-16 hex char string, never linked to any identity.
- Submit payload is strict-whitelist validated — extra fields are rejected.
- Right-to-delete via `DELETE /v1/forget?anon_id=<id>` (immediate KV purge).

## API contract (v1)

All responses are JSON. CORS is open (`access-control-allow-origin: *`).

### `GET /v1/health`
Returns `{ "status": "ok", "schema_version": 1 }`.

### `POST /v1/submit`
Submit current player stats. Rate-limited 24h per `anon_id`. Idempotent overwrite — last submit wins.

**Body** (strict whitelist) :
```jsonc
{
  "anon_id": "7f3a2c1b",                  // 8-16 hex chars
  "schema_version": 1,
  "client_version": "1.0.0-beta.4",       // package.json version
  "submitted_at": "2026-05-05T14:00:00Z",
  "stats": {
    "lifetime": {
      "total_tokens": 2588000,
      "total_evolutions": 3,
      "total_shinies": 1,
      "max_level": 30,
      "total_compagnons": 2,
      "lineages_completed": ["fire", "eevee"],
      "games_won": 1,
      "games_played": 2
    },
    "active": {
      "lineage": "fire",                  // or null if no active companion
      "current_level": 0,
      "is_shiny": false
    },
    "badges": ["hatch", "first_evolution", "first_shiny", "master_pokedex"],
    "pokedex_seen_count": 5               // count only, not which Pokémon
  }
}
```

**Responses** :
- `200 { "ok": true, "next_submit_in_s": 86400 }` — accepted
- `400 { "error": "validation", "details": [...] }` — schema/values invalid
- `429 { "error": "rate_limited", "cooldown_remaining_s": <int> }` — 24h cooldown active
- `500 { "error": "internal", ... }` — bug in worker

### `GET /v1/leaderboard?metric=<X>&limit=<N>`
Top N players by metric.

**Query params** :
- `metric` : one of `total_tokens` (default), `total_evolutions`, `total_shinies`, `max_level`, `lineages_completed_count`, `badges_count`, `games_won`, `pokedex_seen_count`
- `limit` : 1-100, default 10

**Response** :
```jsonc
{
  "metric": "total_tokens",
  "total_players": 42,
  "top": [
    { "anon_id": "7f3a2c1b", "value": 12500000, "lineage": "fire",
      "level": 100, "is_shiny": true, "submitted_at": "2026-05-05T..." },
    ...
  ]
}
```

### `GET /v1/aggregate`
Global aggregate stats (all submitted players).

**Response** :
```jsonc
{
  "total_players": 42,
  "total_tokens_combined": 125000000,
  "total_shinies_observed": 7,
  "shiny_rate_observed": 0.00833,                 // shinies / compagnons
  "active_lineage_distribution": { "fire": 12, "water": 8, ... }
}
```

### `DELETE /v1/forget?anon_id=<id>`
Purge a player's record (RGPD right-to-delete).

## Deployment

```bash
cd api/
wrangler kv namespace create STATS    # one-time, get the id
# paste id into wrangler.toml's [[kv_namespaces]] block
wrangler deploy
```

Worker URL : `https://claude-pokemon-api.<your-subdomain>.workers.dev`.

## Free tier limits (CF Workers)

- 100K requests/day
- 1K KV writes/day → **bottleneck**, ~1000 daily submitters max
- 100K KV reads/day
- 1 GB KV storage

Beyond ~1K submitters/day : either reduce submit frequency to weekly, or
upgrade to Workers Paid (5$/month → 50M req, 100M KV ops).

## Schema migrations

Bump `SCHEMA_VERSION` in `src/index.js` and accept previous versions during
a deprecation window. The CLI passes its `schema_version` in every submit.

## Threat model — known trade-offs (Sprint 2.13)

### `arena_secret` plaintext in KV during the pair window

`POST /v1/arena/pair/init` stores the **plaintext** `arena_secret` in KV
under `pair:<code>` for at most 5 minutes (`PAIR_CODE_TTL_S`). The browser
needs the plaintext to authenticate Bearer requests, so we can't store a
hash here.

**Bounded by** :
- 5-min TTL (auto-expires)
- One-shot redeem (consumed on first successful `/redeem`)
- Explicit user opt-in (must run `/pokemon arena pair`)

**Residual risk** : if Cloudflare KV logs or replicates entries with retention
beyond TTL, the secret could sit at rest. Acceptable given (a) the secret
only authorizes arena actions on this trainer's own snapshot, no PII, (b)
trivial rotation via `/pokemon arena regenerate`.

### KV concurrency — live commits + pair redeem

KV has no compare-and-swap. Two paths needed mitigation :

- **`/v1/arena/live/<id>/commit`** : naive read-modify-write under
  simultaneous commits from both sides could lose one player's pending
  action and hang the battle. Mitigated with a bounded retry-after-write
  loop (3 attempts → 503). `resolveLiveTurn` is deterministic so a duplicate
  parallel resolve produces identical content.
- **`/v1/arena/pair/redeem`** : naive `get → delete` let two concurrent
  redeemers both return the secret. Mitigated with a claim-and-verify dance
  using a `consumed_by` randomUUID token. Loser 404s on re-read.

Both are documented in their handler files.

### Information disclosure — anon_id enumeration

Code review (Q1) flagged a `403 vs 404` distinction in `live-invite.ts` and
`challenge.ts` that let an authed challenger probe arbitrary anon_ids and
learn enabled-status. Fixed : both endpoints now return
`404 defender_not_found` whether the trainer doesn't exist or just isn't
arena-enabled.

### Privacy guarantees (unchanged from Sprint 1)

- No IP logging server-side (`cf-connecting-ip` never read).
- `[observability]` disabled in `wrangler.toml` (Workers Logs off).
- `anon_id` is client-generated 8–16 hex, no link to identity.
- Strict whitelist on submit payload — extra fields silently dropped.
