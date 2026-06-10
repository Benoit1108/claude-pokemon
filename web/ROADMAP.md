# Roadmap

The arena is **Phase 2** of the broader `claude-pokemon` ecosystem. The
authoritative roadmap (Phases 1 → 4 + decisions log) lives in the CLI repo :

→ **[claude-pokemon/ROADMAP.md](https://github.com/Benoit1108/claude-pokemon/blob/main/ROADMAP.md)**

## Where we are

- Phase 2.1 → 2.10 : **shipped** (Nuxt scaffolding through real-time PvP)
- Phase 2.11 (pokédex-driven achievements) + 2.12 (sound theme switcher, easter eggs, QR sync) : **not started**
- Phase 2.13+ stretch — partial : **i18n FR/EN web** done (Sprint 5)
- Sprint 5 polish + recovery-key sign-in : **shipped** (see [CHANGELOG.md](./CHANGELOG.md))
- Phase 2.14 (wild & traded Pokémon en arène, chart 18 types) — web side **shipped** : per-type rendering for non-starter lineages (`app/utils/lineage.ts`). Engine/worker side in the CLI repo.
- Phase 2.15 (refonte scène de combat) — **shipped** : `BattleStage` sur 9 décors anime-style par environnement (dérivés du type adverse / `scene="arena"`), Pokémon posés en diagonale sur le cercle de combat central (ancres communes, cohérentes sur tous les fonds). Sprites corrects pour les wilds (`trade-*` → species sprite) **shipped**. (Reste éventuel : même fix côté CLI `lib/` pour la statusline si un wild y est actif.)

## What's next for this repo

In rough order :

1. **Phase 2.11** — Pokédex-driven achievements. **Web side shipped** : "Pokédex achievements" section on `/trainer/[anonId]` (completion bars per gen, milestones, legendaries-seen grid), computed client-side from the already-served `pokedex_seen_ids` — no worker/CLI change needed. (Optional later : dedicated earned _badges_ for these in the CLI `pokemon_check_badges()`.)
2. **Phase 2.12** — Easter eggs + sound themes + CLI ↔ web QR sync. **Sound theme 3-state cycle (silent / 8-bit / orchestral) shipped** ; Konami code already done. Dropped for now : 10× logo click, `?secret=` URL param. Remaining : CLI ↔ web QR pairing flow (CLI side shipped in the claude-pokemon repo).
3. **Phase 3** — Discord bot (new repo `claude-pokemon-bot`, Cloudflare Workers + HTTP Interactions). Not started.

See [CHANGELOG.md](./CHANGELOG.md) for what's been delivered.
