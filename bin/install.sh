#!/usr/bin/env bash
# claude-pokemon installer.
# Sets up ~/.claude/pokemon/ with data, locales, scripts, sprites + patches
# ~/.claude/settings.json statusLine + installs /pokemon skill.
# Idempotent: safe to re-run (preserves user state.json).

set -euo pipefail

ROOT="${CLAUDE_POKEMON_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TARGET_DIR="$HOME/.claude/pokemon"
TARGET_STATUSLINE="$HOME/.claude/statusline-command.sh"
TARGET_POKEMON_STATUS="$HOME/.claude/pokemon-status.sh"
TARGET_SKILL_DIR="$HOME/.claude/skills/pokemon"
SETTINGS_JSON="$HOME/.claude/settings.json"

# ── Color helpers ────────────────────────────────────────────────────────────
B=$'\033[1m'; R=$'\033[0m'; G=$'\033[32m'; Y=$'\033[33m'; D=$'\033[2m'; E=$'\033[31m'

ok()    { printf "%s✓%s %s\n" "$G" "$R" "$1"; }
warn()  { printf "%s!%s %s\n" "$Y" "$R" "$1"; }
err()   { printf "%s✗%s %s\n" "$E" "$R" "$1" >&2; }
info()  { printf "%s%s%s\n" "$D" "$1" "$R"; }
title() { printf "\n%s%s%s\n\n" "$B" "$1" "$R"; }

# ── 1. Verify prerequisites ─────────────────────────────────────────────────
title "1/5 Vérification des prérequis"

MISSING=()
for tool in jq chafa flock curl awk; do
  if command -v "$tool" >/dev/null; then
    ok "$tool $(command -v "$tool")"
  else
    err "$tool MANQUANT"
    MISSING+=("$tool")
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo
  err "Outils manquants. Installation requise :"
  if command -v apt >/dev/null; then
    info "  Debian/Ubuntu :  sudo apt install ${MISSING[*]}"
  elif command -v brew >/dev/null; then
    info "  macOS (brew)  :  brew install ${MISSING[*]} util-linux"
  else
    info "  Installe ${MISSING[*]} via le gestionnaire de paquets de ta distrib."
  fi
  exit 1
fi

# Optional tools
if command -v gifsicle >/dev/null; then
  ok "gifsicle (animations dispo)"
else
  warn "gifsicle absent — animations désactivées (fallback statique)"
fi

# ── 2. Create directory structure ───────────────────────────────────────────
title "2/5 Création de l'arborescence"

mkdir -p "$TARGET_DIR/sprites/normal" "$TARGET_DIR/sprites/shiny"
mkdir -p "$TARGET_DIR/sprites-mini/normal" "$TARGET_DIR/sprites-mini/shiny"
mkdir -p "$TARGET_DIR/locales"
mkdir -p "$TARGET_SKILL_DIR"
ok "Dossiers créés sous $TARGET_DIR"

# ── 3. Copy library files ───────────────────────────────────────────────────
title "3/5 Installation des scripts"

cp "$ROOT/lib/lib.sh" "$TARGET_DIR/lib.sh"
cp "$ROOT/lib/locales/fr.json" "$TARGET_DIR/locales/fr.json"
cp "$ROOT/lib/locales/en.json" "$TARGET_DIR/locales/en.json"
cp "$ROOT/skills/pokemon/SKILL.md" "$TARGET_SKILL_DIR/SKILL.md"

# data.json: only copy if user doesn't have one (preserve customisations)
if [ ! -f "$TARGET_DIR/data.json" ]; then
  cp "$ROOT/lib/data.default.json" "$TARGET_DIR/data.json"
  ok "data.json initialisé (configuration par défaut)"
else
  warn "data.json existe déjà — préservé (relance avec --force-data pour écraser)"
fi

# state.json: only init if missing
if [ ! -f "$TARGET_DIR/state.json" ]; then
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  jq -n --arg now "$now" '{
    version: 2, lineage: null, is_shiny: false, current_level: 0, total_xp: 0,
    evolution_history: [], evolution_flash_remaining: 10, sessions: {},
    created_at: $now, last_updated: $now,
    badges: [], team: [], pc_storage: [], pokedex: {},
    lifetime_stats: {
      total_tokens: 0, total_evolutions: 0, total_shinies: 0, max_level: 0,
      lineages_completed: [], total_compagnons: 1, first_shiny_at: null
    },
    items: {}, eevee_form: null, high_context_streak: 0, status: "ok"
  }' > "$TARGET_DIR/state.json"
  ok "state.json initialisé (œuf neuf)"
else
  warn "state.json existe — ton compagnon actuel est préservé"
fi

# Statusline + pokemon-status scripts
cp "$ROOT/lib/statusline.sh" "$TARGET_STATUSLINE"
cp "$ROOT/lib/pokemon-status.sh" "$TARGET_POKEMON_STATUS"
chmod +x "$TARGET_STATUSLINE" "$TARGET_POKEMON_STATUS"
ok "Scripts statusline + pokemon-status installés"

# ── 4. Download sprites ─────────────────────────────────────────────────────
title "4/5 Téléchargement des sprites Showdown (~50 fichiers, ~1MB)"

ids=$(jq -r '.lineages | to_entries[] | .value.stages[].showdown_id' "$TARGET_DIR/data.json" | sort -u)

dl_count=0
for variant in normal shiny; do
  url_path="gen5"
  [ "$variant" = "shiny" ] && url_path="gen5-shiny"
  for id in $ids; do
    out_std="$TARGET_DIR/sprites/$variant/$id.txt"
    out_mini="$TARGET_DIR/sprites-mini/$variant/$id.txt"
    if [ -s "$out_std" ] && [ -s "$out_mini" ]; then continue; fi
    tmp=$(mktemp --suffix=.png)
    if curl -sf -o "$tmp" "https://play.pokemonshowdown.com/sprites/$url_path/$id.png" 2>/dev/null; then
      chafa --size 32x16 --symbols block "$tmp" > "$out_std" 2>/dev/null
      chafa --size 24x12 --symbols block "$tmp" > "$out_mini" 2>/dev/null
      dl_count=$((dl_count+1))
    fi
    rm -f "$tmp"
  done
done
ok "$dl_count sprites téléchargés et convertis (lignées de base)"

# ── 4b. Optional: extract animated frames (requires Python + Pillow) ────────
title "4b/5 Animations (optionnel)"

if command -v python3 >/dev/null && python3 -c "from PIL import Image" 2>/dev/null; then
  info "Python + Pillow détectés — extraction des frames animés (désactivés par défaut)..."
  python3 "$ROOT/lib/extract_animations.py" --target-dir "$TARGET_DIR" --frames 5 || warn "Animation pipeline failed"
  ok "Frames extraites (~500 KB) — animations désactivées par défaut"
  info "  Pour activer : jq '.enable_animations = true' ~/.claude/pokemon/data.json | sponge ~/.claude/pokemon/data.json"
else
  warn "Python3 ou Pillow absent — pas d'animations disponibles"
  info "  Pour ajouter plus tard : pip install Pillow && python3 $ROOT/lib/extract_animations.py"
fi
# Always keep enable_animations off by default (cleaner static rendering)
jq '.enable_animations = false' "$TARGET_DIR/data.json" > "$TARGET_DIR/data.json.tmp" \
  && mv "$TARGET_DIR/data.json.tmp" "$TARGET_DIR/data.json"

# ── 5. Patch settings.json ──────────────────────────────────────────────────
title "5/5 Configuration de la statusLine"

if [ ! -f "$SETTINGS_JSON" ]; then
  echo '{}' > "$SETTINGS_JSON"
fi

# Backup existing
cp "$SETTINGS_JSON" "${SETTINGS_JSON}.bak-pokemon-$(date +%Y%m%d-%H%M%S)"

cmd_path="bash $TARGET_STATUSLINE"
jq --arg cmd "$cmd_path" '.statusLine = {type: "command", command: $cmd}' \
  "$SETTINGS_JSON" > "${SETTINGS_JSON}.tmp" && mv "${SETTINGS_JSON}.tmp" "$SETTINGS_JSON"
ok "settings.json mis à jour (statusLine configuré, backup créé)"

# ── Done ────────────────────────────────────────────────────────────────────
title "Installation terminée 🎉"

cat <<EOF
${B}Prochaines étapes :${R}

  1. ${G}Relance Claude Code${R} (le statusLine va se charger).
  2. Tape ${B}/pokemon${R} pour voir ton compagnon (œuf au début).
  3. Continue à utiliser Claude normalement — l'œuf éclora après ~500K tokens
     (~30 min de chat moderé).

${B}Sous-commandes utiles :${R}
  /pokemon              Vue principale
  /pokemon team         Équipe Pokémon
  /pokemon pokedex      Pokédex Gen 1 (151)
  /pokemon switch <n>   Changer de compagnon
  /pokemon hatch        Nouvel œuf
  /pokemon stats        Stats de vie + multiplicateurs
  /pokemon badges       Badges acquis (12)
  /pokemon help         Liste complète

${B}Personnalisation :${R}
  Édite ${D}~/.claude/pokemon/data.json${R} pour changer langue, lignées, seuils XP.
  Switch FR ↔ EN : ${D}jq '.language = "en"' ~/.claude/pokemon/data.json | sponge ~/.claude/pokemon/data.json${R}

${B}Documentation complète :${R} https://github.com/bbruneau/claude-pokemon
EOF
