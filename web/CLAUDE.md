# CLAUDE.md — claude-pokemon-arena

Instructions for Claude Code working on the **web arena** companion site. Auto-loaded every session.

## What this project is

Public web arena for `claude-pokemon` (CLI compagnon Pokémon, dans le repo voisin `~/repositories/perso/claude-pokemon/`). Sépare visuellement et techniquement du CLI : `claude-pokemon-arena` n'est jamais publié sur npm, deployé via Cloudflare Pages.

- **Prod URL** : https://claude-pokemon-arena.pages.dev/
- **GitHub** : https://github.com/Benoit1108/claude-pokemon-arena
- **Backend** : le Worker `claude-pokemon-api` (dans `vendor/claude-pokemon/api/`, submodule git) — appelé via `useApi()` / `services/api.ts`
- **Stack** : Nuxt 4 + Vue 3 + UnoCSS preset-wind4 + @nuxtjs/i18n + @nuxtjs/color-mode + TypeScript strict + Vitest + happy-dom

## Architecture

```
claude-pokemon-arena/
├── app/                              Nuxt 4 src dir
│   ├── components/                   SFC components (pathPrefix: false → flat naming)
│   │   ├── arena/                    Battle UI (BattleStage, BattleLog, AttackPicker, ...)
│   │   ├── ladder/                   BotTrainerTile
│   │   ├── leaderboard/              LeaderboardTable
│   │   ├── pokedex/                  PokedexCard, PokedexFilters
│   │   ├── stats/                    GlobalStatsCards, LineageDistribution
│   │   ├── trainer/                  TrainerHero, TrainerBadges, TrainerStatsCards
│   │   └── ui/                       AppHeader, BottomNav, UserMenu, ColorModeToggle,
│   │                                  PokeballIcon, PokemonSprite, SectionIcon
│   ├── composables/                  use* — useApi, useArenaSession, useBattlePlayer,
│   │                                  useBattleJuice, useLadderProgress, useLiveBattle,
│   │                                  useManualBattle, useSoundEffects, useTrainerProfile
│   ├── data/                         Static data — bot-trainers, moves, wild-pool-gen{1,2}.json
│   ├── pages/                        File-based routing
│   │   ├── index.vue                 Home (leaderboard + stats + 4 tiles + hero)
│   │   ├── arena.vue                 Async PvP pool
│   │   ├── battle/[id].vue           Replay async battle
│   │   ├── ladder/[bot_id].vue       PvE trail bot duel (manual + auto mode)
│   │   ├── live/[id].vue             Live PvP (Durable Object-backed)
│   │   ├── login.vue                 Recovery-key sign-in (Sprint 5)
│   │   ├── pair.vue                  CLI ↔ web pairing redeem
│   │   ├── pokedex/[id].vue          Wild Pokémon detail
│   │   ├── profile.vue               Editable trainer profile
│   │   ├── signup.vue                Web-native trainer creation
│   │   ├── trainer/[anonId].vue      Public trainer card
│   │   └── zones/[id].vue            Wild zone explore + fight + flee
│   ├── services/api.ts               Single ApiClient class wrapping the Worker
│   ├── types/                        api.ts, pokedex.ts
│   ├── utils/                        battle-engine, manual-battle, sprites, format, lineage,
│   │                                  badges, pokedex (filters)
│   ├── assets/css/global.css         Body bg, fonts baseline, reveal keyframes — minimal,
│   │                                  tokens live in uno.config.ts
│   └── app.vue                       Root layout, AppHeader + NuxtPage + BottomNav
├── i18n/locales/{fr,en}.json         ~250 keys each, structurally identical
├── tests/
│   ├── setup.ts                      Global vitest setup — installs vue-i18n plugin
│   ├── components/                   Vue Test Utils mount-based tests
│   └── unit/                         Pure function tests (composables, utils, services)
├── scripts/
│   ├── fetch-github-stars.mjs        Prebuild hook → writes .env.local
│   └── ci-pre-push.sh                Local CI gates (lint, prettier, typecheck, vitest, build)
├── .claude/
│   ├── settings.json                 PreToolUse Bash hook → pre-push.sh
│   └── hooks/pre-push.sh             Runs ci-pre-push.sh before any `git push`
├── vendor/claude-pokemon/            Git submodule (shared package + worker source)
├── nuxt.config.ts                    Modules, i18n config, runtimeConfig, fonts
├── uno.config.ts                     Design tokens — theme, shortcuts, custom rules
└── vitest.config.ts                  setupFiles: ['./tests/setup.ts']
```

## Stack details (sticky)

- **Nuxt** : 4.x, SSR by default, components autoload `pathPrefix: false` (use `<UserMenu />` not `<UiUserMenu />`)
- **UnoCSS** : preset-wind4 (NOT preset-wind3). API names are Tailwind v4 style :
  - `theme.font` (pas `theme.fontFamily`)
  - `theme.radius` (pas `theme.borderRadius`)
  - `theme.ease` (pas `theme.transitionTimingFunction`)
- **i18n** : `@nuxtjs/i18n` v10+, `no_prefix` strategy, locale via cookie `arena-i18n`, default `fr`. Locales declared in `nuxt.config.ts:i18n.locales` with `file: 'xx.json'` — module auto-loads them (no `lazy: true`, no `bundle.*` flags — they don't exist in the v10 type).
- **Color mode** : `@nuxtjs/color-mode` light/dark/system + custom 'retro' (GameBoy DMG palette) managed via class on `<html>` in `app.vue`
- **Auth** : anon_id (8-16 hex) + arena_secret (32-64 hex) in `localStorage['arena-session-v1']` via `useArenaSession()`. Sprint 5 introduced the recovery-key flow — signup shows the secret once in a blocking modal, `/login` accepts pasted credentials, `GET /v1/arena/whoami` validates them.
- **Shared package** : `claude-pokemon-shared` is consumed via `file:./vendor/claude-pokemon/shared` workspace dep. The submodule MUST be checked out (`git submodule update --init`) or build/tests fail with "Failed to resolve import 'claude-pokemon-shared'".

## Conventions

- **Commits** : Conventional Commits. Scope `arena` for web changes, `api` for worker (when touching `vendor/`). No `Co-Authored-By`.
- **PR workflow** : feature branches off `main`, squash on merge. Don't push direct to `main` (branch-protected). One commit per merged PR.
- **CHANGELOG discipline** : every PR adds an entry to `[Unreleased]` in `CHANGELOG.md`. Don't defer to release time — write the entry while the context is fresh. Sections : `Added` / `Changed` / `Fixed` / `Removed` / `Security`.
- **Comments** : default to none. Only justify hidden constraints, subtle invariants, or behavior that would surprise. Never narrate WHAT the code does (the names already do).
- **Components** : SFC `<script setup lang="ts">`, defineProps with types, `useI18n()` for any string the user sees.
- **i18n keys** : kebab/snake-mixed, nested by section (`section.subsection.leaf`). Strings displayed to users go through `t(key)`. Hardcoded strings allowed for proper nouns (Pallet Town, Claude Code, Pokémon Showdown), technical IDs (anon_id, arena_secret), and CLI commands. **Never put literal `{` or `}` in i18n message values** — vue-i18n parses them as placeholders and throws at compile time. Rephrase or use `{'{'}{ '}' }` escaping.
- **Locale parity** : FR and EN must have identical key paths. CI checks parity (TODO — currently only enforced by hook tests).
- **CSS** : prefer UnoCSS utilities or shortcuts (`card`, `pill`, `btn-primary`, `surface-*`, `text-*`) from `uno.config.ts`. Custom CSS only in `<style scoped>` for component-specific behavior.
- **Vue scoped `:global()`** : when writing `<style scoped>` and need to escape the scope, wrap the **full** selector inside `:global(...)`. Use `:global(html.dark .my-class) { ... }`, NEVER `:global(html.dark) .my-class { ... }` — the Vite/Vue compiler strips everything after the closing `)` and the rule ends up applied to `html` itself.
- **Naming** : composables `useXxx`, components `PascalCase`, utils `kebab-case.ts`, types match Worker contracts in `app/types/api.ts`.

## Test expectations

- **Stack** : vitest + happy-dom + @vue/test-utils. `tests/setup.ts` installs vue-i18n plugin globally (legacy: false, locale: 'en' default) so any `useI18n()` call in mounted components resolves.
- **Where** :
  - `tests/components/<Name>.test.ts` — Vue Test Utils mount-based, assertion on rendered text
  - `tests/unit/composables/<name>.test.ts` — composable behavior with fake timers
  - `tests/unit/utils/<name>.test.ts` — pure function tests
  - `tests/unit/services/<name>.test.ts` — ApiClient with fetch mocks
- **Coverage threshold** : 80 / 80 / 80 / 80 (lines, functions, branches, statements). Vitest config enforces this on `app/utils/**` + `app/services/**` only (component coverage is a "feel" metric, threshold focused on pure code).
- **i18n assertions** : default locale in tests is **EN** (matches the pre-i18n hardcoded English assertions). Translated text MUST match the EN locale's value, not key names.
- **Loop var shadowing** : `useI18n()` destructures `t`. Don't `v-for="t in things"` — vue-i18n throws at compile. Use `ty`, `turnItem`, `tr`, etc.

## Workflow

### Local dev

```bash
# .env points to prod worker by default — uncomment the localhost line to point
# at a local wrangler dev (cd vendor/claude-pokemon/api && npm run dev).
npm run dev   # → http://localhost:3000
```

### Pre-push (auto via Claude Code hook)

`.claude/hooks/pre-push.sh` intercepts every Bash `git push` and runs `npm run ci:pre-push` :

1. ESLint
2. Prettier check
3. Nuxt typecheck (with output-grep fallback because `nuxt typecheck` swallows the underlying exit code)
4. Vitest (component + unit)
5. Nuxt build (cloudflare-pages preset)

Bypass : `git push --no-verify` ou `--dry-run`. **Do NOT bypass without an explicit user ask.**

### Deploy

Push to `main` → Cloudflare Pages auto-deploys (~2 min). Build env on CF Pages : `NITRO_PRESET=cloudflare-pages`, `NODE_VERSION=20`.

GitHub Actions CI uses Node 22 (required by `eslint-flat-config-utils` calling `Object.groupBy` which lands in Node 21+) and `submodules: true` on checkout.

## Known traps (chronological discovery)

1. **UnoCSS preset-wind4 theme keys** : v3 names (`fontFamily`, `borderRadius`, `transitionTimingFunction`) are silently ignored. Use `font`, `radius`, `ease`.
2. **Vue scoped `:global()` selector wrap** : see Conventions section. The compiler strips after `)` and the rule applies to `html` entirely → "all text invisible in dark mode" is the classic tell.
3. **`min-h-screen` stacking contexts** : `position: relative` alone doesn't create a stacking context ; need `z-0` or `isolation: isolate` to trap a child with negative z-index (hero decorative pokéballs disappear behind `surface-bg` ancestor otherwise).
4. **Body bg color** : `html.dark body` and `body` MUST have an explicit `background-color`, not just the radial-gradient layers. Without it, the browser default (white) shows through wherever the gradients are transparent → "white bar in dark mode".
5. **i18n placeholder `{...}`** : vue-i18n parses `{name}` as a variable. Literal braces in messages break compilation. Rephrase (`expected: anon_id + arena_secret fields`) instead of using `{anon_id, arena_secret}`.
6. **i18n `t` loop-var shadowing** : `v-for="t in ..."` collides with `const { t } = useI18n()`. Rename the loop var.
7. **Test setup needs i18n plugin** : any component using `useI18n()` will throw `Need to install with app.use function` in tests without the global plugin install in `tests/setup.ts`.
8. **Nuxt CLI typecheck exit code lie** : `nuxt typecheck` prints the error then exits 0 locally despite real TS errors. Detect via grep on `error TS<N>` in the local CI script (already done in `scripts/ci-pre-push.sh`).
9. **Submodule not auto-checkout in CI** : `actions/checkout@v6` requires `submodules: true` to clone `vendor/claude-pokemon/`. Without it, `claude-pokemon-shared` import resolution fails.
10. **Node 21+ for ESLint flat config utils** : `eslint-flat-config-utils` (transitive via `@nuxt/eslint`) uses `Object.groupBy`. CI Node version must be ≥22.

## Pointers

- Backend / Worker source : `vendor/claude-pokemon/api/src/` (git submodule, read-mostly from here — modify in the parent repo)
- Worker prod URL : `https://claude-pokemon-api.benoit-dev.workers.dev`
- Shared package source : `vendor/claude-pokemon/shared/` (exported types + battle resolution)
- Memory of architectural decisions and gotchas across sessions : `~/.claude/projects/-home-bbruneau-repositories-perso-claude-pokemon/memory/`
