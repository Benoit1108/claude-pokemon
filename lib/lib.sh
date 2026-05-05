#!/usr/bin/env bash
# Pokémon companion library — sourced by statusline-command.sh and pokemon-status.sh.
# Single source of truth: ~/.claude/pokemon/data.json (lineages + thresholds + shiny config + language).
# Persistent state: ~/.claude/pokemon/state.json (lineage, is_shiny, level, total_xp, history, sessions, badges, team, pc_storage, pokedex, lifetime_stats).
# Locales: ~/.claude/pokemon/locales/{fr,en}.json — UI strings.

POKEMON_DIR="${POKEMON_DIR:-$HOME/.claude/pokemon}"
POKEMON_DATA="$POKEMON_DIR/data.json"
POKEMON_STATE="$POKEMON_DIR/state.json"
POKEMON_LOCK="$POKEMON_DIR/.lock"
POKEMON_LOCALES_DIR="$POKEMON_DIR/locales"

# ── i18n helper ──────────────────────────────────────────────────────────────
# Look up a localized string by dotted path key. Optional positional args are
# substituted via printf format string.
# Example:
#   pokemon_t "main.companion"           → "COMPAGNON"
#   pokemon_t "stats.tired_warning" 5    → "🥱 Compagnon FATIGUÉ ... 5 ticks ..."
pokemon_t() {
  local key="$1"; shift
  local lang locale_file
  lang=$(jq -r '.language // "fr"' "$POKEMON_DATA" 2>/dev/null || echo "fr")
  locale_file="$POKEMON_LOCALES_DIR/$lang.json"
  [ -f "$locale_file" ] || locale_file="$POKEMON_LOCALES_DIR/fr.json"
  [ -f "$locale_file" ] || { printf '%s' "$key"; return; }

  local result
  result=$(jq -r --arg path "$key" '
    ($path | split(".")) as $keys
    | reduce $keys[] as $k (.;
        if type == "object" then .[$k]
        elif type == "array" then (try (.[$k | tonumber]) catch null)
        else null
        end)
    | if . == null then $path else . end
  ' "$locale_file" 2>/dev/null)

  [ -z "$result" ] && result="$key"
  if [ "$#" -gt 0 ]; then
    # shellcheck disable=SC2059
    printf -- "$result" "$@"
  else
    printf '%s' "$result"
  fi
}

# Unicode-aware left-padded variant. Pads with trailing spaces so the visible
# width matches `width` (default 22). Counts characters, not bytes — so French
# accented chars don't break alignment.
pokemon_t_pad() {
  local key="$1" width="${2:-22}"
  local s
  s=$(pokemon_t "$key")
  local char_count pad
  char_count=$(printf '%s' "$s" | LC_ALL=C.UTF-8 wc -m | tr -d ' \n')
  pad=$(( width - char_count ))
  [ "$pad" -lt 0 ] && pad=0
  printf '%s%*s' "$s" "$pad" ''
}

# ── ANSI palette ─────────────────────────────────────────────────────────────
# Theme: read once from data.json, cached for the script lifetime. See
# pokemon_theme_accent() for the per-theme accent color (replaces the
# legacy hardcoded gold). Retro mode also tints stage + type colors to a
# monochrome GameBoy green palette via the branches below.
POKEMON_THEME=$(jq -r '.theme // "default"' "$POKEMON_DATA" 2>/dev/null || echo "default")

# Accent color used for titles, badges earned-at, statusline highlights.
# Themes:
#   default → 220 (gold)             — current vibrant look
#   dark    → 51  (electric cyan)    — deeper-saturation accent for dark terminals
#   light   → 94  (sepia/brown)      — lower-luminance accent for light terminals
#   retro   → 46  (GameBoy green)    — monochrome palette nostalgia
pokemon_theme_accent() {
  case "$POKEMON_THEME" in
    retro) printf '\033[38;5;46m'  ;;
    dark)  printf '\033[38;5;51m'  ;;
    light) printf '\033[38;5;94m'  ;;
    *)     printf '\033[38;5;220m' ;;
  esac
}

pokemon_ansi_color() {
  # Retro: collapse the hue palette to 4 shades of green (mimics the original
  # GameBoy 4-tone DMG screen). Other themes keep canonical stage colors so
  # Pokémon visual identity is preserved (Salamèche stays yellow, etc.).
  if [ "$POKEMON_THEME" = "retro" ]; then
    case "$1" in
      dim)                                    printf '\033[38;5;22m' ;;
      gold)                                   printf '\033[38;5;46m' ;;
      yellow|green|cyan|white)                printf '\033[38;5;46m' ;;
      red|magenta)                            printf '\033[38;5;34m' ;;
      blue)                                   printf '\033[38;5;28m' ;;
      *)                                      printf '' ;;
    esac
    return
  fi
  case "$1" in
    dim)     printf '\033[2m' ;;
    white)   printf '\033[37m' ;;
    green)   printf '\033[32m' ;;
    yellow)  printf '\033[33m' ;;
    red)     printf '\033[31m' ;;
    blue)    printf '\033[34m' ;;
    magenta) printf '\033[35m' ;;
    cyan)    printf '\033[36m' ;;
    gold)    pokemon_theme_accent ;;
    *)       printf '' ;;
  esac
}

pokemon_type_color() {
  # Retro: all types collapse to GameBoy green. Light/dark: keep canonical hues
  # (type colors are part of Pokémon identity and known by all fans).
  if [ "$POKEMON_THEME" = "retro" ]; then
    printf '\033[38;5;46m'
    return
  fi
  case "$1" in
    Feu|Fire)          printf '\033[38;2;239;108;0m' ;;
    Eau|Water)         printf '\033[38;2;38;143;255m' ;;
    Plante|Grass)      printf '\033[38;2;100;180;55m' ;;
    Électrik|Electric) printf '\033[38;2;255;218;0m' ;;
    Psy|Psychic)       printf '\033[38;2;239;65;125m' ;;
    Ténèbres|Dark)     printf '\033[38;2;120;94;75m' ;;
    Vol|Flying)        printf '\033[38;2;180;180;255m' ;;
    Dragon)            printf '\033[38;2;110;52;201m' ;;
    Poison)            printf '\033[38;2;144;58;156m' ;;
    Normal)            printf '\033[38;2;180;170;160m' ;;
    Glace|Ice)         printf '\033[38;2;108;204;218m' ;;
    Combat|Fighting)   printf '\033[38;2;199;58;55m' ;;
    Insecte|Bug)       printf '\033[38;2;145;162;36m' ;;
    Sol|Ground)        printf '\033[38;2;200;160;90m' ;;
    Roche|Rock)        printf '\033[38;2;180;160;100m' ;;
    Spectre|Ghost)     printf '\033[38;2;112;88;152m' ;;
    Acier|Steel)       printf '\033[38;2;156;156;176m' ;;
    Fée|Fairy)         printf '\033[38;2;239;164;213m' ;;
    *)                 printf '\033[37m' ;;
  esac
}

pokemon_rainbow_name() {
  local name="$1"
  local rainbows=($'\033[91m' $'\033[93m' $'\033[92m' $'\033[96m' $'\033[94m' $'\033[95m')
  local count=${#rainbows[@]}
  local len=${#name}
  local out=""
  for (( i=0; i<len; i++ )); do
    out+="${rainbows[$(( i % count ))]}${name:$i:1}"
  done
  printf '%s' "$out"
}

# ── Read helpers (lineage-aware) ─────────────────────────────────────────────
pokemon_max_level() {
  jq -r '.thresholds | length - 1' "$POKEMON_DATA"
}

pokemon_evo_field() {
  local lineage="$1" level="$2" field="$3"
  # Special case: Eevee Lv.30+ resolves via state.eevee_form (chosen at evolution).
  if [ "$lineage" = "eevee" ] && [ "$level" -ge 30 ] && [ -f "$POKEMON_STATE" ]; then
    local form
    form=$(jq -r '.eevee_form // empty' "$POKEMON_STATE" 2>/dev/null)
    if [ -n "$form" ]; then
      jq -r --arg lin "$lineage" --arg form "$form" --arg f "$field" '
        .lineages[$lin].stages
        | map(select(.showdown_id == $form))
        | .[0]
        | .[$f]
      ' "$POKEMON_DATA"
      return
    fi
  fi
  # Default: stages have a min_level field; pick the highest min_level <= level.
  # Ties resolve to the FIRST in array order (so default forms come first).
  jq -r --arg lin "$lineage" --argjson lvl "$level" --arg f "$field" '
    .lineages[$lin].stages as $s
    | ($s | map(select(.min_level <= $lvl)) | map(.min_level) | max) as $maxLvl
    | $s | map(select(.min_level == $maxLvl)) | .[0] | .[$f]
  ' "$POKEMON_DATA"
}

pokemon_threshold() {
  local level="$1"
  jq -r --argjson l "$level" '.thresholds[$l]' "$POKEMON_DATA"
}

pokemon_compute_level_from_xp() {
  local total_xp="$1"
  jq -r --argjson xp "$total_xp" '
    [.thresholds[] | select(. <= $xp)] | length - 1
  ' "$POKEMON_DATA"
}

pokemon_xp_multiplier() {
  local used_pct="${1:-}"
  if [ -z "$used_pct" ] || [ "$used_pct" = "null" ]; then
    printf '1.0'
    return
  fi
  local used_int
  used_int=$(printf '%.0f' "$used_pct" 2>/dev/null || echo 50)
  if [ "$used_int" -le 25 ]; then
    printf '2.0'
  elif [ "$used_int" -le 50 ]; then
    printf '1.5'
  elif [ "$used_int" -le 75 ]; then
    printf '1.0'
  else
    printf '0.5'
  fi
}

# Type matchup multiplier (lineage-specific bonus based on context %).
# Args: $1 = lineage, $2 = used_pct
pokemon_type_match_mult() {
  local lineage="$1" used_pct="${2:-50}"
  local pct
  pct=$(printf '%.0f' "$used_pct" 2>/dev/null || echo 50)
  case "$lineage" in
    fire)     [ "$pct" -lt 30 ] && printf '1.2' || printf '1.0' ;;
    water)    [ "$pct" -gt 70 ] && printf '1.2' || printf '1.0' ;;
    grass)    if [ "$pct" -ge 40 ] && [ "$pct" -le 60 ]; then printf '1.2'; else printf '1.0'; fi ;;
    electric) printf '1.2' ;;  # always +20% (rapid fire)
    eevee)    printf '1.1' ;;  # adaptable: +10% always
    *)        printf '1.0' ;;
  esac
}


pokemon_progress_pct() {
  local total_xp="$1" level="$2"
  jq -r --argjson xp "$total_xp" --argjson lvl "$level" '
    (.thresholds | length - 1) as $maxL |
    if $lvl >= $maxL then 100
    else
      .thresholds[$lvl]     as $cur |
      .thresholds[$lvl + 1] as $nxt |
      ((($xp - $cur) * 100) / ($nxt - $cur)) | floor |
      if . < 0 then 0 elif . > 100 then 100 else . end
    end
  ' "$POKEMON_DATA"
}

pokemon_xp_to_next() {
  local total_xp="$1" level="$2"
  jq -r --argjson xp "$total_xp" --argjson lvl "$level" '
    (.thresholds | length - 1) as $maxL |
    if $lvl >= $maxL then 0
    else (.thresholds[$lvl + 1] - $xp) end
  ' "$POKEMON_DATA"
}

# ── Lineage & shiny resolution ───────────────────────────────────────────────
# Pick a starter lineage based on data.json.starter_pick.
#   "random"  → uniform pick among existing lineage keys
#   "<key>"   → forced (must exist in data.json.lineages)
pokemon_pick_starter() {
  local mode keys
  mode=$(jq -r '.starter_pick // "random"' "$POKEMON_DATA")
  if [ "$mode" != "random" ]; then
    if jq -e --arg m "$mode" '.lineages[$m]' "$POKEMON_DATA" >/dev/null; then
      printf '%s' "$mode"
      return
    fi
  fi
  keys=( $(jq -r '.lineages | keys[]' "$POKEMON_DATA") )
  printf '%s' "${keys[$(( RANDOM % ${#keys[@]} ))]}"
}

# Roll shiny based on data.json.shiny_mode.
#   "always" → true | "never" → false | "random" → roll using shiny_chance.
# After the 1st shiny obtained (lifetime), the shiny chance is bumped 1.25× as
# a "shiny charm" effect. Echoes "true" or "false".
pokemon_roll_shiny() {
  local mode chance roll has_charm hunter
  mode=$(jq -r '.shiny_mode // "random"' "$POKEMON_DATA")
  case "$mode" in
    always) printf 'true';  return ;;
    never)  printf 'false'; return ;;
  esac
  chance=$(jq -r '.shiny_chance // 0.01' "$POKEMON_DATA")
  has_charm=$(jq -r '(.lifetime_stats.total_shinies // 0) > 0' "$POKEMON_STATE" 2>/dev/null)
  if [ "$has_charm" = "true" ]; then
    chance=$(awk -v c="$chance" 'BEGIN{printf "%.5f", c * 1.25}')
  fi
  # Shiny Hunter mode : ×5 chance
  hunter=$(jq -r '.shiny_hunter_mode // false' "$POKEMON_DATA")
  if [ "$hunter" = "true" ]; then
    chance=$(awk -v c="$chance" 'BEGIN{printf "%.5f", c * 5}')
  fi
  roll=$(awk -v c="$chance" 'BEGIN{srand(); printf "%d", (rand() < c) ? 1 : 0}')
  [ "$roll" = "1" ] && printf 'true' || printf 'false'
}

# ── Achievements / Badges / Team archive ─────────────────────────────────────
# Move current active companion to team[] (overflow → pc_storage if team has 6).
# Updates lifetime_stats. Does NOT reset active state.
# Args: $1 = ISO timestamp, $2 = current state JSON
# Stdout: updated state JSON
pokemon_active_to_archive() {
  local now="$1" state="$2"
  jq --arg now "$now" '
    .lineage as $lin
    | (if $lin == null then
        .  # only skip TRULY empty egg (no lineage assigned yet)
       else
        .team += [{
          lineage: .lineage,
          is_shiny: .is_shiny,
          level: .current_level,
          total_xp: .total_xp,
          max_stage: ((.evolution_history | last.name) // "Œuf"),
          evolution_history: .evolution_history,
          eevee_form: .eevee_form,
          items: .items,
          created_at: .created_at,
          completed_at: $now
        }]
        | (if (.team | length) > 6
           then (.pc_storage += [.team[0]] | .team = .team[1:])
           else . end)
        | (if .current_level >= 100 then .lifetime_stats.total_compagnons += 1
           else . end)
        | (if ((.lifetime_stats.lineages_completed | index($lin)) == null
                and .current_level >= 100)
           then .lifetime_stats.lineages_completed += [$lin]
           else . end)
       end)
  ' <<<"$state"
}

# Reset active to fresh egg state. Optionally forces a specific lineage.
# Args: $1 = ISO timestamp, $2 = state JSON, $3 = lineage (optional, null=random pick on next tick)
# Stdout: updated state JSON
pokemon_reset_active() {
  local now="$1" state="$2" forced_lineage="${3:-}"
  if [ -n "$forced_lineage" ]; then
    jq --arg now "$now" --arg lin "$forced_lineage" '
      .lineage = $lin
      | .is_shiny = false
      | .current_level = 0
      | .total_xp = 0
      | .evolution_history = []
      | .evolution_flash_remaining = 10
      | .created_at = $now
      | .eevee_form = null
      | .items = {}
    ' <<<"$state"
  else
    jq --arg now "$now" '
      .lineage = null
      | .is_shiny = false
      | .current_level = 0
      | .total_xp = 0
      | .evolution_history = []
      | .evolution_flash_remaining = 10
      | .created_at = $now
      | .eevee_form = null
      | .items = {}
    ' <<<"$state"
  fi
}

# Backward-compat: combined archive + reset (used by Lv.100 auto-archive).
pokemon_archive_to_team() {
  local now="$1" state="$2"
  state=$(pokemon_active_to_archive "$now" "$state")
  state=$(pokemon_reset_active "$now" "$state")
  printf '%s' "$state"
}

# Load a team entry into the active state. Idx = 0-based slot in team[].
# Args: $1 = ISO timestamp, $2 = state JSON, $3 = team slot index
# Stdout: updated state JSON
pokemon_load_team_to_active() {
  local now="$1" state="$2" idx="$3"
  jq --arg now "$now" --argjson i "$idx" '
    (.team[$i]) as $entry
    | .lineage = $entry.lineage
    | .is_shiny = $entry.is_shiny
    | .current_level = $entry.level
    | .total_xp = $entry.total_xp
    | .evolution_history = ($entry.evolution_history // [])
    | .eevee_form = $entry.eevee_form
    | .items = ($entry.items // {})
    | .created_at = $entry.created_at
    | .last_updated = $now
    | .evolution_flash_remaining = 3
    | .team = (.team | del(.[$i]))
  ' <<<"$state"
}

# Move team[idx] to pc_storage[]. Preserves order.
pokemon_team_to_pc() {
  local state="$1" idx="$2"
  jq --argjson i "$idx" '
    .pc_storage += [.team[$i]]
    | .team = (.team | del(.[$i]))
  ' <<<"$state"
}

# Move pc_storage[idx] to team[] (or active if active is empty egg).
# If active is empty: pc[idx] → active. Else if team has space: pc[idx] → team. Else: error.
# Args: $1 = ISO timestamp, $2 = state JSON, $3 = pc slot index
# Stdout: updated state JSON OR empty (if team full and active not empty)
pokemon_pc_to_team_or_active() {
  local now="$1" state="$2" idx="$3"
  local active_empty team_full
  active_empty=$(jq -r '(.lineage == null) or (.current_level == 0)' <<<"$state")
  team_full=$(jq -r '(.team | length) >= 6' <<<"$state")

  if [ "$active_empty" = "true" ]; then
    # Load PC[idx] directly into active
    jq --arg now "$now" --argjson i "$idx" '
      (.pc_storage[$i]) as $entry
      | .lineage = $entry.lineage
      | .is_shiny = $entry.is_shiny
      | .current_level = $entry.level
      | .total_xp = $entry.total_xp
      | .evolution_history = ($entry.evolution_history // [])
      | .eevee_form = $entry.eevee_form
      | .items = ($entry.items // {})
      | .created_at = $entry.created_at
      | .last_updated = $now
      | .evolution_flash_remaining = 3
      | .pc_storage = (.pc_storage | del(.[$i]))
    ' <<<"$state"
  elif [ "$team_full" = "false" ]; then
    # Append PC[idx] to team
    jq --argjson i "$idx" '
      .team += [.pc_storage[$i]]
      | .pc_storage = (.pc_storage | del(.[$i]))
    ' <<<"$state"
  else
    return 1  # team full + active occupied → caller must show error
  fi
}

# Delete a slot from team or pc_storage.
# Args: $1 = state JSON, $2 = "team"|"pc", $3 = slot index
pokemon_release_slot() {
  local state="$1" area="$2" idx="$3"
  case "$area" in
    team) jq --argjson i "$idx" '.team = (.team | del(.[$i]))' <<<"$state" ;;
    pc)   jq --argjson i "$idx" '.pc_storage = (.pc_storage | del(.[$i]))' <<<"$state" ;;
    *)    printf '%s' "$state" ;;
  esac
}

# Run all badge condition checks against the state, awarding new ones.
# Args: $1 = current state JSON, $2 = ISO timestamp
# Stdout: updated state JSON with new badges appended.
pokemon_check_badges() {
  local state="$1" now="$2"
  jq --arg now "$now" '
    def add_badge($id):
      if (.badges | map(.id) | index($id)) == null
      then .badges += [{id: $id, earned_at: $now}]
      else . end;

    .
    | (if (.evolution_history | any(.level == 1)) then add_badge("hatch") else . end)
    | (if (.evolution_history | any(.level >= 16)) then add_badge("first_evolution") else . end)
    | (if (.lifetime_stats.total_shinies > 0) then add_badge("first_shiny") else . end)
    | (if (.lifetime_stats.max_level >= 100) then add_badge("champion") else . end)
    | (if (.lifetime_stats.total_tokens >= 100000000) then add_badge("centurion") else . end)
    | (if (.lifetime_stats.total_shinies >= 5) then add_badge("constellation") else . end)
    | (if ([.pokedex | to_entries[] | select(.value.seen)] | length) >= 5 then add_badge("master_pokedex") else . end)
    | (if (.lifetime_stats.lineages_completed | index("fire"))      != null then add_badge("master_fire")      else . end)
    | (if (.lifetime_stats.lineages_completed | index("water"))     != null then add_badge("master_water")     else . end)
    | (if (.lifetime_stats.lineages_completed | index("grass"))     != null then add_badge("master_grass")     else . end)
    | (if (.lifetime_stats.lineages_completed | index("electric"))  != null then add_badge("master_electric")  else . end)
    | (if (.lifetime_stats.lineages_completed | index("eevee"))     != null then add_badge("master_eevee")     else . end)
    | (if (.lifetime_stats.lineages_completed | index("chikorita")) != null then add_badge("master_chikorita") else . end)
    | (if (.lifetime_stats.lineages_completed | index("cyndaquil")) != null then add_badge("master_cyndaquil") else . end)
    | (if (.lifetime_stats.lineages_completed | index("totodile"))  != null then add_badge("master_totodile")  else . end)
  ' <<<"$state"
}

# Badge metadata. Emojis are static, label & desc are localized via locales/.
pokemon_badge_meta() {
  local id="$1" field="${2:-emoji}"
  local emoji
  case "$id" in
    hatch)             emoji="🥚" ;;
    first_evolution)   emoji="🌱" ;;
    first_shiny)       emoji="⭐" ;;
    champion)          emoji="🏆" ;;
    centurion)         emoji="💯" ;;
    constellation)     emoji="🌌" ;;
    master_pokedex)    emoji="💎" ;;
    master_fire)       emoji="🔥" ;;
    master_water)      emoji="💧" ;;
    master_grass)      emoji="🌿" ;;
    master_electric)   emoji="⚡" ;;
    master_eevee)      emoji="🦊" ;;
    master_chikorita)  emoji="🍃" ;;
    master_cyndaquil)  emoji="🦔" ;;
    master_totodile)   emoji="🐊" ;;
    *)                 emoji="?"  ;;
  esac
  case "$field" in
    emoji) printf '%s' "$emoji" ;;
    label) pokemon_t "badges.$id.0" ;;
    desc)  pokemon_t "badges.$id.1" ;;
  esac
}

# ── State init & tick ────────────────────────────────────────────────────────
pokemon_init_state_if_missing() {
  [ -f "$POKEMON_STATE" ] && return 0
  mkdir -p "$POKEMON_DIR"
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  jq -n --arg now "$now" '{
    version: 2,
    lineage: null,
    is_shiny: false,
    current_level: 0,
    total_xp: 0,
    evolution_history: [],
    evolution_flash_remaining: 0,
    sessions: {},
    created_at: $now,
    last_updated: $now
  }' > "$POKEMON_STATE"
}

# Tick: update state with current session's context tokens.
# Args: session_id, current_tokens, used_percentage (0-100, optional)
# Side effects: writes state.json. Uses flock to serialize concurrent calls.
pokemon_tick() {
  local session_id="$1"
  local current_tokens="${2:-0}"
  local used_pct="${3:-}"

  mkdir -p "$POKEMON_DIR"
  touch "$POKEMON_LOCK"

  (
    flock -x 200

    pokemon_init_state_if_missing

    local now state lineage is_shiny prev_level prev_max delta total_xp new_level cutoff
    local xp_multiplier weighted_delta
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    state=$(cat "$POKEMON_STATE")

    # Ensure all extended schema fields exist (forward-compat migration).
    state=$(jq '
      (.badges //= [])
      | (.team //= [])
      | (.pc_storage //= [])
      | (.pokedex //= {})
      | (.lifetime_stats //= {
          total_tokens: 0,
          total_evolutions: 0,
          total_shinies: 0,
          max_level: 0,
          lineages_completed: [],
          total_compagnons: 1,
          first_shiny_at: null
        })
    ' <<<"$state")

    # Retroactive migration: backfill stats from existing companion state.
    # Runs every tick but is idempotent (uses max/maxBy and existence checks).
    state=$(jq '
      .lifetime_stats.max_level =
        (if .lifetime_stats.max_level > .current_level
         then .lifetime_stats.max_level else .current_level end)
      | (if (.lineage // "") != "" and (.pokedex[.lineage] // null) == null then
          .pokedex[.lineage] = {
            seen: true, count: 1, first_seen_at: .created_at,
            shiny_seen: .is_shiny, shiny_count: (if .is_shiny then 1 else 0 end)
          }
        else . end)
      | (if (.lineage // "") != "" and .is_shiny == true
            and ((.pokedex[.lineage].shiny_seen // false) == false) then
          .pokedex[.lineage].shiny_seen = true
          | .pokedex[.lineage].shiny_count = ((.pokedex[.lineage].shiny_count // 0) + 1)
        else . end)
      | (if .is_shiny == true and .lifetime_stats.total_shinies == 0 then
          .lifetime_stats.total_shinies = 1
          | (.lifetime_stats.first_shiny_at //= .created_at)
        else . end)
    ' <<<"$state")

    # Lineage assignment (once, sticky for the whole life of the companion).
    lineage=$(jq -r '.lineage // empty' <<<"$state")
    if [ -z "$lineage" ]; then
      lineage=$(pokemon_pick_starter)
      state=$(jq --arg lin "$lineage" --arg now "$now" '
        .lineage = $lin
        | .pokedex[$lin] //= {seen: false, shiny_seen: false, count: 0, shiny_count: 0, first_seen_at: null}
        | .pokedex[$lin].seen = true
        | .pokedex[$lin].count += 1
        | (.pokedex[$lin].first_seen_at //= $now)
      ' <<<"$state")
    fi

    is_shiny=$(jq -r '.is_shiny' <<<"$state")
    prev_level=$(jq -r '.current_level' <<<"$state")
    prev_max=$(jq -r --arg sid "$session_id" '.sessions[$sid].max_context_tokens // 0' <<<"$state")

    delta=0
    if [ "$current_tokens" -gt "$prev_max" ]; then
      delta=$(( current_tokens - prev_max ))
    fi

    xp_multiplier=$(pokemon_xp_multiplier "$used_pct")
    type_match_mult=$(pokemon_type_match_mult "$lineage" "$used_pct")

    # Daily bonus: +50% XP on the first tick of a new calendar day (UTC).
    local today daily_mult
    today="${now:0:10}"
    if [ "$(jq -r '.last_daily_bonus_date // ""' <<<"$state")" != "$today" ]; then
      daily_mult="1.5"
      state=$(jq --arg t "$today" '.last_daily_bonus_date = $t' <<<"$state")
    else
      daily_mult="1.0"
    fi

    # Status / tired: 5+ consecutive ticks at >=90% context → tired → 0.75x XP.
    local pct_int status_mult
    pct_int=$(printf '%.0f' "${used_pct:-0}" 2>/dev/null || echo 0)
    if [ "$pct_int" -ge 90 ]; then
      state=$(jq '.high_context_streak = ((.high_context_streak // 0) + 1)' <<<"$state")
    else
      state=$(jq '.high_context_streak = 0' <<<"$state")
    fi
    if [ "$(jq -r '.high_context_streak' <<<"$state")" -ge 5 ]; then
      state=$(jq '.status = "tired"' <<<"$state")
      status_mult="0.75"
    else
      state=$(jq '.status = "ok"' <<<"$state")
      status_mult="1.0"
    fi

    # Held item XP modifier
    local held_item held_mult held_friendship_mult
    held_item=$(jq -r '.held_item // ""' <<<"$state")
    held_mult="1.0"
    held_friendship_mult="1.0"
    if [ -n "$held_item" ]; then
      held_mult=$(jq -r --arg id "$held_item" '.items[$id].effect_xp_mult // 1.0' "$POKEMON_DATA")
      held_friendship_mult=$(jq -r --arg id "$held_item" '.items[$id].effect_friendship_mult // 1.0' "$POKEMON_DATA")
    fi

    # Injured status pénalité (if injured_ticks_remaining > 0)
    local injured_ticks injured_mult
    injured_ticks=$(jq -r '.injured_ticks_remaining // 0' <<<"$state")
    injured_mult="1.0"
    if [ "$injured_ticks" -gt 0 ]; then
      injured_mult="0.75"
      state=$(jq '.injured_ticks_remaining = (.injured_ticks_remaining - 1)' <<<"$state")
      # If injured + holding oran_berry, consume berry instead
      if [ "$held_item" = "oran_berry" ]; then
        state=$(jq '.held_item = null | .injured_ticks_remaining = 0' <<<"$state")
        injured_mult="1.0"
      fi
    fi

    # Shiny Hunter mode: skip XP entirely (just shiny rolls), but exit early (no transitions)
    local shiny_hunter
    shiny_hunter=$(jq -r '.shiny_hunter_mode // false' "$POKEMON_DATA")

    # Saison detection (month/day of year)
    local current_month current_day season_mult season_id
    current_month=$(date -u +%-m)
    current_day=$(date -u +%-d)
    season_mult="1.0"
    season_id=""
    while IFS=$'\t' read -r sid m_start m_end d_start d_end mult; do
      if [ "$current_month" = "$m_start" ] && [ "$current_day" -ge "$d_start" ] && [ "$current_day" -le "$d_end" ]; then
        season_mult="$mult"
        season_id="$sid"
        break
      fi
    done < <(jq -r '.seasons // {} | to_entries[] | "\(.key)\t\(.value.month)\t\(.value.month)\t\(.value.day_start)\t\(.value.day_end)\t\(.value.boost_mult_xp // 1.0)"' "$POKEMON_DATA")

    # Combined XP multiplier (with held + injured + season)
    if [ "$shiny_hunter" = "true" ]; then
      weighted_delta=0  # no XP in hunter mode
    else
      weighted_delta=$(awk -v d="$delta" -v xp="$xp_multiplier" -v tm="$type_match_mult" \
                           -v db="$daily_mult" -v st="$status_mult" -v hi="$held_mult" -v ij="$injured_mult" \
                           -v se="$season_mult" \
                           'BEGIN{printf "%d", d * xp * tm * db * st * hi * ij * se}')
    fi

    # Track multipliers in state for /creature display
    state=$(jq --arg xp "$xp_multiplier" --arg tm "$type_match_mult" \
               --arg db "$daily_mult" --arg st "$status_mult" '
      .last_xp_multipliers = {context: $xp, type_match: $tm, daily_bonus: $db, status: $st}
    ' <<<"$state")

    # ── Random events: berry drop (0.5%) + wild encounter (0.1%) ─────────
    local berry_chance encounter_chance
    berry_chance=$(jq -r '.event_chances.berry // 0.005' "$POKEMON_DATA")
    encounter_chance=$(jq -r '.event_chances.encounter // 0.001' "$POKEMON_DATA")

    # Berry roll
    local berry_roll
    berry_roll=$(awk -v c="$berry_chance" 'BEGIN{srand(); print (rand() < c) ? "1" : "0"}')
    if [ "$berry_roll" = "1" ]; then
      local berry_count berry_idx
      berry_count=$(jq -r '.berries | length' "$POKEMON_DATA")
      berry_idx=$((RANDOM % berry_count))
      local b_id b_name b_emoji b_xp
      b_id=$(jq    -r --argjson i "$berry_idx" '.berries[$i].id'        "$POKEMON_DATA")
      b_name=$(jq  -r --argjson i "$berry_idx" '.berries[$i].name'      "$POKEMON_DATA")
      b_emoji=$(jq -r --argjson i "$berry_idx" '.berries[$i].emoji'     "$POKEMON_DATA")
      b_xp=$(jq    -r --argjson i "$berry_idx" '.berries[$i].xp_bonus'  "$POKEMON_DATA")
      state=$(jq --arg id "$b_id" --arg name "$b_name" --arg emoji "$b_emoji" \
                 --argjson xp "$b_xp" --arg now "$now" '
        .total_xp += $xp
        | .recent_events = ([{type: "berry", id: $id, name: $name, emoji: $emoji, xp: $xp, at: $now}]
                            + (.recent_events // []))[0:10]
      ' <<<"$state")
    fi

    # Encounter roll
    local enc_roll
    enc_roll=$(awk -v c="$encounter_chance" 'BEGIN{srand(); print (rand() < c) ? "1" : "0"}')
    if [ "$enc_roll" = "1" ]; then
      local pool_count enc_idx
      pool_count=$(jq -r '.wild_pool | length' "$POKEMON_DATA")
      enc_idx=$((RANDOM % pool_count))
      local w_id
      w_id=$(jq -r --argjson i "$enc_idx" '.wild_pool[$i].id' "$POKEMON_DATA")
      # Just store the id + counters in pokedex_wild; names/emojis derived at display
      state=$(jq --arg id "$w_id" --arg now "$now" '
        .pokedex_wild //= {}
        | .pokedex_wild[$id] = {
            count: ((.pokedex_wild[$id].count // 0) + 1),
            first_seen_at: (.pokedex_wild[$id].first_seen_at // $now),
            last_seen_at: $now
          }
        | .recent_events = ([{type: "encounter", id: $id, at: $now}]
                            + (.recent_events // []))[0:10]
      ' <<<"$state")

      # 30% chance encounter triggers a battle
      local battle_chance battle_roll
      battle_chance=$(jq -r '.battle_chance_on_encounter // 0.3' "$POKEMON_DATA")
      battle_roll=$(awk -v c="$battle_chance" 'BEGIN{srand(); print (rand() < c) ? "1" : "0"}')
      if [ "$battle_roll" = "1" ]; then
        local own_level wild_level battle_won
        own_level=$(jq -r '.current_level' <<<"$state")
        wild_level=$((RANDOM % 46 + 5))  # 5-50
        if [ "$own_level" -ge "$((wild_level - 3))" ]; then
          battle_won="true"
        else
          battle_won="false"
        fi
        if [ "$battle_won" = "true" ]; then
          local battle_xp_min battle_xp_max bonus_xp
          battle_xp_min=$(jq -r '.battle_xp_min // 500' "$POKEMON_DATA")
          battle_xp_max=$(jq -r '.battle_xp_max // 5000' "$POKEMON_DATA")
          bonus_xp=$((RANDOM % (battle_xp_max - battle_xp_min + 1) + battle_xp_min))
          # Scale with wild_level (weight more for higher level)
          bonus_xp=$((bonus_xp * wild_level / 25))
          state=$(jq --arg id "$w_id" --argjson lvl "$wild_level" --argjson xp "$bonus_xp" --arg now "$now" '
            .total_xp += $xp
            | .recent_events = ([{type: "battle_won", id: $id, wild_level: $lvl, xp: $xp, at: $now}]
                                + (.recent_events // []))[0:10]
          ' <<<"$state")
        else
          local injured_ticks
          injured_ticks=$(jq -r '.battle_injured_ticks // 5' "$POKEMON_DATA")
          state=$(jq --arg id "$w_id" --argjson lvl "$wild_level" --argjson ticks "$injured_ticks" --arg now "$now" '
            .injured_ticks_remaining = $ticks
            | .recent_events = ([{type: "battle_lost", id: $id, wild_level: $lvl, at: $now}]
                                + (.recent_events // []))[0:10]
          ' <<<"$state")
        fi
      fi

      # 30% chance encounter also drops an evolution stone
      local item_drop_chance item_roll
      item_drop_chance=$(jq -r '.item_drop_chance_on_encounter // 0.3' "$POKEMON_DATA")
      item_roll=$(awk -v c="$item_drop_chance" 'BEGIN{srand(); print (rand() < c) ? "1" : "0"}')
      if [ "$item_roll" = "1" ]; then
        local item_keys item_count item_idx item_id item_name item_emoji
        # Get item keys as array
        mapfile -t item_keys < <(jq -r '.items | keys[]' "$POKEMON_DATA")
        item_count=${#item_keys[@]}
        item_idx=$((RANDOM % item_count))
        item_id="${item_keys[$item_idx]}"
        item_name=$(jq  -r --arg id "$item_id" '.items[$id].name'  "$POKEMON_DATA")
        item_emoji=$(jq -r --arg id "$item_id" '.items[$id].emoji' "$POKEMON_DATA")
        state=$(jq --arg id "$item_id" --arg name "$item_name" --arg emoji "$item_emoji" --arg now "$now" '
          .items //= {}
          | .items[$id] = ((.items[$id] // 0) + 1)
          | .recent_events = ([{type: "item", id: $id, name: $name, emoji: $emoji, at: $now}]
                              + (.recent_events // []))[0:10]
        ' <<<"$state")
      fi
    fi

    state=$(jq --arg sid "$session_id" \
               --argjson tokens "$current_tokens" \
               --argjson delta "$weighted_delta" \
               --argjson raw_delta "$delta" \
               --arg now "$now" '
      .total_xp += $delta
      | .lifetime_stats.total_tokens += $raw_delta
      | (.sessions[$sid].first_seen //= $now)
      | .sessions[$sid].last_seen = $now
      | .sessions[$sid].max_context_tokens =
          (if (.sessions[$sid].max_context_tokens // 0) > $tokens
           then (.sessions[$sid].max_context_tokens // 0) else $tokens end)
      | .last_updated = $now
      # Capture baseline snapshot ONCE per session, used by /pokemon recap
      # to compute deltas (XP gained, friendship gained, evolutions during session).
      | (if (.sessions[$sid].baseline | not) then
          .sessions[$sid].baseline = {
            total_xp:         (.total_xp - $delta),
            friendship:       (.friendship // 0),
            lifetime_tokens:  (.lifetime_stats.total_tokens - $raw_delta),
            lineage:          .lineage,
            current_level:    .current_level,
            evolution_count:  ((.evolution_history // []) | length),
            badge_count:      ((.badges // []) | length),
            pokedex_wild_count: ((.pokedex_wild // {}) | keys | length),
            games_won:        (.lifetime_stats.games_won // 0)
          }
        else . end)
    ' <<<"$state")

    total_xp=$(jq -r '.total_xp' <<<"$state")
    new_level=$(pokemon_compute_level_from_xp "$total_xp")

    if [ "$new_level" -gt "$prev_level" ]; then
      # Hatching moment (Lv.0 → Lv.1) is when the shiny roll happens.
      if [ "$prev_level" -eq 0 ] && [ "$new_level" -ge 1 ]; then
        is_shiny=$(pokemon_roll_shiny)
        state=$(jq --argjson s "$is_shiny" '.is_shiny = $s' <<<"$state")
        # Update pokedex + lifetime_stats on shiny roll
        if [ "$is_shiny" = "true" ]; then
          state=$(jq --arg lin "$lineage" --arg now "$now" '
            .pokedex[$lin].shiny_seen = true
            | .pokedex[$lin].shiny_count += 1
            | .lifetime_stats.total_shinies += 1
            | (.lifetime_stats.first_shiny_at //= $now)
          ' <<<"$state")
        fi
      fi
      # Eevee evolution choice at Lv.30 — must run BEFORE the history log so
      # pokemon_evo_field returns the chosen form, not the default Aquali.
      # Decision tree (canonical Gen 2 rules) :
      #   1. Held stone wins (consumed) → Pyroli/Aquali/Voltali
      #   2. Friendship ≥ threshold + day  → Mentali (Espeon)
      #   3. Friendship ≥ threshold + night → Noctali (Umbreon)
      #   4. Friendship < threshold → random stone form (game forces evolution
      #      at Lv.30 so we can't keep Eevee waiting like in canon)
      if [ "$lineage" = "eevee" ] && [ "$prev_level" -lt 30 ] && [ "$new_level" -ge 30 ]; then
        local chosen_form="" used_stone=""
        for stone in fire_stone water_stone thunder_stone; do
          local cnt
          cnt=$(jq -r --arg s "$stone" '.items[$s] // 0' <<<"$state")
          if [ "$cnt" -gt 0 ]; then
            used_stone="$stone"
            chosen_form=$(jq -r --arg s "$stone" '.eevee_evolution_rules[$s]' "$POKEMON_DATA")
            break
          fi
        done
        if [ -z "$chosen_form" ]; then
          local friendship_value friendship_threshold hour
          friendship_value=$(jq -r '.friendship // 0' <<<"$state")
          friendship_threshold=$(jq -r '.eevee_friendship_threshold // 50' "$POKEMON_DATA")
          hour=$(date -u +%H)
          if [ "$friendship_value" -ge "$friendship_threshold" ]; then
            if [ "$hour" -ge 6 ] && [ "$hour" -lt 18 ]; then
              chosen_form=$(jq -r '.eevee_evolution_rules.day_default' "$POKEMON_DATA")
            else
              chosen_form=$(jq -r '.eevee_evolution_rules.night_default' "$POKEMON_DATA")
            fi
          else
            # Low friendship fallback: random elemental form (no stone consumed)
            local fallback_stones=("fire_stone" "water_stone" "thunder_stone")
            local fallback_stone="${fallback_stones[$((RANDOM % 3))]}"
            chosen_form=$(jq -r --arg s "$fallback_stone" '.eevee_evolution_rules[$s]' "$POKEMON_DATA")
          fi
        fi
        state=$(jq --arg form "$chosen_form" '.eevee_form = $form' <<<"$state")
        # Persist for pokemon_evo_field: it reads POKEMON_STATE, so flush now
        printf '%s\n' "$state" > "$POKEMON_STATE.tmp" \
          && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
        if [ -n "$used_stone" ]; then
          state=$(jq --arg s "$used_stone" '
            .items[$s] -= 1
            | (if .items[$s] <= 0 then del(.items[$s]) else . end)
          ' <<<"$state")
        fi
      fi
      # Log only stage TRANSITIONS in evolution_history (not every level up).
      # A transition happens at any min_level in the open interval (prev, new].
      local transitions
      transitions=$(jq -r --arg lin "$lineage" --argjson p "$prev_level" --argjson nv "$new_level" '
        .lineages[$lin].stages[]
        | select(.min_level > $p and .min_level <= $nv)
        | .min_level
      ' "$POKEMON_DATA")
      local stage_changed=false
      local transition_count=0
      # For Eevee at Lv.30, multiple stages share min_level=30. Only log ONCE.
      local eevee_logged=false
      for t in $transitions; do
        if [ "$lineage" = "eevee" ] && [ "$t" -eq 30 ] && [ "$eevee_logged" = "true" ]; then
          continue
        fi
        local evo_name
        evo_name=$(pokemon_evo_field "$lineage" "$t" "name")
        state=$(jq --argjson lvl "$t" --arg name "$evo_name" --arg at "$now" \
                   --argjson shiny "$is_shiny" '
          .evolution_history += [{level: $lvl, name: $name, evolved_at: $at, is_shiny: $shiny}]
        ' <<<"$state")
        stage_changed=true
        transition_count=$((transition_count + 1))
        [ "$lineage" = "eevee" ] && [ "$t" -eq 30 ] && eevee_logged=true
      done
      # Update lifetime_stats with evolution count + max_level reached
      if [ "$transition_count" -gt 0 ]; then
        state=$(jq --argjson n "$transition_count" '
          .lifetime_stats.total_evolutions += $n
        ' <<<"$state")
      fi
      state=$(jq --argjson lvl "$new_level" '
        .lifetime_stats.max_level = (if .lifetime_stats.max_level > $lvl
                                     then .lifetime_stats.max_level else $lvl end)
      ' <<<"$state")
      local flash_value=0
      [ "$stage_changed" = "true" ] && flash_value=3
      state=$(jq --argjson lvl "$new_level" --argjson flash "$flash_value" '
        .current_level = $lvl
        | .evolution_flash_remaining = (if $flash > 0 then $flash else .evolution_flash_remaining end)
      ' <<<"$state")
      # Lv.100 reached → archive companion to team, reset to fresh egg
      local max_level
      max_level=$(pokemon_max_level)
      if [ "$prev_level" -lt "$max_level" ] && [ "$new_level" -ge "$max_level" ]; then
        state=$(pokemon_archive_to_team "$now" "$state")
      fi
    else
      local flash
      flash=$(jq -r '.evolution_flash_remaining' <<<"$state")
      if [ "$flash" -gt 0 ]; then
        state=$(jq '.evolution_flash_remaining -= 1' <<<"$state")
      fi
    fi

    # Increment animation frame counter (cycles via modulo at render time)
    state=$(jq '.animation_frame_index = ((.animation_frame_index // 0) + 1)' <<<"$state")

    # Increment friendship counter (only if active has lineage assigned)
    if [ -n "$lineage" ] && [ "$lineage" != "null" ]; then
      state=$(jq '.friendship = ((.friendship // 0) + 1)' <<<"$state")
    fi

    # Run badge checks against the latest state (idempotent)
    state=$(pokemon_check_badges "$state" "$now")

    cutoff=$(date -u -d '30 days ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
          || date -u -v-30d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
          || echo "1970-01-01T00:00:00Z")
    state=$(jq --arg sid "$session_id" --arg cut "$cutoff" '
      .sessions = (.sessions | with_entries(
        select(.key == $sid or .value.last_seen >= $cut)))
    ' <<<"$state")

    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" \
      && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
  ) 200>"$POKEMON_LOCK"
}

# ── Sprite rendering for the statusline ──────────────────────────────────────
# Trim cursor codes + leading/trailing blank lines + common left whitespace.
# Preserves relative alignment between sprite lines while shifting content
# closer to the left edge.
pokemon_trim_sprite() {
  local path="$1"
  [ -f "$path" ] || return 1
  local ESC
  ESC=$(printf '\033')
  awk -v ESC="$ESC" '
  {
    bare = $0
    gsub(ESC "\\[[?0-9;]*[a-zA-Z]", "", bare)

    # Find first/last non-empty line + track min leading whitespace
    test = bare
    sub(/[ \t]+$/, "", test)
    if (test ~ /[^ \t]/) {
      if (!found) { first = NR; found = 1 }
      last = NR
      # Count leading ASCII whitespace on the bare (ANSI-stripped) line
      match(bare, /[^ \t]/)
      lead = RSTART - 1
      if (!min_set || lead < min_lead) {
        min_lead = lead
        min_set = 1
      }
    }
    raw[NR] = $0
  }
  END {
    if (!found) exit
    if (!min_set) min_lead = 0
    for (i = first; i <= last; i++) {
      line = raw[i]
      gsub(ESC "\\[[?]25[lh]", "", line)
      # Strip common min_lead leading spaces (ASCII only, before any ANSI/content)
      strip = min_lead
      while (strip > 0 && substr(line, 1, 1) == " ") {
        line = substr(line, 2)
        strip--
      }
      print line
    }
  }
  ' "$path"
}

# Render the mini sprite for the statusline. Honors data.json:
#   display_sprite_in_statusline: "right" | "above" | "off" | true (=right) | false (=off)
#   enable_animations: true → cycle through animated frames per tick
pokemon_render_sprite_statusline() {
  local mode
  mode=$(jq -r '.display_sprite_in_statusline // "off"' "$POKEMON_DATA")
  case "$mode" in
    left|right|above|true) : ;;
    *) return 0 ;;
  esac

  pokemon_init_state_if_missing

  local lineage is_shiny level showdown_id sprite_path variant
  lineage=$(jq -r '.lineage // "fire"' "$POKEMON_STATE")
  is_shiny=$(jq -r '.is_shiny' "$POKEMON_STATE")
  level=$(jq -r '.current_level' "$POKEMON_STATE")
  showdown_id=$(pokemon_evo_field "$lineage" "$level" "showdown_id")

  variant="normal"
  [ "$is_shiny" = "true" ] && variant="shiny"

  # Animated frame first (if enabled + frames exist for this sprite)
  local enable_anim
  enable_anim=$(jq -r '.enable_animations // false' "$POKEMON_DATA")
  if [ "$enable_anim" = "true" ]; then
    local anim_dir n_frames frame_idx frame_file
    anim_dir="$POKEMON_DIR/sprites-mini-anim/$variant/$showdown_id"
    if [ -d "$anim_dir" ]; then
      n_frames=$(ls "$anim_dir"/frame_*.txt 2>/dev/null | wc -l)
      if [ "$n_frames" -gt 0 ]; then
        frame_idx=$(jq -r '.animation_frame_index // 0' "$POKEMON_STATE")
        frame_idx=$(( frame_idx % n_frames ))
        frame_file=$(printf '%s/frame_%02d.txt' "$anim_dir" "$frame_idx")
        if [ -f "$frame_file" ]; then
          pokemon_trim_sprite "$frame_file"
          return
        fi
      fi
    fi
  fi

  # Fallback: static sprite (egg, megas, gmaxes, or animations disabled)
  sprite_path="$POKEMON_DIR/sprites-mini/$variant/$showdown_id.txt"
  [ -f "$sprite_path" ] || return 0
  pokemon_trim_sprite "$sprite_path"
}

# ── Inline rendering for the statusline ──────────────────────────────────────
pokemon_render_inline() {
  pokemon_init_state_if_missing

  local lineage level total_xp flash is_shiny max_level name emoji color color_code
  lineage=$(jq -r '.lineage // "fire"' "$POKEMON_STATE")
  level=$(jq -r '.current_level' "$POKEMON_STATE")
  total_xp=$(jq -r '.total_xp' "$POKEMON_STATE")
  flash=$(jq -r '.evolution_flash_remaining' "$POKEMON_STATE")
  is_shiny=$(jq -r '.is_shiny' "$POKEMON_STATE")
  max_level=$(pokemon_max_level)

  name=$(pokemon_evo_field "$lineage" "$level" "name")
  emoji=$(pokemon_evo_field "$lineage" "$level" "emoji")
  color=$(pokemon_evo_field "$lineage" "$level" "color")

  local RESET=$'\033[0m' BOLD=$'\033[1m' DIM=$'\033[2m'
  local GOLD
  GOLD=$(pokemon_theme_accent)

  # Shiny override : nom doré + ★ devant.
  local shiny_prefix="" shiny_color=""
  if [ "$is_shiny" = "true" ]; then
    shiny_prefix="${GOLD}★${RESET} "
    shiny_color="$GOLD"
  fi

  if [ "$level" -ge "$max_level" ]; then
    local rainbow_name
    rainbow_name=$(pokemon_rainbow_name "$name")
    printf '%s%s%s %s%s %sLv.MAX ✦%s' \
      "$shiny_prefix" "$BOLD" "$emoji" "$rainbow_name" "$RESET" "$BOLD" "$RESET"
    return
  fi

  if [ "$color" = "rainbow" ]; then
    color_code=$(pokemon_ansi_color "gold")
  else
    color_code=$(pokemon_ansi_color "$color")
  fi
  # Si shiny, on remplace la couleur de stage par doré pour le nom.
  [ -n "$shiny_color" ] && color_code="$shiny_color"

  local progress_pct next_threshold xp_label next_label
  progress_pct=$(pokemon_progress_pct "$total_xp" "$level")
  [ -z "$progress_pct" ] && progress_pct=0

  next_threshold=$(jq -r --argjson lvl "$level" '
    (.thresholds | length - 1) as $maxL |
    if $lvl >= $maxL then .thresholds[$maxL]
    else .thresholds[$lvl + 1] end
  ' "$POKEMON_DATA")

  _xp_fmt() {
    local n="$1"
    if [ "$n" -ge 1000000 ]; then
      awk -v n="$n" 'BEGIN{
        v=n/1000000
        if(v==int(v)) printf "%dM", int(v)
        else           printf "%.1fM", v
      }'
    elif [ "$n" -ge 1000 ]; then
      awk -v n="$n" 'BEGIN{
        v=n/1000
        if(v==int(v)) printf "%dK", int(v)
        else           printf "%.1fK", v
      }'
    else
      printf '%d' "$n"
    fi
  }

  xp_label=$(_xp_fmt "$total_xp")
  next_label=$(_xp_fmt "$next_threshold")

  local pct_color
  if [ "$progress_pct" -ge 75 ]; then
    pct_color=$(pokemon_theme_accent)
  else
    pct_color=$'\033[36m'
  fi

  local gauge_width=10 filled empty gauge_filled="" gauge_empty="" i
  filled=$(( progress_pct / 10 ))
  [ "$filled" -gt "$gauge_width" ] && filled="$gauge_width"
  [ "$filled" -lt 0 ] && filled=0
  empty=$(( gauge_width - filled ))
  for (( i=0; i<filled; i++ )); do gauge_filled+="▰"; done
  for (( i=0; i<empty;  i++ )); do gauge_empty+="▱"; done

  local gauge_color="$color_code"
  if [ "$color" = "dim" ] && [ -z "$shiny_color" ]; then
    gauge_color=$'\033[96m'
  fi

  local LEVEL_COLOR=$'\033[2m\033[37m'

  if [ "$flash" -gt 0 ]; then
    local sparkle=$'\033[93m✨\033[0m'
    printf '%s%s%s%s %s%s%s%s %sLv.%s%s %s%s%s/%s%s%s %s%s%s%s%s %s%d%%%s' \
      "$shiny_prefix" "$color_code" "$BOLD" "$emoji" \
      "$sparkle" "$name" "$sparkle" "$RESET" \
      "$LEVEL_COLOR" "$level" "$RESET" \
      "$color_code" "$xp_label" "$RESET" \
      "$DIM" "$next_label" "$RESET" \
      "$gauge_color" "$gauge_filled" "$DIM" "$gauge_empty" "$RESET" \
      "$pct_color" "$progress_pct" "$RESET"
  else
    printf '%s%s%s%s %s%s %sLv.%s%s %s%s%s/%s%s%s %s%s%s%s%s %s%d%%%s' \
      "$shiny_prefix" "$color_code" "$BOLD" "$emoji" "$name" "$RESET" \
      "$LEVEL_COLOR" "$level" "$RESET" \
      "$color_code" "$xp_label" "$RESET" \
      "$DIM" "$next_label" "$RESET" \
      "$gauge_color" "$gauge_filled" "$DIM" "$gauge_empty" "$RESET" \
      "$pct_color" "$progress_pct" "$RESET"
  fi
}
