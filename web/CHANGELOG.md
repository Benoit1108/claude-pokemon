# Changelog

All notable changes to **claude-pokemon-arena** (the web companion to the
`claude-pokemon` CLI) are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — Semver
applies, but the arena is currently pre-1.0 and not published as a package
(it lives only at https://claude-pokemon-arena.pages.dev/), so versions
loosely track the [project ROADMAP](https://github.com/Benoit1108/claude-pokemon/blob/main/ROADMAP.md)
phases. The CLI has its own [CHANGELOG](https://github.com/Benoit1108/claude-pokemon/blob/main/CHANGELOG.md).

## [Unreleased]

### Added

- **Phase 2.11 — succès Pokédex sur la trainer card**. Nouvelle section "Succès Pokédex" sur `/trainer/[anonId]`, dérivée **100% côté client** des `pokedex_seen_ids` (déjà servis par le profil — zéro changement worker/CLI). Affiche : compteur global (X/251 · %), **barres de complétion par génération** (Gen 1 / Gen 2), **jalons** (25 % / 50 % / 100 % du Pokédex, tous les starters Gen 1, a vu un rare, a vu un légendaire) en grille acquise/grisée, et une **grille des légendaires aperçus** (sprites + noms). Nouveaux `app/utils/pokedex-achievements.ts` + `app/components/trainer/TrainerPokedexAchievements.vue`.
- **Phase 2.12 (partiel) — thème sonore à 3 états**. Le bouton 🔊 des combats cycle désormais **silencieux → 8-bit → orchestral** (au lieu d'un simple on/off). Le mode `orchestral` adoucit les voix (sine/triangle, attaque/release plus longues + une 2e voix légèrement désaccordée pour le corps) ; `8-bit` garde les blips secs (square/sawtooth). Tout reste **synthétisé** (Web Audio, zéro asset, copyright-safe). Choix persisté dans `localStorage` (`arena-sound-theme`, migration auto de l'ancien `arena-sound-enabled`). Le Konami code (easter egg) était déjà livré ; clic-logo 10× et `?secret=` non retenus.

- **Phase 2.15 — refonte de la scène de combat (fonds pixel-art)**. `BattleStage` passe du backdrop en dégradé CSS à de **vrais décors anime-style** par environnement (`/public/battle-bg/<env>.png`), avec les Pokémon **posés** sur le cercle de combat central (ombre de contact, sprite descendu pour compenser le vide transparent des sprites Showdown).
  - Nouveau `app/utils/battle-scene.ts` : `resolveScene()` choisit le fond + les ancres. `scene="arena"` force le stade PvP ; sinon le décor est dérivé du **type de l'adversaire** (water→plage, fire→volcan, ice→neige, electric/steel/poison→usine, psychic/ghost/dark/fairy→ville, rock/ground/dragon/flying→canyon, grass/bug→prairie, fighting/normal→dojo). Combats wild/ladder → décor adapté automatiquement.
  - `BattleStage` réécrit : fond image (cover, `image-rendering: pixelated`), sprites posés en diagonale sur le **cercle central** (joueur devant-gauche de dos, adversaire derrière-droite de face), HP-pills aux coins. Anims d'attaque/recul/victoire/défaite/crit + dégâts flottants + intro conservés ; cercles concentriques CSS retirés (remplacés par le marquage peint).
  - **9 décors** dans `public/battle-bg/` (arène, neige, plage, volcan, dojo, prairie, usine, ville, canyon), composition cohérente (cercle de combat centré) → **un seul jeu d'ancres** pour tous, pas de calage par fond.

### Fixed

- **Sprites des Pokémon sauvages / échangés** (`app/utils/sprites.ts`). Une lignée non-starter (`psyduck`, `trade-gengar`, …) tombait sur le sprite du starter (Salamèche) via `stageFor`. Désormais `spriteUrl()` et `stageNameFor()` résolvent le **sprite Showdown de l'espèce** (le species id du `wild_pool` = l'id Showdown) et son **nom FR** depuis le pokédex (Psykokwak, Ectoplasma…). Corrige le rendu partout (scène de combat, leaderboard, opponents, trainer-card, pokédex).

- **Phase 2.14 — rendu des Pokémon sauvages & échangés** (suit la PR CLI du même nom). L'arène héberge désormais n'importe quel Pokémon (sauvage, échangé `trade-*`), plus seulement les 8 starters → le rendu lignée gère tous les types.
  - `app/utils/lineage.ts` : nouvelle couche **par type canonique** (18) — emoji, label, accent, gradient — résolue via `lineageToCombatType()` du package shared. Les starters gardent leur branding curaté ; tout le reste (ex: `trade-psyduck` → 💧 Water) rend proprement au lieu du fallback ❓/gris.
  - Nouvelle fonction `lineageLabel()` ; les accès directs `LINEAGE_LABELS[lineage]` (qui affichaient `undefined` pour un wild) migrés vers elle dans `OpponentRow`, `UserMenu`, `BotTrainerTile`, `TrainerHero`, `profile`, `live/[id]`.
  - Submodule `vendor/claude-pokemon` bumpé sur le moteur 18 types.

- **Sprint 5 — design pass + recovery-key sign-in + i18n FR/EN** (commits `0d164f5` → `df9ecdb`) :
  - Chrome v2 : 56 px sticky `AppHeader` with brand + version + GitHub-stars pills, 4 nav tabs, segmented light/dark/system theme toggle + lang switch chip, user pill. Mobile `BottomNav` (md:hidden, fixed, 5 SVG-icon entries).
  - Landing redesign : hero with decorative pokéballs, eyebrow pill, accented wordmark, 4 featured section tiles (lineage-tinted radial gradient backgrounds + slide-in CTA on hover), below-the-fold strips (global stats / leaderboard / lineage distribution).
  - 4 zone status badges (sweet / preview / outclassed / locked) with distinct visual treatments + legend.
  - **Recovery-key sign-in** (closes the "can't reconnect a web account" gap) : signup now displays the `anon_id` + `arena_secret` once in a blocking modal with copy / download `.json` actions and an explicit acknowledgement. New `/login` page accepts the combined `anon_id.arena_secret`, two separate fields, or a `.json` file import. `UserMenu` disconnect button prompts a confirmation panel.
  - **i18n FR + EN** via `@nuxtjs/i18n` (no-prefix strategy, locale via cookie `arena-i18n`, default FR, parity-enforced). FR↔EN chip in the header. ~543 keys per locale, full UI translated (header, BottomNav, UserMenu, home, signup, login, pokedex, profile, pair, arena, zones list+detail, ladder list+detail, battle, live, trainer, all 11 `arena/*` battle components). Hardcoded strings deliberately left for proper nouns and CLI commands.
- **CI restructure** to a 4-stage DAG (`security → quality → test → build`) with 9 jobs : npm audit, ESLint, Prettier, TypeScript typecheck, knip (dead code), i18n FR/EN parity, Vitest + coverage (80% threshold), Nuxt build (cloudflare-pages preset), Cloudflare Pages deploy.
- **Pre-push hook** (`.claude/hooks/pre-push.sh`) wired as a Claude Code `PreToolUse` hook. Runs the same gates as CI before any `git push` initiated by Claude, blocks the push if anything is red. Bypass with `--no-verify` / `--dry-run`. Replaces a brief husky stint.
- **`CLAUDE.md`** at the repo root — auto-loaded every Claude Code session, captures architecture, naming conventions, test expectations, 10 known gotchas (UnoCSS preset-wind4 theme keys, Vue scoped `:global()` wrap, stacking contexts, body bg color requirement, vue-i18n placeholder escape, loop-var shadowing, test-time i18n plugin install, Nuxt CLI typecheck exit-code lie, submodule auto-checkout, Node 21+ requirement), deploy workflow.

### Changed

- `vendor/claude-pokemon` consumed as a git submodule (was a flat copy). Shared package `claude-pokemon-shared` now linked via workspace dep `file:./vendor/claude-pokemon/shared` — submodules `true` required in CI checkout.
- CI Node version pinned to **22** (eslint-flat-config-utils calls `Object.groupBy`, Node 21+ only). CF Pages auto-build still uses Node 20 — unaffected because ESLint isn't invoked there.

### Fixed

- Dark mode "white bar" at viewport bottom — `body { background-color: rgb(13 17 23) }` explicit (was a transparent radial-gradient over browser default white).
- Pokédex now greys out un-encountered species for the **logged-in user**, not only when a `?trainer=` query param is present. Falls back to `useArenaSession()` automatically with a "✨ Ton pokédex" banner.
- `app/pages/index.vue` : added `z-0` to the hero `<section>` to create a stacking context that traps the `.hero-deco { z-index: -1 }` children inside (decorative pokéballs were disappearing behind the opaque `.surface-bg` ancestor).
- Vue scoped `:global()` syntax — wrap the **full** selector inside `:global(...)`, not the prefix only. Fixed 37 rules across 5 components ; one bad rule was applying `background-clip:text; color:transparent` to the whole `<html>` element in dark mode (= invisible page).
- UnoCSS `preset-wind4` theme key names (`font` / `radius` / `ease`, not the v3 names) — pill / typography / button utilities now generate correctly.

### Security

- **`GET /v1/arena/whoami`** (Bearer auth, in the `vendor/claude-pokemon/api/`) — validates pasted recovery-key credentials without mutating any record. Bearer hash compared in constant time, 400/401/404 error codes well-typed. Backed by 6 vitest cases.

## [0.1.0] — 2026-05-06

### Added

- **🚀 Phase 2 Sprint 1 — first commit live on Cloudflare Pages.** Nuxt 4 + Vue 3 + UnoCSS preset-wind4. Homepage with SSR-fetched leaderboard top 10, global stats, lineage distribution. Repo separate from the CLI. CF Pages env `NITRO_PRESET=cloudflare-pages`, free tier.
- Sprints 2.2 → 2.10 shipped iteratively (commits visible in `git log`) :
  - 2.2 trainer card `/trainer/[anonId]`, `/pokedex` grid (251 species), `/battle/[id]` text replay
  - 2.3 combat engine + arena async PvP routes
  - 2.4 animated battle replays, GameBoy-dither page transitions, 8-bit Web Audio sound effects
  - 2.5 Pokémon Showdown sprites + idle yoyo micro-animation
  - 2.6 bot trainers ladder with lineage-tinted backgrounds
  - 2.7 manual combat vs bots + visual juice pack (confetti, screen-shake, floating damage)
  - 2.8 battle quotes + GG reactions (bounded emoji set)
  - 2.9 customizable trainer profile (quote + bio + pinned badges)
  - 2.10 real-time PvP 1v1 via Durable Objects
