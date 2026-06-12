---
name: pokemon
description: Compagnon Pokémon de la statusline Claude Code. Affiche l'état (sprite, niveau, XP, badges) et permet de gérer une équipe de Pokémon (switch, hatch, deposit, withdraw, release). Sous-commandes - team / pc / pokedex / stats / badges / inventory / switch / hatch / deposit / withdraw / release / reset / --shiny. Lance ~/.claude/pokemon/pokemon.mjs. Mots-clés - pokemon, compagnon, statusline, evolution, xp, level, shiny, équipe, badges, pokedex, stats, switch, hatch, deposit, withdraw.
---

Compagnon Pokémon de la statusline Claude Code, avec gestion complète d'équipe (max 6) + PC storage (illimité).

## Action

**IMPORTANT** : extrait le ou les arguments tapés par l'utilisateur après `/pokemon` et passe-les en arguments au script. Si l'utilisateur n'a tapé qu'un mot après `/pokemon` parmi cette liste : `team`, `pc`, `storage`, `pokedex`, `dex`, `stats`, `lifetime`, `badges`, `inventory`, `inv`, `sac`, `switch`, `hatch`, `deposit`, `withdraw`, `release`, `reset`, `--shiny` → utilise comme premier argument. Pour `switch`, `hatch`, `deposit`, `withdraw` un slot ou une lignée peut suivre. Pour `release` deux arguments suivent (area + slot, et optionnellement `--confirm`).

Exécution :

```
node $HOME/.claude/pokemon/pokemon.mjs <subcommand> [<arg1>] [<arg2>] [<arg3>]
```

Exemples :
- `/pokemon` → `node ... pokemon.mjs`
- `/pokemon team` → `node ... pokemon.mjs team`
- `/pokemon switch 0` → `node ... pokemon.mjs switch 0`
- `/pokemon hatch fire` → `node ... pokemon.mjs hatch fire`
- `/pokemon deposit 2` → `node ... pokemon.mjs deposit 2`
- `/pokemon withdraw 0` → `node ... pokemon.mjs withdraw 0`
- `/pokemon release pc 1 --confirm` → `node ... pokemon.mjs release pc 1 --confirm`

Restituer la sortie telle quelle dans la réponse.

## Sous-commandes supportées

| Commande | Effet |
|---|---|
| (aucun) | Vue principale du compagnon actif |
| `team` | Équipe (max 6 compagnons) avec numéros de slot |
| `pc` / `storage` | PC storage (illimité, overflow team) |
| `switch [<slot>]` | Sans arg : liste équipe. Avec slot : échange l'actif avec team[slot] |
| `hatch [<lineage>]` | Archive l'actif et fait éclore un nouvel œuf (lignée optionnelle : fire/water/grass/electric/eevee) |
| `deposit <slot>` | Déplace team[slot] vers le PC |
| `withdraw <slot>` | Récupère pc[slot] dans l'actif (si vide) ou l'équipe |
| `release <team\|pc> <slot> [--confirm]` | Relâche définitivement (irréversible, --confirm requis) |
| `pokedex` / `dex` | Lignées rencontrées + sauvages croisés |
| `stats` / `lifetime` | Stats de vie + multiplicateurs actifs |
| `badges` | 12 badges (acquis + verrouillés) |
| `inventory` / `inv` / `sac` | Items (pierres d'évolution Eevee) |
| `reset` | Reset cérémonial (= hatch sans choix lignée) |
| `--shiny` | Toggle shiny manuel (cheat) |

## Notes

- **Switch** : déplace le compagnon actif dans l'équipe (overflow PC si pleine), puis charge le compagnon choisi en actif.
- **Hatch** : si l'actif n'est pas un œuf vide, il est archivé. Lignée forcée (`fire`/`water`/`grass`/`electric`/`eevee`) ou random.
- **Withdraw** : si l'actif est un œuf vide, le PC[slot] devient actif. Sinon ajouté à l'équipe (si elle a de la place).
- **Release** : sans `--confirm`, affiche le compagnon ciblé. Avec `--confirm`, supprime définitivement.
- État dans `~/.claude/pokemon/state.json`. Lignées et seuils dans `~/.claude/pokemon/data.json`. Locales dans `~/.claude/pokemon/locales/{fr,en}.json`.
- Switch de langue : `jq '.language = "en"' ~/.claude/pokemon/data.json | sponge ~/.claude/pokemon/data.json`.
