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

## Target architecture (refonte — in progress, branch `refonte/foundations`)

The 2026-06 refonte unifies the ecosystem around **one TypeScript rules engine**.
Until it lands, the layout below (bash CLI + submodule-linked arena) is the live
reality; the target here is what we migrate toward. See ADR-005…ADR-010.

```
monorepo (pnpm workspaces)
├── packages/shared   — pure, IO-free rules engine = SINGLE SOURCE OF TRUTH
│                        (resolveBattle, applyTick, evolve, xp curves,
│                         capture rate, type chart, content data)
├── packages/cli      — was bash; migrates to TS, imports shared directly
├── packages/worker   — Cloudflare Worker (api), imports shared
└── packages/web      — Nuxt arena, imports shared
```

- **One engine, three clients.** CLI, worker and web all import `packages/shared`
  → identical results everywhere *by construction*. Kills the bash/TS rule
  duplication that was the main feature bottleneck.
- **shared is pure.** No IO, no globals, no `Date.now`/`random` without an
  injected clock/seed. State in → `{ state, events }` out. Fully unit-testable;
  replays deterministic.
- **Identity & sync.** Real auth (GitHub OAuth device-flow + email magic-link),
  opaque KV-backed sessions, and a server-authoritative collection (team[6] + PC)
  shared between CLI and web.

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
**Superseded by ADR-007 (2026-06-10)** — the "marginal gain" premise no longer
holds once synced collection forces rule-unification.

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

### ADR-005 : monorepo (pnpm workspaces)
**2026-06-10.** `shared` is about to become the load-bearing engine consumed by
CLI + worker + web. The current git-submodule link (arena → CLI repo) is a known
friction (init-or-build-fails, manual bumps) and blocks atomic cross-package
changes. A pnpm-workspace monorepo (`packages/{shared,cli,worker,web}`) makes
shared a normal workspace dep — one version, one CI, "change a rule + all its
consumers in a single PR". Arena git history preserved via subtree merge.
Reconsider only if the arena must stay independently releasable.

### ADR-006 : `shared` = single source of truth, pure IO-free engine
**2026-06-10.** All game rules (XP curve, evolution incl. Eevee friendship/form
logic, battle resolution, context multipliers, capture rate, type chart, content
data) move into `packages/shared` as pure functions: state in → `{ state, events }`
out. No IO, no globals, no ambient clock/RNG (inject seed + clock). This is what
makes results identical across CLI/worker/web and keeps everything unit-testable
with deterministic replays. Function-by-function signatures are settled per-phase;
the module boundaries + the purity contract are fixed here. Note: Eevee rules and
context multipliers exist only in bash today — they must be ported in, not lost.

### ADR-007 : CLI migrates bash → TypeScript (supersedes ADR-002)
**2026-06-10.** ADR-002 kept bash because a rewrite was "marginal gain". That
premise no longer holds: the synced collection forces rule-unification, the
bash/TS duplication is now the #1 feature bottleneck, and native Windows is
wanted. Plan: (P1) extract the engine to TS — bash calls it via one Node
entrypoint over stdin/stdout JSON (one spawn/tick; bash keeps flock, atomic
write, ANSI render); (P3) the shell itself becomes TS and bash disappears →
Windows native. Tick latency (node cold-start ~50-100 ms) is a risk to measure in
P1; candidate end-state is a single compiled binary (`bun build --compile`) to
drop the node spawn and the runtime dependency entirely.

### ADR-008 : auth = GitHub OAuth + email magic-link, opaque sessions (not JWT)
**2026-06-10.** Audience is developers → "Sign in with GitHub" (device-flow on the
CLI à la `gh auth login`; redirect on web) is the familiar, low-friction path and
unifies CLI/web identity for free. Email magic-link/OTP covers non-GitHub users.
The worker issues an **opaque** session token (random, sha256 in KV
`session:<hash>` → user_id, TTL + refresh) rather than a JWT: revocable (delete the
key), simpler, no JWT-secret rotation, and it matches the existing hash-in-KV
pattern (`arena_secret`). JWT's stateless edge is worthless at our scale.
Reconsider JWT only if the Discord bot needs KV-free token verification.

### ADR-009 : server-authoritative collection as a KV blob (reaffirms ADR-004)
**2026-06-10.** The synced collection (team[6] + PC + items) lives server-side as
one JSON blob per user (`collection:<user_id>`), read-modify-write. Access is
always "load/mutate MY collection" — no cross-user queries — so KV fits (even 500
mons ≈ 100 KB ≪ 25 MB limit). Consistent with ADR-004. Move to D1 only when we
need cross-collection queries (trade marketplace, "who owns shiny X", global dex
stats) — a Phase 3+ concern; the 5K-DAU trigger from ADR-004 still applies.

### ADR-010 : identity migration by linking, never destroying
**2026-06-10.** Existing users have a local `anon_id` + `stats:`/`arena:` KV
records. On first login the client sends its `anon_id`(s); the worker attaches
them to the new `user_id` (`user:<id>.linked_anon_ids`) and aliases the existing
records — zero data loss, `anon_id` stays a stable alias for badges/trainer URLs.
Anonymous local play stays fully functional (no login → offline, sync/arena off;
login = upgrade), honouring the privacy stance above. Linking is idempotent; an
`anon_id` already linked to another user is rejected (anti-takeover).
