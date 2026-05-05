#!/usr/bin/env bash
# Detailed companion view + subcommands.
# Usage:
#   ~/.claude/creature-status.sh [<subcommand>]
#
# Subcommands:
#   (none)    → current Pokémon (sprite, stage, progress, history, chain)
#   team      → roster (up to 6 archived companions at Lv.100)
#   pc        → PC storage (overflow team)
#   pokedex   → all lineages encountered + shiny tracking
#   stats     → lifetime statistics
#   badges    → earned + locked achievement badges
#   reset     → ceremonial reset (archive current to team, hatch new egg)
#   --shiny   → toggle shiny flag on current companion (cheat)

export LC_NUMERIC=C

source "$HOME/.claude/pokemon/lib.sh"
pokemon_init_state_if_missing

RESET=$'\033[0m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
GOLD=$(pokemon_theme_accent)

fmt_int() {
  awk -v n="$1" 'BEGIN{
    s = sprintf("%d", n); neg=""; if (s ~ /^-/) { neg="-"; s=substr(s,2) }
    out=""; while (length(s) > 3) { out = " " substr(s, length(s)-2) out; s = substr(s, 1, length(s)-3) }
    print neg s out
  }'
}

# Box drawing helpers — top/bottom borders with section title inline.
# Width default 64 chars. Title is centered between dashes.
pokemon_box_top() {
  local title="${1:-}" width="${2:-64}"
  local title_visible_len=0
  if [ -n "$title" ]; then
    title_visible_len=$(printf '%s' "$title" | sed -E "s/$(printf '\033')\\[[0-9;]*[a-zA-Z]//g" | LC_ALL=C.UTF-8 wc -m | tr -d ' \n')
    title_visible_len=$((title_visible_len + 2))  # spaces around title
  fi
  local dash_count=$((width - title_visible_len - 2))
  [ "$dash_count" -lt 4 ] && dash_count=4
  local dashes
  dashes=$(printf '─%.0s' $(seq 1 "$dash_count"))
  if [ -n "$title" ]; then
    printf '%s╭─ %s%s%s %s╮%s\n' "$DIM" "$BOLD" "$title" "$RESET" "$dashes" "$RESET"
  else
    printf '%s╭%s╮%s\n' "$DIM" "$dashes──" "$RESET"
  fi
}

pokemon_box_bottom() {
  local width="${1:-64}"
  local dash_count=$((width - 2))
  local dashes
  dashes=$(printf '─%.0s' $(seq 1 "$dash_count"))
  printf '%s╰%s╯%s\n' "$DIM" "$dashes" "$RESET"
}

# ── Subcommand: --shiny toggle ───────────────────────────────────────────────
toggle_shiny() {
  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    state=$(cat "$POKEMON_STATE")
    cur=$(jq -r '.is_shiny' <<<"$state")
    new=$([ "$cur" = "true" ] && echo "false" || echo "true")
    state=$(jq --argjson s "$new" '.is_shiny = $s' <<<"$state")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
    printf '%s✦ shiny → %s%s\n\n' "$GOLD" "$new" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: ceremonial reset ─────────────────────────────────────────────
ceremonial_reset() {
  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local state
    state=$(cat "$POKEMON_STATE")
    local lineage current_level
    lineage=$(jq -r '.lineage // ""' <<<"$state")
    current_level=$(jq -r '.current_level' <<<"$state")

    if [ -z "$lineage" ] || [ "$current_level" -eq 0 ]; then
      printf "\\n  %s$(pokemon_t reset.no_active)%s\\n\\n" "$DIM" "$RESET"
      return
    fi

    # Archive even if not Lv.100 — ceremonial reset is voluntary
    state=$(pokemon_archive_to_team "$now" "$state")
    state=$(pokemon_check_badges "$state" "$now")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"

    printf "\\n  %s$(pokemon_t reset.archived)%s\\n" "$BOLD" "$RESET"
    printf "  %s$(pokemon_t reset.egg_awaits)%s\\n\\n" "$DIM" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: stats ────────────────────────────────────────────────────────
view_stats() {
  printf "\\n  %s%s$(pokemon_t stats.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  local s
  s=$(jq -r '.lifetime_stats' "$POKEMON_STATE")
  local tokens evos shinies maxlvl compagnons completed first_shiny
  tokens=$(jq -r '.total_tokens' <<<"$s")
  evos=$(jq -r '.total_evolutions' <<<"$s")
  shinies=$(jq -r '.total_shinies' <<<"$s")
  maxlvl=$(jq -r '.max_level' <<<"$s")
  compagnons=$(jq -r '.total_compagnons' <<<"$s")
  completed=$(jq -r '.lineages_completed | length' <<<"$s")
  total_lineages=$(jq -r '.lineages | length' "$POKEMON_DATA")
  first_shiny=$(jq -r '.first_shiny_at // "—"' <<<"$s")

  printf "  %s$(pokemon_t_pad stats.total_tokens 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$tokens")"
  printf "  %s$(pokemon_t_pad stats.total_evolutions 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$evos")"
  printf "  %s$(pokemon_t_pad stats.total_shinies 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$shinies")"
  printf "  %s$(pokemon_t_pad stats.max_level 22)%s :  Lv.%s\\n" "$DIM" "$RESET" "$maxlvl"
  printf "  %s$(pokemon_t_pad stats.total_compagnons 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$compagnons")"
  printf "  %s$(pokemon_t_pad stats.lineages_completed 22)%s :  %s / %s\\n" "$DIM" "$RESET" "$completed" "$total_lineages"
  printf "  %s$(pokemon_t_pad stats.first_shiny 22)%s :  %s\\n\\n"  "$DIM" "$RESET" "${first_shiny:0:10}"

  # Active multipliers (last tick)
  local mults status streak
  mults=$(jq -r '.last_xp_multipliers // null' "$POKEMON_STATE")
  if [ "$mults" != "null" ]; then
    printf "  %s%s$(pokemon_t stats.multipliers_title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
    local ctx tm db st
    ctx=$(jq -r '.context'     <<<"$mults")
    tm=$(jq  -r '.type_match'  <<<"$mults")
    db=$(jq  -r '.daily_bonus' <<<"$mults")
    st=$(jq  -r '.status'      <<<"$mults")
    printf "  %s$(pokemon_t_pad stats.context 22)%s : ×%s\\n" "$DIM" "$RESET" "$ctx"
    printf "  %s$(pokemon_t_pad stats.type_match 22)%s : ×%s\\n" "$DIM" "$RESET" "$tm"
    printf "  %s$(pokemon_t_pad stats.daily_bonus 22)%s : ×%s\\n" "$DIM" "$RESET" "$db"
    printf "  %s$(pokemon_t_pad stats.status 22)%s : ×%s\\n" "$DIM" "$RESET" "$st"
    local combined
    combined=$(awk -v c="$ctx" -v t="$tm" -v d="$db" -v s="$st" 'BEGIN{printf "%.2f", c*t*d*s}')
    printf "  %s$(pokemon_t_pad stats.combined 22)%s : %s×%s%s\\n\\n" "$DIM" "$RESET" "$BOLD" "$combined" "$RESET"
  fi

  # Status flags
  status=$(jq -r '.status // "ok"' "$POKEMON_STATE")
  streak=$(jq -r '.high_context_streak // 0' "$POKEMON_STATE")
  if [ "$status" = "tired" ]; then
    printf "  %s$(pokemon_t stats.tired_warning "$streak")%s\\n\\n" "$BOLD" "$RESET"
  fi

  # Shiny charm indicator
  if [ "$shinies" -gt 0 ]; then
    printf "  %s$(pokemon_t stats.shiny_charm)%s\\n\\n" "$GOLD" "$RESET"
  fi
}

# ── Subcommand: pokedex ──────────────────────────────────────────────────────
view_pokedex() {
  printf "\\n  %s%s$(pokemon_t pokedex.title_lineages)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  jq -r '.lineages | to_entries[] | "\(.key)|\(.value.label)"' "$POKEMON_DATA" | \
  while IFS='|' read -r lin label; do
    seen=$(jq -r --arg l "$lin" '.pokedex[$l].seen // false' "$POKEMON_STATE")
    shiny=$(jq -r --arg l "$lin" '.pokedex[$l].shiny_seen // false' "$POKEMON_STATE")
    count=$(jq -r --arg l "$lin" '.pokedex[$l].count // 0' "$POKEMON_STATE")
    shiny_count=$(jq -r --arg l "$lin" '.pokedex[$l].shiny_count // 0' "$POKEMON_STATE")
    if [ "$seen" = "true" ]; then
      shiny_str=""
      [ "$shiny" = "true" ] && shiny_str="  ${GOLD}$(pokemon_t pokedex.shiny_seen)${RESET}"
      printf "   %s✓%s  %-20s %s×%d   %s: %d%s\\n" \
        "$BOLD" "$RESET" "$label" "$DIM" "$count" "$(pokemon_t pokedex.shinies)" "$shiny_count" "$shiny_str"
    else
      printf '   ▢  %s%-20s%s  %s—%s\n' "$DIM" "$label" "$RESET" "$DIM" "$RESET"
    fi
  done

  # Wild encounters section — Gen 1 + Gen 2 dex (251 entries, sorted by national_dex)
  local wild_seen total_wild lang
  wild_seen=$(jq -r '(.pokedex_wild // {}) | length' "$POKEMON_STATE")
  total_wild=$(jq -r '.wild_pool | length' "$POKEMON_DATA")
  lang=$(jq -r '.language // "fr"' "$POKEMON_DATA")

  printf "\\n  %s%s$(pokemon_t pokedex.title_wild)%s   %s(%d / %d)%s\\n\\n" \
    "$BOLD" "$GOLD" "$RESET" "$DIM" "$wild_seen" "$total_wild" "$RESET"

  # Pre-fetch all seen IDs in one jq call → load into awk dict
  local seen_ids
  seen_ids=$(jq -r '(.pokedex_wild // {}) | keys[]' "$POKEMON_STATE" | tr '\n' '|')

  jq -r --arg lang "name_$lang" '
    .wild_pool | sort_by(.national_dex)[] |
    "\(.national_dex)|\(.id)|\(.[$lang])|\(.emoji)|\(.rarity // "common")"
  ' "$POKEMON_DATA" | \
  awk -F'|' -v seen_list="$seen_ids" -v dim="$DIM" -v rst="$RESET" -v bold="$BOLD" -v gold="$GOLD" '
  BEGIN {
    col=0
    n = split(seen_list, arr, "|")
    for (i=1; i<=n; i++) seen[arr[i]] = 1
  }
  {
    dex=$1; id=$2; name=$3; rarity=$5
    if (seen[id]) {
      marker = bold "✓" rst
      style = ""
      name_disp = name
    } else {
      marker = dim "▢" rst
      style = dim
      name_disp = "???"
    }
    rarity_marker = (rarity == "legendary") ? gold "★" rst : " "
    printf "  %s #%03d %s %s%-12s%s", marker, dex, rarity_marker, style, name_disp, rst
    col++
    if (col >= 4) { printf "\n"; col=0 }
  }
  END { if (col > 0) printf "\n" }
  '
  printf '\n'
}

# ── Subcommand: badges ───────────────────────────────────────────────────────
view_badges() {
  printf "\\n  %s%s$(pokemon_t badges.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  local all_badges=(
    hatch first_evolution first_shiny champion centurion constellation
    master_pokedex master_fire master_water master_grass master_electric master_eevee
    master_chikorita master_cyndaquil master_totodile
  )
  for id in "${all_badges[@]}"; do
    earned_at=$(jq -r --arg id "$id" '.badges[] | select(.id == $id) | .earned_at' "$POKEMON_STATE")
    emoji=$(pokemon_badge_meta "$id" emoji)
    label=$(pokemon_badge_meta "$id" label)
    desc=$(pokemon_badge_meta "$id" desc)
    if [ -n "$earned_at" ]; then
      printf '   %s  %s%-22s%s  %s%s%s\n     %s%s%s\n' \
        "$emoji" "$BOLD" "$label" "$RESET" "$GOLD" "${earned_at:0:10}" "$RESET" "$DIM" "$desc" "$RESET"
    else
      printf '   %s%s  %-22s%s\n     %s%s%s\n' \
        "$DIM" "▢" "$label" "$RESET" "$DIM" "$desc" "$RESET"
    fi
  done
  printf '\n'
}

# ── Subcommand: team / pc ────────────────────────────────────────────────────
view_roster() {
  local field="$1" title="$2"
  printf '\n  %s%s%s%s\n\n' "$BOLD" "$GOLD" "$title" "$RESET"
  local count
  count=$(jq -r --arg f "$field" '.[$f] | length' "$POKEMON_STATE")
  if [ "$count" = "0" ] || [ -z "$count" ]; then
    printf "  %s$(pokemon_t team.empty)%s\\n\\n" "$DIM" "$RESET"
    return
  fi
  local i=0
  jq -r --arg f "$field" '.[$f][] |
    "\(.lineage)|\(.is_shiny)|\(.level)|\(.max_stage)|\(.created_at)|\(.completed_at)"' "$POKEMON_STATE" | \
  while IFS='|' read -r lin shiny lvl name created completed; do
    star=""
    [ "$shiny" = "true" ] && star="${GOLD}★${RESET} "
    label=$(jq -r --arg l "$lin" '.lineages[$l].label // $l' "$POKEMON_DATA")
    printf '   %s[%d]%s  %s%-22s  %sLv.%d%s  %s%s%s  (%s%s%s → %s%s%s)\n' \
      "$BOLD" "$i" "$RESET" "$star" "$name" "$BOLD" "$lvl" "$RESET" "$DIM" "$label" "$RESET" \
      "$DIM" "${created:0:10}" "$RESET" "$DIM" "${completed:0:10}" "$RESET"
    i=$((i+1))
  done
  printf '\n'
}

view_team() {
  view_roster "team" "$(pokemon_t team.title)"
  pc_count=$(jq -r '.pc_storage | length' "$POKEMON_STATE")
  if [ "$pc_count" -gt 0 ]; then
    printf "  %s$(pokemon_t team.pc_overflow) — %sbash %s pc%s\\n\\n" \
      "$DIM" "$pc_count" "$DIM" "${0##*/}" "$RESET"
  fi
}

view_pc() { view_roster "pc_storage" "$(pokemon_t pc.title)"; }

# ── Subcommand: inventory ────────────────────────────────────────────────────
view_inventory() {
  printf "\\n  %s%s$(pokemon_t inventory.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  local count
  count=$(jq -r '.items // {} | length' "$POKEMON_STATE")
  if [ "$count" = "0" ]; then
    printf "  %s$(pokemon_t inventory.empty)%s\\n\\n" "$DIM" "$RESET"
  else
    jq -r '.items | to_entries[] | "\(.key)|\(.value)"' "$POKEMON_STATE" | \
    while IFS='|' read -r item_id qty; do
      name=$(jq -r --arg id "$item_id" '.items[$id].name // $id' "$POKEMON_DATA")
      emoji=$(jq -r --arg id "$item_id" '.items[$id].emoji // "?"' "$POKEMON_DATA")
      desc=$(jq -r --arg id "$item_id" '.items[$id].desc // ""' "$POKEMON_DATA")
      printf '   %s  %s%-18s%s  %s×%d%s\n     %s%s%s\n' \
        "$emoji" "$BOLD" "$name" "$RESET" "$DIM" "$qty" "$RESET" \
        "$DIM" "$desc" "$RESET"
    done
    printf '\n'
  fi
  # Eevee form info
  local eevee_form
  eevee_form=$(jq -r '.eevee_form // empty' "$POKEMON_STATE")
  if [ -n "$eevee_form" ]; then
    local form_name msg
    form_name=$(jq -r --arg f "$eevee_form" '.lineages.eevee.stages | map(select(.showdown_id == $f)) | .[0].name' "$POKEMON_DATA")
    msg=$(pokemon_t inventory.eevee_form "$form_name")
    printf "  %s%s%s\\n\\n" "$DIM" "$msg" "$RESET"
  fi
}

# ── Helpers shared by switch/deposit/withdraw views ──────────────────────────
# Print one roster entry with slot number. Args: $1 = JSON of entry, $2 = slot, $3 = "active"|""
_print_roster_entry() {
  local entry="$1" slot="$2" marker="$3"
  local lin shiny lvl name
  lin=$(jq -r '.lineage' <<<"$entry")
  shiny=$(jq -r '.is_shiny' <<<"$entry")
  lvl=$(jq -r '.level // .current_level' <<<"$entry")
  name=$(jq -r '.max_stage // (.evolution_history | last.name) // "Œuf"' <<<"$entry")
  local star=""
  [ "$shiny" = "true" ] && star="${GOLD}★${RESET} "
  local label
  label=$(jq -r --arg l "$lin" '.lineages[$l].label // $l' "$POKEMON_DATA" 2>/dev/null)
  local marker_str=""
  [ "$marker" = "active" ] && marker_str="  ${GOLD}$(pokemon_t common.active_marker)${RESET}"
  printf '   %s[%s]%s  %s%-22s  %sLv.%d%s  %s%s%s%s\n' \
    "$BOLD" "$slot" "$RESET" "$star" "$name" "$BOLD" "$lvl" "$RESET" \
    "$DIM" "$label" "$RESET" "$marker_str"
}

# ── Subcommand: switch ───────────────────────────────────────────────────────
view_switch() {
  local target_slot="${1:-}"
  printf "\\n  %s%s$(pokemon_t switch.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  if [ -z "$target_slot" ]; then
    # No slot arg → display roster
    local active_lineage active_level
    active_lineage=$(jq -r '.lineage // ""' "$POKEMON_STATE")
    active_level=$(jq -r '.current_level' "$POKEMON_STATE")
    if [ -n "$active_lineage" ] && [ "$active_level" -gt 0 ]; then
      _print_roster_entry "$(jq '{lineage, is_shiny, level: .current_level, max_stage: ((.evolution_history | last.name) // "Œuf"), evolution_history}' "$POKEMON_STATE")" "-" "active"
    else
      printf "   %s$(pokemon_t switch.no_active)%s\\n" "$DIM" "$RESET"
    fi
    printf '\n'
    local team_count
    team_count=$(jq -r '.team | length' "$POKEMON_STATE")
    if [ "$team_count" = "0" ]; then
      printf "   %s$(pokemon_t switch.no_team)%s\\n\\n" "$DIM" "$RESET"
    else
      for ((i=0; i<team_count; i++)); do
        _print_roster_entry "$(jq --argjson i "$i" '.team[$i]' "$POKEMON_STATE")" "$i" ""
      done
      printf "\\n  %s$(pokemon_t switch.usage)%s\\n\\n" "$DIM" "$RESET"
    fi
    return
  fi

  # Slot arg given → perform swap
  local team_count
  team_count=$(jq -r '.team | length' "$POKEMON_STATE")
  if [ "$target_slot" -ge "$team_count" ] || [ "$target_slot" -lt 0 ]; then
    printf "  %s$(pokemon_t switch.out_of_range $((team_count-1)))%s\n\n" "$DIM" "$RESET"
    return
  fi

  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local now state
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    state=$(cat "$POKEMON_STATE")
    local active_name target_name
    active_name=$(jq -r '(.evolution_history | last.name) // "Œuf"' <<<"$state")
    target_name=$(jq -r --argjson i "$target_slot" '.team[$i].max_stage // "Œuf"' <<<"$state")

    # Save current active to team
    state=$(pokemon_active_to_archive "$now" "$state")
    # Re-fetch slot index (it may have shifted if active was archived)
    # Active was appended at end of team, so target_slot is unchanged unless overflow happened
    local current_team_size
    current_team_size=$(jq '.team | length' <<<"$state")
    # If team overflowed (now in PC), target_slot might be off — keep simple: assume not full case
    state=$(pokemon_load_team_to_active "$now" "$state" "$target_slot")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"

    printf "  %s$(pokemon_t switch.swapped "$active_name" "$target_name")%s\n\n" "$BOLD" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: hatch ────────────────────────────────────────────────────────
view_hatch() {
  local target_lineage="${1:-}"
  printf "\\n  %s%s$(pokemon_t hatch.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  # Validate lineage if provided
  if [ -n "$target_lineage" ]; then
    if ! jq -e --arg l "$target_lineage" '.lineages[$l]' "$POKEMON_DATA" >/dev/null 2>&1; then
      local available
      available=$(jq -r '.lineages | keys | join(", ")' "$POKEMON_DATA")
      printf "  %s$(pokemon_t hatch.no_lineage_match "$target_lineage" "$available")%s\n\n" "$DIM" "$RESET"
      return
    fi
  fi

  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local now state active_name active_level
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    state=$(cat "$POKEMON_STATE")
    active_name=$(jq -r '(.evolution_history | last.name) // "Œuf"' <<<"$state")
    active_level=$(jq -r '.current_level' <<<"$state")

    if [ "$active_level" -gt 0 ]; then
      state=$(pokemon_active_to_archive "$now" "$state")
      printf "  %s$(pokemon_t hatch.current_archived "$active_name")%s\n" "$DIM" "$RESET"
    fi
    state=$(pokemon_reset_active "$now" "$state" "$target_lineage")
    state=$(pokemon_check_badges "$state" "$now")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"

    local lin_label="${target_lineage:-random}"
    printf "  %s$(pokemon_t hatch.egg_starting "$lin_label")%s\n\n" "$BOLD" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: deposit (team → PC) ──────────────────────────────────────────
view_deposit() {
  local slot="${1:-}"
  printf "\\n  %s%s$(pokemon_t deposit.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  if [ -z "$slot" ]; then
    printf "  %s$(pokemon_t deposit.usage)%s\n\n" "$DIM" "$RESET"
    return
  fi
  local team_count
  team_count=$(jq -r '.team | length' "$POKEMON_STATE")
  if [ "$team_count" = "0" ]; then
    printf "  %s$(pokemon_t deposit.no_team)%s\n\n" "$DIM" "$RESET"; return
  fi
  if [ "$slot" -ge "$team_count" ] || [ "$slot" -lt 0 ]; then
    printf "  %s$(pokemon_t switch.out_of_range $((team_count-1)))%s\n\n" "$DIM" "$RESET"; return
  fi

  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local state name
    state=$(cat "$POKEMON_STATE")
    name=$(jq -r --argjson i "$slot" '.team[$i].max_stage // "Œuf"' <<<"$state")
    state=$(pokemon_team_to_pc "$state" "$slot")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
    printf "  %s$(pokemon_t deposit.success "$name")%s\n\n" "$BOLD" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: withdraw (PC → team/active) ──────────────────────────────────
view_withdraw() {
  local slot="${1:-}"
  printf "\\n  %s%s$(pokemon_t withdraw.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  if [ -z "$slot" ]; then
    printf "  %s$(pokemon_t withdraw.usage)%s\n\n" "$DIM" "$RESET"; return
  fi
  local pc_count
  pc_count=$(jq -r '.pc_storage | length' "$POKEMON_STATE")
  if [ "$pc_count" = "0" ]; then
    printf "  %s$(pokemon_t withdraw.no_pc)%s\n\n" "$DIM" "$RESET"; return
  fi
  if [ "$slot" -ge "$pc_count" ] || [ "$slot" -lt 0 ]; then
    printf "  %s$(pokemon_t switch.out_of_range $((pc_count-1)))%s\n\n" "$DIM" "$RESET"; return
  fi

  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local now state name new_state
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    state=$(cat "$POKEMON_STATE")
    name=$(jq -r --argjson i "$slot" '.pc_storage[$i].max_stage // "Œuf"' <<<"$state")
    if new_state=$(pokemon_pc_to_team_or_active "$now" "$state" "$slot"); then
      printf '%s\n' "$new_state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
      printf "  %s$(pokemon_t withdraw.success "$name")%s\n\n" "$BOLD" "$RESET"
    else
      printf "  %s$(pokemon_t withdraw.team_full)%s\n\n" "$DIM" "$RESET"
    fi
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: release ──────────────────────────────────────────────────────
view_release() {
  local area="${1:-}" slot="${2:-}" confirm_flag="${3:-}"
  printf "\\n  %s%s$(pokemon_t release.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  if [ -z "$area" ] || [ -z "$slot" ]; then
    printf "  %s$(pokemon_t release.usage)%s\n\n" "$DIM" "$RESET"; return
  fi
  case "$area" in team|pc) : ;; *) printf "  %s$(pokemon_t release.usage)%s\n\n" "$DIM" "$RESET"; return ;; esac

  local field count
  [ "$area" = "team" ] && field="team" || field="pc_storage"
  count=$(jq -r --arg f "$field" '.[$f] | length' "$POKEMON_STATE")
  if [ "$count" = "0" ]; then
    if [ "$area" = "team" ]; then
      printf "  %s$(pokemon_t team.empty)%s\n\n" "$DIM" "$RESET"
    else
      printf "  %s$(pokemon_t pc.empty)%s\n\n" "$DIM" "$RESET"
    fi
    return
  fi
  if [ "$slot" -ge "$count" ] || [ "$slot" -lt 0 ]; then
    printf "  %s$(pokemon_t switch.out_of_range $((count-1)))%s\n\n" "$DIM" "$RESET"; return
  fi

  local name
  name=$(jq -r --arg f "$field" --argjson i "$slot" '.[$f][$i].max_stage // "Œuf"' "$POKEMON_STATE")

  if [ "$confirm_flag" != "--confirm" ]; then
    printf "  %s$(pokemon_t release.confirm_required)%s\n" "$DIM" "$RESET"
    printf "  %sCible : %s%s%s (slot %d)%s\n\n" "$DIM" "$BOLD" "$name" "$RESET" "$slot" "$RESET"
    return
  fi

  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local state
    state=$(cat "$POKEMON_STATE")
    state=$(pokemon_release_slot "$state" "$area" "$slot")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
    printf "  %s$(pokemon_t release.released "$name")%s\n\n" "$BOLD" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: give (equip held item) ──────────────────────────────────────
view_give() {
  local item_id="${1:-}"
  printf "\\n  %s%s$(pokemon_t held.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  if [ -z "$item_id" ]; then
    printf "  %s$(pokemon_t held.usage_give)%s\n\n" "$DIM" "$RESET"
    return
  fi
  # Verify item is in inventory
  local count
  count=$(jq -r --arg id "$item_id" '.items[$id] // 0' "$POKEMON_STATE")
  if [ "$count" = "0" ] || [ -z "$count" ]; then
    printf "  %s$(pokemon_t held.no_inventory)%s\n\n" "$DIM" "$RESET"; return
  fi
  # Verify item is holdable
  local holdable
  holdable=$(jq -r --arg id "$item_id" '.items[$id].holdable // false' "$POKEMON_DATA")
  if [ "$holdable" != "true" ]; then
    printf "  %s$(pokemon_t held.not_holdable)%s\n\n" "$DIM" "$RESET"; return
  fi
  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local state name
    state=$(cat "$POKEMON_STATE")
    name=$(jq -r --arg id "$item_id" '.items[$id].name // $id' "$POKEMON_DATA")
    state=$(jq --arg id "$item_id" '
      .items[$id] -= 1
      | (if .items[$id] <= 0 then del(.items[$id]) else . end)
      | .held_item = $id
    ' <<<"$state")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
    printf "  %s$(pokemon_t held.given "$name")%s\n\n" "$BOLD" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: take (unequip held item) ─────────────────────────────────────
view_take() {
  printf "\\n  %s%s$(pokemon_t held.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  local current
  current=$(jq -r '.held_item // ""' "$POKEMON_STATE")
  if [ -z "$current" ]; then
    printf "  %s$(pokemon_t held.none)%s\n\n" "$DIM" "$RESET"; return
  fi
  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local state
    state=$(cat "$POKEMON_STATE")
    state=$(jq --arg id "$current" '
      .items[$id] = ((.items[$id] // 0) + 1)
      | .held_item = null
    ' <<<"$state")
    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
    printf "  %s$(pokemon_t held.taken)%s\n\n" "$BOLD" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: trade (one trade per day) ────────────────────────────────────
view_trade() {
  local trainer="${1:-Anonymous}"
  printf "\\n  %s%s$(pokemon_t trade.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  # Check cooldown
  local last_trade now_epoch last_epoch hours_passed cooldown_h
  last_trade=$(jq -r '.last_trade_at // ""' "$POKEMON_STATE")
  cooldown_h=$(jq -r '.trade_cooldown_hours // 24' "$POKEMON_DATA")
  if [ -n "$last_trade" ]; then
    now_epoch=$(date -u +%s)
    last_epoch=$(date -u -d "$last_trade" +%s 2>/dev/null || echo 0)
    hours_passed=$(( (now_epoch - last_epoch) / 3600 ))
    if [ "$hours_passed" -lt "$cooldown_h" ]; then
      local remaining=$((cooldown_h - hours_passed))
      printf "  %s$(pokemon_t trade.cooldown "$remaining")%s\n\n" "$DIM" "$RESET"
      return
    fi
  fi

  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local now state
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    state=$(cat "$POKEMON_STATE")

    # Pick random Pokémon from wild_pool
    local pool_count idx
    pool_count=$(jq -r '.wild_pool | length' "$POKEMON_DATA")
    idx=$((RANDOM % pool_count))
    local lang sid name dex
    lang=$(jq -r '.language // "fr"' "$POKEMON_DATA")
    sid=$(jq -r --argjson i "$idx" '.wild_pool[$i].id' "$POKEMON_DATA")
    name=$(jq -r --argjson i "$idx" --arg lang "name_$lang" '.wild_pool[$i][$lang]' "$POKEMON_DATA")
    dex=$(jq -r --argjson i "$idx" '.wild_pool[$i].national_dex' "$POKEMON_DATA")

    # Random level 5-50
    local level=$((RANDOM % 46 + 5))
    # 5% shiny chance
    local shiny="false" shiny_str=""
    if [ $((RANDOM % 20)) -eq 0 ]; then
      shiny="true"
      shiny_str=" $(pokemon_t trade.shiny_received)"
    fi

    # Add to team if space, else PC
    local destination team_full
    team_full=$(jq -r '(.team | length) >= 6' <<<"$state")
    if [ "$team_full" = "true" ]; then
      destination="PC"
    else
      destination="team"
    fi

    # Build entry: it's a wild Pokémon, so use wild_pool data; not a regular lineage entry
    state=$(jq --arg sid "$sid" --arg name "$name" --argjson lvl "$level" \
               --argjson shiny "$shiny" --arg dest "$destination" --arg now "$now" '
      ($sid + " (trade)") as $lineage_label
      | {
          lineage: ("trade-" + $sid),
          is_shiny: $shiny,
          level: $lvl,
          total_xp: 0,
          max_stage: $name,
          evolution_history: [{level: $lvl, name: $name, evolved_at: $now, is_shiny: $shiny}],
          eevee_form: null,
          items: {},
          created_at: $now,
          completed_at: $now,
          source: "trade"
        } as $entry
      | (if $dest == "team" then .team += [$entry] else .pc_storage += [$entry] end)
      | .last_trade_at = $now
      | .recent_events = ([{type: "trade", id: $sid, name: $name, at: $now}]
                          + (.recent_events // []))[0:10]
    ' <<<"$state")

    printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"

    local dest_label
    [ "$destination" = "team" ] && dest_label="$(pokemon_t team.title)" || dest_label="$(pokemon_t pc.title)"
    local lvl_str="Lv.$level"
    [ "$shiny" = "true" ] && lvl_str="${GOLD}★${RESET} $lvl_str"
    printf "  %s#%03d %s %s%s   %s%s%s\n" "$BOLD" "$dex" "$name" "$lvl_str" "$shiny_str" "$DIM" "(par $trainer)" "$RESET"
    printf "  %s$(pokemon_t trade.received "$name" "$shiny_str" "$dest_label")%s\n\n" "$DIM" "$RESET"
  ) 200>"$POKEMON_LOCK"
}

# ── Default view: current Pokémon ────────────────────────────────────────────
view_main() {
  local lineage level total_xp is_shiny created_at max_level
  lineage=$(jq -r '.lineage // "fire"' "$POKEMON_STATE")
  level=$(jq -r '.current_level' "$POKEMON_STATE")
  total_xp=$(jq -r '.total_xp' "$POKEMON_STATE")
  is_shiny=$(jq -r '.is_shiny' "$POKEMON_STATE")
  created_at=$(jq -r '.created_at' "$POKEMON_STATE")
  max_level=$(pokemon_max_level)

  local name showdown_id emoji color lineage_label
  name=$(pokemon_evo_field "$lineage" "$level" "name")
  showdown_id=$(pokemon_evo_field "$lineage" "$level" "showdown_id")
  emoji=$(pokemon_evo_field "$lineage" "$level" "emoji")
  color=$(pokemon_evo_field "$lineage" "$level" "color")
  lineage_label=$(jq -r --arg l "$lineage" '.lineages[$l].label' "$POKEMON_DATA")

  local cur_stage_lvl next_lvl
  cur_stage_lvl=$(jq -r --arg lin "$lineage" --argjson lvl "$level" '
    .lineages[$lin].stages as $s
    | ($s | map(select(.min_level <= $lvl)) | map(.min_level) | max) as $m
    | $s | map(select(.min_level == $m)) | .[0].min_level
  ' "$POKEMON_DATA")
  next_lvl=$(jq -r --arg lin "$lineage" --argjson lvl "$level" '
    .lineages[$lin].stages
    | map(select(.min_level > $lvl))
    | if length == 0 then "null" else (min_by(.min_level).min_level | tostring) end
  ' "$POKEMON_DATA")

  local color_code
  color_code=$(pokemon_ansi_color "$color")
  [ "$color" = "rainbow" ] && color_code=$(pokemon_ansi_color "gold")
  [ "$is_shiny" = "true" ] && color_code="$GOLD"

  # Top border + COMPAGNON title
  printf '\n'
  pokemon_box_top "$(pokemon_t main.companion)" 64

  # Sprite (32x16 standard)
  local sprite_variant="normal"
  [ "$is_shiny" = "true" ] && sprite_variant="shiny"
  local sprite_path="$POKEMON_DIR/sprites/$sprite_variant/$showdown_id.txt"
  if [ -f "$sprite_path" ]; then
    while IFS= read -r line; do printf '  %s\n' "$line"; done < "$sprite_path"
    printf '\n'
  fi

  # Header
  local shiny_badge=""
  [ "$is_shiny" = "true" ] && shiny_badge="${GOLD}★ SHINY${RESET}  "
  printf "  %s%s$(pokemon_t main.companion)%s   %s%s%s%s   %sdepuis %s%s\\n\\n" \
    "$BOLD" "$color_code" "$RESET" "$shiny_badge" "$DIM" "$lineage_label" "$RESET" "$DIM" "${created_at:0:10}" "$RESET"

  # Current stage + progression
  if [ "$level" -ge "$max_level" ]; then
    # True MAX (Lv.100 reached)
    local rainbow_name
    rainbow_name=$(pokemon_rainbow_name "$name")
    printf '  %s   %s%s%s   %s%sLv.%d%s   %sLv.MAX ✦%s\n\n' \
      "$emoji" "$rainbow_name" "$RESET" "$RESET" "$color_code" "$BOLD" "$level" "$RESET" "$BOLD" "$RESET"
  elif [ "$next_lvl" = "null" ]; then
    # Final stage form (Eevee post-Lv.30) but Lv < 100 — still progressing to Lv.100
    local cur_threshold next_threshold band_xp band_total remaining progress_pct
    cur_threshold=$(pokemon_threshold "$cur_stage_lvl")
    next_threshold=$(pokemon_threshold "$max_level")
    band_xp=$(( total_xp - cur_threshold ))
    band_total=$(( next_threshold - cur_threshold ))
    remaining=$(( next_threshold - total_xp ))
    progress_pct=$(( band_xp * 100 / band_total ))
    [ "$progress_pct" -lt 0 ] && progress_pct=0
    [ "$progress_pct" -gt 100 ] && progress_pct=100

    local bar_width=20 filled empty bar="" i
    filled=$(( progress_pct * bar_width / 100 ))
    [ "$filled" -gt "$bar_width" ] && filled="$bar_width"
    empty=$(( bar_width - filled ))
    for (( i=0; i<filled; i++ )); do bar+="█"; done
    for (( i=0; i<empty; i++ )); do bar+="░"; done

    printf '  %s   %s%s%s%s   %s%sLv.%d%s\n\n' \
      "$emoji" "$color_code" "$BOLD" "$name" "$RESET" "$color_code" "$BOLD" "$level" "$RESET"
    printf '  %s%s%s   %s%d%% vers Lv.MAX (forme stable)%s\n\n' \
      "$color_code" "$bar" "$RESET" "$DIM" "$progress_pct" "$RESET"
    printf "  %s$(pokemon_t_pad main.xp_total 22)%s :  %s tokens\\n" "$DIM" "$RESET" "$(fmt_int "$total_xp")"
    printf "  %s$(pokemon_t_pad main.remaining 22)%s :  %s tokens (Lv.%d)\\n\\n" "$DIM" "$RESET" "$(fmt_int "$remaining")" "$max_level"
  else
    local cur_threshold next_threshold band_xp band_total remaining progress_pct
    cur_threshold=$(pokemon_threshold "$cur_stage_lvl")
    next_threshold=$(pokemon_threshold "$next_lvl")
    band_xp=$(( total_xp - cur_threshold ))
    band_total=$(( next_threshold - cur_threshold ))
    remaining=$(( next_threshold - total_xp ))
    progress_pct=$(( band_xp * 100 / band_total ))
    [ "$progress_pct" -lt 0 ] && progress_pct=0
    [ "$progress_pct" -gt 100 ] && progress_pct=100

    local bar_width=20 filled empty bar="" i
    filled=$(( progress_pct * bar_width / 100 ))
    [ "$filled" -gt "$bar_width" ] && filled="$bar_width"
    empty=$(( bar_width - filled ))
    for (( i=0; i<filled; i++ )); do bar+="█"; done
    for (( i=0; i<empty; i++ )); do bar+="░"; done

    local next_name next_emoji
    next_name=$(jq -r --arg lin "$lineage" --argjson lvl "$level" '
      .lineages[$lin].stages | map(select(.min_level > $lvl)) | min_by(.min_level).name' "$POKEMON_DATA")
    next_emoji=$(jq -r --arg lin "$lineage" --argjson lvl "$level" '
      .lineages[$lin].stages | map(select(.min_level > $lvl)) | min_by(.min_level).emoji' "$POKEMON_DATA")

    printf '  %s   %s%s%s%s   %s%sLv.%d%s\n\n' \
      "$emoji" "$color_code" "$BOLD" "$name" "$RESET" "$color_code" "$BOLD" "$level" "$RESET"
    printf '  %s%s%s   %s%d%% vers %s %s%s\n\n' \
      "$color_code" "$bar" "$RESET" "$DIM" "$progress_pct" "$next_emoji" "$next_name" "$RESET"
    printf "  %s$(pokemon_t_pad main.xp_total 22)%s :  %s tokens\\n" "$DIM" "$RESET" "$(fmt_int "$total_xp")"
    printf "  %s$(pokemon_t_pad main.stage_progress 22)%s :  %s / %s\\n" "$DIM" "$RESET" "$(fmt_int "$band_xp")" "$(fmt_int "$band_total")"
    printf "  %s$(pokemon_t_pad main.remaining 22)%s :  %s tokens (Lv.%d)\\n\\n" "$DIM" "$RESET" "$(fmt_int "$remaining")" "$next_lvl"
  fi

  # Moves — must respect Eevee form choice (state.eevee_form)
  local moves stage_json
  if [ "$lineage" = "eevee" ] && [ "$level" -ge 30 ]; then
    local eform
    eform=$(jq -r '.eevee_form // empty' "$POKEMON_STATE")
    if [ -n "$eform" ]; then
      moves=$(jq -r --arg lin "$lineage" --arg form "$eform" '
        .lineages[$lin].stages | map(select(.showdown_id == $form)) | .[0].moves // []
        | if length == 0 then "" else join(", ") end' "$POKEMON_DATA")
    fi
  fi
  if [ -z "$moves" ]; then
    moves=$(jq -r --arg lin "$lineage" --argjson lvl "$level" '
      .lineages[$lin].stages as $s
      | ($s | map(select(.min_level <= $lvl)) | map(.min_level) | max) as $m
      | $s | map(select(.min_level == $m)) | .[0].moves // []
      | if length == 0 then "" else join(", ") end' "$POKEMON_DATA")
  fi
  if [ -n "$moves" ]; then
    printf "  %s$(pokemon_t_pad main.moves 22)%s :  %s\\n\\n" "$DIM" "$RESET" "$moves"
  fi

  # Types Pokémon (résolution Eevee-aware via creature_evo_field via state)
  local lang_main types_json
  lang_main=$(jq -r '.language // "fr"' "$POKEMON_DATA")
  if [ "$lineage" = "eevee" ] && [ "$level" -ge 30 ]; then
    local eform
    eform=$(jq -r '.eevee_form // empty' "$POKEMON_STATE")
    if [ -n "$eform" ]; then
      types_json=$(jq -c --arg lin "$lineage" --arg form "$eform" '
        .lineages[$lin].stages | map(select(.showdown_id == $form)) | .[0].types // []
      ' "$POKEMON_DATA")
    fi
  fi
  if [ -z "$types_json" ]; then
    types_json=$(jq -c --arg lin "$lineage" --argjson lvl "$level" '
      .lineages[$lin].stages as $s
      | ($s | map(select(.min_level <= $lvl)) | map(.min_level) | max) as $m
      | $s | map(select(.min_level == $m)) | .[0].types // []
    ' "$POKEMON_DATA")
  fi
  if [ "$types_json" != "[]" ] && [ -n "$types_json" ]; then
    printf "  %s$(pokemon_t_pad main.types 22)%s :  " "$DIM" "$RESET"
    local first=1
    echo "$types_json" | jq -r '.[]' | while read -r t; do
      [ "$first" = "0" ] && printf " "
      tcolor=$(pokemon_type_color "$t")
      printf '%s[ %s ]%s' "$tcolor" "$t" "$RESET"
      first=0
    done
    printf '\n\n'
  fi

  # Pokédex entry (description courte)
  local pokedex_entry
  if [ "$lineage" = "eevee" ] && [ "$level" -ge 30 ]; then
    local eform
    eform=$(jq -r '.eevee_form // empty' "$POKEMON_STATE")
    if [ -n "$eform" ]; then
      pokedex_entry=$(jq -r --arg lin "$lineage" --arg form "$eform" --arg key "pokedex_$lang_main" '
        .lineages[$lin].stages | map(select(.showdown_id == $form)) | .[0][$key] // empty
      ' "$POKEMON_DATA")
    fi
  fi
  if [ -z "$pokedex_entry" ]; then
    pokedex_entry=$(jq -r --arg lin "$lineage" --argjson lvl "$level" --arg key "pokedex_$lang_main" '
      .lineages[$lin].stages as $s
      | ($s | map(select(.min_level <= $lvl)) | map(.min_level) | max) as $m
      | $s | map(select(.min_level == $m)) | .[0][$key] // empty
    ' "$POKEMON_DATA")
  fi
  if [ -n "$pokedex_entry" ]; then
    printf "  %s$(pokemon_t_pad main.pokedex_entry 22)%s :  %s%s%s\\n\\n" "$DIM" "$RESET" "$DIM" "$pokedex_entry" "$RESET"
  fi

  # Held item + injured status indicators
  local held_item held_name held_emoji
  held_item=$(jq -r '.held_item // ""' "$POKEMON_STATE")
  if [ -n "$held_item" ]; then
    held_name=$(jq -r --arg id "$held_item" '.items[$id].name // $id' "$POKEMON_DATA")
    held_emoji=$(jq -r --arg id "$held_item" '.items[$id].emoji // "?"' "$POKEMON_DATA")
    printf "  %s$(pokemon_t_pad main.held_item 22)%s :  %s %s\\n\\n" "$DIM" "$RESET" "$held_emoji" "$held_name"
  fi
  local injured
  injured=$(jq -r '.injured_ticks_remaining // 0' "$POKEMON_STATE")
  if [ "$injured" -gt 0 ]; then
    printf "  %s$(pokemon_t main.status_injured)%s   %s($injured ticks remaining)%s\\n\\n" \
      "${BOLD}\\033[91m" "$RESET" "$DIM" "$RESET"
  fi

  # Friendship counter
  local friendship
  friendship=$(jq -r '.friendship // 0' "$POKEMON_STATE")
  if [ "$friendship" -gt 0 ]; then
    # Heart icon scales with friendship: 0-100=💗, 100-500=💖, 500+=💞
    local heart="💗"
    [ "$friendship" -ge 100 ] && heart="💖"
    [ "$friendship" -ge 500 ] && heart="💞"
    printf "  %s$(pokemon_t_pad main.friendship 22)%s :  %s %s\\n\\n" "$DIM" "$RESET" "$heart" "$friendship"
  fi

  # Badges earned (compact summary)
  local badges_count
  badges_count=$(jq -r '.badges | length' "$POKEMON_STATE")
  if [ "$badges_count" -gt 0 ]; then
    printf "  %s$(pokemon_t_pad main.badges 22)%s :  " "$DIM" "$RESET"
    jq -r '.badges[] | .id' "$POKEMON_STATE" | while read -r bid; do
      printf '%s ' "$(pokemon_badge_meta "$bid" emoji)"
    done
    printf ' %s(%d/%d)%s\n\n' "$DIM" "$badges_count" "15" "$RESET"
  fi

  # End of "compagnon card" section
  pokemon_box_bottom 64
  printf '\n'

  # Recent events (last 3) — encounter events lookup name via wild_pool.id
  local events_count lang_evt
  events_count=$(jq -r '.recent_events | length' "$POKEMON_STATE" 2>/dev/null || echo 0)
  lang_evt=$(jq -r '.language // "fr"' "$POKEMON_DATA")
  if [ "$events_count" -gt 0 ]; then
    printf "  %s$(pokemon_t main.recent_events)%s\\n" "$BOLD" "$RESET"
    jq -r '.recent_events[0:3][] | "\(.type)|\(.id // "")|\(.at)|\(.xp // 0)|\(.name // "")|\(.emoji // "")"' "$POKEMON_STATE" | \
    while IFS='|' read -r etype eid eat exp ename eemoji; do
      case "$etype" in
        berry)
          printf '   🍇 %s%s %s +%s XP   %s%s%s\n' "$eemoji" "$RESET" "$ename" "$exp" "$DIM" "${eat//T/ }" "$RESET"
          ;;
        encounter)
          local wn we
          wn=$(jq -r --arg id "$eid" --arg lang "name_$lang_evt" '.wild_pool[] | select(.id == $id) | .[$lang]' "$POKEMON_DATA")
          we=$(jq -r --arg id "$eid" '.wild_pool[] | select(.id == $id) | .emoji' "$POKEMON_DATA")
          printf '   ✨ %s %s   %s%s%s\n' "$we" "$wn" "$DIM" "${eat//T/ }" "$RESET"
          ;;
        battle_won)
          local bn
          bn=$(jq -r --arg id "$eid" --arg lang "name_$lang_evt" '.wild_pool[] | select(.id == $id) | .[$lang]' "$POKEMON_DATA")
          local bxp=$(jq -r --arg id "$eid" --arg at "$eat" '.recent_events[] | select(.type == "battle_won" and .at == $at and .id == $id) | .xp' "$POKEMON_STATE")
          printf "   ⚔️  $(pokemon_t battle.won "$bn" "$bxp")   %s%s%s\n" "$DIM" "${eat//T/ }" "$RESET"
          ;;
        battle_lost)
          local bn
          bn=$(jq -r --arg id "$eid" --arg lang "name_$lang_evt" '.wild_pool[] | select(.id == $id) | .[$lang]' "$POKEMON_DATA")
          printf "   💔 $(pokemon_t battle.lost "$bn")   %s%s%s\n" "$DIM" "${eat//T/ }" "$RESET"
          ;;
        item)
          printf '   🎁 %s%s %s obtenu   %s%s%s\n' "$eemoji" "$RESET" "$ename" "$DIM" "${eat//T/ }" "$RESET"
          ;;
        trade)
          printf "   🔄 $(pokemon_t trade.title): %s   %s%s%s\n" "$ename" "$DIM" "${eat//T/ }" "$RESET"
          ;;
        *)
          printf '   • %s   %s%s%s\n' "$etype" "$DIM" "${eat//T/ }" "$RESET"
          ;;
      esac
    done
    printf '\n'
  fi

  # Evolution history
  local history_count
  history_count=$(jq -r '.evolution_history | length' "$POKEMON_STATE")
  if [ "$history_count" -gt 0 ]; then
    pokemon_box_top "$(pokemon_t main.history)" 64
    jq -r '.evolution_history[] | "\(.level)|\(.name)|\(.evolved_at)|\(.is_shiny // false)"' "$POKEMON_STATE" | \
    while IFS='|' read -r lvl ename eat eshiny; do
      eemoji=$(pokemon_evo_field "$lineage" "$lvl" "emoji")
      star=""
      [ "$eshiny" = "true" ] && star="${GOLD}★${RESET} "
      printf '  %sLv.%-3d%s  %s  %s%-22s  %s%s%s\n' \
        "$DIM" "$lvl" "$RESET" "$eemoji" "$star" "$ename" "$DIM" "${eat//T/ }" "$RESET"
    done
    printf '\n'
  fi

  # End of history section
  if [ "$history_count" -gt 0 ]; then
    pokemon_box_bottom 64
    printf '\n'
  fi

  # Full chain — highlight only the chosen Eevee form when at Lv.30+
  pokemon_box_top "$(pokemon_t main.full_chain) — $lineage_label" 64
  local eevee_form_id=""
  if [ "$lineage" = "eevee" ]; then
    eevee_form_id=$(jq -r '.eevee_form // empty' "$POKEMON_STATE")
  fi
  jq -r --arg l "$lineage" '.lineages[$l].stages[] | "\(.min_level)|\(.name)|\(.emoji)|\(.showdown_id)"' "$POKEMON_DATA" | \
  while IFS='|' read -r imin iname iemoji ishow; do
    ithresh=$(pokemon_threshold "$imin")
    if [ -n "$eevee_form_id" ] && [ "$imin" = "30" ]; then
      if [ "$ishow" = "$eevee_form_id" ]; then
        marker="${BOLD}►${RESET}"; style="$color_code$BOLD"
      else
        marker=" "; style="$DIM"
      fi
    elif [ "$imin" -lt "$cur_stage_lvl" ]; then
      marker="${BOLD}✓${RESET}"; style="$DIM"
    elif [ "$imin" = "$cur_stage_lvl" ]; then
      marker="${BOLD}►${RESET}"; style="$color_code$BOLD"
    else
      marker=" "; style="$DIM"
    fi
    printf '   %s  %sLv.%-3d%s  %s  %s%-22s%s  %s%s tokens%s\n' \
      "$marker" "$style" "$imin" "$RESET" "$iemoji" "$style" "$iname" "$RESET" \
      "$DIM" "$(fmt_int "$ithresh")" "$RESET"
  done
  pokemon_box_bottom 64
  printf '\n'

  # Footer hints
  printf "  %s$(pokemon_t_pad common.subcommands 22)%s : team, pc, pokedex, stats, badges, switch, hatch, deposit, withdraw, give, take, trade, reset, --shiny\\n" "$DIM" "$RESET"
  printf "  %s$(pokemon_t_pad common.example 22)%s : %sbash ~/.claude/pokemon-status.sh team%s\\n\\n" \
    "$DIM" "$RESET" "$DIM" "$RESET"
}

# ── Subcommand: game (devine le Pokémon) ─────────────────────────────────
# Stateless mini-game piloted via state.current_quiz :
#   /pokemon game            → tirage si pas de quiz actif, sinon rappel hints
#   /pokemon game <nom>      → soumission de réponse
#   /pokemon game skip       → annule le quiz en cours sans pénalité
#   /pokemon game help       → aide
# Cooldown sur la dernière fin (correct OU wrong, pas skip) pour éviter le grind.

# Normalize a name for comparison: lowercase, accent-stripped, no spaces.
_game_norm() {
  printf '%s' "$1" | iconv -t ASCII//TRANSLIT 2>/dev/null \
    | tr '[:upper:]' '[:lower:]' \
    | tr -d '[:space:].-' || printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

_game_show_help() {
  printf "  %s$(pokemon_t game.help.intro)%s\n\n" "$DIM" "$RESET"
  printf "  %s/pokemon game%s         %s$(pokemon_t game.help.start)%s\n" "$BOLD" "$RESET" "$DIM" "$RESET"
  printf "  %s/pokemon game <nom>%s   %s$(pokemon_t game.help.submit)%s\n" "$BOLD" "$RESET" "$DIM" "$RESET"
  printf "  %s/pokemon game skip%s    %s$(pokemon_t game.help.skip)%s\n" "$BOLD" "$RESET" "$DIM" "$RESET"
  printf "\n"
}

_game_render_hints() {
  local idx="$1" lang="$2"
  local name type dex first letters gen
  name=$(jq -r --argjson i "$idx" --arg lang "name_$lang" '.wild_pool[$i][$lang]' "$POKEMON_DATA")
  type=$(jq -r --argjson i "$idx" '.wild_pool[$i].type' "$POKEMON_DATA")
  dex=$(jq -r --argjson i "$idx" '.wild_pool[$i].national_dex' "$POKEMON_DATA")
  first=$(printf '%s' "$name" | head -c 4 | iconv -t ASCII//TRANSLIT 2>/dev/null | head -c 1)
  letters=$(printf '%s' "$name" | LC_ALL=C.UTF-8 wc -m | tr -d ' \n')
  gen=$([ "$dex" -le 151 ] && echo "1" || echo "2")
  local tcolor
  tcolor=$(pokemon_type_color "$type")

  printf "  %s$(pokemon_t_pad game.hint_type 12)%s : %s%s%s\n"     "$DIM" "$RESET" "$tcolor" "$type" "$RESET"
  printf "  %s$(pokemon_t_pad game.hint_letters 12)%s : %s\n"      "$DIM" "$RESET" "$letters"
  printf "  %s$(pokemon_t_pad game.hint_initial 12)%s : %s%s.%s\n" "$DIM" "$RESET" "$BOLD" "$first" "$RESET"
  printf "  %s$(pokemon_t_pad game.hint_gen 12)%s : %s\n\n"        "$DIM" "$RESET" "$gen"
  printf "  %s$(pokemon_t game.prompt_answer)%s\n\n"               "$DIM" "$RESET"
}

view_game() {
  local raw_answer="$*"
  printf "\\n  %s%s$(pokemon_t game.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  case "$raw_answer" in
    help|--help|-h) _game_show_help; return ;;
  esac

  mkdir -p "$POKEMON_DIR"; touch "$POKEMON_LOCK"
  (
    flock -x 200
    local now state lineage lang
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    state=$(cat "$POKEMON_STATE")
    lineage=$(jq -r '.lineage // ""' <<<"$state")
    lang=$(jq -r '.language // "fr"' "$POKEMON_DATA")

    if [ -z "$lineage" ] || [ "$lineage" = "null" ]; then
      printf "  %s$(pokemon_t game.no_active)%s\n\n" "$DIM" "$RESET"
      return
    fi

    local current_quiz_id
    current_quiz_id=$(jq -r '.current_quiz.id // ""' <<<"$state")

    case "$raw_answer" in
      skip)
        if [ -z "$current_quiz_id" ]; then
          printf "  %s$(pokemon_t game.no_quiz)%s\n\n" "$DIM" "$RESET"; return
        fi
        state=$(jq 'del(.current_quiz)' <<<"$state")
        printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
        printf "  %s$(pokemon_t game.skipped)%s\n\n" "$DIM" "$RESET"
        return
        ;;
      "")
        # No arg: show current quiz hints, or start a new one
        if [ -n "$current_quiz_id" ]; then
          local idx
          idx=$(jq -r --arg id "$current_quiz_id" '.wild_pool | to_entries | map(select(.value.id == $id))[0].key' "$POKEMON_DATA")
          printf "  %s$(pokemon_t game.in_progress)%s\n\n" "$DIM" "$RESET"
          _game_render_hints "$idx" "$lang"
          return
        fi
        # Cooldown gate
        local last cooldown_min now_epoch last_epoch min_passed
        last=$(jq -r '.last_game_completed_at // ""' <<<"$state")
        cooldown_min=$(jq -r '.game_cooldown_minutes // 15' "$POKEMON_DATA")
        if [ -n "$last" ]; then
          now_epoch=$(date -u +%s)
          last_epoch=$(date -u -d "$last" +%s 2>/dev/null || echo 0)
          min_passed=$(( (now_epoch - last_epoch) / 60 ))
          if [ "$min_passed" -lt "$cooldown_min" ]; then
            local remaining=$((cooldown_min - min_passed))
            printf "  %s$(pokemon_t game.cooldown "$remaining")%s\n\n" "$DIM" "$RESET"
            return
          fi
        fi
        # New quiz
        local pool_count idx new_id
        pool_count=$(jq -r '.wild_pool | length' "$POKEMON_DATA")
        idx=$((RANDOM % pool_count))
        new_id=$(jq -r --argjson i "$idx" '.wild_pool[$i].id' "$POKEMON_DATA")
        state=$(jq --arg id "$new_id" --arg at "$now" '.current_quiz = {id: $id, started_at: $at}' <<<"$state")
        printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
        _game_render_hints "$idx" "$lang"
        return
        ;;
      *)
        # Submit answer
        if [ -z "$current_quiz_id" ]; then
          printf "  %s$(pokemon_t game.no_quiz)%s\n\n" "$DIM" "$RESET"; return
        fi
        local expected expected_norm answer_norm
        expected=$(jq -r --arg id "$current_quiz_id" --arg lang "name_$lang" '.wild_pool[] | select(.id == $id) | .[$lang]' "$POKEMON_DATA")
        expected_norm=$(_game_norm "$expected")
        answer_norm=$(_game_norm "$raw_answer")

        local xp_reward fr_reward total_xp new_friendship
        xp_reward=$(jq -r '.game_xp_reward // 500' "$POKEMON_DATA")
        fr_reward=$(jq -r '.game_friendship_reward // 2' "$POKEMON_DATA")

        if [ "$answer_norm" = "$expected_norm" ]; then
          # Correct
          state=$(jq --arg now "$now" --argjson xp "$xp_reward" --argjson fr "$fr_reward" '
            .total_xp += $xp
            | .friendship = ((.friendship // 0) + $fr)
            | .lifetime_stats.games_won = ((.lifetime_stats.games_won // 0) + 1)
            | .lifetime_stats.games_played = ((.lifetime_stats.games_played // 0) + 1)
            | .last_game_completed_at = $now
            | del(.current_quiz)
          ' <<<"$state")
          printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
          printf "  %s$(pokemon_t game.win "$expected")%s\n" "$GOLD" "$RESET"
          printf "  %s$(pokemon_t game.win_reward "$xp_reward" "$fr_reward")%s\n\n" "$DIM" "$RESET"
        else
          # Wrong
          state=$(jq --arg now "$now" '
            .lifetime_stats.games_played = ((.lifetime_stats.games_played // 0) + 1)
            | .last_game_completed_at = $now
            | del(.current_quiz)
          ' <<<"$state")
          printf '%s\n' "$state" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
          printf "  %s$(pokemon_t game.wrong "$raw_answer")%s\n" "$DIM" "$RESET"
          printf "  %s$(pokemon_t game.reveal "$expected")%s\n\n" "$DIM" "$RESET"
        fi
        return
        ;;
    esac
  ) 200>"$POKEMON_LOCK"
}

# ── Subcommand: stats-share / leaderboard / aggregate ────────────────────────
# Opt-in shared stats : envoi anonymous (anon_id) → endpoint Cloudflare Worker.
# Privacy : voir api/README.md. Aucune IP n'est loggée côté serveur.

# Build minimal payload from state.json + config (whitelist strict)
_share_build_payload() {
  local anon_id="$1" client_ver="$2" display_name="${3:-}"
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  jq -n \
    --arg id "$anon_id" \
    --arg name "$display_name" \
    --arg ver "$client_ver" \
    --arg at "$now" \
    --slurpfile state "$POKEMON_STATE" \
    '{
      anon_id: $id,
      display_name: (if $name == "" then null else $name end),
      schema_version: 1,
      client_version: $ver,
      submitted_at: $at,
      stats: {
        lifetime: {
          total_tokens:        ($state[0].lifetime_stats.total_tokens // 0),
          total_evolutions:    ($state[0].lifetime_stats.total_evolutions // 0),
          total_shinies:       ($state[0].lifetime_stats.total_shinies // 0),
          max_level:           ($state[0].lifetime_stats.max_level // 0),
          total_compagnons:    ($state[0].lifetime_stats.total_compagnons // 0),
          lineages_completed:  ($state[0].lifetime_stats.lineages_completed // []),
          games_won:           ($state[0].lifetime_stats.games_won // 0),
          games_played:        ($state[0].lifetime_stats.games_played // 0)
        },
        active: {
          lineage:        ($state[0].lineage // null),
          current_level:  ($state[0].current_level // 0),
          is_shiny:       ($state[0].is_shiny // false)
        },
        badges:             ($state[0].badges // [] | map(.id)),
        pokedex_seen_count: (($state[0].pokedex_wild // {}) | keys | length)
      }
    }'
}

view_stats_share() {
  local sub="${1:-}"
  printf "\\n  %s%s$(pokemon_t share.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  local enabled endpoint anon_id display_name
  enabled=$(jq -r '.stats_share.enabled // false' "$POKEMON_DATA")
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  anon_id=$(jq -r '.stats_share.anon_id // ""' "$POKEMON_DATA")
  display_name=$(jq -r '.stats_share.display_name // ""' "$POKEMON_DATA")

  case "$sub" in
    enable|on)
      if [ "$enabled" = "true" ]; then
        printf "  %s$(pokemon_t share.already_enabled)%s\n\n" "$DIM" "$RESET"
        printf "  %s%s%s\n\n" "$DIM" "anon_id : $anon_id" "$RESET"
        return
      fi
      if [ "${2:-}" != "--confirm" ]; then
        printf "  %s$(pokemon_t share.privacy_notice)%s\n\n" "$DIM" "$RESET"
        printf "  %s$(pokemon_t share.confirm_hint)%s\n\n" "$BOLD" "$RESET"
        return
      fi
      # Generate anon_id (8 hex chars from /dev/urandom)
      local new_id
      new_id=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')
      jq --arg id "$new_id" '
        .stats_share.enabled = true
        | .stats_share.anon_id = $id
      ' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t share.enabled "$new_id")%s\n\n" "$GOLD" "$RESET"
      ;;

    disable|off)
      if [ "$enabled" != "true" ]; then
        printf "  %s$(pokemon_t share.already_disabled)%s\n\n" "$DIM" "$RESET"
        return
      fi
      jq '.stats_share.enabled = false' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" \
        && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t share.disabled)%s\n\n" "$DIM" "$RESET"
      printf "  %s$(pokemon_t share.disable_hint)%s\n\n" "$DIM" "$RESET"
      ;;

    forget)
      if [ -z "$anon_id" ]; then
        printf "  %s$(pokemon_t share.no_id)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local resp
      resp=$(curl -sf -X DELETE "$endpoint/v1/forget?anon_id=$anon_id" 2>&1)
      if [ -n "$resp" ]; then
        printf "  %s$(pokemon_t share.forgotten "$anon_id")%s\n\n" "$GOLD" "$RESET"
        jq '.stats_share.enabled = false | .stats_share.anon_id = null' \
          "$POKEMON_DATA" > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      else
        printf "  %s$(pokemon_t share.forget_failed)%s\n\n" "$DIM" "$RESET"
      fi
      ;;

    name|pseudo)
      local new_name="${2:-}"
      if [ -z "$new_name" ]; then
        if [ -n "$display_name" ]; then
          printf "  %s$(pokemon_t share.name_current "$display_name")%s\n\n" "$GOLD" "$RESET"
        else
          printf "  %s$(pokemon_t share.name_unset)%s\n\n" "$DIM" "$RESET"
        fi
        printf "  %s$(pokemon_t share.name_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      if [ "$new_name" = "clear" ] || [ "$new_name" = "remove" ]; then
        jq '.stats_share.display_name = null' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" \
          && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
        printf "  %s$(pokemon_t share.name_cleared)%s\n\n" "$DIM" "$RESET"
        return
      fi
      # Validate locally (same regex as Worker)
      if ! [[ "$new_name" =~ ^[a-zA-Z0-9_-]{2,24}$ ]]; then
        printf "  %s$(pokemon_t share.name_invalid)%s\n\n" "$DIM" "$RESET"
        return
      fi
      jq --arg n "$new_name" '.stats_share.display_name = $n' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t share.name_set "$new_name")%s\n\n" "$GOLD" "$RESET"
      printf "  %s$(pokemon_t share.name_set_hint)%s\n\n" "$DIM" "$RESET"
      ;;

    submit|push)
      if [ "$enabled" != "true" ]; then
        printf "  %s$(pokemon_t share.not_enabled)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local pkg_ver
      pkg_ver=$(jq -r '.version // "unknown"' "$POKEMON_DATA")
      local payload
      payload=$(_share_build_payload "$anon_id" "$pkg_ver" "$display_name")
      local http_code
      http_code=$(curl -s -o /tmp/share-resp.$$ -w "%{http_code}" \
        -X POST "$endpoint/v1/submit" \
        -H "content-type: application/json" \
        --data "$payload" 2>/dev/null)
      case "$http_code" in
        200)
          printf "  %s$(pokemon_t share.submit_ok)%s\n\n" "$GOLD" "$RESET"
          ;;
        429)
          local cd
          cd=$(jq -r '.cooldown_remaining_s // 0' /tmp/share-resp.$$ 2>/dev/null)
          local hours=$((cd / 3600))
          printf "  %s$(pokemon_t share.cooldown "$hours")%s\n\n" "$DIM" "$RESET"
          ;;
        *)
          printf "  %s$(pokemon_t share.submit_failed "$http_code")%s\n\n" "$DIM" "$RESET"
          ;;
      esac
      rm -f /tmp/share-resp.$$
      ;;

    status|"")
      if [ "$enabled" = "true" ]; then
        printf "  %s$(pokemon_t share.status_enabled "$anon_id")%s\n" "$GOLD" "$RESET"
        if [ -n "$display_name" ]; then
          printf "  %s$(pokemon_t share.status_pseudo "$display_name")%s\n" "$GOLD" "$RESET"
        else
          printf "  %s$(pokemon_t share.status_no_pseudo)%s\n" "$DIM" "$RESET"
        fi
        printf "  %s$(pokemon_t share.status_endpoint "$endpoint")%s\n\n" "$DIM" "$RESET"
      else
        printf "  %s$(pokemon_t share.status_disabled)%s\n\n" "$DIM" "$RESET"
      fi
      printf "  %s$(pokemon_t share.usage)%s\n\n" "$DIM" "$RESET"
      ;;

    *)
      printf "  %s$(pokemon_t share.unknown_subcmd "$sub")%s\n\n" "$DIM" "$RESET"
      ;;
  esac
}

view_leaderboard() {
  local metric="${1:-total_tokens}"
  local limit="${2:-10}"
  printf "\\n  %s%s$(pokemon_t leaderboard.title "$metric")%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  local endpoint
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  if [ -z "$endpoint" ]; then
    printf "  %s$(pokemon_t leaderboard.no_endpoint)%s\n\n" "$DIM" "$RESET"; return
  fi

  local resp
  resp=$(curl -sf "$endpoint/v1/leaderboard?metric=$metric&limit=$limit" 2>/dev/null)
  if [ -z "$resp" ]; then
    printf "  %s$(pokemon_t leaderboard.fetch_failed)%s\n\n" "$DIM" "$RESET"; return
  fi

  local total_players my_id
  total_players=$(jq -r '.total_players' <<<"$resp")
  my_id=$(jq -r '.stats_share.anon_id // ""' "$POKEMON_DATA")

  printf "  %s$(pokemon_t leaderboard.subtitle "$total_players")%s\n\n" "$DIM" "$RESET"

  jq -r --arg me "$my_id" '.top | to_entries[] |
    "\(.key + 1)|\(.value.anon_id)|\(.value.display_name // "")|\(.value.value)|\(.value.lineage // "-")|\(.value.level)|\(.value.is_shiny)|\(if .value.anon_id == $me then "*" else "" end)"' <<<"$resp" \
  | while IFS='|' read -r rank id name val lin lvl shiny is_me; do
      local mark="$DIM"
      [ "$is_me" = "*" ] && mark="$GOLD"
      local star=""
      [ "$shiny" = "true" ] && star="${GOLD}★ ${RESET}"
      # Render label : pseudo#shortid (4 first chars of anon_id) if pseudo set, else full anon_id
      local label
      if [ -n "$name" ]; then
        label="${name}#${id:0:4}"
      else
        label="$id"
      fi
      printf "  %s%2s.%s  %s%-20s%s  %s%12s%s   %s(%s lv.%s%s)%s\n" \
        "$mark" "$rank" "$RESET" "$BOLD" "$label" "$RESET" \
        "$mark" "$val" "$RESET" "$DIM" "$lin" "$lvl" "$star" "$RESET"
    done
  printf "\n"
}

view_aggregate() {
  printf "\\n  %s%s$(pokemon_t aggregate.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"
  local endpoint resp
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  if [ -z "$endpoint" ]; then
    printf "  %s$(pokemon_t leaderboard.no_endpoint)%s\n\n" "$DIM" "$RESET"; return
  fi
  resp=$(curl -sf "$endpoint/v1/aggregate" 2>/dev/null)
  if [ -z "$resp" ]; then
    printf "  %s$(pokemon_t leaderboard.fetch_failed)%s\n\n" "$DIM" "$RESET"; return
  fi

  local players=$(jq -r '.total_players' <<<"$resp")
  if [ "$players" = "0" ] || [ "$players" = "null" ]; then
    printf "  %s$(pokemon_t aggregate.empty)%s\n\n" "$DIM" "$RESET"; return
  fi

  local tokens shinies rate
  tokens=$(jq -r '.total_tokens_combined' <<<"$resp")
  shinies=$(jq -r '.total_shinies_observed' <<<"$resp")
  rate=$(jq -r '.shiny_rate_observed // 0' <<<"$resp")

  printf "  %s$(pokemon_t_pad aggregate.players 22)%s :  %s\n"        "$DIM" "$RESET" "$(fmt_int "$players")"
  printf "  %s$(pokemon_t_pad aggregate.tokens 22)%s :  %s\n"         "$DIM" "$RESET" "$(fmt_int "$tokens")"
  printf "  %s$(pokemon_t_pad aggregate.shinies 22)%s :  %s\n"        "$DIM" "$RESET" "$(fmt_int "$shinies")"
  printf "  %s$(pokemon_t_pad aggregate.shiny_rate 22)%s :  %s\n\n"   "$DIM" "$RESET" "$rate"

  printf "  %s%s$(pokemon_t aggregate.distribution)%s\n" "$BOLD" "$GOLD" "$RESET"
  jq -r '.active_lineage_distribution | to_entries | sort_by(-.value)[] |
    "\(.key)|\(.value)"' <<<"$resp" \
  | while IFS='|' read -r lin count; do
      printf "    %s%-12s%s : %d\n" "$DIM" "$lin" "$RESET" "$count"
    done
  printf "\n"
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "${1:-}" in
  --shiny)            toggle_shiny ;;
  reset)              ceremonial_reset ;;
  team)               view_team ;;
  pc|storage)         view_pc ;;
  pokedex|dex)        view_pokedex ;;
  stats|lifetime)     view_stats ;;
  badges)             view_badges ;;
  inventory|inv|sac)  view_inventory ;;
  switch)             view_switch "${2:-}" ;;
  hatch)              view_hatch "${2:-}" ;;
  deposit)            view_deposit "${2:-}" ;;
  withdraw)           view_withdraw "${2:-}" ;;
  release)            view_release "${2:-}" "${3:-}" "${4:-}" ;;
  give)               view_give "${2:-}" ;;
  take)               view_take ;;
  trade)              view_trade "${2:-Anonymous}" ;;
  game)               view_game "${@:2}" ;;
  stats-share|share)  view_stats_share "${2:-}" "${3:-}" ;;
  leaderboard|lb)     view_leaderboard "${2:-total_tokens}" "${3:-10}" ;;
  aggregate|global)   view_aggregate ;;
  *)                  view_main ;;
esac
