# CLAUDE.md

Instructions pour Claude Code lors du développement de **claude-pokemon**.

## Vue d'ensemble

Compagnon Pokémon persistant pour la `statusLine` de Claude Code, distribué via npm (`claude-pokemon`).

- **npm** : https://www.npmjs.com/package/claude-pokemon
- **GitHub** : https://github.com/Benoit1108/claude-pokemon
- **Install end-user** : `npx claude-pokemon install`

## Architecture

```
claude-pokemon/
├── bin/
│   ├── claude-pokemon         Node CLI dispatcher (entry npx)
│   ├── install.sh             Bootstrap ~/.claude/pokemon/, sprites, settings.json
│   ├── update.sh, uninstall.sh, status.sh, export.sh, import.sh
├── lib/
│   ├── lib.sh                 Tick logic, badges, archives, helpers (43 KB)
│   ├── statusline.sh          Rendu statusline (1 sortie par tick)
│   ├── pokemon-status.sh      Sous-commandes /pokemon (45 KB)
│   ├── data.default.json      ⚠️ GÉNÉRÉ — ne pas éditer (source = lib/data/**)
│   ├── data/                  Sources splittées par domaine
│   │   ├── config.json        Toggles, taux, scales, event_chances
│   │   ├── thresholds.json    XP par level (array 100 entries)
│   │   ├── seasons.json       Modificateurs saisonniers
│   │   ├── items.json, berries.json
│   │   ├── special/eevee.json Friendship + evolution_rules
│   │   ├── lineages/gen{N}.json    Lignées par génération
│   │   └── wild_pool/gen{N}.json   Wilds par génération
│   ├── build-data.sh          Concatène lib/data/** → lib/data.default.json (-S déterministe)
│   ├── locales/{fr,en}.json   UI strings i18n
│   └── extract_animations.py  Pipeline Python+PIL (canvas 96x96 centré)
├── skills/pokemon/SKILL.md    Slash command Claude Code
├── assets/demo.gif            GIF démo référencé dans le README
├── .demo/                     Scripts asciinema (regen reproductible du GIF)
└── .github/workflows/ci.yml   CI : shellcheck, JSON, build drift, install dry-run, npm pack
```

L'**état utilisateur** vit dans `~/.claude/pokemon/state.json` (préservé entre les `update.sh`).

## Conventions

- **Commits** : Conventional Commits (`feat:` / `fix:` / `chore:` / `ci:` / `docs:` / `refactor:` / `i18n:`)
- **Pas de Co-Authored-By** dans les commits
- **Pas de push** sur `main` sans validation explicite
- **PR workflow** (à partir de 2026-05-12) : feature branches off `main`, squash on merge. `main` branch-protected. Pre-push hook Claude Code lance les CI gates avant chaque push.
- **CHANGELOG discipline** : chaque PR ajoute une entrée dans `[Unreleased]` du `CHANGELOG.md`. Sections Keep-a-Changelog (`Added` / `Changed` / `Fixed` / `Removed` / `Security`). Au moment de bump une version, on renomme `[Unreleased]` → `[X.Y.Z] — YYYY-MM-DD`.
- **Strings UI** : toujours via `pokemon_t <key>` (jamais hardcoded en français/anglais)
- **Data** : éditer **uniquement** `lib/data/**`, jamais `lib/data.default.json` directement. Re-build avec `npm run build:data` (ou `bash lib/build-data.sh`) avant commit. CI échoue si la source diverge du build.
- **JSON keys** : ASCII uniquement, accents seulement dans les values
- **Backward-compat schema** : ajout de champs en `// {}` defaults dans jq (jamais retirer un champ de `state.json`)
- **printf format** : si plusieurs `%s`, vérifier le nombre d'args (printf cycle si trop d'args → bug fréquent qui duplique les sorties)

## Tests locaux

```bash
bash bin/install.sh                            # Bootstrap dans ~/.claude/pokemon/
bash bin/status.sh                             # Diagnostic
bash ~/.claude/pokemon-status.sh               # Vue principale
bash ~/.claude/pokemon-status.sh team          # Équipe
bash ~/.claude/pokemon-status.sh stats         # Stats
# … toutes les sous-commandes
bash bin/uninstall.sh --confirm                # Cleanup
```

## Mécaniques XP (`pokemon_tick`)

Source de vérité : `lib/lib.sh` `pokemon_tick()`. Logique :

1. **Per-tick delta** : `delta = max(0, current_tokens − last_tick_tokens)`. Pas de high-water mark — chaque tick mesure la croissance depuis le précédent. Auto-compaction → delta=0 mais `last_tick_tokens` redescend au floor courant, donc XP redémarre dès la prochaine croissance.
2. **Per-tick cap 10K tokens** (variable `tick_cap`) sur `delta` uniquement, max ~15K XP/tick après multiplicateurs. Anti-spike : empêche un seul gros message (lecture de N fichiers volumineux) de clear plusieurs niveaux. PAS de daily cap : la difficulté est gérée par la courbe des thresholds (cf. point 4) plutôt que par un plafond artificiel. `raw_delta` reste non-capé pour `lifetime_stats.total_tokens` (badge centurion).
3. **Multiplicateurs** (compoundés) : context (0.5×-2× selon used_pct), type_match (1.0×-1.2× par lignée), daily_bonus (×1.5 premier tick du jour UTC), status (×0.75 si tired = 5+ ticks ≥90% ctx), held_item, injured (×0.75 pendant 5 ticks après défaite combat), season.
4. **Threshold curve** (`lib/data/thresholds.json`, force-propagée via update.sh) : géométrique 1.205× Lv.1→16, puis 1.05× jusqu'à Lv.100. Ancres : Lv.1=300K (~0.5j normal dev), Lv.5=635K (~1.3j), Lv.16=5M (~1 sem normal dev), Lv.36=13.2M (~3 sem), Lv.100=300M (~1.5 an normal dev). Sans daily cap, la courbe seule gère la difficulté — heavy devs progressent naturellement plus vite, casual plus lentement.
5. **Détection 1M context** dans `statusline.sh` : si `model.display_name` contient "1M context" ou "(1M)", `default_window=1_000_000` (au lieu de 200K) pour le calcul fallback `tokens = used_pct × window_size`.

State fields (per-session) : `last_tick_tokens` (nouveau, source du delta), `max_context_tokens` (legacy, conservé pour stats). Migration douce : `last_tick_tokens // max_context_tokens // 0` au premier tick post-upgrade → pas de windfall.

Display statusline : `pokemon_render_inline` affiche **XP dans le niveau courant** (`X/Y`), pas le cumul absolu. Total cumulé visible via `/pokemon` (vue principale) et trainer-card.

## Mécaniques d'évolution Eevee (Lv.30)

Décision dans `lib.sh:840` (block dans `pokemon_tick`). Ordre :
1. **Pierre tenue** : `fire_stone` → Pyroli, `water_stone` → Aquali, `thunder_stone` → Voltali. Pierre consommée.
2. **Friendship ≥ seuil** (`eevee_friendship_threshold`, default 50) :
   - jour (UTC 6-17) → Mentali (Espeon)
   - nuit (UTC 18-5) → Noctali (Umbreon)
3. **Friendship < seuil** : fallback aléatoire vers une forme élémentaire (Aquali/Voltali/Pyroli) — sans pierre consommée. Justification : le système force l'évolution à Lv.30 (contrairement à canon où Évoli reste Évoli jusqu'à friendship élevée), donc on ne peut pas bloquer l'évolution.

Friendship est lifetime (pas reset sur hatch). Pour la plupart des players, le seuil 50 est atteint bien avant Lv.30 → branche fallback rarement déclenchée.

## Stats partagées (opt-in, anonymes) + Arena + Zones + Live PvP

Backend = Cloudflare Worker `claude-pokemon-api` dans `api/` (séparé du package npm). Stack moderne : TypeScript strict, vitest 312 tests, structure `handlers/` + `lib/` + `data/`. Storage : Cloudflare KV (free tier).

**Endpoints publics (read-only)** :
- `POST /v1/submit` — submit stats (rate-limited 24h par anon_id)
- `GET /v1/leaderboard?metric=X&limit=N`
- `GET /v1/aggregate`
- `DELETE /v1/forget?anon_id=X` (RGPD)
- `GET /v1/health`
- `GET /v1/trainer/<anon_id>` — public profile
- `GET /v1/badge/<anon_id>.svg` — embeddable README badge

**Endpoints arena PvP (Bearer auth via arena_secret)** :
- `POST /v1/arena/enable` (origin: cli|web — Sprint 4.2 ouvre le web signup)
- `POST /v1/arena/disable`, `regenerate`
- `POST /v1/arena/challenge`, `GET /v1/arena/opponents`, `GET /v1/arena/battle/<id>`
- `POST /v1/arena/battle/<id>/react`
- **`GET /v1/arena/whoami?anon_id=X`** (Sprint 5) — valide les credentials sans muter, alimente la page `/login` web

**Pair flow (CLI ↔ web)** :
- `POST /v1/arena/pair/init` (Bearer, CLI ou web) → code 6-char, TTL 5min
- `POST /v1/arena/pair/redeem` (code) → renvoie {anon_id, arena_secret}

**Live PvP** :
- `POST /v1/arena/live/invite`, `POST /v1/arena/live/<id>/{accept,forfeit,commit}`
- `GET /v1/arena/live/<id>` — état + timer

**Wild zones (Sprint 4.5+)** :
- `GET /v1/zones`, `GET /v1/zones/<id>`
- `POST /v1/zone/<id>/{explore,fight,flee}` (Bearer)
- `PATCH /v1/trainer/<id>/profile` (display_name, quote, bio, pinned_badges)

**Privacy** : pas de logs IP côté serveur, anon_id généré localement (8 hex via /dev/urandom), whitelist stricte sur les champs submit (extras rejetés). Arena_secret stocké hashé (sha256) + comparé en constant-time. Pas de stockage en clair.

**Deploy** :
```bash
cd api/
wrangler deploy
```

URL prod actuelle : `https://claude-pokemon-api.benoit-dev.workers.dev`.

CLI side : `view_stats_share`, `view_leaderboard`, `view_aggregate` dans `lib/pokemon-status.sh`. Endpoint configuré dans `lib/data/config.json.stats_share.endpoint`.

## Thèmes

`data.json.theme` contrôle l'accent UI (titres, gauges ≥75%, badges, ★ shiny) :
- `default` — gold (256-color 220)
- `dark` — electric cyan (51)
- `light` — sépia (94, lisible sur fond clair)
- `retro` — GameBoy green (46), + palette stage/type collapsée monochrome

`pokemon_theme_accent()` retourne le code ANSI du thème actif. `pokemon_ansi_color()` et `pokemon_type_color()` branchent en mode `retro` pour produire l'effet GB.

## Pièges connus

### Côté bash CLI

- **Cursor positioning ANSI dans statusline** : Claude Code strippe le leading whitespace + ignore `\033[<col>G` sur lignes vides. Workaround : anchor char `\033[2;30m·\033[0m` en début de ligne pour forcer la préservation.
- **Animations** : désactivées par défaut, frames extraites via Python+PIL (canvas 96x96 centré). Opt-in via `enable_animations: true` dans `data.json`.
- **Sprite alignment 32x16** : utiliser `pokemon_trim_sprite` qui calcule le min_lead et le strip uniformément (préserve l'alignement relatif).
- **`%-22s` byte-padding** casse sur Unicode (accents = 2 bytes mais 1 char). Utiliser `pokemon_t_pad` (basé sur `LC_ALL=C.UTF-8 wc -m`).
- **`shellcheck SC1087`** : `jq ".$var..."` est interprété comme expansion d'array. Toujours utiliser `jq --arg f "$var" '.[$f]...'`.

### Côté worker (`api/`)

- **`prepare: husky` dans package.json** : casse `cd api && npm ci` en CI (la sous-shell workspace exécute le prepare root sans avoir husky dans son node_modules). On a remplacé husky par un hook Claude Code → plus de prepare-lifecycle. Si jamais on réintroduit husky, mettre `"prepare": "husky || true"`.
- **Workspace + npm ci depuis api/** : npm trouve la package.json root et exécute son prepare. Sentinel = `"command not found: husky"` au milieu d'un install api.
- **`scheduled_tasks.lock` dans `.claude/`** : runtime lockfile du système ScheduleWakeup. Doit être gitignoré (déjà fait), pas commit.

## Tests & CI

### Tests locaux

**API (TypeScript)** :
```bash
cd api/
npm test                   # vitest run (312 tests)
npm run test:coverage      # avec couverture v8
npm run typecheck          # tsc --noEmit
npm run lint               # eslint src --ext .ts
npm run format:check       # prettier check
```

**CLI (bash)** :
```bash
npm test                   # bats tests/cli/
bash bin/install.sh && bash bin/status.sh
```

### Hook pre-push (Claude Code, auto)

`.claude/hooks/pre-push.sh` intercepte tout `git push` lancé via outil Bash et lance `npm run ci:pre-push` (`scripts/ci-pre-push.sh`) :

1. `jq empty` sur tous les JSON sources + locales
2. `shellcheck -S error` (si installé)
3. `bash lib/build-data.sh` + diff check (data.default.json en sync)
4. `api/` : ESLint, Prettier, tsc --noEmit, vitest 312

Bypass : `git push --no-verify` ou `--dry-run`. **Ne PAS bypass sans demande explicite user.**

### GitHub Actions CI

`.github/workflows/ci.yml` valide à chaque push :
1. **Lint bash** (`shellcheck -S error`) sur tous les scripts publiés
2. **Validate JSON** (`jq empty`) + parité des clés FR/EN dans les locales
3. **Install dry-run** (`bash -n`, vérifie présence des fichiers requis)
4. **CLI smoke tests** (bats)
5. **Worker — ESLint + TypeScript + Prettier**
6. **Worker — Vitest + coverage**
7. **npm pack --dry-run**

## Companion web : claude-pokemon-arena

Le site public lié vit dans un repo voisin `~/repositories/perso/claude-pokemon-arena/`. Il consomme **ce** worker (`api/`) via SSR Nuxt. Le shared package `claude-pokemon-shared/` est exposé en workspace npm et linké depuis l'arena via git submodule.

- **Arena prod** : https://claude-pokemon-arena.pages.dev/
- **Workflow déploiement complet** (CLI + web simultanés) :
  1. Modifs api/ ou shared/ ici → `cd api/ && wrangler deploy`
  2. Push main ici → submodule pointer à jour
  3. Côté arena : `git submodule update --remote vendor/claude-pokemon && git add vendor && git commit -m "chore: bump shared submodule"`
  4. Push main arena → CF Pages auto-deploy

## Workflow de publish npm

Voir `.demo/record.sh` pour la régénération du GIF démo.
Pour publier une nouvelle version, voir le workflow détaillé dans `CONTRIBUTING.md`.

## Documentation complémentaire

- [`README.md`](README.md) — features, install, prerequisites
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup local, types de contributions, conventions
- [`CHANGELOG.md`](CHANGELOG.md) — historique des versions
