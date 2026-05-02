# Changelog

All notable changes to claude-pokemon will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — Semver.

## [Unreleased]

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
