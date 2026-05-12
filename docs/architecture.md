# Architecture — `claude-pokemon`

> Living document. Captures the *why* of the structural choices. Update it
> when you change the layered design, the data flow, or the conventions for
> adding a feature. ADR-style entries at the bottom for irreversible calls.

## Overview

The repo packages two products that share a Cloudflare account but are
otherwise loosely coupled :

```
┌────────────────────────────────────────────────────────────────────┐
│  bin/   — CLI dispatcher (Node) + bash install/update scripts      │
│  lib/   — bash runtime : tick logic, badges, themes, sub-commands  │
│  api/   — Cloudflare Worker (TypeScript) : shared anonymous stats  │
└────────────────────────────────────────────────────────────────────┘
```

The CLI is npm-distributed (`npm install -g claude-pokemon`). The Worker is
deployed via `wrangler deploy` to `claude-pokemon-api.benoit-dev.workers.dev`.

Cross-cutting docs live at the repo root :

- `README.md` — user-facing
- `ROADMAP.md` — phases & decisions log
- `CHANGELOG.md` — semver-style release notes
- `CLAUDE.md` — internal AI-assistant primer
- `CONTRIBUTING.md` — workflow for human contributors

## Repository layout

```
claude-pokemon/
├── bin/
│   ├── claude-pokemon              Node CLI entry (npx target).
│   │                               Detects Windows → friendly WSL guidance.
│   ├── install.sh, update.sh, ...  Bash provisioning scripts.
│   └── ...
├── lib/                            Bash runtime + data sources.
│   ├── lib.sh                      Tick, badges, evolution, archive.
│   ├── statusline.sh               Statusline render (1 output / tick).
│   ├── pokemon-status.sh           /pokemon sub-commands (views).
│   ├── data.default.json           BUILT artifact — do not edit.
│   ├── data/                       Source-of-truth for content :
│   │   ├── config.json             Tunables.
│   │   ├── thresholds.json         XP curve.
│   │   ├── lineages/gen{N}.json    Lineages per generation.
│   │   ├── wild_pool/gen{N}.json   Wild pokédex per generation.
│   │   └── ...                     items, berries, seasons, special.
│   ├── build-data.sh               Concat lib/data/** → data.default.json (deterministic, sorted keys).
│   ├── locales/{fr,en}.json        UI strings i18n.
│   └── extract_animations.py       Optional Python pipeline.
├── api/                            Cloudflare Worker (separate npm root).
│   ├── src/
│   │   ├── index.ts                Router : URL → handler dispatch.
│   │   ├── handlers/*.ts           One file per endpoint.
│   │   ├── lib/{http,kv,svg,validation}.ts   Pure utilities.
│   │   ├── types.ts                Shared contracts (mirror in arena/types).
│   │   └── env.d.ts                Worker bindings.
│   ├── tsconfig.json, eslint.config.mjs, .prettierrc.json
│   └── wrangler.toml
├── skills/pokemon/SKILL.md         Slash command for Claude Code.
├── docs/
│   └── architecture.md             ← this file
├── assets/                         GIFs + screenshots referenced in README.
├── .demo/                          Asciinema scripts to regenerate GIFs.
├── .github/workflows/ci.yml        Layered CI : security (audit ×2) → quality
│                                    (bash shellcheck/json/drift/parity + api lint/
│                                    prettier/typecheck) → test (bats + vitest + dry-run)
│                                    → package (npm pack).
├── shared/                         Workspace package : pure types + battle resolution.
│                                    Consumed by api/ AND by claude-pokemon-arena (via
│                                    a git submodule of this repo).
├── scripts/ci-pre-push.sh          Local CI mirror — runs every gate before `git push`.
├── .claude/
│   ├── settings.json               PreToolUse Bash hook → pre-push.sh.
│   └── hooks/pre-push.sh           Claude Code pre-push gate.
├── .nvmrc                          Node 22.
├── .editorconfig                   Shared editor settings.
├── .prettierrc.json                Root Prettier config (mirror of api/'s).
├── package.json                    npm package (CLI distribution).
├── ROADMAP.md, CHANGELOG.md, README.md, LICENSE
```

## Layered design

### CLI side (bash)

```
bin/claude-pokemon  (Node CLI entry)
        │ delegates to
        ▼
bin/{install|update|...}.sh
        │ source
        ▼
lib/lib.sh           (engine : tick, evolution, badges)
lib/pokemon-status.sh (views : sub-commands rendering)
        │ reads
        ▼
~/.claude/pokemon/state.json      User state (preserved across updates).
~/.claude/pokemon/data.json       Default config (updated via merge).
```

Keep `lib/lib.sh` and `lib/pokemon-status.sh` as the only files where
*business logic* lives. The bin/ scripts are thin orchestrators (file copy,
sprite download, settings.json patch). New sub-commands go in
`pokemon-status.sh` with locale strings in `lib/locales/`.

### Worker side (TypeScript)

Three layers, no dependency between layers' children :

```
src/index.ts                  (Router : URL.pathname + method → handler)
        ↓
src/handlers/*.ts             (One per endpoint. Each is a pure function
                               of `(request|url|pathname, env) => Response`.)
        ↓
src/lib/                      (Pure utilities. No business logic.)
  ├─ http.ts                  Response/CORS helpers.
  ├─ validation.ts            Strict whitelist for submit payload.
  ├─ kv.ts                    KV access primitives (get/put/list/delete).
  └─ svg.ts                   Badge SVG generator (pure function).
        ↓
src/types.ts                  Shared contracts (Lineage, KVRecord, etc.)
                              + runtime constants (regexes, allowed sets).
src/env.d.ts                  Worker bindings (env.STATS).
```

### Why this split

- **Single Responsibility (S in SOLID)** : each handler knows its endpoint,
  each lib knows its concern.
- **Testability** : `lib/validation.ts` and `lib/svg.ts` are pure functions
  (no IO, no Worker globals) → unit-testable with Vitest without
  `miniflare`.
- **Future scale** : adding `/v1/arena/challenge` (Sprint 2.3) = one new
  file under `handlers/`, no router refactor.

## Privacy stance (load-bearing)

**Never log IPs or any PII.**

- `cf-connecting-ip` is *never* read from request headers.
- `[observability] enabled = false` in `wrangler.toml` (Workers Logs off).
- No analytics, no third-party scripts, no cookies.

**anon_id is client-generated.**

- 8-16 hex chars from `/dev/urandom` (CLI side).
- Stored in `data.json.stats_share.anon_id` (locally, gitignored at the user's
  machine level since their state is in `~/.claude/pokemon/`).
- Not derived from any system identifier (email, git config, etc.).

**Strict whitelist on submit.**

- `lib/validation.ts` accepts only known fields with bounded values.
- Lineage IDs and badge IDs validated against `ALLOWED_LINEAGES` / `ALLOWED_BADGES`.
- `display_name` (optional, opt-in) validated against `/^[a-zA-Z0-9_-]{2,24}$/`.

**Right to delete (GDPR).**

- `DELETE /v1/forget?anon_id=<id>` — purges the KV record + cooldown key.
- CLI side : `/pokemon stats-share forget`.

## Data flow

### CLI → Worker (auto-submit)

```
pokemon_tick (every Claude Code statusline tick)
    │
    ├─ if stats_share.enabled && last_submit > 24h
    ▼
build payload (whitelist : lifetime stats + active pokemon + badge IDs)
    │
    ▼
curl -X POST $endpoint/v1/submit (background, --max-time 5, fd 200 closed)
    │
    ▼
Worker validates → KV.put(stats:<anon_id>) + cooldown TTL 24h
```

### Frontend (arena) → Worker

```
Nuxt SSR fetch (from useApi composable)
    │
    ▼
GET /v1/aggregate, GET /v1/leaderboard, GET /v1/trainer/<id>
    │
    ▼
Worker reads KV → JSON response (CORS open, cached client-side)
```

## Conventions

### Adding a Worker endpoint

1. Add types to `src/types.ts` (request body + response shape).
2. Create `src/handlers/<name>.ts` exporting `async function handle<Name>(...)`.
3. Wire in `src/index.ts` router.
4. Add unit tests for validation + handler logic in `tests/handlers/<name>.test.ts` (Vitest).
5. Update `api/README.md` API contract.
6. Deploy : `wrangler deploy --cwd api/`.

### Adding a CLI sub-command

1. Add `view_<name>()` function in `lib/pokemon-status.sh`.
2. Wire in the dispatch `case` at the bottom of the file.
3. Add locale strings to `lib/locales/{fr,en}.json` (parity is checked in CI).
4. Run `npm run build:data` if you touched any `lib/data/**` source.
5. Test via `bash bin/install.sh` + `bash ~/.claude/pokemon-status.sh <name>`.

### Adding a content batch (e.g., Gen 3 starters)

1. Edit only files under `lib/data/`. Never edit `data.default.json` directly.
2. `bash lib/build-data.sh` to regenerate the deployed artifact.
3. Commit both the source edits and the rebuilt `data.default.json`.

### Schema version + propagation

`data.default.json.version` is auto-injected from `package.json.version` at
build time (single source of truth). For game-design constants that must
override user customizations, add them to the force-list in `bin/update.sh` :

```bash
jq -s '.[0] * .[1] * { thresholds: .[0].thresholds, version: .[0].version, wild_pool: .[0].wild_pool }'
```

## Testing strategy

| Component | Tool | Coverage target |
|-----------|------|-----------------|
| Worker lib functions (pure) | Vitest | High (logic-critical) |
| Worker handlers | Vitest + mocked KV | Medium (happy-path + main errors) |
| CLI bash scripts | shellcheck + manual | shellcheck `-S error` zero |
| JSON sources | `jq empty` + locale parity | Both pass in CI |
| Build idempotency | rebuild + git diff | Empty diff |

E2E and visual regression deferred until traffic warrants them.

## Decisions log (ADRs)

### ADR-001 : layered architecture, not DDD
**2026-05-06.** DDD bounded contexts / aggregates are dimensioned for 50K+
LoC codebases with multiple teams. We have ~3K LoC and one developer.
Three layers (router → handlers → lib) capture all the value of layering
without the ceremony.

### ADR-002 : TypeScript on Worker, bash stays on CLI
**2026-05-06.** Migrating the bash CLI to TS would require rewriting six
months of polish (statusline rendering, ANSI sprites, atomic state writes,
flock locking) for marginal gain. The Worker, however, is small and
benefits from strict types (KVRecord, validation contracts, etc.).

### ADR-003 : Prettier as formatting source of truth, ESLint for logic
**2026-05-06.** Prevents the "two formatters, conflicting rules" common
trap. ESLint stylistic plugin is disabled (`eslint.config.stylistic = false`).
ESLint focuses on `no-unused-vars`, `prefer-const`, type-import consistency.
Prettier handles indentation, quotes, line wrapping.

### ADR-004 : KV as single backend, no SQL
**2026-05-06.** Cloudflare KV is eventually consistent and limited to ~25 MB
values, but it's free up to 1 GB storage / 1K writes-per-day. Our access
patterns (key by anon_id, list+sort for leaderboard at <1000 entries) fit
KV constraints comfortably. Migrating to D1 (CF SQL) becomes worth it
beyond ~5K daily active submitters.
