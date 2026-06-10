# Architecture — `claude-pokemon-arena`

> Living document. Captures the _why_ of the directory split, the layered
> design, and the conventions for adding a feature. ADR-style entries at
> the bottom for irreversible calls.

## Overview

`claude-pokemon-arena` is the web frontend for the [`claude-pokemon`](https://github.com/Benoit1108/claude-pokemon)
ecosystem. It consumes the Cloudflare Worker API and renders trainer pages,
the leaderboard, the pokédex, async + live PvP battles, wild zones, the
trail ladder, and a web-native signup with recovery-key sign-in.

```
┌────────────────────────────────────────────────────────┐
│  Nuxt 4 SSR site → Cloudflare Pages (free tier)        │
│  fetches data from claude-pokemon-api.benoit-dev...    │
└────────────────────────────────────────────────────────┘
```

The site is **read + write** today (Phase 2.1 → 2.10 shipped). Writes go
through the same Worker with Bearer auth via the `arena_secret` stored in
`localStorage` (managed by `useArenaSession()`). The auth model is
anonymous-by-default — Sprint 5 introduced the recovery-key flow so a user
who clears localStorage can paste back their `anon_id` + `arena_secret` to
recover.

See [`../CHANGELOG.md`](../CHANGELOG.md) for what's shipped per sprint and
[`../ROADMAP.md`](../ROADMAP.md) for what's next.

## Repository layout

```
claude-pokemon-arena/
├── app/                           Nuxt 4 src dir
│   ├── app.vue                    Root layout : AppHeader + NuxtPage + BottomNav.
│   ├── pages/                     File-based routing
│   │   ├── index.vue              Hero + leaderboard + global stats + 4 tiles
│   │   ├── arena.vue              Async PvP pool
│   │   ├── battle/[id].vue        Battle replay (animated turn-by-turn)
│   │   ├── ladder/[bot_id].vue    PvE trail bot duel (auto + manual mode)
│   │   ├── live/[id].vue          Live PvP (Durable Object-backed)
│   │   ├── login.vue              Recovery-key sign-in (Sprint 5)
│   │   ├── pair.vue               CLI ↔ web pairing redeem
│   │   ├── pokedex/[id].vue       Wild Pokémon detail
│   │   ├── profile.vue            Editable trainer profile
│   │   ├── signup.vue             Web-native trainer creation
│   │   ├── trainer/[anonId].vue   Public trainer card
│   │   └── zones/[id].vue         Wild zone explore + fight + flee
│   ├── components/                pathPrefix: false → flat naming
│   │   ├── arena/                 11 battle UI parts (Stage, Log, AttackPicker, ...)
│   │   ├── ladder/                BotTrainerTile
│   │   ├── leaderboard/           LeaderboardTable
│   │   ├── pokedex/               PokedexCard, PokedexFilters
│   │   ├── stats/                 GlobalStatsCards, LineageDistribution
│   │   ├── trainer/               Hero, Badges, StatsCards
│   │   └── ui/                    AppHeader, BottomNav, UserMenu, ColorModeToggle, ...
│   ├── composables/               useApi, useArenaSession, useBattlePlayer,
│   │                              useBattleJuice, useLadderProgress, useLiveBattle,
│   │                              useManualBattle, useSoundEffects, useTrainerProfile
│   ├── data/                      bot-trainers, moves, wild-pool-gen{1,2}.json
│   ├── services/api.ts            Single ApiClient class
│   ├── types/                     api.ts (Worker contracts), pokedex.ts
│   ├── utils/                     battle-engine, manual-battle, sprites, format,
│   │                              lineage, badges, pokedex (filters)
│   └── assets/css/global.css      Body bg, fonts baseline, reveal keyframes
├── i18n/locales/{fr,en}.json      ~543 keys per locale, parity-enforced in CI
├── tests/
│   ├── setup.ts                   Vitest setup — installs vue-i18n plugin globally
│   ├── components/                Mount-based (LeaderboardTable, PokedexCard, ...)
│   └── unit/                      composables/, services/, utils/
├── scripts/
│   ├── fetch-github-stars.mjs     predev/prebuild hook
│   ├── check-i18n-parity.mjs      FR/EN parity gate
│   └── ci-pre-push.sh             Full local CI suite (mirrors GitHub Actions)
├── .claude/
│   ├── settings.json              PreToolUse hook → pre-push.sh
│   └── hooks/pre-push.sh          Runs ci-pre-push.sh on `git push`
├── docs/
│   ├── architecture.md            ← this file
│   └── mockups/                   Design pass mockups (Sprint 5)
├── vendor/claude-pokemon/         Git submodule — source of claude-pokemon-shared
├── nuxt.config.ts                 Modules (i18n, color-mode, eslint, unocss),
│                                  runtimeConfig, fonts head links
├── uno.config.ts                  Design tokens + shortcuts (card, pill, btn-*, surface-*)
├── vitest.config.ts               setupFiles: ['./tests/setup.ts']
├── knip.json                      Dead-code config (Nuxt-aware)
├── .nvmrc                         Node 22
├── .editorconfig                  Shared editor settings
├── .prettierrc.json               Prettier config
└── package.json
```

## Layered design

```
Pages          (file-based routes, thin : data fetch + compose components)
    ↓
Components     (presentation, props-driven, no direct API calls)
    ↓
Composables    (Vue-specific logic : useApi, useColorMode wrappers)
    ↓
Services       (pure JS classes : ApiClient — no Vue, no SSR concerns)
    ↓
Utils + Types  (pure functions and TypeScript contracts)
```

### Why this split

- **Single Responsibility (S in SOLID)** : pages compose, components present,
  services fetch, utils transform. No cross-mixing.
- **Dependency Inversion (D in SOLID)** : pages don't `fetch` directly ;
  they call `useApi()` which depends on a service abstraction. The service
  takes a `fetchImpl` parameter — trivial to mock in tests.
- **Testability** : utils are pure → fast Vitest unit tests. Services take
  an injectable fetcher → mockable. Components use Testing Library Vue +
  `@nuxt/test-utils`.

## Theming foundation

The site supports **dark / light / system** modes via `@nuxtjs/color-mode`
applied as a class (`.dark` / `.light`) on `<html>`.

UnoCSS uses `dark: 'class'` strategy, so `dark:bg-...` variants only fire
when the class is present.

**Semantic shortcuts** (in `uno.config.ts`) abstract surface/text colors :

```ts
shortcuts: {
  'surface-bg':       'bg-zinc-50 dark:bg-[#0d1117]',
  'surface-card':     'bg-white dark:bg-[#161b22]',
  'text-primary':     'text-zinc-900 dark:text-zinc-100',
  'text-accent':      'text-gold-soft dark:text-gold',
  // ...
}
```

**Convention** : never hard-code Tailwind colors (`bg-zinc-900`,
`text-white`) in components. Use `surface-*` / `text-*` shortcuts. New
themes → add them once in shortcuts, every component adapts.

Lineage colors (fire = orange, water = blue, etc.) are Pokémon identity —
they don't adapt to theme.

## Conventions

### Adding a page

1. Create `app/pages/<name>.vue`.
2. Use `useAsyncData` for SSR-friendly fetches.
3. Compose presentational components from `app/components/`. Don't put
   markup logic inline.
4. Type the data : import contracts from `~/types/api`.
5. (Optional) add E2E test in `tests/e2e/<name>.spec.ts` (Playwright).

### Adding a component

1. Decide the domain : `ui/` (generic), `leaderboard/`, `stats/`, `trainer/`.
2. Create `<DomainName>.vue` with `<script setup lang="ts">`.
3. Use `defineProps<{...}>()` with TypeScript types — don't use `props` runtime declaration.
4. Use semantic shortcuts (`surface-card`, `text-primary`, ...) for styling.
5. Add unit test in `tests/components/<Name>.test.ts` if logic-heavy.

### Adding a composable

1. Create `app/composables/use<Name>.ts`.
2. Auto-imported by Nuxt — no need to import in components.
3. If wrapping an external dep, prefer to inject it via a service (see
   `useApi` calling `ApiClient`).

### Adding API integration

1. Add types to `app/types/api.ts` (mirror `api/src/types.ts` worker-side).
2. Add method to `ApiClient` in `app/services/api.ts`.
3. Use `useApi().<method>()` from a page or composable.
4. Add a test in `tests/unit/services/api.test.ts` with mocked `fetchImpl`.

## CI / Dev workflow

```bash
# Local development
npm run dev              # Nuxt dev server with HMR
npm run lint             # ESLint logic + Vue rules
npm run lint:fix         # auto-fix
npm run typecheck        # vue-tsc strict mode
npm run format           # Prettier (formatting source of truth)
npm run format:check     # CI-style check
npm run build            # Production build (NITRO_PRESET=cloudflare-pages for CF)
```

GitHub Actions runs `lint + typecheck + format:check + build` on every
push to `main` and on every PR. CF Pages auto-deploys on push to `main`.

## Decisions log (ADRs)

### ADR-001 : Nuxt 4 over alternatives

**2026-05-06.** Considered SvelteKit (lighter), Astro (content-first),
Next.js (React ecosystem). Chose Nuxt 4 for : (a) Vue's gentler learning
curve for solo dev, (b) auto-imports reduce ceremony at this scale,
(c) seamless CF Pages integration via Nitro `cloudflare-pages` preset,
(d) file-based routing is enough for our 4-5 pages.

### ADR-002 : UnoCSS over Tailwind

**2026-05-06.** Tailwind v4 is great but heavier at build. UnoCSS
`preset-wind4` gives the same DX (Tailwind syntax) with smaller bundle
and faster dev rebuilds. Theme/shortcut customization is more flexible
(programmatic config in `uno.config.ts`).

### ADR-003 : Class-based dark mode (not media query only)

**2026-05-06.** `prefers-color-scheme` respects OS preference but doesn't
let users override per-tab. Class-based mode (via `@nuxtjs/color-mode`)
gives users explicit control via the toggle, with `system` as the default
that honors OS prefs. Best of both worlds.

### ADR-004 : SSR with hydration, not pure SSG

**2026-05-06.** SSG would require rebuild on every leaderboard change.
SSR fetches the API on each request (CF Pages edge-runs the Nitro server),
giving fresh data without rebuilds. Trade-off : CF Pages SSR cold-start
(~50ms) vs static-cache simplicity. We pay the cold-start to keep data live.

### ADR-005 : Tests deferred until next sprint

**2026-05-06.** Étape 1 ships ESLint + Prettier + structure now. Vitest

- test fixtures come in Étape 2 (next session). The architecture is
  designed test-friendly (pure utils, injectable services) so retrofit is
  cheap.

### ADR-006 : No `server/` directory — frontend-only Nuxt

**2026-05-08 (Sprint 2.13).** Considered adding `server/api/*` Nitro routes
for OG-card SSR or webhook handlers. Decided against : the Worker
(`claude-pokemon/api`) is the single source of truth for state ; two
backends would invite drift. The Nuxt app is intentionally a thin client
that talks to the Worker over HTTPS. `runtimeConfig.public.apiBase`
controls the endpoint. CORS lives in the Worker, not in a Nuxt proxy.

**When to revisit** : OG image / share-card SSR (heavy canvas), Discord /
GitHub webhook handlers (need server-side secrets), or cache layer for
`/aggregate` if Worker latency becomes an issue. Add `server/` then,
documenting **why** in this file.

### ADR-007 : Mirror code over npm package (until Sprint 3)

**2026-05-08 (Sprint 2.13).** Three files are hand-maintained mirrors of
the Worker / CLI : `app/utils/battle-engine.ts`,
`app/data/moves.ts`, and the various lineage / badge / pokedex catalogs.
Identified by code review as a drift risk. Decided to defer the npm package
extraction to Sprint 3 post-Sprint-2 push, and add **contractual parity
tests** as the immediate guard :

- `tests/unit/utils/battle-engine-parity.test.ts` (this repo)
- `api/tests/lib/battle-parity.test.ts` (Worker repo)

Both pin the same fixed-vector `resolveBattle` outputs. A unilateral
formula change fails CI on at least one side, forcing a sync update.

### ADR-008 : `arena_secret` in `localStorage` — accepted XSS surface

**2026-05-08 (Sprint 2.13).** After `/pair` redemption, the
`arena_secret` is stored in `localStorage` under `arena-session-v1`. This
exposes it to any script running on this origin (XSS).

Mitigations :

1. No `v-html` of untrusted content anywhere in the codebase.
2. Single npm runtime dependency that touches the DOM (`canvas-confetti`,
   vendored).
3. Recommend a strict CSP at deploy (TODO: add via Cloudflare Pages headers).
4. One-click rotation via `/pokemon arena regenerate` on the CLI.

Acceptable for the current threat surface (no money, no PII, no auth tokens
of value beyond the trainer's own data). Re-evaluate if the model shifts
(e.g. monetization, real PII).

The alternative — `HttpOnly` cookies set by the Worker — would require
CORS credentials, a Worker session endpoint, and breaks the "pair via
copy-paste code" UX. Trade-off accepted.

### ADR-009 : KV last-write-wins concurrency model

**2026-05-08 (Sprint 2.13).** Cloudflare KV has no compare-and-swap. Two
read-modify-write paths needed mitigation :

- **Live commit** (`/v1/arena/live/<id>/commit`) : two simultaneous commits
  could overwrite each other. Mitigated with a bounded retry-after-write
  loop on the Worker side. `resolveLiveTurn` is deterministic so duplicate
  parallel resolves produce identical content. Up to 3 retries, then 503.
- **Pair redeem** (`/v1/arena/pair/redeem`) : two concurrent redeems could
  both return the secret. Mitigated with a claim-and-verify dance using a
  `consumed_by` randomUUID token. The loser observes a different token on
  re-read and 404s.

Both mitigations live in the Worker repo (`api/src/handlers/arena/`). The
web side just calls the endpoints — no client-side concurrency logic.

### ADR-010 : Shared code via git submodule, not npm publish (supersedes ADR-007)

**2026-05-11 (Sprint 3).** ADR-007 planned to extract the duplicated
battle engine / moves / stages / types into an npm package
`claude-pokemon-shared` and consume it from both the Worker and the web.

We **pivoted to a git submodule** instead :

1. The shared package lives in
   [`claude-pokemon/shared/`](https://github.com/Benoit1108/claude-pokemon/tree/main/shared).
2. The Worker (same repo) consumes it via [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces).
3. **This repo** clones `claude-pokemon` as a submodule under
   `vendor/claude-pokemon/` and references it via a `file:` dependency :
   ```json
   "claude-pokemon-shared": "file:./vendor/claude-pokemon/shared"
   ```
4. Cloudflare Pages **must have "Include submodules" enabled** in the
   build settings (Pages → claude-pokemon-arena → Settings → Build →
   Submodules : on). Without it, the build fails because vendor/ is empty.

**Rationale for the pivot** :

- The shared package is purely internal. No external consumer would
  `npm install claude-pokemon-shared`. Publishing would take an npm name
  slot forever for marketing value the project doesn't need.
- Per-change friction with npm publish (bump version, publish, bump
  consumer dependency, install, push) is non-trivial — ~3 min vs. ~30 s
  with the submodule (`git submodule update --remote && commit`).
- The submodule pins to a specific commit SHA, so this repo's build is
  stable until we explicitly bump — that's the semver guarantee, without
  the registry overhead.

**Workflow to bump shared code** :

```bash
# 1. Edit + commit in the claude-pokemon repo
cd ../claude-pokemon/shared
# edit src/...
npm run build  # regenerate dist/
git commit -am "feat(shared): X"
git push

# 2. Bump the submodule pointer in this repo
cd ../../claude-pokemon-arena
git submodule update --remote vendor/claude-pokemon
git commit -am "chore: bump shared to <SHA>"
git push  # Cloudflare Pages auto-deploys
```

**Trade-off** : `shared/dist/` is committed (vs. built at install time)
because submodules don't run install scripts. Author discipline is
required : whenever you edit `shared/src/`, run `npm run build` and
commit the regenerated `dist/` in the same change.

### ADR-011 : Unified identity model — Worker owns trainers, CLI + web are equal clients

**2026-05-11 (Sprint 3.6 + 4).** The web was launched as a CLI companion :
its only identity model was "pair with an existing CLI install". That left
a gap : users without Claude Code (the majority of potential players)
hit the site, see a leaderboard + a ladder, and find nothing they can
actually own. The ladder defaulted to a hardcoded Salamèche Lv.(bot-3) —
hostile to anyone discovering the project.

We're flipping the model. **The Worker is the single source of truth for
trainer identity**. Both CLI and web are equal first-class clients.

#### Identity creation

- **From CLI** (existing) : `/pokemon arena enable --confirm` generates
  `anon_id` locally and calls `POST /v1/arena/enable`. The Worker stores
  the trainer record with `origin: 'cli'`.
- **From web** (new in Sprint 4) : `/signup` page lets the visitor pick a
  starter and a display name, calls the same `POST /v1/arena/enable`
  (with `origin: 'web'`). The `arena_secret` lands in `localStorage`
  via `useArenaSession`.

Both flows yield the **same shape of trainer record**. The `origin` field
is informational only — there's no functional gating based on it (a CLI
trainer can do everything a web trainer can, and vice versa).

#### Pairing — bidirectional

The existing `POST /v1/arena/pair/{init,redeem}` endpoints work both ways :

- **CLI → web** : `/pokemon arena pair` issues a code, web `/pair?code=XXX`
  redeems it and stores the secret.
- **Web → CLI** (new in Sprint 4.3) : web "Pair my CLI" button issues a
  code via the same endpoint, CLI command `/pokemon arena link <code>`
  redeems it. The CLI also fetches `GET /v1/trainer/<anon_id>` and writes
  the trainer state into `~/.claude/pokemon/state.json` so the user's web
  progression is recovered locally.

On successful link, the Worker bumps `origin` to `'linked'`.

#### Progression model — separate XP sources, one trainer

| XP source                      | CLI      | Web                     |
| ------------------------------ | -------- | ----------------------- |
| Tokens consumed in Claude Code | ✅       | ❌ (no IDE integration) |
| Wild zone encounters           | ❌       | ✅ (Sprint 4.5+)        |
| Async PvP win                  | small    | small                   |
| Live PvP win                   | small    | small                   |
| Ladder bots PvE                | n/a      | ✅ (Sprint 4.6+)        |
| Daily login bonus              | optional | ✅                      |
| Pokémon quizzes                | ✅       | port from CLI           |

A `linked` account accumulates both sources naturally — no double-counting
because each source has its own server-side validation + cooldown.

#### Anti-cheat via wild zones (Sprint 4.5)

Web XP is gated by a **zones model** inspired by Pokéchill : the world is
split into level-bracketed zones (Route 1 Lv.1-10, Forêt de Jade Lv.11-20,
…, Mont Argent Lv.71-100). Each zone has a wild pool (subset of the
existing 251-species pokédex) and a fixed encounter cooldown (20 s per
trainer per zone).

Anti-cheat is built in :

- Cooldown caps the encounter rate (~3 / minute max, in practice ~5-15 / h)
- Level bracket rules : trainer below `zone.min - 10` is locked out ;
  trainer above `zone.max + 10` gets XP × 0.1 (drastically reduced).
- Battles resolve server-side (`POST /v1/zone/<id>/fight`) — the client
  can't fabricate wins.

No "tokens passively earn XP" loophole on web. Earning XP requires
visible gameplay actions.

#### KV vs a SQL DB (Cloudflare D1)

The current persistence is Cloudflare KV. KV is sufficient for :
trainer records, battle persistence, pair codes, live sessions, zone
cooldowns. The known limitation : leaderboards iterate all keys in
Worker memory, breaks beyond ~1000 trainers.

Migration to **Cloudflare D1 (serverless SQLite)** is a 1-day job if we
hit the scale, but it's not blocking. We start on KV.

#### `server/` Nuxt directory — still not needed

ADR-006 holds : no `server/` Nuxt directory. All new endpoints
(`POST /v1/web/signup`, `POST /v1/zone/<id>/explore`, etc.) live in the
Worker (`api/src/handlers/`). The Nuxt app stays a thin client.
