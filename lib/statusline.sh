#!/usr/bin/env bash
# Claude Code statusLine — Pokémon companion + context gauge + project + branch + model + effort.
# Companion system: a starter Pokémon hatched from an egg, evolving with consumed XP.
# State in ~/.claude/pokemon/state.json. Lineages & thresholds in ~/.claude/pokemon/data.json.

export LC_NUMERIC=C

input=$(cat)

cwd=$(echo "$input"        | jq -r '.workspace.current_dir // .cwd')
model=$(echo "$input"      | jq -r '.model.display_name // empty')
used=$(echo "$input"       | jq -r '.context_window.used_percentage // empty')
effort=$(echo "$input"     | jq -r '.effort.level // empty')
session_id=$(echo "$input" | jq -r '.session_id // "default"')

context_tokens=$(echo "$input" | jq -r '
  .context_window.tokens
  // .context.tokens
  // .context_window.input_tokens
  // empty
')
if [ -z "$context_tokens" ] && [ -n "$used" ]; then
  # Detect 1M-context models (Opus 1M, Sonnet 1M) when Claude Code doesn't
  # provide model.context_window directly. Without this the 200K default
  # silently caps XP-eligible context growth at ~200K, breaking long-form
  # users on premium tiers.
  case "$model" in
    *"1M context"*|*"(1M)"*) default_window=1000000 ;;
    *)                       default_window=200000 ;;
  esac
  window_size=$(echo "$input" | jq -r --argjson dw "$default_window" '
    .model.context_window // .context_window.size // $dw
  ')
  context_tokens=$(awk -v p="$used" -v w="$window_size" 'BEGIN{printf "%d", (p*w)/100}')
fi
context_tokens=$(printf '%.0f' "${context_tokens:-0}" 2>/dev/null || echo 0)

branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null)

project_dir=$(echo "$input" | jq -r '.workspace.project_dir // .workspace.current_dir // .cwd')
project=$(basename "$project_dir")

# ── ANSI palette ─────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
WHITE="\033[37m"
CYAN="\033[36m"
YELLOW="\033[33m"
BLUE="\033[34m"
GREEN="\033[32m"
RED="\033[31m"
BRIGHT_RED="\033[91m"
BRIGHT_YELLOW="\033[93m"
BRIGHT_GREEN="\033[92m"
BRIGHT_MAGENTA="\033[95m"

# ── Pokémon companion ─────────────────────────────────────────────────────
source "$HOME/.claude/pokemon/lib.sh"
pokemon_tick "$session_id" "$context_tokens" "${used:-}"

# Capture sprite lines into an array (empty if disabled in data.json).
sprite_lines=()
while IFS= read -r line; do
  sprite_lines+=("$line")
done < <(pokemon_render_sprite_statusline)
n=${#sprite_lines[@]}

# Layout modes (from data.json display_sprite_in_statusline):
#   "left"  → sprite top-left, stats line inline on same row as last sprite line
#   "above" → sprite stacked above stats line (full width)
#   "off"   → no sprite, just the stats line
sprite_layout=$(jq -r '.display_sprite_in_statusline // "off"' "$HOME/.claude/pokemon/data.json")
case "$sprite_layout" in
  left|right|true) sprite_layout="left" ;;
  above) : ;;
  *) sprite_layout="off" ;;
esac

# ── Layout: stacked above ────────────────────────────────────────────────────
if [ "$sprite_layout" = "above" ] && [ "$n" -gt 0 ]; then
  for (( i=0; i<n; i++ )); do
    printf '%s\n' "${sprite_lines[$i]}"
  done
fi

# ── Layout: sprite-left — top n-1 sprite lines + last line inline with stats ──
# IMPORTANT: Claude Code's statusline renderer strips leading whitespace from
# any line that contains only whitespace + ANSI codes. We prefix every sprite
# line with a near-invisible "anchor" char (dim+black middle dot) so that the
# leading whitespace of each line is preserved → relative alignment intact.
SPRITE_ANCHOR=$'\033[2;30m·\033[0m'

if [ "$sprite_layout" = "left" ] && [ "$n" -gt 1 ]; then
  for (( i=0; i<n-1; i++ )); do
    printf '%s%s\n' "$SPRITE_ANCHOR" "${sprite_lines[$i]}"
  done
fi
if [ "$sprite_layout" = "left" ] && [ "$n" -gt 0 ]; then
  ESC=$(printf '\033')
  last_line_trimmed=$(printf '%s' "${sprite_lines[$((n-1))]}" | awk -v ESC="$ESC" '
    { while (sub(/[ \t]+$/, "") || sub(ESC "\\[0?m$", "")) {}; print $0 ESC "[0m" }')
  printf '%s%s  ' "$SPRITE_ANCHOR" "$last_line_trimmed"
fi

# ── Stats line (always printed) ──────────────────────────────────────────────
pokemon_render_inline

printf "  ${DIM}│${RESET}"

if [ -n "$used" ]; then
  used_int=$(printf '%.0f' "$used")
  gauge_total=10
  filled=$(( used_int * gauge_total / 100 ))
  [ $filled -gt $gauge_total ] && filled=$gauge_total
  empty=$(( gauge_total - filled ))

  if [ "$used_int" -ge 85 ]; then
    gauge_color="$BRIGHT_RED"
  elif [ "$used_int" -ge 60 ]; then
    gauge_color="$BRIGHT_YELLOW"
  else
    gauge_color="$BRIGHT_GREEN"
  fi

  bar=""
  for (( i=0; i<filled; i++ )); do bar="${bar}█"; done
  for (( i=0; i<empty; i++ )); do bar="${bar}░"; done

  xp_multiplier=$(pokemon_xp_multiplier "$used")
  case "$xp_multiplier" in
    2.0) mult_color="$BRIGHT_GREEN" ;;
    1.5) mult_color="$GREEN" ;;
    1.0) mult_color="$DIM$WHITE" ;;
    0.5) mult_color="$BRIGHT_RED" ;;
    *)   mult_color="$WHITE" ;;
  esac

  printf "  ${gauge_color}[%s]${RESET} ${DIM}%s%%${RESET} ${mult_color}×%s${RESET}" "$bar" "$used_int" "$xp_multiplier"
fi

if [ -n "$project" ]; then
  printf "  ${BOLD}${CYAN}%s${RESET}" "$project"
fi

if [ -n "$branch" ]; then
  printf " ${YELLOW}%s${RESET}" "$branch"
fi

if [ -n "$model" ]; then
  printf "  ${BRIGHT_MAGENTA}%s${RESET}" "$model"
fi

if [ -n "$effort" ]; then
  case "$effort" in
    low)    effort_label="↓low"    ; effort_color="$DIM$WHITE" ;;
    medium) effort_label="◇med"    ; effort_color="$CYAN" ;;
    high)   effort_label="◆high"   ; effort_color="$YELLOW" ;;
    xhigh)  effort_label="◈xhigh"  ; effort_color="$BRIGHT_YELLOW" ;;
    max)    effort_label="★max"    ; effort_color="$BRIGHT_RED" ;;
    *)      effort_label="$effort" ; effort_color="$WHITE" ;;
  esac
  printf " ${effort_color}%s${RESET}" "$effort_label"
fi

