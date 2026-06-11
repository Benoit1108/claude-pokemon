# Changelog

All notable changes to claude-pokemon will be documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — Semver.

## [Unreleased]

### Added

- **`pokemon login` / `pokemon logout` (CLI)** (Phase R2d). `/pokemon login` lance le **device flow GitHub** : affiche le code + `github.com/login/device`, attend l'autorisation (polling), échange le token GitHub via `POST /v1/auth/github/cli-session` et stocke la **session opaque** dans `~/.claude/pokemon/.session` (chmod 600, comme l'`arena_secret`). `/pokemon logout` révoque la session (serveur best-effort + local). client_id public de l'app prod, surchargeable via `POKEMON_GITHUB_CLIENT_ID` pour le dev. Prérequis : *Device Flow* activé sur l'app OAuth + worker déployé. Smoke tests bats (chemins offline). La même identité GitHub que le web → compte unifié (lier l'anon via le web `/link` ou plus tard côté CLI).
- **UI « Lier mon compte CLI »** (Phase R2 — réconciliation web). Nouvelle page `/link` (accessible depuis le `UserMenu` quand on est connecté GitHub) : on saisit son `anon_id` + `arena_secret`, le front appelle `/v1/auth/link-anon` (preuve de possession + liaison au user GitHub), puis **persiste la session arène localement** → `/profile` fonctionne immédiatement avec le compte lié. `ApiClient.linkAnon` (+ tests), `useAuthSession` expose `sessionToken`, i18n FR/EN. Mappe les erreurs (déjà lié 409, secret invalide 401, introuvable 404).
- **Session CLI via device flow GitHub — côté Worker** (Phase R2d). `POST /v1/auth/github/cli-session` : la CLI fera le **device flow** GitHub elle-même (client_id public, sans secret) pour obtenir un access token, puis le postera ici → le Worker résout l'utilisateur GitHub (`fetchGithubUser` + `findOrCreateUserByIdentity`) et émet une session opaque, exactement comme le flux web. Codes : 400 `missing_token`/`invalid_body`, 401 `github_auth_failed`. 3 tests (fetch mocké). (La commande `pokemon login` en bash branchera cet endpoint — étape suivante.)
- **État de connexion GitHub visible dans l'UI** (intégration R2c). Le `UserMenu` affiche « Connecté en tant que @login » + un bouton « Se déconnecter » (révocation serveur via `useAuthSession.signOut`) dès qu'une session GitHub est active. Le callback OAuth atterrit désormais sur `/` (au lieu de `/profile`, qui rebondit vers `/pair` faute de session arène). Première brique d'unification des deux sessions (web GitHub ↔ arène anon_id) ; l'UI « lier mon compte CLI » suit.
- **Lier un compte CLI (anon_id) à un compte GitHub** (Phase R2f, ADR-010). `POST /v1/auth/link-anon` (Bearer session) prouve la possession du compte anonyme legacy via l'`arena_secret` (même check que `whoami`), puis ajoute l'`anon_id` à `user.linked_anon_ids` — **idempotent** et **anti-takeover** (409 `already_linked` si l'`anon_id` est déjà rattaché à un autre user, via le reverse-map KV `anonlink:<anon_id>`). C'est le pont qui unifie compte web (GitHub) et compte CLI (anon_id), **prérequis de la collection synchro (R4)**. Codes : 401 `missing_bearer`/`invalid_session`/`invalid_secret`, 400 `invalid_anon_id`/`invalid_body`, 404 `anon_not_found`, 409 `already_linked`. 7 tests. (L'UI web « lier mon compte CLI » + le login CLI viendront brancher cet endpoint.)
- **Durcissement auth post-revue de code**. `POST /v1/auth/logout` (Bearer) révoque la session côté serveur (`deleteSession`, idempotent) — branché dans `useAuthSession.signOut` (le token n'était sinon jamais révoqué avant son TTL 30j). `POST /v1/auth/github/exchange` valide désormais le `redirect_uri` contre une **allowlist** (host `claude-pokemon-arena.pages.dev` ou `localhost` + path `/auth/github/callback`) et borne la longueur du `code`. `linkAnonToUser` pose le verrou `anonlink:` **avant** de muter le user et gère le pointeur orphelin (réduit la fenêtre de race KV). Le callback web valide la forme du `session_token` reçu avant de le persister.
- **Sign-in web « Continuer avec GitHub »** (Phase R2c, ADR-008). Bouton sur `/login` → redirection OAuth (client_id public **env-aware** : app dev en local, app prod au build ; `state` CSRF en `sessionStorage`). Nouvelle page `/auth/github/callback` qui vérifie le `state`, poste le `code` à `/v1/auth/github/exchange` et stocke la **session opaque** (`useAuthSession`, localStorage `arena-auth-v1`). Helpers purs `app/utils/auth.ts` (URL d'autorisation, validation du blob stocké) testés. i18n FR/EN. Distinct de l'`useArenaSession` legacy (anon_id/arena_secret) — la réconciliation des deux identités = R2f.
- **GitHub OAuth — échange côté Worker** (Phase R2b, ADR-008). Endpoint `POST /v1/auth/github/exchange` : le web fait la redirection GitHub (client_id public, `state` CSRF vérifié côté client) puis poste le `code` au Worker, qui l'échange contre un access token (avec le `client_secret`, jamais exposé), résout l'utilisateur GitHub via `findOrCreateUserByIdentity('github', …)` et émet une session opaque. `lib/github.ts` (wrappers fetch testables). Codes : 400 `missing_code` / `missing_redirect_uri`, 503 `github_oauth_unconfigured`, 401 `github_auth_failed`. **Nécessite côté Worker** `GITHUB_CLIENT_ID` (var wrangler) + `GITHUB_CLIENT_SECRET` (`wrangler secret put`) ; sans eux → 503 (zéro impact tant que non configuré). 4 tests (fetch mocké). Endpoint `POST /v1/auth/github/exchange` : le web fait la redirection GitHub (client_id public, `state` CSRF vérifié côté client) puis poste le `code` au Worker, qui l'échange contre un access token (avec le `client_secret`, jamais exposé), résout l'utilisateur GitHub via `findOrCreateUserByIdentity('github', …)` et émet une session opaque. `lib/github.ts` (wrappers fetch testables). Codes : 400 `missing_code` / `missing_redirect_uri`, 503 `github_oauth_unconfigured`, 401 `github_auth_failed`. **Nécessite côté Worker** `GITHUB_CLIENT_ID` (var wrangler) + `GITHUB_CLIENT_SECRET` (`wrangler secret put`) ; sans eux → 503 (zéro impact tant que non configuré). 4 tests (fetch mocké).
- **Fondation auth Worker** (Phase R2a, ADR-008/010). Modèle identité+session côté Worker, **provider-agnostic** : `lib/auth.ts` émet un **token de session opaque** (hashé en KV `session:<hash>`→user_id, TTL 30j — le token clair n'est jamais stocké, révocable en supprimant la clé) ; `findOrCreateUserByIdentity` mappe `identity:<provider>:<id>`→`user:<id>` stable ; `UserRecord` porte `linked_anon_ids` (prêt pour la migration ADR-010). Nouvel endpoint `GET /v1/auth/session` (whoami par session). GitHub OAuth (R2b) et magic-link email (R2e) viendront s'y brancher. **Aucun flux de login encore → zéro impact prod.** 9 tests.
- **Dev local isolé de la prod** (post-monorepo). `npm run dev` à la racine lance le worker local (`wrangler dev`, KV **local**) **et** le web ensemble (via `concurrently`). L'`apiBase` du web cible automatiquement le worker **local** (`http://localhost:8787`) en dev et le worker **déployé** au build prod (`NODE_ENV`) — donc les comptes/données créés en testant ne touchent plus la prod. Surchargeable via `NUXT_PUBLIC_API_BASE`. Corrige le fait que `npm run dev` tapait jusqu'ici le worker de prod par défaut.
- **Filet de tests golden** (Phase R0 — refonte). `tests/golden/capture.sh` fige le comportement du moteur bash (courbe XP, niveau depuis l'XP, résolution d'évolution incl. formes Eevee, multiplicateurs de contexte) en fixtures JSONL (`tests/golden/fixtures/`). `tests/cli/golden.bats` re-capture et diffe contre les fixtures → toute dérive de `lib.sh` casse la CI. Ces fixtures sont le **contrat** que le port du moteur en TypeScript (`packages/shared`, ADR-006/007) devra reproduire à l'identique. Voir `docs/architecture.md` (ADR-005→010) + `ROADMAP.md` (Phase R).
- **Moteur de règles en TypeScript — courbe XP, multiplicateurs, évolution** (Phase R1b, ADR-006). Le calcul des règles est porté de bash vers `claude-pokemon-shared` en fonctions **pures** : `thresholdFor`/`levelFromXp`/`xpToNext`/`progressPct` (`shared/src/xp.ts`), `xpMultiplier`/`typeMatchMultiplier`, et `stageFor` étendu d'un param `eeveeForm`. Vérifié **ligne-pour-ligne** contre les fixtures golden R0 (`shared/tests/golden-parity.test.ts`, 42 tests). Le `evo_field` matche les 8 lignées → `LINEAGE_STAGES` était déjà aligné sur les données bash. **Pas encore consommé par la CLI** (le bash garde sa logique ; le branchement bash↔TS = R1c) — c'est la dé-duplication des règles côté source de vérité.
- **QR de pairing dans le terminal** (Phase 2.12). `/pokemon arena pair` affiche maintenant, en plus du code + lien, un **QR scannable** du lien `…/pair?code=XXX` (rendu via `qrencode -t ANSIUTF8`) — on scanne avec le téléphone pour ouvrir la page `/pair` (qui appaire le navigateur) sans retaper l'URL. `qrencode` est **optionnel** : s'il n'est pas installé, on garde le lien + une astuce pour l'activer (aucune dépendance dure ajoutée). Locales FR/EN (`pair.qr_label`, `pair.qr_hint`).

- **⚔️ Wild & traded Pokémon en Arène + chart 18 types** (Phase 2.14). N'importe quel Pokémon élevé dans le CLI (sauvage capturé, échangé `trade-*`, ou forcé à la main) peut désormais entrer en arène — plus seulement les 8 lignées de starters.
  - **Moteur de combat `shared` étendu des 5 types collapsés aux 18 types canoniques** : un Dragon reste Dragon, un Spectre reste Spectre. `TYPE_CHART` est maintenant la matrice 18×18 Gen-6+ (construite à partir d'une table sparse de matchups) avec les **vraies immunités 0×** (Normal⇄Spectre, Sol→Vol, Électrik→Sol, Dragon→Fée…). Un coup immunisé fait 0 dégât ; un matchup mutuellement immunisé se décide au % HP au `turn_limit`. Backward-compat : les matchups starters d'origine (Feu>Plante>Eau>Feu, Électrik>Eau) sont inchangés → les replays historiques restent déterministes.
  - **Résolution de type générée depuis `lib/data/wild_pool`** (source unique de vérité, 251 espèces) : nouveau `shared/src/species-combat-type.generated.ts` + `lineageToCombatType()` (starter connu → mapping ; sinon strip `trade-` → species map → fallback `normal`). La table partielle hand-maintenue côté worker (`species-types.ts`) est supprimée au profit d'un re-export.
  - **Movesets réels par learnset** (comme le vrai jeu) : pipeline PokéAPI → snapshot commité minimal (`shared/data/pokeapi-learnsets.snapshot.json`, rafraîchi manuellement via `npm run fetch:pokeapi`) → générateur offline déterministe → `learnsets.generated.ts` (302 moves bilingues, 251 learnsets level-gated). `movesForParticipant()` sert les moves curatés pour les starters, et pour tout autre espèce les 4 derniers moves offensifs appris ≤ niveau (≥1 STAB garanti). Live PvP `lookupMoveForSide` utilise désormais ce pool (gère les wilds).
  - **Validation lignée ouverte** : le whitelist strict des 8 starters (`ALLOWED_LINEAGES`) est remplacé par un format-check `LINEAGE_RE` (`/^[a-z][a-z0-9-]{1,32}$/`) côté worker (arena enable + submit). Un Pokémon hors-starter ne bloque plus ni le partage de stats ni l'inscription arène.
  - **Build & CI** : `npm run build:data` régénère aussi les artefacts shared (species types + learnsets), avec drift-check ajouté au pre-push et à GitHub Actions (job `shared-tests` + étape de sync).

### Fixed

- **Message d'erreur `/pokemon arena enable` lisible** : en cas d'échec, le CLI affichait le JSON brut de la réponse serveur (cause de confusions du type « c'est le pseudo ? »). Il parse maintenant le code d'erreur (`validation` → détails joints, `already_enabled` → message dédié) et n'affiche le corps brut qu'en dernier recours.
- **Courbe XP rééquilibrée** (gros fix bug). La spec d'origine annonçait "ratio géométrique 1.205× Lv.1→16 puis 1.05× Lv.16→100" appliqué sur les **thresholds cumulés**, ce qui produisait des deltas marginaux qui **diminuaient** au-delà de Lv.16 : 855K XP pour aller de Lv.15 à Lv.16, puis 250K seulement pour Lv.16→17 (chute de 3.4×). Les niveaux 17 à 100 étaient progressivement plus faciles, contrairement au principe annoncé. Nouvelle courbe propre :
  - **Lv.0→1 = 1,000,000 XP** (œuf, one-shot hatching cost — narrativement séparé)
  - **Phase A** (Lv.1→16) : delta démarre à 202K (Lv.1→2), ratio **1.143× sur les deltas** par niveau. Lv.5 ≈ 2M, Lv.10 ≈ 4.3M, **Lv.16 = 10M**.
  - **Phase B** (Lv.16→100) : delta continue de croître avec ratio **1.021× par niveau**. Lv.36 ≈ 43M, Lv.55 ≈ 90M, **Lv.100 = 312M**.
  - **Deltas monotones croissants** de Lv.1 à Lv.100 (seule l'éclosion est non-monotone par design).
  - Migration automatique : `update.sh` force-propage les nouveaux thresholds, le clamp-down existant dans `pokemon_tick` (`lib.sh:631`) ajuste le niveau affiché au prochain tick. Le `total_xp` est préservé.
  - **Notice one-shot** affiché dans `/pokemon` après upgrade pour expliquer la régression de niveau. Idempotent via `state.xp_rebalance_v2_acknowledged: true`. Les nouveaux installs sont seedés avec le flag set, donc skip le notice.

### Changed

- **Docs alignées sur le monorepo**. `web/CLAUDE.md` purgé des références au submodule `vendor/` (obsolète) : `shared`/`api` sont des packages workspace, section *Deploy* mise à jour (CF Pages root `web/`, build `npm run -w web build`). README racine : nouvelle section *Architecture* décrivant le monorepo (root = CLI npm, + `shared/ api/ web/`) et confirmant que le package npm publié ne contient **que** le CLI.
- **Monorepo : l'arène web rejoint le repo** (Phase R1a, ADR-005). Le site `claude-pokemon-arena` est fusionné ici sous `web/` (historique préservé via `git subtree`) et ajouté aux workspaces npm (`["api","shared","web"]`). Le **submodule `vendor/claude-pokemon` est supprimé** : `web` consomme désormais `claude-pokemon-shared` comme dépendance workspace (`"*"`) au lieu de `file:./vendor/claude-pokemon/shared`. Plus besoin de `git submodule update --init`. Reste de R1a : unifier la CI (un seul workflow) et reconnecter Cloudflare Pages au repo monorepo (*root directory* = `web/`). ADR-005 amendé : on reste sur **npm workspaces** (pas pnpm — aucun bénéfice fonctionnel ici).
- **SVG badge enrichi** (`/v1/badge/<anon_id>.svg`). Affiche maintenant `⚔️` à côté de la lignée+niveau si le dresseur est inscrit dans le pool arena (handler interroge `getArena` en plus de `getStats`, ~1 KV read en plus). La ligne stats du bas inclut le compteur Pokédex `📖 X/251` (donnée déjà dans le payload submit, juste pas exploitée). Layout serré pour rester dans 480 px : retrait du label "tokens" sous-entendu par l'icône `⚡`.

## [1.0.0-beta.6] — 2026-05-06

### Added

- **🌐 Web arena live** : la première page du site compagnon est en ligne sur [claude-pokemon-arena.pages.dev](https://claude-pokemon-arena.pages.dev/) (Sprint 1 de Phase 2). Affiche le leaderboard live, les stats globales et la distribution des lignées actives, le tout fetché en SSR depuis le Worker API existant. Stack Nuxt 4 + Vue 3 + UnoCSS sur Cloudflare Pages free tier. Repo séparé : [Benoit1108/claude-pokemon-arena](https://github.com/Benoit1108/claude-pokemon-arena). Browser-friendly = ouvre la porte aux utilisateurs Windows / mobile pour le côté social sans installer la CLI. Sprint 2.2/2.3/2.4 (trainer pages, battle replay, animations) à venir.
- **⚔️ Arena async PvP** (Sprint 2.3) : 6 endpoints Worker `/v1/arena/*` (enable, disable, regenerate, challenge, opponents, battle/:id) avec auth Bearer (arena_secret 128 bits, sha256 stocké, comparaison constant-time, cooldown 1h challenge). Moteur de combat pur déterministe (PRNG mulberry32 seeded → battles rejouables) avec table de types (fire>grass>water>fire, electric>water, eevee neutre), dérivation HP/Atk depuis level, ±15% variance, 6.25% crit, 50 tours max. CLI `/pokemon arena {enable,disable,regenerate,challenge,opponents,battle,status}` avec arena_secret en chmod 600 dans `~/.claude/pokemon/.arena-secret`. Web `/arena` (liste publique du pool) et `/battle/[id]` (replay tour-par-tour avec scene + log + winner banner). 80 tests Vitest sur le Worker (153 total, 93% coverage), 16 tests sur l'arena Nuxt (75 total).

### Changed

- **Windows UX guidance** : retrait de la whitelist `os: ["linux", "darwin"]` dans package.json (l'install npm passe maintenant sur Windows). À l'exécution, `bin/claude-pokemon` détecte Windows pure (non-WSL) et affiche un message friendly guidant vers WSL au lieu de l'`EBADPLATFORM` cryptique de npm. Section `## Windows users` ajoutée au README. Native Windows reste non-supporté (besoin de bash + chafa + flock + paths POSIX), WSL fonctionne parfaitement.

### Fixed

- **Système XP refondu** (3 bugs corrigés + recalibration courbe).
  (1) **Per-tick delta** remplace le high-water mark cassé : `pokemon_tick` calculait `delta = current − max_ever_for_session`, donc une fois le pic de contexte atteint, plus aucune XP ne tombait tant qu'on ne le dépassait pas — et l'auto-compaction de Claude Code rendait ça quasi-impossible. Nouveau : `delta = current − last_tick_tokens`. Chaque interaction qui fait croître le contexte donne du XP, et l'auto-compaction ne bloque plus le flux. Migration douce : `last_tick_tokens` se seed depuis l'ancien `max_context_tokens`, pas de windfall.
  (2) **Détection 1M context** : `statusline.sh` fallback hardcodé à 200K plafonnait les users Opus 4.7 / Sonnet 4.6 1M. Détection via `model.display_name` ("1M context" / "(1M)") → `default_window=1,000,000`.
  (3) **Anti-spike cap 10K tokens/tick** : empêche un seul gros message (lecture de N fichiers volumineux) de clearer plusieurs niveaux. `raw_delta` reste non-capé pour le badge centurion 100M tokens.

- **Courbe XP recalibrée** (anchors `1 jour = 1 éclosion` + `1 semaine = Reptincel pour devs normaux`). Two-phase géométrique : ratio 1.205 Lv.1→16, puis 1.05 Lv.16→100. Ancres :

  | Niveau | XP | Dev normal (600K XP/j) |
  |---|---|---|
  | Lv.1 (œuf éclos) | 300K | ~0.5 jour |
  | Lv.5 | 635K | ~1.3 jours |
  | Lv.16 (Reptincel) | 5M | ~8 jours ≈ 1 semaine |
  | Lv.36 (Dracaufeu) | 13.2M | ~3 semaines |
  | Lv.100 (champion) | 300M | ~1.5 an |

  Pas de daily cap : la difficulté est gérée par la courbe seule. Heavy devs (500K+ tokens/j) progressent naturellement plus vite, casual users plus lentement — pas de plafond artificiel qui frustre les sessions intenses. Force-propagée via update.sh.

- **Affichage statusline relatif au niveau** : la barre XP affichait `Lv.13 904.4K/983.6K 24%` (cumulé absolu) — peu lisible et différent de la convention des jeux Pokémon. Maintenant `Lv.13 26K/79K 24%` : XP **dans** le niveau / XP nécessaire pour le niveau suivant. Total cumulé reste visible via `/pokemon` (vue principale) et la trainer card.

## [1.0.0-beta.5] — 2026-05-05

### Added

- **End-of-session recap** (`/pokemon recap`) : résume les events de la session (baies, rencontres, combats, items, évolutions, badges débloqués) + les deltas vs baseline (XP gagnés, friendship +N, progression hatch, level transitions). Résout le pain UX où les events scrollaient en silence pendant que tu codais. Scopes : `session` (défaut, basé sur le session_id Claude Code le plus récent) ou `today` (depuis 00:00 UTC). Sub-batch 1.1 du roadmap.
- **README badge SVG** (Phase 1.2) : nouvel endpoint Worker `GET /v1/badge/<anon_id>.svg` qui retourne un SVG live (~480×100, 1.2 KB) avec le pseudo, la lignée actuelle + niveau, tokens cumulés, shinies, badges. Self-contained (zéro dépendance externe — GitHub camo friendly), cache 5 min. Embed via `![](https://claude-pokemon-api.benoit-dev.workers.dev/v1/badge/<id>.svg)`. Fallback placeholder SVG sur 404 / invalid id. Levier viralité : chaque user qui colle le badge sur son README GitHub devient un point d'entrée organique vers le projet.

- **Trainer card CLI** (`/pokemon trainer-card`, Phase 1.5) : carte de dresseur stylée en ASCII frame avec pseudo (display_name#shortid) ou anon_id, compagnon actif (sprite emoji + lignée + niveau), 7 stats lifetime (tokens, XP, friendship, shinies, lineages_completed, games_won/played, pokédex sauvages), liste des badges acquis avec leurs emojis, status stats-share (activé / désactivé), placeholder Arena Phase 2. Pendant CLI de la trainer card web qui sera servie en Phase 2 — déjà screenshootable et partageable maintenant.
- **Auto-submit hook** (Phase 1.4) : le `pokemon_tick` fire-and-forget en background un POST `/v1/submit` si `stats_share.enabled = true` et `last_stats_submit_at > 24h` (ou never). Throttle local côté state.json + cooldown 24h serveur (KV TTL) = double protection contre le grind. `--max-time 5` sur curl, fd 200 closed pour pas tenir le flock pendant la requête HTTP. Le manual submit (`/pokemon stats-share submit`) update aussi `last_stats_submit_at` pour que les 2 paths cohabitent. Plus besoin de penser à `submit` manuellement — les stats restent fresh sur le leaderboard automatiquement.

### Changed

- **Leaderboard polish** (Phase 1.3) : rendu plus visuel. Top 3 affichés avec 🥇🥈🥉 au lieu de "1." "2." "3.". Préfixe emoji par lignée (🔥 fire, 💧 water, 🌿 grass, ⚡ electric, 🦊 eevee, 🌱 chikorita, 🦔 cyndaquil, 🐊 totodile). Niveau 0 (œuf) affiché 🥚 au lieu de "lv.0". Étoile shiny ✦ après la lignée si applicable. Valeurs formatées avec séparateurs (2 638 000 vs 2638000). `aggregate` view : distribution lignée préfixée d'emoji aussi pour cohérence visuelle. Helpers `_lineage_emoji()` et `_rank_prefix()` dans pokemon-status.sh, sync avec le `LINEAGE_EMOJI` du Worker.

## [1.0.0-beta.4] — 2026-05-05

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
