# Contributing — claude-pokemon-arena

The web companion to the [`claude-pokemon`](https://github.com/Benoit1108/claude-pokemon) CLI. Nuxt 4 + Vue 3 + UnoCSS + Vitest, deployed on Cloudflare Pages.

## Setup

```bash
git clone --recurse-submodules https://github.com/Benoit1108/claude-pokemon-arena.git
cd claude-pokemon-arena
nvm use            # Node 22 (.nvmrc)
npm install
npm run dev        # → http://localhost:3000
```

The `--recurse-submodules` flag is **required** : the shared package
(`claude-pokemon-shared`) lives in `vendor/claude-pokemon/` as a git submodule.
Forgetting it = `Failed to resolve import "claude-pokemon-shared"` at build time.

By default the dev server hits the **prod** Cloudflare Worker. To point at a
local `wrangler dev` worker, uncomment the localhost line in `.env`.

## Development workflow

We work **PR-based** : feature branches off `main`, push, open a PR, squash on merge. `main` should stay linear with one commit per merged PR (commit message = PR title).

```bash
git checkout -b feat/whatever
# … edit …
git commit -m "feat: short description"   # Conventional Commits
git push -u origin feat/whatever
# Open PR on GitHub → squash merge when CI is green
```

## Test + lint locally

Everything that CI runs is also runnable locally (and the Claude Code pre-push hook automatically gates every `git push` on it) :

```bash
npm run ci:pre-push    # full CI suite (lint + prettier + typecheck + knip + i18n parity + vitest + nuxt build)
```

Individual gates :

```bash
npm run lint           # ESLint
npm run format         # Prettier --write (auto-fix)
npm run format:check   # Prettier --check (CI gate)
npm run typecheck      # Nuxt typecheck (vue-tsc under the hood)
npm run knip           # dead-code / unused exports
npm run check:i18n     # FR ↔ EN locale key parity
npm run test           # Vitest (147 tests)
npm run test:coverage  # Vitest + coverage (80% threshold)
```

## Conventions

- **Commits** : Conventional Commits with `arena` scope where it helps disambiguate (e.g. `feat(arena): …`, `fix(arena): …`). No `Co-Authored-By` lines.
- **CHANGELOG discipline** : every PR should add an entry to the `[Unreleased]` section of [CHANGELOG.md](./CHANGELOG.md). Don't deferred. When we cut a release we just rename `[Unreleased]` → `[X.Y.Z]` and add the date.
- **i18n** : all user-facing strings must go through `t(key)` (FR + EN required). The `i18n parity` CI gate refuses any missing translation.
- **No literal `{` or `}` in i18n message values** — vue-i18n treats them as placeholders. Rephrase.
- **Vue scoped `:global()`** — wrap the **full** selector inside `:global(...)`. See [`CLAUDE.md`](./CLAUDE.md) section "Known traps" for the full list of gotchas you'll want to avoid.

## Branch protection (for the maintainer)

`main` should be branch-protected on GitHub :

- Require pull request reviews before merging
- Require status checks to pass : all 9 CI stages (`security → quality → test → build`)
- Require linear history (squash-only merge)
- Don't allow force pushes

This is set up via Settings → Branches → Add rule on github.com.

## Deploy

`main` push → Cloudflare Pages auto-deploys (~2 min). CF Pages env :
`NITRO_PRESET=cloudflare-pages`, `NODE_VERSION=20` (CF's default, distinct from our CI's Node 22). Both work — Node 20 doesn't run ESLint on CF.

The backend (Cloudflare Worker `claude-pokemon-api`) lives in the [CLI repo](https://github.com/Benoit1108/claude-pokemon) and is deployed separately with `wrangler deploy --cwd api/`.

## Reporting

- Bug? Performance issue? Open a [GitHub issue](https://github.com/Benoit1108/claude-pokemon-arena/issues).
- Security finding? See [SECURITY.md](./SECURITY.md).
- Feature idea? Open an issue with the `enhancement` label so it can be triaged against the [roadmap](./ROADMAP.md).
