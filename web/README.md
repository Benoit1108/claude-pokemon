# 🌐 claude-pokemon-arena

The **web arena** for [`claude-pokemon`](https://github.com/Benoit1108/claude-pokemon) — leaderboard, public trainer cards, async + live PvP battles, wild zones, pokédex achievements. Live at **[claude-pokemon-arena.pages.dev](https://claude-pokemon-arena.pages.dev/)**.

![arena demo](.demo/arena-demo.gif)

> The CLI raises the Pokémon. This site is where they compete.
> Recorded via `.demo/record.mjs` (Playwright + mock API) → `.demo/build-gif.sh` (ffmpeg). See [`.demo/README.md`](./.demo/README.md) to regenerate.

## Features

- 🏆 **Live leaderboard** of opted-in trainers (top tokens, max level, shiny counts) with lineage emoji + level pill + shiny mark
- 🎴 **Public trainer cards** at `/trainer/[anonId]` — sprite, lineage, badges, quote, bio, pinned badges, lifetime stats
- 📖 **Pokédex** (251 species, Gen 1 + Gen 2) — type/generation/rarity filters, FR/EN names toggle, greyed-out species for un-encountered (auto when signed in, manual via `?trainer=...`)
- ⚔️ **Arena pool** for async PvP — challenge any opted-in trainer, replay battles tour-par-tour
- 🤺 **Live PvP 1v1** via Cloudflare Durable Objects — matchmaking, 30s turn timer, reconnection grace
- 🏞️ **Wild zones** (`/zones`) — 8 biomes, explore + fight + flee, lineage-tinted maps
- 🗻 **Trail** (`/ladder`) — 8 scripted bot trainers (Bug Catcher → Champion), auto + manual play modes with juice pack (confetti, screen shake, floating damage)
- 👤 **Web-native signup** (`/signup`) — no CLI needed, pick a starter + display name, get a recovery key
- 🔑 **Recovery-key sign-in** (`/login`) — paste your `anon_id` + `arena_secret` to reconnect, no email required (anonymous-by-default)
- 🔗 **CLI ↔ web pairing** — generate a 6-char code on either side to import the account
- 🌍 **i18n FR + EN** with a `FR↔EN` chip in the header (locale cookie-persisted, browser auto-detected)
- 🎨 **3-state theme** (light / dark / system) with retro GameBoy mode via the user menu
- ⌨️ **Konami code** anywhere → confetti

## Stack

- **Nuxt 4** + Vue 3 (file-based routing, auto-imports, SSR by default)
- **UnoCSS** with `preset-wind4` (Tailwind v4-compatible atomic CSS)
- **TypeScript** strict mode
- **@nuxtjs/i18n** + **@nuxtjs/color-mode**
- **Vitest** + **happy-dom** + **@vue/test-utils**
- **Cloudflare Pages** deployment, free tier, edge SSR
- Backend : the [`claude-pokemon-api`](https://claude-pokemon-api.benoit-dev.workers.dev) Worker (in the CLI repo, REST + KV)

## Local dev

```bash
git clone --recurse-submodules https://github.com/Benoit1108/claude-pokemon-arena.git
cd claude-pokemon-arena
nvm use            # Node 22 (.nvmrc)
npm install
npm run dev        # → http://localhost:3000
```

The `--recurse-submodules` flag is **required** : the shared package
(`claude-pokemon-shared`) is consumed from `vendor/claude-pokemon/` (git
submodule of the CLI repo). Forgetting it = `Failed to resolve import` at
build time.

By default the dev server hits the **prod** Cloudflare Worker. Point at a
local `wrangler dev` worker via `.env`.

## Project structure

```
claude-pokemon-arena/
├── app/                                Nuxt 4 src dir
│   ├── components/                     Flat-named SFCs (pathPrefix: false)
│   │   ├── arena/                      Battle UI (BattleStage, AttackPicker, ReactionBar, ...)
│   │   ├── ladder/                     Trail bot tiles
│   │   ├── leaderboard/                LeaderboardTable
│   │   ├── pokedex/                    PokedexCard, PokedexFilters
│   │   ├── stats/                      Global stats + lineage distribution
│   │   ├── trainer/                    Trainer card pieces
│   │   └── ui/                         AppHeader, BottomNav, UserMenu, ColorModeToggle, ...
│   ├── composables/                    useApi, useArenaSession, useBattlePlayer, useLiveBattle, ...
│   ├── data/                           Static : bot-trainers, moves, wild-pool-gen{1,2}.json
│   ├── pages/                          File-based routing (signup, login, pair, profile,
│   │                                    arena, ladder/, zones/, pokedex/, trainer/, battle/, live/)
│   ├── services/api.ts                 Single ApiClient class wrapping the Worker
│   ├── types/                          api.ts, pokedex.ts (mirror Worker contracts)
│   ├── utils/                          battle-engine, manual-battle, sprites, lineage, format
│   └── assets/css/global.css           Body bg, fonts baseline, reveal keyframes
├── i18n/locales/{fr,en}.json           ~543 keys per locale, parity-enforced in CI
├── tests/                              Vitest — components/, unit/, setup.ts (installs vue-i18n)
├── scripts/
│   ├── fetch-github-stars.mjs          predev/prebuild hook (writes .env.local)
│   ├── check-i18n-parity.mjs           FR ↔ EN key parity gate (CI + local)
│   └── ci-pre-push.sh                  Full local CI suite (mirrors GitHub Actions)
├── .claude/
│   ├── settings.json                   PreToolUse hook on Bash → pre-push gate
│   └── hooks/pre-push.sh
├── vendor/claude-pokemon/              Git submodule (shared package + worker source)
├── docs/architecture.md                Layered design + ADRs
└── nuxt.config.ts, uno.config.ts, vitest.config.ts, knip.json
```

See [`docs/architecture.md`](./docs/architecture.md) for the layered design + ADRs and [`CLAUDE.md`](./CLAUDE.md) for repo-specific conventions, 10 known gotchas, and deploy workflow.

## Test + lint locally

Everything CI runs is also runnable locally — the Claude Code [pre-push hook](.claude/hooks/pre-push.sh) gates every `git push` automatically :

```bash
npm run ci:pre-push    # full suite: lint + prettier + typecheck + knip + i18n parity + vitest + nuxt build
```

Individual gates :

```bash
npm run lint              # ESLint
npm run format            # Prettier --write
npm run typecheck         # Nuxt typecheck
npm run knip              # dead-code / unused exports
npm run check:i18n        # FR ↔ EN locale key parity
npm run test              # Vitest (147 tests)
npm run test:coverage     # Vitest + v8 coverage (80% threshold)
```

## Deploy

`main` pushes auto-deploy to Cloudflare Pages (~2 min). CF Pages build env :
`NITRO_PRESET=cloudflare-pages`, `NODE_VERSION=20`.

The backend Worker is deployed separately from the [CLI repo](https://github.com/Benoit1108/claude-pokemon) :

```bash
cd ~/repositories/perso/claude-pokemon
wrangler deploy --cwd api
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the setup, PR workflow, and conventions.

Issues + features → [GitHub issues](https://github.com/Benoit1108/claude-pokemon-arena/issues). Security findings → [`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE) — same as `claude-pokemon`.

## Credits

- Pokémon sprites : © Game Freak / Nintendo, hot-linked from [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/) (gen5)
- Fonts : Bricolage Grotesque (display), DM Sans (body), JetBrains Mono (mono) — Google Fonts
