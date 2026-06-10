# claude-pokemon — Roadmap

> **Living document.** Phases below describe current intent, not dated promises.
> Order is firm, content is adjusted based on feedback and learning.
> Decisions log at the bottom captures the *why* of irreversible choices.

## 🎯 Vision

`claude-pokemon` is a coding companion (Pokémon-themed) that grows alongside your work. It started as a CLI statusline gamification, and is becoming a connected ecosystem :

- **CLI** (`claude-pokemon`, npm) — where you **raise** your Pokémon while coding
- **Arena web** (planned) — where they **compete** between trainers
- **Discord bot** (planned) — where the **community** gathers
- **Portfolio** (planned) — showcase aggregating the ecosystem

Shared stack : Cloudflare Workers + KV (API), Nuxt 4 on Pages (web), free tier permanent (~1000 daily active users headroom).

## 📦 Current state — `v1.0.0-beta.6` (live on npm) + arena web live + Sprint 2.4 done

- ✅ Pokédex Gen 1+2 (251 wild Pokémon)
- ✅ 8 starter lineages (Gen 1 + Johto starters with Hisuian Typhlosion)
- ✅ Egg → Lv.100 progression with two-phase geometric XP curve (300K hatch ~1d, 5M Reptincel ~1 week, 300M champion ~1.5 year for normal devs)
- ✅ Evolutions including friendship-gated (Eevee → Espeon/Umbreon canonical Gen 2)
- ✅ Team management (6 max) + unlimited PC storage
- ✅ Switch / hatch / deposit / withdraw / release / give / take / trade
- ✅ Battle simulation (30% encounters), held items, berries, seasons
- ✅ Shiny system (1/100, +25% Shiny Charm), shiny hunter mode (×5, XP frozen)
- ✅ 15 achievement badges (incl. master per lineage)
- ✅ 4 UI themes : default / dark / light / retro (GameBoy)
- ✅ Mini-game `/pokemon game` (guess the Pokémon, +500 XP reward)
- ✅ Stats partagées opt-in via Cloudflare Worker (anonymous leaderboard with public pseudo, GDPR forget endpoint)
- ✅ i18n FR + EN
- ✅ Architecture : split data sources, auto-version inject, force-propagate game-design constants

## 🚀 Phase 1 — Polish CLI (~2 weeks) ✅

Goal : improve the existing engagement, create viral surface area for Phase 2.

| # | Feature | Description |
|---|---------|-------------|
| 1.1 | **End-of-session recap** | `SessionEnd` Claude Code hook that summarizes events that happened during the session ("you coded 2h, got 1 wild encounter, 2 berries, +12 500 XP, friendship +47, hatch progress 23% → 31%"). Solves the visibility gap where events scroll silently while user is focused. |
| 1.2 | **README badge SVG endpoint** | New Worker route `/v1/badge/<anon_id>.svg` returning a live-rendered SVG. Users embed `![](https://...)` in their GitHub README → viral discoverability via every player's profile. |
| 1.3 | **Leaderboard polish** | 🥇🥈🥉 trophies for top 3, lineage emoji prefix, optional mini-sprite of active companion. |
| 1.4 | **Auto-submit hook** | Inside `pokemon_tick()`, fire-and-forget submit if `last_submit_at > 24h` and `stats_share.enabled`. Stats stay fresh on the leaderboard without manual `submit`. |
| 1.5 | **Trainer card CLI** | `/pokemon trainer-card` → ASCII frame with sprite + pseudo + selected stats + badges + arena record. Companion to web version (Phase 2). |

## 🌐 Phase 2 — Arena web (~4-6 weeks after Phase 1)

Goal : extend the project beyond the terminal, give Pokémon a public life.

### 2.1 — Setup & infra (1 week) ✅
- New repo `claude-pokemon-arena` (separate from CLI main repo)
- Nuxt 4 + Vue 3 + UnoCSS bootstrap
- Cloudflare Pages deployment, free tier
- Composables fetching the existing Worker API
- Visual direction locked : *modern minimalism with GameBoy soul* — pixel-rendered sprites, micro-animations (idle bounce, screen shake on critical hit, pixel-dither page transitions)

### 2.2 — Core pages MVP (2 weeks) ✅
- `/` Home : top 10 leaderboard, global stats, install CTA
- `/trainer/[anonId]` : public trainer card (stats, team, badges, arena record, "challenge me" button)
- `/pokedex` : grid of 251 Pokémon with shiny rate observed by community
- `/battle/[id]` : text-only replay (animated version in 2.4)

### 2.3 — Combat engine (1-2 weeks) ✅
- Engine level 2 : turn-based with HP, type effectiveness, basic moves (~200 LoC Worker)
- Endpoint `POST /v1/arena/challenge` (Bearer auth via `arena_secret`)
- Endpoint `GET /v1/arena/leaderboard` (W/L records)
- Deterministic replay via seeded RNG
- CLI : `/pokemon arena enable | challenge <pseudo> | regenerate | status`
- Auth : 32-hex `arena_secret` generated locally, hash-stored server-side, Bearer token on writes, 5-min replay protection

### 2.4 — Animations & polish (1 week, V1.5) ✅
- Battle replay animated turn-by-turn (sprites bouncing, narration typewriter)
- 8-bit generic sound effects via Web Audio API (opt-in, copyright-safe)
- GameBoy-dither page transitions
- Theme sync CLI ↔ web (your `data.json.theme` colors the site too)

### 2.5 — Real Pokémon sprites + idle micro-anim (~3-5 days)
Replace lineage emojis with actual Pokémon Showdown sprites in the web UI.
- Hot-link `play.pokemonshowdown.com/sprites/gen5/<showdown_id>.png` (already used by the CLI)
- Static sprites first in `BattleParticipantCard`, `OpponentRow`, `LeaderboardTable`, `PokedexCard`. Animated GIFs (`/sprites/ani/`) on the battle replay page only.
- Shiny variant pulled automatically from `is_shiny` field.
- Fallback to current emoji if sprite 404 (graceful degradation).
- **Idle yoyo** : non-active sprites (leaderboard, opponents list) get a slow 2-3 s vertical bounce loop — gives the page life without being distracting.
- (Later if Showdown changes URLs : proxy via Worker with cache.)

### 2.6 — Bot trainers ladder + dynamic backgrounds (~1 week)
Solo gameplay loop : a static list of NPC trainers with rising difficulty, beatable in async mode (deterministic resolution against AI snapshots).
- 10-20 bots in `app/data/bot-trainers.ts` : Bug Catcher Lv.5 → Champion Lv.50, varied lineages.
- Progression in `localStorage` first (offline-friendly), optional sync to Worker for cross-device profile.
- New page `/ladder` with the bots laid out as a "trail" / map.
- Reward at the end : "Trail Conqueror" badge displayed on web trainer card + title on leaderboard.
- Battles still resolve via the existing `resolveBattle()` engine (no new logic required).
- **Dynamic backgrounds** : `/battle/[id]` and the ladder tiles get a `linear-gradient` that shifts based on the encountered trainer's lineage (forest greens for grass, sunset oranges for fire, etc.).

### 2.7 — Manual combat vs bots + battle juice pack (~1-2 weeks)
The big interactive jump : player picks one of 4 attacks per turn, bot AI responds. Browser-only logic (no Worker roundtrip during the fight).
- Battle engine refactored to step-by-step API : `nextTurn(state, action) → newState`. Stays deterministic for replay parity.
- 4-attacks model : add a `moves[]` field per stage (already partially modeled in `lib/data/lineages/*.json` — extend with damage/effectiveness modifiers per move).
- Bot AI : simple rule-based (prioritize super-effective, switch to crit chance if HP low). Difficulty levels = rule-set tiers.
- UI : attack picker overlay during the player's turn, animated countdown, sound feedback.
- Async PvP unaffected — manual mode is bots-only.
- **Visual juice pack** (combat-specific) :
  - Confetti on victory (`canvas-confetti`, ~3 KB)
  - Screen shake on critical (small `<main>` transform)
  - Floating damage numbers (`−12` floats above hit sprite, fade out)
  - Particle effects per attack type (flames for fire, droplets for water, leaves for grass — pure CSS or tiny inline SVG)

### 2.8 — Battle quotes + GG reactions (~3-4 days)
Light social layer without the cost of moderating free chat.
- Trainer quote (1 line, max 80 chars) set via CLI `/pokemon quote <text>`, stored in submit payload, rendered on web trainer card + arena pool tile.
- Post-battle reactions : bounded emoji set (👏 🔥 🎉 😂 🥲 — 6 options) clickable on `/battle/[id]`, aggregated counter per reaction.
- Worker endpoint `POST /v1/arena/battle/<id>/react` (rate-limited per anon_id per battle).
- No free text. No user-to-user DM yet.

### 2.9 — Customizable trainer profile (~1 week)
Identity layer for the public trainer card. Builds on the quote from 2.8.
- **Avatar** : picked from Pokémon Showdown sprites — full Pokédex pickable in CLI via `/pokemon trainer-avatar <showdown_id>`. Stored in submit payload, displayed on web `/trainer/[anonId]` and arena pool tile.
- **Bio** : 160 chars max (Twitter-style), set via CLI `/pokemon bio <text>`. Ratelimited at submit.
- **3 pinned badges** : pick which 3 of your earned badges show on the public card (instead of the full grid).
- **Accent color** : auto-derived from the active lineage — no custom override (keeps moderation surface zero).

### 2.10 — Real-time PvP 1v1 + battle highlights GIF (~2-3 weeks, biggest infra jump)
Both players decide simultaneously each turn (manual combat against another human, not an async snapshot).
- Cloudflare Durable Object per active match (room = battle session). WebSocket connection for each peer.
- Matchmaking : "Looking for opponent" button → server pairs two waiting players.
- Turn timer (e.g. 30 s) with auto-pick if expired.
- Same UI as 2.7 (4 attacks per turn) but the opponent is human.
- Reconnection grace period (~60 s) if a player loses connection.
- Result still recorded as a `battle:<id>` row for replay parity.
- **Battle highlights** : at the end of any replay (PvP or async), button "Export 3 s clip" → server-side renders the KO moment as a GIF (reuses the `.demo/` Playwright pipeline). Twitch-clip vibes, share-friendly.

### 2.11 — Pokédex-driven achievements (~3-5 days, CLI ↔ web crossover)
Make the wild encounters of the CLI matter on the public profile.
- New badges tied to `pokedex_wild` data : "Vu un Lugia sauvage", "Capturé tous les Gen 1 starters", "Pokédex 50 % rempli", etc.
- CLI : extend `pokemon_check_badges()` in `lib/lib.sh` with the new conditions (idempotent, runs every tick).
- Submit payload already carries `pokedex_seen_count` — extend with a hashed bitmap of seen species so we can render which specific entries are unlocked on the web.
- Web : new "Pokédex achievements" section on `/trainer/[anonId]` with the unlocked icons.

### 2.12 — Easter eggs + sound themes + CLI↔web sync (~3-5 days)
Polish pack — multiple small wins bundled.
- **Sound theme switcher** : extend the existing 🔊 toggle into a 3-state cycle — `8-bit` (current) / `orchestral` (richer envelopes, longer attack/release) / `silent`. Stored in `localStorage`.
- **Easter eggs** :
  - Konami code anywhere → permanent retro mode (until cleared from localStorage)
  - 10× click on the logo → hidden message / animation
  - URL param `?secret=<hash>` unlocks dev-only features
- **CLI↔web QR sync** ✅ : `/pokemon arena pair` renders a scannable QR of the `/pair?code=` link in the terminal (via `qrencode`, optional with graceful fallback). Scanning on a phone opens `/pair` which pairs the browser to the `anon_id` (the redeem flow already existed). Sound theme 3-state cycle + Konami also done (web). 10× logo click + `?secret=` dropped.

### 2.14 — Wild & traded Pokémon en Arène + chart 18 types ✅
Tout Pokémon élevé dans le CLI (sauvage capturé, échangé, starter, ou forcé à la main) peut entrer en arène — plus seulement les 8 lignées de starters. Sinon l'intérêt des sauvages s'effondre.
- Moteur de combat `shared` étendu des **5 types collapsés aux 18 types canoniques** (un Dragon reste Dragon) : matrice `TYPE_CHART` 18×18 Gen-6+ avec **vraies immunités 0×**. Backward-compat sur les matchups starters → replays historiques déterministes.
- Résolution species→type **générée** depuis `lib/data/wild_pool` (source unique, 251 espèces, drift-check CI), consommée par le worker, le live PvP et le web. `lineageToCombatType()` gère starter / `psyduck` / `trade-psyduck` / inconnu→normal.
- **Movesets réels par learnset** (level-up, comme le vrai jeu) : pipeline PokéAPI → snapshot commité (refresh manuel hors CI) → générateur offline déterministe → 302 moves + 251 learnsets level-gated. Starters gardent leurs movesets curatés.
- Validation lignée : whitelist strict → format-check ouvert (arena enable + submit). Rendu web par couleur de type (18).

### 2.13+ — Stretch (post-arena complete, scope TBD)
- **3v3 team battles** : pick 3 from your team, switch mid-battle, type-coverage strategy.
- **Tournaments / seasons** : monthly bracket, seasonal leaderboard reset, Hall of Fame.
- **Daily challenges** : "Win with a Lv.<X>" / "Beat 3 trainers" → bonus XP in CLI.
- **Trade system** : Pokémon snapshot exchange between trainers (original Phase 2 vision included this).
- **Achievements dynamiques** : streaks, unusual wins, record-keeping beyond pokédex-based ones.
- **Spectator mode** : live view of currently-running PvP matches + curated "Replay of the day".
- **i18n FR/EN** sur le web (le CLI l'est déjà).
- **PWA mobile** : installable, push notifications when challenged.
- **Chat post-match (DM)** : limited scope, ratelimited, opt-in. Free-form global chat NOT planned (modération coût trop élevé).

## 🛠️ Phase R — Refonte écosystème + Travel (socle TS unifié)

Goal : éliminer le facteur limitant (règles dupliquées bash↔TS, sync à sens
unique, auth inhabituelle, pas de Windows natif) **avant** d'empiler de nouvelles
features. On vise une seule source de vérité (`shared` TS), une vraie auth, et une
collection synchronisée CLI↔web — puis on construit le farm idle « Travel »
par-dessus. Décisions figées : voir `docs/architecture.md` ADR-005…ADR-010.

> **Socle d'abord, features après.** Ordre : `R0 → R1`, puis **R2 ∥ R3**, puis
> `R4 → R5`. R2 (auth) et R4 (collection) ne dépendent pas de R3 (coquille) —
> réordonnables si on veut livrer une feature plus tôt.

| # | Phase | Quoi | Pourquoi | Dépend de |
|---|-------|------|----------|-----------|
| **R0** | Filet de tests | Tests *golden* du comportement bash actuel (courbe XP, chaînes d'évolution, issues de combat) avant tout port | Le cœur bash est sous-testé (~50 tests / 5300 lignes) — porter sans filet = pari aveugle | — |
| **R1** | Cœur règles → TS | XP, évolution (+ Eevee), combat, multiplicateurs → `packages/shared` (moteur pur). La CLI bash *appelle* le moteur (1 spawn Node/tick, JSON stdin/stdout). Tests de parité TS == ancien bash. Inclut le **passage en monorepo pnpm** (ADR-005) | Une seule source de vérité. Fondation de tout. Mesurer la latence du tick | R0 |
| **R2** | Auth refonte | GitHub OAuth (device flow CLI + redirect web) **+** magic-link/OTP email. Sessions opaques KV. Migration des `anon_id` par liaison (ADR-010). Jeu local anonyme conservé en fallback | Identité unifiée = colonne vertébrale de la sync ; UX web enfin standard | indépendant de R1 |
| **R3** | Coquille CLI → TS | Vues, statusline, sous-commandes → TS. Chute de la dépendance bash → **Windows natif**. *Risque à spiker : remplacer chafa (rendu ANSI sprites) par un équivalent Node/binaire* | Deux projets vraiment homogènes ; débloque Windows | R1 |
| **R4** | Collection serveur + équipe/PC | Store `collection:<user_id>` serveur-autoritaire (blob KV, ADR-009). Endpoints list/switch/deposit/withdraw/release. UI **Équipe** + **Boîte PC** (web + CLI) | La « collection synchro » — triviale une fois R1+R2 faits | R1, R2 |
| **R5** | Travel — farm idle + capture | Session de farm par zone (~5 wilds : 3 communs / 1 uncommon / 1 rare/très rare). Auto-retry **lead + rotation au KO**. **Catch-up offline serveur-autoritaire** (temps jamais déclaré par le client) + cap d'accumulation. Capture **RNG par rareté**. Drops d'items. Rapport « pendant ton absence » | Le fun, inspiré du *travel* de Pokéchill | R4, R1 |

**Différé (tranché au début de la phase concernée)** : remplacement chafa (R3),
schéma JSON d'un Pokémon possédé (R4), schéma items/drops + UX du prompt de
liaison de compte (R5/R2), signatures fonction-par-fonction du moteur (R1).

## 🤖 Phase 3 — Discord bot (~1-2 weeks)

Goal : pull the community into a shared space, increase organic discovery.

- Repo `claude-pokemon-bot` — Cloudflare Workers + Discord HTTP Interactions (no persistent process needed)
- Slash commands :
  - `/pokemon stats <pseudo>` — public stats
  - `/pokemon top` — server-scoped leaderboard
  - `/pokemon daily` — Pokémon-of-the-day (same for all servers, Wordle-style)
  - `/pokemon challenge <pseudo>` — triggers arena battle, posts replay link
  - `/pokemon link <code>` — link Discord account ↔ anon_id (one-time code generated in CLI)
- DM hooks : "you got challenged by X", daily Pokémon ready, shiny event in your team

## 🎨 Phase 4 — Portfolio (~1 weekend)

Goal : aggregate the ecosystem into a professional showcase.

- Custom domain (target ~10€/yr via Cloudflare Registrar — `bbruneau.dev` or similar)
- Subdomain mapping :
  - `bbruneau.dev` → portfolio homepage
  - `arena.bbruneau.dev` → Phase 2 site
  - `api.bbruneau.dev` → Worker (alias of `*.workers.dev`)
  - `bot.bbruneau.dev` → Discord bot endpoint
- Portfolio content :
  - Hero + project cards animated (CLI, Arena, Bot, API)
  - Live ecosystem stats (pulled from Worker API)
  - GitHub feed
  - Contact / about

## 🔮 Wishlist — not committed yet

- Pokémon breeding lab (egg crafting from team pairs)
- Trade marketplace player-to-player
- Weekly arena tournaments
- Custom user-defined themes (data.json plugin)
- Mobile companion (read-only PWA)
- Quests / weekly missions rotating
- Localization beyond FR/EN

## 📋 Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-05 | Combat engine = level 2 (types + HP + turns) | Level 1 too flat, level 3 overkill for beta |
| 2026-05-05 | Async battles (no real-time WebSocket) | WebSocket = leaving CF free tier (Durable Objects), async = ELO-style suffices |
| 2026-05-05 | Auth = `anon_id` + `arena_secret` (hash-stored, 32 hex local) | Privacy first, no PII, recovery via regenerate |
| 2026-05-05 | Web stack = Nuxt 4 + Vue 3 + UnoCSS | Best DX, CF Pages-native, solid ecosystem |
| 2026-05-05 | Visual direction = "modern + GameBoy soul" | Pure retro pixel-art ages poorly, hybrid keeps long-term appeal |
| 2026-05-05 | Free-tier subdomains for MVP, custom domain at Phase 4 | De-risk infra, buy domain when portfolio ready |
| 2026-05-05 | Phase order = 1 → 2 → 3 → 4 strict | Each phase grows audience for next, no parallel work |
| 2026-06-02 | Combat engine = 18 canonical types (was 5 collapsed) | Wilds/échangés en arène n'auraient aucune identité de type si on collapse ; un Dragon doit rester Dragon |
| 2026-06-02 | Lignée : résolution graceful (inconnu → normal) au lieu d'un whitelist | Ajouter une espèce ne doit jamais bloquer l'arène ni le partage de stats |
| 2026-06-02 | Species→type & learnsets = artefacts générés (wild_pool + snapshot PokéAPI), drift-checkés | Une seule source de vérité, zéro maintenance manuelle à 251 espèces, build offline déterministe |
| 2026-06-10 | Monorepo pnpm (ADR-005) — fin du submodule arène | `shared` devient le moteur consommé par CLI+worker+web ; le submodule est une friction et bloque les changements atomiques |
| 2026-06-10 | `shared` = source de vérité unique, moteur pur sans IO (ADR-006) | Résultats identiques CLI/worker/web par construction ; tue la duplication des règles bash↔TS = bottleneck #1 |
| 2026-06-10 | CLI migre bash → TS (ADR-007, remplace ADR-002) | La sync force l'unification des règles ; duplication = bottleneck ; Windows natif voulu |
| 2026-06-10 | Auth = GitHub OAuth + magic-link email, sessions opaques (ADR-008) | Public dev → "Sign in with GitHub" + device flow familier ; identité unifiée gratuite ; opaque = révocable, colle au pattern hash-en-KV |
| 2026-06-10 | Collection serveur-autoritaire = blob KV par user (ADR-009) | Accès toujours "ma collection" sans requête transverse → KV suffit ; cohérent ADR-004 |
| 2026-06-10 | Migration identité par liaison, jamais destruction (ADR-010) | Zéro perte pour les users existants ; anonyme local préservé ; idempotent + anti-takeover |

---

*Want to contribute, suggest a feature, or push back on a decision?*
*Open an issue : https://github.com/Benoit1108/claude-pokemon/issues*
