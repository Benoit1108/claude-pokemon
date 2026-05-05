# Changelog

All notable changes to claude-pokemon will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — Semver.

## [Unreleased]

### Added

- **Master badges Gen 2** : 3 nouveaux badges débloqués à Lv.100 sur les lignées Johto (`master_chikorita` 🍃, `master_cyndaquil` 🦔, `master_totodile` 🐊). Total badges 12 → 15.
- **Wild_pool Gen 2** : 100 nouveaux Pokémon (#152-251) dans le Pokédex (Johto). Distribution : 92 common, 2 rare (Heracross, Tyranitar), 6 legendary (Raikou, Entei, Suicune, Lugia, Ho-Oh, Celebi). Pokédex passe à 251 entries. Propagation forcée via `update.sh` aux installs existants.
- **Thèmes UI** : `data.json.theme` contrôle l'accent (titres, gauges, badges, étoiles shiny). 4 thèmes — `default` (gold), `dark` (electric cyan), `light` (sépia, fond clair), `retro` (GameBoy green + palette monochrome stages+types). Aucun changement de comportement par défaut.

### Changed

- **Eevee evolution canonique** : à Lv.30 sans pierre tenue, le choix Mentali (Espeon) / Noctali (Umbreon) est désormais gated par `eevee_friendship_threshold` (default 50). Friendship ≥ seuil + jour (UTC 6-17) → Mentali, ≥ seuil + nuit → Noctali. En dessous du seuil, fallback aléatoire vers une forme élémentaire (Aquali/Voltali/Pyroli) puisque le système force l'évolution à Lv.30. La règle des pierres tenues reste prioritaire. Pour la plupart des users, friendship dépasse 50 bien avant Lv.30 → comportement inchangé en pratique.

### Added (suite)

- **Mini-jeu `/pokemon game`** : « Devine le Pokémon ». Tirage aléatoire dans le wild_pool 251 entries, indices type/lettres/initiale/génération. `/pokemon game` (start ou rappel hints), `/pokemon game <nom>` (submit), `/pokemon game skip` (annule sans pénalité), `/pokemon game help`. Bonne réponse = +500 XP + 2 amitié sur le compagnon actif. Cooldown 15 min entre quiz complétés (correct ou wrong, pas skip) pour éviter le grind. Comparaison de nom case-insensitive et accent-insensitive (iconv ASCII translit). Stats `games_won` et `games_played` dans `lifetime_stats`.
- **Stats partagées (opt-in)** : nouveau backend Cloudflare Worker (`api/` dans le repo) hébergeant un endpoint REST anonyme. Les users qui activent `/pokemon stats-share enable --confirm` reçoivent un anon_id local (8 hex) et peuvent submit leurs stats lifetime + actives 1×/24h. `/pokemon leaderboard <metric>` affiche le top N (total_tokens, total_shinies, max_level, badges_count, games_won, etc.). `/pokemon aggregate` montre les stats globales : nombre de players, tokens cumulés, taux shiny réellement observé, distribution des lignées actives. Privacy : aucune IP loggée serveur-side, anon_id non lié à l'identité, whitelist stricte côté Worker, droit de suppression via `/pokemon stats-share forget` (RGPD). Free tier Cloudflare Workers + KV (1K writes/jour = ~1000 daily submitters).

## [1.0.0-beta.3] — 2026-05-04

### Changed

- **Balance** : seuil d'éclosion de l'œuf réduit de 500 000 → 300 000 XP. Le palier reste un "rite de passage" (~6× l'écart Lv.1→Lv.5) mais devient atteignable dans la première journée d'utilisation réelle. Propagation automatique aux installations existantes via `update.sh` (game-design constant, override les valeurs user).
- **Architecture** : `lib/data.default.json` devient un artefact généré. Sources splittées par domaine dans `lib/data/**` (config, lineages par gen, wild_pool par gen, items, etc.). Build via `npm run build:data` (ou `bash lib/build-data.sh`). CI vérifie qu'aucun PR ne laisse l'artefact desyncé. Aucun impact end-user.
- **Tracking version** : `data.default.json.version` (ancien int 4 manuellement bumpé) auto-injecté depuis `package.json.version` au build. Single source of truth, `jq .version ~/.claude/pokemon/data.json` mappe désormais directement sur un release npm.

### Added

- **Gen 2 starters (Johto)** : 3 nouvelles lignées Pokémon disponibles via `starter_pick: random` ou `/pokemon hatch <chikorita|cyndaquil|totodile>` :
  - `chikorita` : Œuf → Germignon → Macronium → Méganium
  - `cyndaquil` : Œuf → Héricendre → Feurisson → Typhlosion → Typhlosion d'Hisui (forme régionale Feu/Spectre lvl 55)
  - `totodile` : Œuf → Kaiminus → Crocrodil → Aligatueur

### Fixed

- `bin/update.sh` annonçait "re-fetch sprites" mais ne le faisait pas. Les utilisateurs existants qui mettent à jour avec de nouvelles lignées avaient data.json mais pas les sprites correspondants. Correction : fetch des sprites manquants après le merge.
- `/pokemon stats` affichait "Lignées complétées : N / 5" en hardcodé. Devient dynamique sur le total réel (8 désormais avec Gen 2).

### Removed

- `hatch_cost_tokens` du config (doublon redondant avec `thresholds[1]`)
- `xp_per_token_scale` du config (jamais lu par le runtime, multiplicateurs runtime déjà câblés via context/type/daily/status)

## [1.0.0-beta.1] — 2026-05-02

First public beta. Full feature set ready for testing.

### Added

**Core gameplay**
- 5 starter lineages (Bulbasaur, Charmander, Squirtle, Pikachu, Eevee)
- Pokémon-canonical XP curve (Medium Slow, Lv.0 → Lv.100)
- Canonical evolution levels (Lv.16, Lv.32-36, Lv.55, Lv.100 for mega forms)
- Eevee Lv.30 split with stone/day-night logic (5 forms : Vaporeon, Jolteon, Flareon, Espeon, Umbreon)

**Team management**
- Team (max 6) + unlimited PC storage
- `/pokemon switch <slot>`, `hatch`, `deposit`, `withdraw`, `release`, `give`, `take`, `trade`
- Trade simulation : 1 random Gen 1 Pokémon per day, 5% shiny chance
- Manual switch retains compagnon state (XP, evolution history, etc.)

**Pokédex**
- Gen 1 (151 Pokémon) wild encounter pool
- National dex numbers + types + rarity (legendary marker)
- Localized names (FR/EN)

**Achievements & Stats**
- 12 badges (lifetime persistent)
- Friendship counter (+1 per tick)
- Lifetime stats (tokens, evolutions, shinies, max level, lineages completed)

**Bonus mechanics**
- Daily bonus (+50% XP first tick of day)
- Type matchup multipliers (lineage × context %)
- Status effects (tired after 5+ ticks at >90% context)
- Shiny Charm (×1.25 chance after first shiny)
- Shiny Hunter mode (×5 chance, XP frozen)
- Berry events (0.5%/tick, +XP boost)
- Encounter rare (0.1%/tick, adds to wild pokédex)
- Battle simulé (30% of encounters → win/lose, XP bonus or injured status)
- Held items (XP Charm, Lucky Egg, Soothe Bell, Berry)
- Saisonal events (Halloween, Christmas — ×1.5 XP)

**UI / UX**
- Sprite ANSI rendering via chafa (32x16 for `/pokemon`, 24x12 for statusline)
- Animations support (5 idle frames, opt-in via `enable_animations: true`)
- Unicode borders (`╭─ TITLE ─╮`) around `/pokemon` sections
- i18n (FR + EN, switch via `data.json.language`)
- Anchor padding for proper sprite alignment in statusline

**Distribution**
- npm package `claude-pokemon` with CLI : `install`, `update`, `uninstall`, `status`, `export`, `import`
- Automatic dependency check (jq, chafa, flock, curl, optionally Python+Pillow)
- Non-destructive `~/.claude/settings.json` patching
- Backup before any destructive op

### Known limitations

- Statusline animations only advance on user interaction (no idle ticks — Claude Code limitation)
- 7 Pokémon don't have animated GIFs on Showdown (egg, mega/gmax forms) → fallback to static
- Cursor positioning `\033[<col>G` works only on lines with preceding content in Claude Code's renderer (workaround : anchor char prefix)

### Tested on

- Ubuntu 24.04 / bash 5.2 / Claude Code 2.1.123
- Locale `en_US.UTF-8` and `fr_FR.UTF-8`
