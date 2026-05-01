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
GOLD=$'\033[38;5;220m'

fmt_int() {
  awk -v n="$1" 'BEGIN{
    s = sprintf("%d", n); neg=""; if (s ~ /^-/) { neg="-"; s=substr(s,2) }
    out=""; while (length(s) > 3) { out = " " substr(s, length(s)-2) out; s = substr(s, 1, length(s)-3) }
    print neg s out
  }'
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
  first_shiny=$(jq -r '.first_shiny_at // "—"' <<<"$s")

  printf "  %s$(pokemon_t_pad stats.total_tokens 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$tokens")"
  printf "  %s$(pokemon_t_pad stats.total_evolutions 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$evos")"
  printf "  %s$(pokemon_t_pad stats.total_shinies 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$shinies")"
  printf "  %s$(pokemon_t_pad stats.max_level 22)%s :  Lv.%s\\n" "$DIM" "$RESET" "$maxlvl"
  printf "  %s$(pokemon_t_pad stats.total_compagnons 22)%s :  %s\\n"    "$DIM" "$RESET" "$(fmt_int "$compagnons")"
  printf "  %s$(pokemon_t_pad stats.lineages_completed 22)%s :  %s / 5\\n" "$DIM" "$RESET" "$completed"
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

  # Wild encounters section — Gen 1 dex (151 entries, sorted by national_dex)
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
  count=$(jq -r ".$field | length" "$POKEMON_STATE")
  if [ "$count" = "0" ] || [ -z "$count" ]; then
    printf "  %s$(pokemon_t team.empty)%s\\n\\n" "$DIM" "$RESET"
    return
  fi
  local i=0
  jq -r ".$field[] |
    \"\(.lineage)|\(.is_shiny)|\(.level)|\(.max_stage)|\(.created_at)|\(.completed_at)\"" "$POKEMON_STATE" | \
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
  count=$(jq -r ".$field | length" "$POKEMON_STATE")
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
  name=$(jq -r --argjson i "$slot" ".$field[\$i].max_stage // \"Œuf\"" "$POKEMON_STATE")

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

  # Sprite (32x16 standard)
  local sprite_variant="normal"
  [ "$is_shiny" = "true" ] && sprite_variant="shiny"
  local sprite_path="$POKEMON_DIR/sprites/$sprite_variant/$showdown_id.txt"
  printf '\n'
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
    printf ' %s(%d/%d)%s\n\n' "$DIM" "$badges_count" "12" "$RESET"
  fi

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
    printf "  %s$(pokemon_t main.history)%s\\n\\n" "$BOLD" "$RESET"
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

  # Full chain — highlight only the chosen Eevee form when at Lv.30+
  printf "  %s$(pokemon_t main.full_chain) — %s%s\\n\\n" "$BOLD" "$lineage_label" "$RESET"
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
  printf '\n'

  # Footer hints
  printf "  %s$(pokemon_t_pad common.subcommands 22)%s : team, pc, pokedex, stats, badges, reset, --shiny\\n" "$DIM" "$RESET"
  printf "  %s$(pokemon_t_pad common.example 22)%s : %sbash ~/.claude/creature-status.sh team%s\\n\\n" \
    "$DIM" "$RESET" "$DIM" "$RESET"
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
  *)                  view_main ;;
esac
