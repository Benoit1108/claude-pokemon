# Déploiement du web (arena) depuis le monorepo

> **Contexte (audit 2026-06-12)** : la prod `claude-pokemon-arena.pages.dev` est
> encore servie par le repo legacy `claude-pokemon-arena` (figé, en retard sur
> `web/`). Ce document décrit le repointage de Cloudflare Pages vers ce
> monorepo, puis l'archivage du repo legacy. Tant que ce n'est pas fait, **tout
> commit web doit atterrir ici dans `web/`, jamais dans le repo legacy.**

## 1. Repointer Cloudflare Pages (dashboard, ~5 min)

Dans le projet Pages `claude-pokemon-arena` → **Settings → Builds & deployments** :

| Réglage | Valeur |
|---|---|
| Source repo | `Benoit1108/claude-pokemon` (ce monorepo) |
| Production branch | `main` |
| **Root directory** | `web` |
| Build command | `npm ci --prefix .. && npm run build` *(ou laisser `npm run build` si l'install racine est gérée — voir note)* |
| Build output directory | `dist` |

Variables d'environnement de build (identiques à l'ancien projet) :

```
NITRO_PRESET = cloudflare-pages
NODE_VERSION = 22
```

> **Note install workspace** : le monorepo est un npm workspace — `npm ci` doit
> tourner **à la racine** pour installer `claude-pokemon-shared` (le `prepare`
> du package compile `shared/dist`). Si le Root directory `web` ne le permet
> pas proprement, utiliser Root directory = *(racine)* avec :
> - Build command : `npm ci && npm run -w web build`
> - Output directory : `web/dist`

Vérifier ensuite qu'un push sur `main` déclenche un déploiement et que la
prod sert bien la version monorepo (la ligne auth GitHub `/login` → « Continuer
avec GitHub » est le marqueur visuel : absente du legacy).

## 2. Archiver le repo legacy (APRÈS le repoint vérifié)

```bash
# Tombstone + archive (une fois la prod servie par le monorepo) :
gh repo edit Benoit1108/claude-pokemon-arena --description "ARCHIVED — merged into Benoit1108/claude-pokemon (web/ workspace)"
gh repo archive Benoit1108/claude-pokemon-arena --yes
```

Penser à rapatrier d'éventuelles branches restantes avant l'archive
(`git -C ~/repositories/perso/claude-pokemon-arena branch -a`).

## 3. Après l'archive

- Supprimer le clone local ou le marquer lecture-seule.
- Le submodule `vendor/claude-pokemon` du legacy meurt avec lui — plus aucun
  consommateur de `shared/dist` commité (déjà retiré de git ici).
