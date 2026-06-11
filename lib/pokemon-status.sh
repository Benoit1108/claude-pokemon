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

# One-shot rebalance notice. Fires for users whose state predates the XP
# curve fix and have measurable progress. Idempotent : the flag is persisted
# after rendering so it never fires again.
#
# The flag check + persist BOTH happen inside the flock to avoid a TOCTOU
# race when statusline tick + manual /pokemon view fire concurrently — both
# would otherwise pass the check and render the notice twice.
#
# Args: $1 = total_xp (passed by caller to avoid re-reading state).
pokemon_render_xp_rebalance_notice_if_needed() {
  local total_xp="${1:-0}"
  # Only fire for users with non-trivial progress (skip empty/fresh installs
  # that somehow lack the flag).
  [ "$total_xp" -lt 1000 ] && return 0

  touch "$POKEMON_LOCK"
  local should_render
  should_render=$(
    flock -x 200
    local acked
    acked=$(jq -r '.xp_rebalance_v2_acknowledged // false' "$POKEMON_STATE")
    if [ "$acked" = "true" ]; then
      echo "no"
    else
      # Persist FIRST while holding the lock, so a concurrent caller seeing
      # the flag set after us won't render.
      jq '.xp_rebalance_v2_acknowledged = true' "$POKEMON_STATE" > "$POKEMON_STATE.tmp" \
        && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
      echo "yes"
    fi
    200>"$POKEMON_LOCK"
  )
  [ "$should_render" = "no" ] && return 0

  printf '\n'
  pokemon_box_top "$(pokemon_t main.xp_rebalance_title)" 70
  printf '  %s\n' "$(pokemon_t main.xp_rebalance_line1)"
  printf '  %s\n' "$(pokemon_t main.xp_rebalance_line2)"
  printf '  %s\n' "$(pokemon_t main.xp_rebalance_line3)"
  printf '  %s\n' "$(pokemon_t main.xp_rebalance_line4)"
  printf '\n  %s%s%s\n' "$DIM" "$(pokemon_t main.xp_rebalance_footer)" "$RESET"
  pokemon_box_bottom 70
  printf '\n'
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
    local state name new_state
    state=$(cat "$POKEMON_STATE")
    name=$(jq -r --argjson i "$slot" '.team[$i].max_stage // "Œuf"' <<<"$state")
    if new_state=$(_mutate_state team_to_pc "$slot"); then state="$new_state"
    else state=$(pokemon_team_to_pc "$state" "$slot"); fi
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
    local now state name new_state mrc
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    state=$(cat "$POKEMON_STATE")
    name=$(jq -r --argjson i "$slot" '.pc_storage[$i].max_stage // "Œuf"' <<<"$state")
    new_state=$(_mutate_state pc_to_team_or_active "$slot"); mrc=$?
    if [ "$mrc" -eq 1 ]; then
      # engine unavailable → bash fallback
      if new_state=$(pokemon_pc_to_team_or_active "$now" "$state" "$slot"); then mrc=0; else mrc=4; fi
    fi
    if [ "$mrc" -eq 0 ]; then
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
    local state new_state
    state=$(cat "$POKEMON_STATE")
    if new_state=$(_mutate_state release_slot "$area" "$slot"); then state="$new_state"
    else state=$(pokemon_release_slot "$state" "$area" "$slot"); fi
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

  # One-shot XP curve rebalance notice — only fires for users whose state
  # predates the curve fix (= no `xp_rebalance_v2_acknowledged` flag) and
  # have measurable progress. New installs are seeded with the flag, so
  # they skip this entirely. See pokemon_render_xp_rebalance_notice_if_needed.
  pokemon_render_xp_rebalance_notice_if_needed "$total_xp"

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

# ── Subcommand: recap (résumé fin de session) ────────────────────────────────
# Affiche un résumé des events de la session courante (encounters, baies, items,
# évolutions, badges débloqués, deltas XP/friendship, progression hatch).
# Le baseline est capturé au premier tick de chaque session_id (cf. lib.sh).
# Sans arg = session courante (most-recent .last_seen). Arg "today" = depuis 00:00 UTC.

view_recap() {
  local scope="${1:-session}"
  printf "\\n  %s%s$(pokemon_t recap.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  local state since_iso label
  state=$(cat "$POKEMON_STATE")

  case "$scope" in
    today)
      since_iso=$(date -u +"%Y-%m-%dT00:00:00Z")
      label=$(pokemon_t recap.scope_today)
      ;;
    session|"")
      # Find session with the most recent last_seen (= active session)
      local sid
      sid=$(jq -r '.sessions // {} | to_entries | sort_by(.value.last_seen) | last.key // ""' <<<"$state")
      if [ -z "$sid" ] || [ "$sid" = "null" ]; then
        printf "  %s$(pokemon_t recap.no_session)%s\n\n" "$DIM" "$RESET"; return
      fi
      since_iso=$(jq -r --arg sid "$sid" '.sessions[$sid].first_seen' <<<"$state")
      label=$(pokemon_t recap.scope_session)
      ;;
    *)
      printf "  %s$(pokemon_t recap.unknown_scope "$scope")%s\n\n" "$DIM" "$RESET"; return
      ;;
  esac

  # Compute time delta + duration display
  local now_epoch since_epoch dur_min
  now_epoch=$(date -u +%s)
  since_epoch=$(date -u -d "$since_iso" +%s 2>/dev/null || echo "$now_epoch")
  dur_min=$(( (now_epoch - since_epoch) / 60 ))
  local dur_label
  if [ "$dur_min" -lt 60 ]; then
    dur_label="${dur_min}min"
  else
    dur_label="$((dur_min / 60))h$(printf '%02d' $((dur_min % 60)))"
  fi

  printf "  %s$(pokemon_t recap.context "$label" "$dur_label")%s\n\n" "$DIM" "$RESET"

  # ── Deltas (only meaningful for session scope where baseline exists) ──
  if [ "$scope" = "session" ] || [ "$scope" = "" ]; then
    local sid baseline
    sid=$(jq -r '.sessions // {} | to_entries | sort_by(.value.last_seen) | last.key // ""' <<<"$state")
    baseline=$(jq -r --arg sid "$sid" '.sessions[$sid].baseline // null' <<<"$state")

    if [ "$baseline" != "null" ]; then
      local xp_delta fr_delta tok_delta lvl_now lvl_then
      xp_delta=$(jq -r --arg sid "$sid" '.total_xp - .sessions[$sid].baseline.total_xp' <<<"$state")
      fr_delta=$(jq -r --arg sid "$sid" '(.friendship // 0) - .sessions[$sid].baseline.friendship' <<<"$state")
      tok_delta=$(jq -r --arg sid "$sid" '.lifetime_stats.total_tokens - .sessions[$sid].baseline.lifetime_tokens' <<<"$state")
      lvl_now=$(jq -r '.current_level' <<<"$state")
      lvl_then=$(jq -r --arg sid "$sid" '.sessions[$sid].baseline.current_level' <<<"$state")

      printf "  %s%s$(pokemon_t recap.deltas)%s\n" "$BOLD" "$GOLD" "$RESET"
      printf "    %s$(pokemon_t_pad recap.tokens_consumed 22)%s :  %s\n" "$DIM" "$RESET" "$(fmt_int "$tok_delta")"
      printf "    %s$(pokemon_t_pad recap.xp_gained 22)%s :  +%s\n" "$DIM" "$RESET" "$(fmt_int "$xp_delta")"
      printf "    %s$(pokemon_t_pad recap.friendship_gained 22)%s :  +%s\n" "$DIM" "$RESET" "$(fmt_int "$fr_delta")"
      if [ "$lvl_now" -gt "$lvl_then" ]; then
        printf "    %s$(pokemon_t_pad recap.level_progress 22)%s :  Lv.%s → %sLv.%s%s\n" "$DIM" "$RESET" "$lvl_then" "$GOLD" "$lvl_now" "$RESET"
      else
        # Compute hatch progress for level 0 specially
        if [ "$lvl_now" -eq 0 ]; then
          local total_xp threshold pct
          total_xp=$(jq -r '.total_xp' <<<"$state")
          threshold=$(jq -r '.thresholds[1]' "$POKEMON_DATA")
          pct=$(awk -v t="$total_xp" -v th="$threshold" 'BEGIN{printf "%d", (t/th)*100}')
          printf "    %s$(pokemon_t_pad recap.hatch_progress 22)%s :  %s%% vers Lv.1\n" "$DIM" "$RESET" "$pct"
        else
          printf "    %s$(pokemon_t_pad recap.level_stable 22)%s :  Lv.%s\n" "$DIM" "$RESET" "$lvl_now"
        fi
      fi
      printf "\n"
    fi
  fi

  # ── Events filtered since since_iso ──
  local events_json
  events_json=$(jq -c --arg since "$since_iso" '
    [.recent_events // [] | .[] | select(.at >= $since)]
  ' <<<"$state")

  local n_events
  n_events=$(jq -r 'length' <<<"$events_json")

  if [ "$n_events" = "0" ]; then
    printf "  %s$(pokemon_t recap.no_events)%s\n\n" "$DIM" "$RESET"
  else
    printf "  %s%s$(pokemon_t recap.events_title "$n_events")%s\n" "$BOLD" "$GOLD" "$RESET"
    local lang
    lang=$(jq -r '.language // "fr"' "$POKEMON_DATA")
    jq -r --arg lang "name_$lang" '.[] |
      "\(.type)|\(.id // "")|\(.at)|\(.xp // 0)|\(.name // "")|\(.emoji // "")|\(.wild_level // 0)"' <<<"$events_json" | \
    while IFS='|' read -r etype eid eat exp ename eemoji wlvl; do
      local time_short
      time_short="${eat:11:5}"  # HH:MM
      case "$etype" in
        berry)
          printf "    %s%s%s  🍇 %s%s %s +%s XP\n" "$DIM" "$time_short" "$RESET" "$eemoji" "$RESET" "$ename" "$exp"
          ;;
        encounter)
          local wn we
          wn=$(jq -r --arg id "$eid" --arg lang "name_$lang" '.wild_pool[] | select(.id == $id) | .[$lang]' "$POKEMON_DATA")
          we=$(jq -r --arg id "$eid" '.wild_pool[] | select(.id == $id) | .emoji' "$POKEMON_DATA")
          printf "    %s%s%s  🎯 %s%s %s rencontré\n" "$DIM" "$time_short" "$RESET" "$we" "$RESET" "$wn"
          ;;
        battle_won)
          local wn
          wn=$(jq -r --arg id "$eid" --arg lang "name_$lang" '.wild_pool[] | select(.id == $id) | .[$lang]' "$POKEMON_DATA")
          printf "    %s%s%s  ⚔️  %sbattle won%s vs %s Lv.%s (+%s XP)\n" "$DIM" "$time_short" "$RESET" "$GOLD" "$RESET" "$wn" "$wlvl" "$exp"
          ;;
        battle_lost)
          local wn
          wn=$(jq -r --arg id "$eid" --arg lang "name_$lang" '.wild_pool[] | select(.id == $id) | .[$lang]' "$POKEMON_DATA")
          printf "    %s%s%s  💢 %sbattle lost%s vs %s Lv.%s\n" "$DIM" "$time_short" "$RESET" "$DIM" "$RESET" "$wn" "$wlvl"
          ;;
        item)
          printf "    %s%s%s  🎁 %s%s %s obtenu\n" "$DIM" "$time_short" "$RESET" "$eemoji" "$RESET" "$ename"
          ;;
      esac
    done
    printf "\n"
  fi

  # ── Evolutions during the period ──
  local evos
  evos=$(jq -c --arg since "$since_iso" '
    [.evolution_history // [] | .[] | select(.evolved_at >= $since)]
  ' <<<"$state")
  local n_evos
  n_evos=$(jq -r 'length' <<<"$evos")
  if [ "$n_evos" -gt 0 ]; then
    printf "  %s%s$(pokemon_t recap.evolutions_title)%s\n" "$BOLD" "$GOLD" "$RESET"
    jq -r '.[] | "\(.level)|\(.name)|\(.evolved_at)"' <<<"$evos" | \
    while IFS='|' read -r elvl ename eat; do
      printf "    %s%s%s  ✨ Lv.%s — %s%s%s\n" "$DIM" "${eat:11:5}" "$RESET" "$elvl" "$BOLD" "$ename" "$RESET"
    done
    printf "\n"
  fi

  # ── Badges earned during the period ──
  local new_badges
  new_badges=$(jq -c --arg since "$since_iso" '
    [.badges // [] | .[] | select(.earned_at >= $since)]
  ' <<<"$state")
  local n_badges
  n_badges=$(jq -r 'length' <<<"$new_badges")
  if [ "$n_badges" -gt 0 ]; then
    printf "  %s%s$(pokemon_t recap.badges_title)%s\n" "$BOLD" "$GOLD" "$RESET"
    jq -r '.[] | "\(.id)|\(.earned_at)"' <<<"$new_badges" | \
    while IFS='|' read -r bid bat; do
      local emoji label
      emoji=$(pokemon_badge_meta "$bid" emoji)
      label=$(pokemon_badge_meta "$bid" label)
      printf "    %s%s%s  %s  %s%s%s\n" "$DIM" "${bat:11:5}" "$RESET" "$emoji" "$BOLD" "$label" "$RESET"
    done
    printf "\n"
  fi
}

# ── Subcommand: trainer-card ─────────────────────────────────────────────────
# Affiche une carte de dresseur stylée — pendant CLI de la trainer card web
# qui sera servie en Phase 2. Compact, scannable, vanity-feature pour partager
# son profil avec un screenshot.

view_trainer_card() {
  printf '\n'
  pokemon_box_top "$(pokemon_t trainer_card.title)" 64

  local state lineage level total_xp is_shiny friendship created_at
  local total_tokens total_shinies total_compagnons total_lineages_completed
  local games_won games_played pokedex_count
  local lang share_enabled share_anon_id share_display_name
  state=$(cat "$POKEMON_STATE")
  lineage=$(jq -r '.lineage // "fire"' <<<"$state")
  level=$(jq -r '.current_level' <<<"$state")
  total_xp=$(jq -r '.total_xp' <<<"$state")
  is_shiny=$(jq -r '.is_shiny // false' <<<"$state")
  friendship=$(jq -r '.friendship // 0' <<<"$state")
  created_at=$(jq -r '.created_at // "—"' <<<"$state")
  total_tokens=$(jq -r '.lifetime_stats.total_tokens // 0' <<<"$state")
  total_shinies=$(jq -r '.lifetime_stats.total_shinies // 0' <<<"$state")
  total_compagnons=$(jq -r '.lifetime_stats.total_compagnons // 0' <<<"$state")
  total_lineages_completed=$(jq -r '.lifetime_stats.lineages_completed // [] | length' <<<"$state")
  games_won=$(jq -r '.lifetime_stats.games_won // 0' <<<"$state")
  games_played=$(jq -r '.lifetime_stats.games_played // 0' <<<"$state")
  pokedex_count=$(jq -r '.pokedex_wild // {} | keys | length' <<<"$state")
  lang=$(jq -r '.language // "fr"' "$POKEMON_DATA")

  share_enabled=$(jq -r '.stats_share.enabled // false' "$POKEMON_DATA")
  share_anon_id=$(jq -r '.stats_share.anon_id // ""' "$POKEMON_DATA")
  share_display_name=$(jq -r '.stats_share.display_name // ""' "$POKEMON_DATA")

  local lineage_label total_lineages lineage_emoji
  lineage_label=$(jq -r --arg l "$lineage" '.lineages[$l].label // $l' "$POKEMON_DATA")
  total_lineages=$(jq -r '.lineages | length' "$POKEMON_DATA")
  lineage_emoji=$(_lineage_emoji "$lineage")

  # Resolve current stage emoji + name
  local stage_name stage_emoji
  stage_name=$(pokemon_evo_field "$lineage" "$level" "name")
  stage_emoji=$(pokemon_evo_field "$lineage" "$level" "emoji")
  local shiny_mark=""
  [ "$is_shiny" = "true" ] && shiny_mark=" ${GOLD}✦${RESET}"

  # Header : pseudo + trainer since
  local label
  if [ -n "$share_display_name" ] && [ -n "$share_anon_id" ]; then
    label="${share_display_name}#${share_anon_id:0:4}"
  elif [ -n "$share_anon_id" ]; then
    label="$share_anon_id"
  else
    label="$(pokemon_t trainer_card.unnamed)"
  fi
  printf "\n  %s🎮 %s%s%s%s\n" "$BOLD" "$GOLD" "$label" "$RESET" "$shiny_mark"
  printf "  %s$(pokemon_t trainer_card.trainer_since "${created_at:0:10}")%s\n\n" "$DIM" "$RESET"

  # Companion line
  printf "  %s$(pokemon_t_pad trainer_card.companion 22)%s :  %s %s%s%s · Lv.%s\n" \
    "$DIM" "$RESET" "$stage_emoji" "$BOLD" "$stage_name" "$RESET" "$level"
  printf "  %s$(pokemon_t_pad trainer_card.lineage 22)%s :  %s %s\n\n" \
    "$DIM" "$RESET" "$lineage_emoji" "$lineage_label"

  # Stats block
  printf "  %s%s$(pokemon_t trainer_card.stats_section)%s\n" "$BOLD" "$GOLD" "$RESET"
  printf "  %s$(pokemon_t_pad trainer_card.tokens 22)%s :  %s\n" "$DIM" "$RESET" "$(fmt_int "$total_tokens")"
  printf "  %s$(pokemon_t_pad trainer_card.xp 22)%s :  %s\n" "$DIM" "$RESET" "$(fmt_int "$total_xp")"
  printf "  %s$(pokemon_t_pad trainer_card.friendship 22)%s :  %s\n" "$DIM" "$RESET" "$(fmt_int "$friendship")"
  printf "  %s$(pokemon_t_pad trainer_card.shinies 22)%s :  %s\n" "$DIM" "$RESET" "$total_shinies"
  printf "  %s$(pokemon_t_pad trainer_card.lineages_done 22)%s :  %s / %s\n" \
    "$DIM" "$RESET" "$total_lineages_completed" "$total_lineages"
  printf "  %s$(pokemon_t_pad trainer_card.games 22)%s :  %s / %s\n" \
    "$DIM" "$RESET" "$games_won" "$games_played"
  printf "  %s$(pokemon_t_pad trainer_card.pokedex 22)%s :  %s / 251\n\n" "$DIM" "$RESET" "$pokedex_count"

  # Badges block — display all earned badges with their emoji
  local badges_count
  badges_count=$(jq -r '.badges | length' <<<"$state")
  if [ "$badges_count" -gt 0 ]; then
    printf "  %s%s$(pokemon_t trainer_card.badges_section "$badges_count")%s\n" "$BOLD" "$GOLD" "$RESET"
    jq -r '.badges[] | .id' <<<"$state" | while read -r bid; do
      local emoji blabel
      emoji=$(pokemon_badge_meta "$bid" emoji)
      blabel=$(pokemon_badge_meta "$bid" label)
      printf "  %s · %s\n" "$emoji" "$blabel"
    done
    printf "\n"
  fi

  # Stats share status
  printf "  %s%s$(pokemon_t trainer_card.share_section)%s\n" "$BOLD" "$GOLD" "$RESET"
  if [ "$share_enabled" = "true" ]; then
    printf "  %s$(pokemon_t trainer_card.share_active "$share_anon_id")%s\n" "$DIM" "$RESET"
    if [ -n "$share_display_name" ]; then
      printf "  %s$(pokemon_t trainer_card.share_pseudo "$share_display_name")%s\n" "$DIM" "$RESET"
    fi
  else
    printf "  %s$(pokemon_t trainer_card.share_inactive)%s\n" "$DIM" "$RESET"
  fi

  # Arena placeholder (Phase 2)
  printf "  %s$(pokemon_t trainer_card.arena_soon)%s\n" "$DIM" "$RESET"

  pokemon_box_bottom 64
  printf '\n'
}

# ── Subcommand: stats-share / leaderboard / aggregate ────────────────────────
# Opt-in shared stats : envoi anonymous (anon_id) → endpoint Cloudflare Worker.
# Privacy : voir api/README.md. Aucune IP n'est loggée côté serveur.

# Build minimal payload from state.json + config (whitelist strict)
_share_build_payload() {
  local anon_id="$1" client_ver="$2" display_name="${3:-}"
  local now quote bio
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  quote=$(jq -r '.stats_share.quote // ""' "$POKEMON_DATA")
  bio=$(jq -r '.stats_share.bio // ""' "$POKEMON_DATA")
  # Pinned badges array : pull as a JSON literal so jq can splice it directly.
  # Filter on the worker side intersects with owned badges anyway, but trim
  # locally too (fewer round-trips on a bad submit).
  local pinned_json
  pinned_json=$(jq -c '.stats_share.pinned_badges // []' "$POKEMON_DATA")
  jq -n \
    --arg id "$anon_id" \
    --arg name "$display_name" \
    --arg quote "$quote" \
    --arg bio "$bio" \
    --argjson pinned "$pinned_json" \
    --arg ver "$client_ver" \
    --arg at "$now" \
    --slurpfile state "$POKEMON_STATE" \
    '{
      anon_id: $id,
      display_name: (if $name == "" then null else $name end),
      quote:        (if $quote == "" then null else $quote end),
      bio:          (if $bio == "" then null else $bio end),
      pinned_badges: $pinned,
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
        pokedex_seen_count: (($state[0].pokedex_wild // {}) | keys | length),
        pokedex_seen_ids:   (($state[0].pokedex_wild // {}) | keys)
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
          # Track submit timestamp locally so the auto-submit hook in
          # pokemon_tick doesn't redundantly fire for the next 24h.
          local now_iso
          now_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
          jq --arg now "$now_iso" '.last_stats_submit_at = $now' \
            "$POKEMON_STATE" > "$POKEMON_STATE.tmp" \
            && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
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

# ── Trainer quote (Sprint 2.8a) — public flair on trainer card / arena pool
# Single line, ≤80 chars. Stored in data.json.stats_share.quote and propagated
# via the next auto-submit hook (or `/pokemon stats-share submit` for instant
# push). Matches the worker's validation: no newlines, ≤80 chars.
view_quote() {
  local sub="${1:-}"
  printf "\\n  %s%s$(pokemon_t quote.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  local current
  current=$(jq -r '.stats_share.quote // ""' "$POKEMON_DATA")

  case "$sub" in
    "")
      if [ -n "$current" ]; then
        printf "  %s\"%s\"%s\\n\\n" "$GOLD" "$current" "$RESET"
      else
        printf "  %s$(pokemon_t quote.unset)%s\\n\\n" "$DIM" "$RESET"
      fi
      printf "  %s$(pokemon_t quote.usage)%s\\n\\n" "$DIM" "$RESET"
      ;;

    clear|remove|reset)
      jq '.stats_share.quote = null' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" \
        && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t quote.cleared)%s\\n\\n" "$DIM" "$RESET"
      ;;

    *)
      # Concat all remaining args as the quote (so unquoted multi-word works).
      local new_quote="$*"
      # Length check (chars, not bytes — wc -m is unicode-aware in C.UTF-8).
      local len
      len=$(printf '%s' "$new_quote" | LC_ALL=C.UTF-8 wc -m | tr -d ' \n')
      if [ "$len" -gt 80 ]; then
        printf "  %s$(pokemon_t quote.too_long "$len")%s\\n\\n" "$DIM" "$RESET"
        return
      fi
      # Single-line check (no \n / \r — they'd break the SVG / submit payload).
      if printf '%s' "$new_quote" | grep -q $'[\r\n]'; then
        printf "  %s$(pokemon_t quote.no_newline)%s\\n\\n" "$DIM" "$RESET"
        return
      fi
      jq --arg q "$new_quote" '.stats_share.quote = $q' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t quote.set "$new_quote")%s\\n\\n" "$GOLD" "$RESET"
      printf "  %s$(pokemon_t quote.set_hint)%s\\n\\n" "$DIM" "$RESET"
      ;;
  esac
}

# ── Trainer bio (Sprint 2.9) — longer description, ≤160 chars, ≤4 lines.
# Quote is the one-liner / flair ; bio is the full presentation paragraph.
view_bio() {
  local sub="${1:-}"
  printf "\\n  %s%s$(pokemon_t bio.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  local current
  current=$(jq -r '.stats_share.bio // ""' "$POKEMON_DATA")

  case "$sub" in
    "")
      if [ -n "$current" ]; then
        # Indent each line for the box-style display.
        printf '%s\n' "$current" | while IFS= read -r line; do
          printf "  %s%s%s\\n" "$GOLD" "$line" "$RESET"
        done
        printf '\n'
      else
        printf "  %s$(pokemon_t bio.unset)%s\\n\\n" "$DIM" "$RESET"
      fi
      printf "  %s$(pokemon_t bio.usage)%s\\n\\n" "$DIM" "$RESET"
      ;;

    clear|remove|reset)
      jq '.stats_share.bio = null' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" \
        && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t bio.cleared)%s\\n\\n" "$DIM" "$RESET"
      ;;

    *)
      # All args (including $1) joined with newlines : `pokemon bio "L1" "L2"`
      # → "L1\nL2". Single-arg bios with embedded \n still work because we
      # don't strip them. The quote-style "$*" join would space-separate, so
      # we iterate explicitly here.
      local new_bio=""
      local arg
      for arg in "$@"; do
        if [ -z "$new_bio" ]; then
          new_bio="$arg"
        else
          new_bio="$new_bio
$arg"
        fi
      done
      local len
      len=$(printf '%s' "$new_bio" | LC_ALL=C.UTF-8 wc -m | tr -d ' \n')
      if [ "$len" -gt 160 ]; then
        printf "  %s$(pokemon_t bio.too_long "$len")%s\\n\\n" "$DIM" "$RESET"
        return
      fi
      local lines
      lines=$(printf '%s\n' "$new_bio" | wc -l | tr -d ' ')
      if [ "$lines" -gt 4 ]; then
        printf "  %s$(pokemon_t bio.too_many_lines "$lines")%s\\n\\n" "$DIM" "$RESET"
        return
      fi
      jq --arg b "$new_bio" '.stats_share.bio = $b' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t bio.set)%s\\n\\n" "$GOLD" "$RESET"
      printf "  %s$(pokemon_t bio.set_hint)%s\\n\\n" "$DIM" "$RESET"
      ;;
  esac
}

# ── Pinned badges (Sprint 2.9) — up to 3 displayed prominently on the public
# trainer profile. User picks from their owned badges only ; unknown / unowned
# badges are rejected locally (and again on the worker for defense in depth).
view_pins() {
  local sub="${1:-}"
  printf "\\n  %s%s$(pokemon_t pins.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  local owned_json current_json
  owned_json=$(jq -c '.badges // [] | map(.id)' "$POKEMON_STATE")
  current_json=$(jq -c '.stats_share.pinned_badges // []' "$POKEMON_DATA")

  case "$sub" in
    "")
      local n
      n=$(printf '%s' "$current_json" | jq 'length')
      if [ "$n" -gt 0 ]; then
        printf '%s' "$current_json" | jq -r '.[]' | while IFS= read -r pin; do
          printf "  %s★ %s%s\\n" "$GOLD" "$pin" "$RESET"
        done
        printf '\n'
      else
        printf "  %s$(pokemon_t pins.unset)%s\\n\\n" "$DIM" "$RESET"
      fi
      printf "  %s$(pokemon_t pins.usage)%s\\n" "$DIM" "$RESET"
      printf "  %s$(pokemon_t pins.owned)%s %s\\n\\n" "$DIM" "$RESET" \
        "$(printf '%s' "$owned_json" | jq -r 'join(", ")')"
      ;;

    clear|remove|reset)
      jq '.stats_share.pinned_badges = []' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t pins.cleared)%s\\n\\n" "$DIM" "$RESET"
      ;;

    set)
      shift
      # Accept either comma-separated single arg or multiple args.
      local raw="$*"
      raw="${raw//,/ }"
      # shellcheck disable=SC2206  # intentional word splitting
      local pins=($raw)
      if [ "${#pins[@]}" -eq 0 ]; then
        printf "  %s$(pokemon_t pins.empty)%s\\n\\n" "$DIM" "$RESET"
        return
      fi
      if [ "${#pins[@]}" -gt 3 ]; then
        printf "  %s$(pokemon_t pins.too_many "${#pins[@]}")%s\\n\\n" "$DIM" "$RESET"
        return
      fi
      # Validate each pin is owned ; reject the first one that isn't so the
      # user gets a precise error.
      local p
      for p in "${pins[@]}"; do
        if ! printf '%s' "$owned_json" | jq -e --arg id "$p" 'index($id)' >/dev/null 2>&1; then
          printf "  %s$(pokemon_t pins.not_owned "$p")%s\\n\\n" "$DIM" "$RESET"
          return
        fi
      done
      # Build JSON array literal and persist.
      local pins_json
      pins_json=$(printf '%s\n' "${pins[@]}" | jq -R . | jq -s .)
      jq --argjson pins "$pins_json" '.stats_share.pinned_badges = $pins' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t pins.set)%s\\n\\n" "$GOLD" "$RESET"
      printf "  %s$(pokemon_t pins.set_hint)%s\\n\\n" "$DIM" "$RESET"
      ;;

    *)
      printf "  %s$(pokemon_t pins.usage)%s\\n\\n" "$DIM" "$RESET"
      ;;
  esac
}

# ── Arena (Sprint 2.3) — async PvP via the Worker ───────────────────────────
# The arena_secret is stored in a separate file (not data.json) so it isn't
# accidentally exported / shared. chmod 600 on save.

POKEMON_ARENA_SECRET_FILE="$POKEMON_DIR/.arena-secret"

_arena_load_secret() {
  [ -f "$POKEMON_ARENA_SECRET_FILE" ] || return 1
  cat "$POKEMON_ARENA_SECRET_FILE"
}

_arena_save_secret() {
  local secret="$1"
  # umask 077 so the secret file is created 600 from the start (no world-
  # readable window between the redirect and a separate chmod).
  (umask 077; printf '%s' "$secret" > "$POKEMON_ARENA_SECRET_FILE")
}

_arena_clear_secret() {
  rm -f "$POKEMON_ARENA_SECRET_FILE"
}

# ── Auth : GitHub device-flow login (Phase R2d) ─────────────────────────────
# Opaque session token from the Worker, stored in its own chmod-600 file (like
# the arena secret). The CLI runs the GitHub device flow itself (public
# client_id, no secret) then exchanges the GitHub token for our session via
# POST /v1/auth/github/cli-session.
POKEMON_SESSION_FILE="$POKEMON_DIR/.session"

_session_load() { [ -f "$POKEMON_SESSION_FILE" ] && cat "$POKEMON_SESSION_FILE"; }
# umask 077 in a subshell so the file is created 600 from the start (no
# world-readable window between create and chmod).
_session_save() { (umask 077; printf '%s' "$1" > "$POKEMON_SESSION_FILE"); }
_session_clear() { rm -f "$POKEMON_SESSION_FILE"; }

view_login() {
  local endpoint client_id
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  if [ -z "$endpoint" ]; then
    printf '  No API endpoint configured (data.json.stats_share.endpoint).\n'
    return 1
  fi
  # Public client_id of the prod GitHub OAuth app ; override for local dev.
  client_id="${POKEMON_GITHUB_CLIENT_ID:-Ov23liiZGFKFIT78EDcz}"

  local resp device_code user_code verification_uri interval
  resp=$(curl -s --max-time 10 -X POST 'https://github.com/login/device/code' \
    -H 'Accept: application/json' \
    --data-urlencode "client_id=$client_id" --data-urlencode 'scope=read:user' 2>/dev/null)
  device_code=$(jq -r '.device_code // empty' <<<"$resp" 2>/dev/null)
  user_code=$(jq -r '.user_code // empty' <<<"$resp" 2>/dev/null)
  verification_uri=$(jq -r '.verification_uri // empty' <<<"$resp" 2>/dev/null)
  interval=$(jq -r '.interval // 5' <<<"$resp" 2>/dev/null)
  # Coerce to a sane integer ≥1 — a garbage/non-numeric value would crash the
  # arithmetic / sleep below, or busy-spin curl at interval=0.
  case "$interval" in '' | *[!0-9]*) interval=5 ;; esac
  [ "$interval" -lt 1 ] && interval=5
  if [ -z "$device_code" ]; then
    printf '  GitHub device-flow request failed (is Device Flow enabled on the OAuth app?).\n'
    return 1
  fi

  printf '\n  Open %s\n  and enter the code:  %s\n\n  Waiting for authorization…\n' \
    "$verification_uri" "$user_code"

  local access_token='' deadline poll err
  deadline=$(( $(date +%s) + 300 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    sleep "$interval"
    poll=$(curl -s --max-time 10 -X POST 'https://github.com/login/oauth/access_token' \
      -H 'Accept: application/json' \
      --data-urlencode "client_id=$client_id" \
      --data-urlencode "device_code=$device_code" \
      --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:device_code' 2>/dev/null)
    access_token=$(jq -r '.access_token // empty' <<<"$poll" 2>/dev/null)
    [ -n "$access_token" ] && break
    err=$(jq -r '.error // empty' <<<"$poll" 2>/dev/null)
    case "$err" in
      authorization_pending | '') : ;;
      slow_down) interval=$((interval + 5)) ;;
      *)
        printf '  Login aborted (%s).\n' "$err"
        return 1
        ;;
    esac
  done
  if [ -z "$access_token" ]; then
    printf '  Timed out waiting for authorization.\n'
    return 1
  fi

  local sess session_token login_name
  sess=$(curl -s --max-time 10 -X POST "$endpoint/v1/auth/github/cli-session" \
    -H 'content-type: application/json' \
    --data "$(jq -n --arg t "$access_token" '{access_token:$t}')" 2>/dev/null)
  session_token=$(jq -r '.session_token // empty' <<<"$sess" 2>/dev/null)
  login_name=$(jq -r '.github.login // empty' <<<"$sess" 2>/dev/null)
  if [ -z "$session_token" ]; then
    printf '  Session exchange with the arena failed.\n'
    return 1
  fi
  _session_save "$session_token"
  printf '  ✓ Logged in as @%s\n' "$login_name"
}

view_logout() {
  local endpoint token
  token=$(_session_load)
  if [ -z "$token" ]; then
    printf '  Not logged in.\n'
    return 0
  fi
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  if [ -n "$endpoint" ]; then
    # Fire-and-forget server-side revocation.
    curl -s --max-time 5 -X POST "$endpoint/v1/auth/logout" \
      -H "authorization: Bearer $token" >/dev/null 2>&1 &
  fi
  _session_clear
  printf '  ✓ Logged out.\n'
}

# Build the team_snapshot JSON from current state.json.
# Returns 1 if no active companion (caller should warn).
_arena_build_team() {
  local anon_id="$1"
  local display_name="$2"
  local lineage current_level is_shiny
  lineage=$(jq -r '.lineage // ""' "$POKEMON_STATE")
  current_level=$(jq -r '.current_level // 0' "$POKEMON_STATE")
  is_shiny=$(jq -r '.is_shiny // false' "$POKEMON_STATE")
  if [ -z "$lineage" ] || [ "$current_level" -lt 1 ]; then
    return 1
  fi
  jq -n \
    --arg id "$anon_id" \
    --arg n "$display_name" \
    --arg lin "$lineage" \
    --argjson lvl "$current_level" \
    --argjson shiny "$is_shiny" '
      {
        anon_id: $id,
        display_name: ($n | select(. != "")),
        lineage: $lin,
        level: $lvl,
        is_shiny: $shiny
      }
    '
}

# Render a battle (challenger vs defender, turn log, winner) in the terminal.
# Input: raw JSON envelope from /v1/arena/challenge or /v1/arena/battle/:id.
_arena_render_battle() {
  local raw="$1"
  local b
  b=$(jq '.battle // .' <<<"$raw")
  local c_name c_lin c_lvl c_shiny d_name d_lin d_lvl d_shiny winner reason turns_count
  c_name=$(jq -r '.challenger.display_name // .challenger.anon_id' <<<"$b")
  c_lin=$(jq -r '.challenger.lineage' <<<"$b")
  c_lvl=$(jq -r '.challenger.level' <<<"$b")
  c_shiny=$(jq -r '.challenger.is_shiny' <<<"$b")
  d_name=$(jq -r '.defender.display_name // .defender.anon_id' <<<"$b")
  d_lin=$(jq -r '.defender.lineage' <<<"$b")
  d_lvl=$(jq -r '.defender.level' <<<"$b")
  d_shiny=$(jq -r '.defender.is_shiny' <<<"$b")
  winner=$(jq -r '.winner' <<<"$b")
  reason=$(jq -r '.reason' <<<"$b")
  turns_count=$(jq -r '.turns | length' <<<"$b")

  local c_emoji d_emoji c_star d_star
  c_emoji=$(_lineage_emoji "$c_lin")
  d_emoji=$(_lineage_emoji "$d_lin")
  c_star=""; d_star=""
  [ "$c_shiny" = "true" ] && c_star='★'
  [ "$d_shiny" = "true" ] && d_star='★'

  printf "  %s%s %s %s%s %sLv.%s%s   %svs%s   %s%s %s %s%s %sLv.%s%s\n\n" \
    "$BOLD" "$c_emoji" "$c_name" "$c_star" "$RESET" "$DIM" "$c_lvl" "$RESET" \
    "$DIM" "$RESET" \
    "$BOLD" "$d_emoji" "$d_name" "$d_star" "$RESET" "$DIM" "$d_lvl" "$RESET"

  jq -r '.turns[] | "\(.turn)|\(.actor)|\(.damage)|\(.effectiveness)|\(.critical)"' <<<"$b" | \
  while IFS='|' read -r tn actor dmg eff crit; do
    local who eff_label crit_label
    if [ "$actor" = "challenger" ]; then who="$c_emoji"; else who="$d_emoji"; fi
    case "$eff" in
      2.0|2)  eff_label="2.0×" ;;
      0.5)    eff_label="0.5×" ;;
      *)      eff_label="" ;;
    esac
    crit_label=""
    [ "$crit" = "true" ] && crit_label=" CRIT!"
    printf "  %sTurn %2s%s  %s -%s HP %s%s%s\n" "$DIM" "$tn" "$RESET" "$who" "$dmg" "$DIM" "$eff_label$crit_label" "$RESET"
  done

  printf "\n"
  case "$winner" in
    challenger) printf "  %s%s$(pokemon_t arena.winner_challenger "$c_name")%s\n\n" "$BOLD" "$GOLD" "$RESET" ;;
    defender)   printf "  %s%s$(pokemon_t arena.winner_defender "$d_name")%s\n\n" "$BOLD" "$GOLD" "$RESET" ;;
    *)          printf "  %s$(pokemon_t arena.winner_draw)%s\n\n" "$DIM" "$RESET" ;;
  esac
  printf "  %s$(pokemon_t arena.battle_summary "$turns_count" "$reason")%s\n\n" "$DIM" "$RESET"
}

view_arena() {
  local sub="${1:-status}"
  printf "\\n  %s%s$(pokemon_t arena.title)%s\\n\\n" "$BOLD" "$GOLD" "$RESET"

  local endpoint web_url anon_id display_name enabled
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  web_url=$(jq -r '.arena.web_url // "https://claude-pokemon-arena.pages.dev"' "$POKEMON_DATA")
  anon_id=$(jq -r '.stats_share.anon_id // ""' "$POKEMON_DATA")
  display_name=$(jq -r '.stats_share.display_name // ""' "$POKEMON_DATA")
  enabled=$(jq -r '.arena.enabled // false' "$POKEMON_DATA")

  case "$sub" in
    enable|on)
      if [ -z "$anon_id" ]; then
        printf "  %s$(pokemon_t arena.no_anon_id)%s\n\n" "$DIM" "$RESET"
        return
      fi
      if [ "$enabled" = "true" ]; then
        printf "  %s$(pokemon_t arena.already_enabled)%s\n\n" "$DIM" "$RESET"
        return
      fi
      if [ "${2:-}" != "--confirm" ]; then
        printf "  %s$(pokemon_t arena.privacy_notice)%s\n\n" "$DIM" "$RESET"
        printf "  %s$(pokemon_t arena.confirm_hint)%s\n\n" "$BOLD" "$RESET"
        return
      fi
      local team_payload
      if ! team_payload=$(_arena_build_team "$anon_id" "$display_name"); then
        printf "  %s$(pokemon_t arena.no_active)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local resp
      resp=$(curl -s -X POST "$endpoint/v1/arena/enable" \
        -H "content-type: application/json" \
        --data "$team_payload" 2>/dev/null)
      local secret
      secret=$(jq -r '.arena_secret // ""' <<<"$resp" 2>/dev/null)
      if [ -z "$secret" ]; then
        # Surface the server's error code/details instead of the raw JSON
        # envelope — the raw body is what made past failures unreadable.
        local err_code err_msg
        err_code=$(jq -r '.error // ""' <<<"$resp" 2>/dev/null)
        case "$err_code" in
          validation)      err_msg=$(jq -r '.details | join("; ")' <<<"$resp" 2>/dev/null) ;;
          already_enabled) err_msg=$(pokemon_t arena.already_enabled) ;;
          "")              err_msg="$resp" ;;
          *)               err_msg="$err_code" ;;
        esac
        # Keep the server-controlled message as a printf *argument*, never in
        # the format string — a literal % in $err_msg would otherwise be
        # re-parsed and corrupt the output.
        printf '  %s%s%s\n\n' "$DIM" "$(pokemon_t arena.enable_failed "$err_msg")" "$RESET"
        return
      fi
      _arena_save_secret "$secret"
      local now_iso
      now_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
      jq --arg now "$now_iso" '
        .arena.enabled = true | .arena.enabled_at = $now
      ' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t arena.enabled "$anon_id")%s\n\n" "$GOLD" "$RESET"
      ;;

    disable|off)
      if [ "$enabled" != "true" ]; then
        printf "  %s$(pokemon_t arena.already_disabled)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local secret
      if ! secret=$(_arena_load_secret); then
        printf "  %s$(pokemon_t arena.no_secret)%s\n\n" "$DIM" "$RESET"
        return
      fi
      curl -s -X DELETE "$endpoint/v1/arena/disable?anon_id=$anon_id" \
        -H "authorization: Bearer $secret" >/dev/null 2>&1
      _arena_clear_secret
      jq '.arena.enabled = false' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" \
        && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "  %s$(pokemon_t arena.disabled)%s\n\n" "$DIM" "$RESET"
      ;;

    regenerate|rotate)
      if [ "$enabled" != "true" ]; then
        printf "  %s$(pokemon_t arena.not_enabled)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local old_secret
      if ! old_secret=$(_arena_load_secret); then
        printf "  %s$(pokemon_t arena.no_secret)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local team_payload
      if ! team_payload=$(_arena_build_team "$anon_id" "$display_name"); then
        printf "  %s$(pokemon_t arena.no_active)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local resp
      resp=$(curl -s -X POST "$endpoint/v1/arena/regenerate" \
        -H "content-type: application/json" \
        -H "authorization: Bearer $old_secret" \
        --data "$team_payload" 2>/dev/null)
      local new_secret
      new_secret=$(jq -r '.arena_secret // ""' <<<"$resp" 2>/dev/null)
      if [ -z "$new_secret" ]; then
        printf "  %s$(pokemon_t arena.regen_failed "$resp")%s\n\n" "$DIM" "$RESET"
        return
      fi
      _arena_save_secret "$new_secret"
      printf "  %s$(pokemon_t arena.regen_ok)%s\n\n" "$GOLD" "$RESET"
      ;;

    opponents|list)
      local limit="${2:-10}"
      local resp
      resp=$(curl -sf "$endpoint/v1/arena/opponents?limit=$limit" 2>/dev/null)
      if [ -z "$resp" ]; then
        printf "  %s$(pokemon_t arena.fetch_failed)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local total
      total=$(jq -r '.total // 0' <<<"$resp")
      printf "  %s$(pokemon_t arena.opponents_count "$total")%s\n\n" "$DIM" "$RESET"
      jq -r '.opponents[]? | "\(.anon_id)|\(.display_name // .anon_id)|\(.lineage)|\(.level)|\(.is_shiny)"' <<<"$resp" | \
      while IFS='|' read -r oid name lin lvl shiny; do
        local emoji shiny_mark
        emoji=$(_lineage_emoji "$lin")
        shiny_mark=""
        [ "$shiny" = "true" ] && shiny_mark=" ★"
        printf "  %s#%s%s  %s  Lv.%s  %s%s\n" "$DIM" "$oid" "$RESET" "$emoji" "$lvl" "$name" "$shiny_mark"
      done
      printf "\n  %s$(pokemon_t arena.opponents_hint)%s\n\n" "$DIM" "$RESET"
      ;;

    challenge|fight)
      local target="${2:-}"
      if [ -z "$target" ]; then
        printf "  %s$(pokemon_t arena.challenge_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      if [ "$enabled" != "true" ]; then
        printf "  %s$(pokemon_t arena.not_enabled)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local secret
      if ! secret=$(_arena_load_secret); then
        printf "  %s$(pokemon_t arena.no_secret)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local payload
      payload=$(jq -n --arg c "$anon_id" --arg d "$target" \
        '{challenger_anon_id:$c, defender_anon_id:$d}')
      local resp
      resp=$(curl -s -X POST "$endpoint/v1/arena/challenge" \
        -H "content-type: application/json" \
        -H "authorization: Bearer $secret" \
        --data "$payload" 2>/dev/null)
      local battle_id
      battle_id=$(jq -r '.battle.battle_id // ""' <<<"$resp" 2>/dev/null)
      if [ -z "$battle_id" ]; then
        printf "  %s$(pokemon_t arena.challenge_failed "$resp")%s\n\n" "$DIM" "$RESET"
        return
      fi
      jq --arg id "$battle_id" '.arena.last_battle_id = $id' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      _arena_render_battle "$resp"
      printf "  %s$(pokemon_t arena.replay "$web_url" "$battle_id")%s\n\n" "$DIM" "$RESET"
      ;;

    battle|view)
      local id="${2:-}"
      [ -z "$id" ] && id=$(jq -r '.arena.last_battle_id // ""' "$POKEMON_DATA")
      if [ -z "$id" ]; then
        printf "  %s$(pokemon_t arena.battle_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local resp
      resp=$(curl -sf "$endpoint/v1/arena/battle/$id" 2>/dev/null)
      if [ -z "$resp" ]; then
        printf "  %s$(pokemon_t arena.battle_not_found "$id")%s\n\n" "$DIM" "$RESET"
        return
      fi
      _arena_render_battle "$resp"
      printf "  %s$(pokemon_t arena.replay "$web_url" "$id")%s\n\n" "$DIM" "$RESET"
      ;;

    status|"")
      if [ "$enabled" = "true" ]; then
        printf "  %s$(pokemon_t arena.status_enabled "$anon_id")%s\n" "$GOLD" "$RESET"
      else
        printf "  %s$(pokemon_t arena.status_disabled)%s\n" "$DIM" "$RESET"
      fi
      printf "  %s$(pokemon_t arena.status_endpoint "$endpoint")%s\n\n" "$DIM" "$RESET"
      printf "  %s$(pokemon_t arena.usage)%s\n\n" "$DIM" "$RESET"
      ;;

    live)
      view_arena_live "${@:2}"
      ;;

    pair)
      view_arena_pair
      ;;

    link)
      view_arena_link "${2:-}"
      ;;

    *)
      printf "  %s$(pokemon_t arena.unknown_subcmd "$sub")%s\n\n" "$DIM" "$RESET"
      ;;
  esac
}

# Pair this CLI install with the web (Sprint 2.12). Prints a 6-char code +
# a one-click URL. The web /pair?code=XXX page redeems the code and stores
# the arena_secret in localStorage so the user can commit live PvP moves
# from the browser.
view_arena_pair() {
  printf "\n  %s%s$(pokemon_t pair.title)%s\n\n" "$BOLD" "$GOLD" "$RESET"

  local endpoint web_url anon_id enabled
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  web_url=$(jq -r '.arena.web_url // "https://claude-pokemon-arena.pages.dev"' "$POKEMON_DATA")
  anon_id=$(jq -r '.stats_share.anon_id // ""' "$POKEMON_DATA")
  enabled=$(jq -r '.arena.enabled // false' "$POKEMON_DATA")

  if [ "$enabled" != "true" ] || [ -z "$anon_id" ]; then
    printf "  %s$(pokemon_t live.not_enabled)%s\n\n" "$DIM" "$RESET"
    return
  fi
  local secret
  if ! secret=$(_arena_load_secret); then
    printf "  %s$(pokemon_t arena.no_secret)%s\n\n" "$DIM" "$RESET"
    return
  fi

  local payload resp code expires_at
  payload=$(jq -n --arg id "$anon_id" '{anon_id: $id}')
  resp=$(curl -s -X POST "$endpoint/v1/arena/pair/init" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $secret" \
    --data "$payload" 2>/dev/null)
  code=$(jq -r '.code // ""' <<<"$resp")
  expires_at=$(jq -r '.expires_at // ""' <<<"$resp")
  if [ -z "$code" ]; then
    printf "  %s$(pokemon_t pair.failed "$resp")%s\n\n" "$DIM" "$RESET"
    return
  fi

  local pair_url="$web_url/pair?code=$code"
  printf "  %s$(pokemon_t pair.code_label)%s   %s%s%s\n\n" "$DIM" "$RESET" "$BOLD$GOLD" "$code" "$RESET"
  printf "  %s$(pokemon_t pair.url_label)%s\n" "$DIM" "$RESET"
  printf "  %s%s%s\n\n" "$BOLD" "$pair_url" "$RESET"

  # Scannable QR of the pair URL (Sprint 2.12) — opens /pair on a phone so the
  # user doesn't retype the link. qrencode is optional ; without it we just
  # keep the URL above and hint how to enable the QR.
  if command -v qrencode >/dev/null 2>&1; then
    printf "  %s$(pokemon_t pair.qr_label)%s\n" "$DIM" "$RESET"
    qrencode -t ANSIUTF8 -m 1 "$pair_url" 2>/dev/null | sed 's/^/  /'
    printf "\n"
  else
    printf "  %s$(pokemon_t pair.qr_hint)%s\n\n" "$DIM" "$RESET"
  fi

  printf "  %s$(pokemon_t pair.expires "$expires_at")%s\n\n" "$DIM" "$RESET"
  printf "  %s$(pokemon_t pair.warning)%s\n\n" "$DIM" "$RESET"
}

# ── Link this CLI to a web-created account (Sprint 4.3) ─────────────────────
# Inverse of pair : the web user generates a code on their /profile page,
# they hand it to us, we redeem → we receive {anon_id, arena_secret} and
# overwrite local state. Also fetches the TrainerRecord and rewrites
# state.json so the user's web progression (level, badges, pokédex) lands
# locally (Sprint 4.4 — combined with 4.3 for atomicity).
#
# Safety : if the CLI already has a different anon_id, we prompt the user
# to confirm overwriting because the previous identity becomes orphaned on
# the server (it still exists, but this install can no longer authenticate
# as it without going through the full /enable cycle).
view_arena_link() {
  local code="${1:-}"
  printf "\n  %s%s$(pokemon_t link.title)%s\n\n" "$BOLD" "$GOLD" "$RESET"

  if [ -z "$code" ]; then
    printf "  %s$(pokemon_t link.usage)%s\n\n" "$DIM" "$RESET"
    return
  fi

  # Code shape : 6 chars from the safe alphabet (cf. Worker's PAIR_CODE_RE).
  local upper
  upper=$(printf '%s' "$code" | tr '[:lower:]' '[:upper:]')
  if ! printf '%s' "$upper" | grep -qE '^[A-HJ-NP-TV-Z2-9]{6}$'; then
    printf "  %s$(pokemon_t link.invalid_code)%s\n\n" "$DIM" "$RESET"
    return
  fi

  local endpoint anon_id_current arena_enabled_current
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  anon_id_current=$(jq -r '.stats_share.anon_id // ""' "$POKEMON_DATA")
  arena_enabled_current=$(jq -r '.arena.enabled // false' "$POKEMON_DATA")

  # Warn if the user is about to overwrite a different existing identity.
  # We don't block — they may have just nuked their state.json and want a
  # fresh link — but we surface the change explicitly.
  if [ "$arena_enabled_current" = "true" ] && [ -n "$anon_id_current" ]; then
    printf "  %s$(pokemon_t link.warn_existing "$anon_id_current")%s\n\n" "$DIM" "$RESET"
  fi

  local resp anon_id arena_secret
  resp=$(curl -s -X POST "$endpoint/v1/arena/pair/redeem" \
    -H "content-type: application/json" \
    --data "$(jq -n --arg c "$upper" '{code: $c}')" 2>/dev/null)
  anon_id=$(jq -r '.anon_id // ""' <<<"$resp")
  arena_secret=$(jq -r '.arena_secret // ""' <<<"$resp")
  if [ -z "$anon_id" ] || [ -z "$arena_secret" ]; then
    printf "  %s$(pokemon_t link.failed "$resp")%s\n\n" "$DIM" "$RESET"
    return
  fi

  # 1. Persist the secret + flip arena.enabled in data.json
  _arena_save_secret "$arena_secret"
  local now_iso
  now_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  jq --arg id "$anon_id" --arg now "$now_iso" '
    .stats_share.anon_id = $id
    | .arena.enabled = true
    | .arena.enabled_at = $now
  ' "$POKEMON_DATA" > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"

  # 2. Sprint 4.4 — fetch the trainer record from the Worker and rewrite
  # state.json so the web progression (lineage, level, badges, pokédex)
  # lands locally. This is what makes the web→CLI handoff "lossless".
  local trainer_resp
  trainer_resp=$(curl -sf "$endpoint/v1/trainer/$anon_id" 2>/dev/null || printf '')
  if [ -n "$trainer_resp" ]; then
    _link_apply_trainer_to_state "$trainer_resp"
    printf "  %s$(pokemon_t link.state_synced)%s\n" "$DIM" "$RESET"
  else
    # Trainer record doesn't exist yet (web user just signed up, no submit
    # or profile patch yet). The link still works — local state.json is
    # untouched, the next state.json submit will create the record.
    printf "  %s$(pokemon_t link.no_remote_state)%s\n" "$DIM" "$RESET"
  fi

  printf "  %s$(pokemon_t link.success "$anon_id")%s\n\n" "$GOLD" "$RESET"
}

# Rewrite state.json from a TrainerResponse JSON (the GET /v1/trainer/<id>
# response). Mapping :
#   stats.active.lineage   → state.lineage
#   stats.active.current_level → state.current_level
#   stats.active.is_shiny  → state.is_shiny
#   stats.lifetime.*       → state.lifetime_stats.*
#   stats.badges           → state.badges (as {id, earned_at: now} objects)
#   stats.pokedex_seen_ids → state.pokedex_wild (one entry per id, count=1)
#
# We don't have per-encounter dates from the API, so first_seen_at gets
# stamped at "now" for everything imported. Minor cosmetic loss — better
# than ditching the whole progression.
_link_apply_trainer_to_state() {
  local trainer="$1"
  local now_iso
  now_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  jq --argjson t "$trainer" --arg now "$now_iso" '
    .lineage = $t.stats.active.lineage
    | .is_shiny = $t.stats.active.is_shiny
    | .current_level = $t.stats.active.current_level
    | .lifetime_stats.total_tokens     = ($t.stats.lifetime.total_tokens // 0)
    | .lifetime_stats.total_evolutions = ($t.stats.lifetime.total_evolutions // 0)
    | .lifetime_stats.total_shinies    = ($t.stats.lifetime.total_shinies // 0)
    | .lifetime_stats.max_level        = ($t.stats.lifetime.max_level // 0)
    | .lifetime_stats.total_compagnons = ($t.stats.lifetime.total_compagnons // 0)
    | .lifetime_stats.lineages_completed = ($t.stats.lifetime.lineages_completed // [])
    | .lifetime_stats.games_won  = ($t.stats.lifetime.games_won // 0)
    | .lifetime_stats.games_played = ($t.stats.lifetime.games_played // 0)
    | .badges = ([$t.stats.badges // [] | .[] | { id: ., earned_at: $now }])
    | .pokedex_wild = (
        ($t.stats.pokedex_seen_ids // [])
        | map({ key: ., value: { count: 1, first_seen_at: $now } })
        | from_entries
      )
    | .last_updated = $now
  ' "$POKEMON_STATE" > "$POKEMON_STATE.tmp" && mv "$POKEMON_STATE.tmp" "$POKEMON_STATE"
}

# ── Live PvP (Sprint 2.10) — polling-based realtime battles ────────────────
# Subcommands : invite <opp> | accept [<id>] | status [<id>] | move <name>
#               | forfeit [<id>]
# Each one needs the arena_secret loaded ; commits + invites use Bearer auth.
view_arena_live() {
  local sub="${1:-status}"

  local endpoint web_url anon_id enabled
  endpoint=$(jq -r '.stats_share.endpoint // ""' "$POKEMON_DATA")
  web_url=$(jq -r '.arena.web_url // "https://claude-pokemon-arena.pages.dev"' "$POKEMON_DATA")
  anon_id=$(jq -r '.stats_share.anon_id // ""' "$POKEMON_DATA")
  enabled=$(jq -r '.arena.enabled // false' "$POKEMON_DATA")

  if [ "$enabled" != "true" ] || [ -z "$anon_id" ]; then
    printf "\n  %s$(pokemon_t live.not_enabled)%s\n\n" "$DIM" "$RESET"
    return
  fi
  local secret
  if ! secret=$(_arena_load_secret); then
    printf "\n  %s$(pokemon_t arena.no_secret)%s\n\n" "$DIM" "$RESET"
    return
  fi

  case "$sub" in
    invite)
      local opp="${2:-}"
      if [ -z "$opp" ]; then
        printf "\n  %s$(pokemon_t live.invite_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local payload resp battle_id
      payload=$(jq -n --arg c "$anon_id" --arg d "$opp" \
        '{challenger_anon_id: $c, defender_anon_id: $d}')
      resp=$(curl -s -X POST "$endpoint/v1/arena/live/invite" \
        -H "content-type: application/json" \
        -H "authorization: Bearer $secret" \
        --data "$payload" 2>/dev/null)
      battle_id=$(jq -r '.battle_id // ""' <<<"$resp")
      if [ -z "$battle_id" ]; then
        printf "\n  %s$(pokemon_t live.invite_failed "$resp")%s\n\n" "$DIM" "$RESET"
        return
      fi
      jq --arg id "$battle_id" '.arena.last_live_battle_id = $id' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "\n  %s$(pokemon_t live.invite_sent "$opp" "$battle_id")%s\n" "$GOLD" "$RESET"
      printf "  %s$(pokemon_t live.spectator_url "$web_url" "$battle_id")%s\n\n" "$DIM" "$RESET"
      ;;

    accept)
      local id="${2:-}"
      [ -z "$id" ] && id=$(jq -r '.arena.last_live_battle_id // ""' "$POKEMON_DATA")
      if [ -z "$id" ]; then
        printf "\n  %s$(pokemon_t live.accept_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local resp
      resp=$(curl -s -X POST "$endpoint/v1/arena/live/$id/accept" \
        -H "authorization: Bearer $secret" 2>/dev/null)
      local state
      state=$(jq -r '.state // ""' <<<"$resp")
      if [ "$state" != "active" ]; then
        printf "\n  %s$(pokemon_t live.accept_failed "$resp")%s\n\n" "$DIM" "$RESET"
        return
      fi
      jq --arg id "$id" '.arena.last_live_battle_id = $id' "$POKEMON_DATA" \
        > "$POKEMON_DATA.tmp" && mv "$POKEMON_DATA.tmp" "$POKEMON_DATA"
      printf "\n  %s$(pokemon_t live.accepted "$id")%s\n\n" "$GOLD" "$RESET"
      view_arena_live status "$id"
      ;;

    status|"")
      local id="${2:-}"
      [ -z "$id" ] && id=$(jq -r '.arena.last_live_battle_id // ""' "$POKEMON_DATA")
      if [ -z "$id" ]; then
        printf "\n  %s$(pokemon_t live.status_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local resp
      resp=$(curl -sf "$endpoint/v1/arena/live/$id" 2>/dev/null)
      if [ -z "$resp" ]; then
        printf "\n  %s$(pokemon_t live.not_found "$id")%s\n\n" "$DIM" "$RESET"
        return
      fi
      _live_render_status "$resp" "$anon_id"
      printf "  %s$(pokemon_t live.spectator_url "$web_url" "$id")%s\n\n" "$DIM" "$RESET"
      ;;

    move|attack)
      local name="${2:-}"
      local id
      id=$(jq -r '.arena.last_live_battle_id // ""' "$POKEMON_DATA")
      if [ -z "$id" ]; then
        printf "\n  %s$(pokemon_t live.move_no_battle)%s\n\n" "$DIM" "$RESET"
        return
      fi
      if [ -z "$name" ]; then
        printf "\n  %s$(pokemon_t live.move_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local payload resp
      payload=$(jq -n --arg id "$anon_id" --arg m "$name" \
        '{anon_id: $id, move_id: $m}')
      resp=$(curl -s -X POST "$endpoint/v1/arena/live/$id/commit" \
        -H "content-type: application/json" \
        -H "authorization: Bearer $secret" \
        --data "$payload" 2>/dev/null)
      local err
      err=$(jq -r '.error // ""' <<<"$resp")
      if [ -n "$err" ]; then
        printf "\n  %s$(pokemon_t live.move_failed "$err")%s\n\n" "$DIM" "$RESET"
        return
      fi
      printf "\n  %s$(pokemon_t live.move_committed "$name")%s\n\n" "$GOLD" "$RESET"
      _live_render_status "$resp" "$anon_id"
      printf "  %s$(pokemon_t live.spectator_url "$web_url" "$id")%s\n\n" "$DIM" "$RESET"
      ;;

    forfeit|abandon)
      local id="${2:-}"
      [ -z "$id" ] && id=$(jq -r '.arena.last_live_battle_id // ""' "$POKEMON_DATA")
      if [ -z "$id" ]; then
        printf "\n  %s$(pokemon_t live.forfeit_usage)%s\n\n" "$DIM" "$RESET"
        return
      fi
      local resp
      resp=$(curl -s -X POST "$endpoint/v1/arena/live/$id/forfeit" \
        -H "authorization: Bearer $secret" 2>/dev/null)
      local state
      state=$(jq -r '.state // ""' <<<"$resp")
      printf "\n  %s$(pokemon_t live.forfeited "$state")%s\n\n" "$DIM" "$RESET"
      ;;

    *)
      printf "\n  %s$(pokemon_t live.unknown_subcmd "$sub")%s\n\n" "$DIM" "$RESET"
      ;;
  esac
}

# Render HP bars + state + the local player's available moves.
_live_render_status() {
  local resp="$1"
  local me="$2"

  local state turn_no winner reason
  state=$(jq -r '.state // ""' <<<"$resp")
  turn_no=$(jq -r '.turn_no // 0' <<<"$resp")
  winner=$(jq -r '.winner // ""' <<<"$resp")
  reason=$(jq -r '.reason // ""' <<<"$resp")

  local c_id c_lin c_lvl c_hp c_pending d_id d_lin d_lvl d_hp d_pending
  c_id=$(jq -r '.challenger.anon_id' <<<"$resp")
  c_lin=$(jq -r '.challenger.snapshot.lineage // "?"' <<<"$resp")
  c_lvl=$(jq -r '.challenger.snapshot.level // 0' <<<"$resp")
  c_hp=$(jq -r '.challenger.hp // 0' <<<"$resp")
  c_pending=$(jq -r '.challenger.has_pending_action // false' <<<"$resp")
  d_id=$(jq -r '.defender.anon_id' <<<"$resp")
  d_lin=$(jq -r '.defender.snapshot.lineage // "?"' <<<"$resp")
  d_lvl=$(jq -r '.defender.snapshot.level // 0' <<<"$resp")
  d_hp=$(jq -r '.defender.hp // null' <<<"$resp")
  d_pending=$(jq -r '.defender.has_pending_action // false' <<<"$resp")

  printf "  %s── Live PvP — état: %s%s · tour %s%s\n" "$BOLD" "$GOLD" "$state" "$turn_no" "$RESET"

  local c_emoji d_emoji
  c_emoji=$(_lineage_emoji "$c_lin")
  d_emoji=$(_lineage_emoji "$d_lin")
  printf "  %s%s %s Lv.%s · HP %s · %s%s\n" \
    "$DIM" "$c_emoji" "$c_id" "$c_lvl" "$c_hp" \
    "$([ "$c_pending" = "true" ] && printf 'commit ✓' || printf '... en attente')" "$RESET"
  if [ "$d_hp" = "null" ]; then
    printf "  %s%s %s · en attente d'acceptation%s\n\n" "$DIM" "$d_emoji" "$d_id" "$RESET"
  else
    printf "  %s%s %s Lv.%s · HP %s · %s%s\n\n" \
      "$DIM" "$d_emoji" "$d_id" "$d_lvl" "$d_hp" \
      "$([ "$d_pending" = "true" ] && printf 'commit ✓' || printf '... en attente')" "$RESET"
  fi

  if [ "$state" = "finished" ] || [ "$state" = "abandoned" ]; then
    printf "  %s🏁 Combat terminé · winner=%s · reason=%s%s\n\n" "$GOLD" "$winner" "$reason" "$RESET"
    return
  fi

  # Local move list — derived from the player's lineage + level. Reused
  # client-side as a hint ; the worker will reject invalid moves.
  if [ "$state" = "active" ] && [ "$me" = "$c_id" ] && [ "$c_pending" != "true" ]; then
    _live_print_moves "$c_lin" "$c_lvl"
  elif [ "$state" = "active" ] && [ "$me" = "$d_id" ] && [ "$d_pending" != "true" ]; then
    _live_print_moves "$d_lin" "$d_lvl"
  fi
}

# Print the 4 moves available to the local player at their current stage.
# Source of truth on the worker (api/src/lib/moves.ts) — we keep a minimal
# per-stage list here for display only ; the worker will reject anything
# that's not in the actual pool.
_live_print_moves() {
  local lin="$1" lvl="$2" stage moves
  stage=$(_live_stage_for "$lin" "$lvl")
  moves=$(_live_moves_for_stage "$stage")
  if [ -z "$moves" ]; then
    printf "  %sAucun moveset connu pour ce stade.%s\n\n" "$DIM" "$RESET"
    return
  fi
  printf "  %sTes attaques :%s\n" "$BOLD" "$RESET"
  printf '%s\n' "$moves" | while IFS= read -r m; do
    [ -n "$m" ] && printf "    %s• %s%s\n" "$GOLD" "$m" "$RESET"
  done
  printf "\n  %s/pokemon arena live move \"<nom>\"%s\n\n" "$DIM" "$RESET"
}

# Lineage + level → showdown_id, mirror of api/src/lib/moves.ts stageFor.
_live_stage_for() {
  local lin="$1" lvl="$2"
  case "$lin" in
    fire)
      if [ "$lvl" -ge 55 ]; then printf 'charizard-megax'
      elif [ "$lvl" -ge 36 ]; then printf 'charizard'
      elif [ "$lvl" -ge 16 ]; then printf 'charmeleon'
      elif [ "$lvl" -ge 1 ]; then printf 'charmander'
      else printf 'egg'; fi ;;
    water)
      if [ "$lvl" -ge 55 ]; then printf 'blastoise-mega'
      elif [ "$lvl" -ge 36 ]; then printf 'blastoise'
      elif [ "$lvl" -ge 16 ]; then printf 'wartortle'
      elif [ "$lvl" -ge 1 ]; then printf 'squirtle'
      else printf 'egg'; fi ;;
    grass)
      if [ "$lvl" -ge 55 ]; then printf 'venusaur-mega'
      elif [ "$lvl" -ge 32 ]; then printf 'venusaur'
      elif [ "$lvl" -ge 16 ]; then printf 'ivysaur'
      elif [ "$lvl" -ge 1 ]; then printf 'bulbasaur'
      else printf 'egg'; fi ;;
    electric)
      if [ "$lvl" -ge 55 ]; then printf 'raichu-alola'
      elif [ "$lvl" -ge 30 ]; then printf 'raichu'
      elif [ "$lvl" -ge 10 ]; then printf 'pikachu'
      elif [ "$lvl" -ge 1 ]; then printf 'pichu'
      else printf 'egg'; fi ;;
    eevee)
      if [ "$lvl" -ge 30 ]; then printf 'vaporeon'
      elif [ "$lvl" -ge 1 ]; then printf 'eevee'
      else printf 'egg'; fi ;;
    chikorita)
      if [ "$lvl" -ge 32 ]; then printf 'meganium'
      elif [ "$lvl" -ge 16 ]; then printf 'bayleef'
      elif [ "$lvl" -ge 1 ]; then printf 'chikorita'
      else printf 'egg'; fi ;;
    cyndaquil)
      if [ "$lvl" -ge 55 ]; then printf 'typhlosion-hisui'
      elif [ "$lvl" -ge 32 ]; then printf 'typhlosion'
      elif [ "$lvl" -ge 16 ]; then printf 'quilava'
      elif [ "$lvl" -ge 1 ]; then printf 'cyndaquil'
      else printf 'egg'; fi ;;
    totodile)
      if [ "$lvl" -ge 32 ]; then printf 'feraligatr'
      elif [ "$lvl" -ge 16 ]; then printf 'croconaw'
      elif [ "$lvl" -ge 1 ]; then printf 'totodile'
      else printf 'egg'; fi ;;
    *) printf 'egg' ;;
  esac
}

# Per-stage move list — basic one-line-per-move output, used as a hint only.
# Source of truth lives in the worker (api/src/lib/moves.ts STAGE_MOVES).
# Sprint 2.13 (A1) — must be kept in sync. The worker re-validates the move
# server-side via lookupMoveForSide, so a drift here is a UX bug (stale
# hint) not a correctness bug. Until A4 (npm package) lands, sync manually
# whenever moves.ts changes.
_live_moves_for_stage() {
  case "$1" in
    egg) printf 'Charge\nMimi-Queue\nRepli\nGrondement' ;;
    charmander) printf 'Charge\nGriffe\nFlammèche\nGrondement' ;;
    charmeleon) printf 'Tranche\nFlammèche\nBrouillard\nBrûlure' ;;
    charizard) printf 'Lance-Flammes\nCru-Aile\nTranche\nMorsure' ;;
    charizard-megax) printf 'Dracosouffle\nDamoclès\nLance-Flammes\nTranche' ;;
    charizard-megay) printf 'Lance-Soleil\nDéflagration\nCru-Aile\nBélier' ;;
    squirtle) printf 'Charge\nMimi-Queue\nPistolet à O\nRepli' ;;
    wartortle) printf 'Pistolet à O\nRepli\nMorsure\nTranche' ;;
    blastoise) printf "Hydrocanon\nBulles d'O\nTranche\nBélier" ;;
    blastoise-mega) printf 'Hydroblast\nVibraqua\nBélier\nDamoclès' ;;
    blastoise-gmax) printf 'Hydroblast\nVibraqua\nHydrocanon\nDamoclès' ;;
    bulbasaur) printf "Charge\nRugissement\nVampigraine\nTranch'Herbe" ;;
    ivysaur) printf "Tranch'Herbe\nVampigraine\nPoudre Dodo\nBélier" ;;
    venusaur) printf "Lance-Soleil\nTranch'Herbe\nVampigraine\nBélier" ;;
    venusaur-mega) printf 'Lance-Soleil\nVampigraine\nBélier\nSynthèse' ;;
    venusaur-gmax) printf "G-Max Vine Lash\nLance-Soleil\nSynthèse\nVampigraine" ;;
    pichu) printf 'Charge\nÉclair\nMimi-Queue\nVive-Attaque' ;;
    pikachu) printf 'Tonnerre\nVive-Attaque\nÉclair\nCharge' ;;
    raichu) printf "Fatal-Foudre\nCoup d'Jus\nTonnerre\nVive-Attaque" ;;
    raichu-alola) printf "Psyko\nTonnerre\nVive-Attaque\nCoup d'Jus" ;;
    pikachu-gmax) printf "G-Max Volt Crash\nCataclectric\nTonnerre\nVive-Attaque" ;;
    eevee) printf 'Charge\nMimi-Queue\nMorsure\nVive-Attaque' ;;
    vaporeon) printf "Hydrocanon\nVibraqua\nBulles d'O\nMorsure" ;;
    jolteon) printf "Tonnerre\nVive-Attaque\nCoup d'Jus\nÉclair" ;;
    flareon) printf 'Lance-Flammes\nCrocs Feu\nRoue de Feu\nMorsure' ;;
    espeon) printf 'Psyko\nVœu Soin\nVive-Attaque\nMimi-Queue' ;;
    umbreon) printf "Ball'Ombre\nReflet Magik\nMorsure\nVive-Attaque" ;;
    chikorita) printf "Charge\nRugissement\nTranch'Herbe\nMimi-Queue" ;;
    bayleef) printf "Tranch'Herbe\nSynthèse\nVampigraine\nBélier" ;;
    meganium) printf "Lance-Soleil\nBélier\nSynthèse\nTranch'Herbe" ;;
    cyndaquil) printf "Charge\nGroz'Yeux\nFlammèche\nBrouillard" ;;
    quilava) printf 'Roue de Feu\nBrouillard\nFlammèche\nVive-Attaque' ;;
    typhlosion) printf 'Lance-Flammes\nSurchauffe\nRoue de Feu\nTranche' ;;
    typhlosion-hisui) printf "Vortex Infernal\nBall'Ombre\nLance-Flammes\nReflet Magik" ;;
    totodile) printf 'Charge\nRugissement\nPistolet à O\nMorsure' ;;
    croconaw) printf 'Morsure\nPistolet à O\nTranche\nVive-Attaque' ;;
    feraligatr) printf 'Hydrocanon\nMâchouille\nTranche\nBélier' ;;
    *) printf 'Charge\nMimi-Queue\nMorsure\nTranche' ;;
  esac
}

# Map a lineage id to its iconic emoji (used in leaderboard render + trainer-card).
# Kept synced with api/src/index.js LINEAGE_EMOJI constant.
_lineage_emoji() {
  case "$1" in
    fire)       printf '🔥' ;;
    water)      printf '💧' ;;
    grass)      printf '🌿' ;;
    electric)   printf '⚡' ;;
    eevee)      printf '🦊' ;;
    chikorita)  printf '🌱' ;;
    cyndaquil)  printf '🦔' ;;
    totodile)   printf '🐊' ;;
    *)          printf '❓' ;;
  esac
}

# Format the rank prefix : 🥇🥈🥉 for top 3, "N." for the rest.
_rank_prefix() {
  case "$1" in
    1) printf '🥇' ;;
    2) printf '🥈' ;;
    3) printf '🥉' ;;
    *) printf '%2s.' "$1" ;;
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
      [ "$shiny" = "true" ] && star="${GOLD} ✦${RESET}"
      # Render label : pseudo#shortid (4 first chars of anon_id) if pseudo set, else full anon_id
      local label
      if [ -n "$name" ]; then
        label="${name}#${id:0:4}"
      else
        label="$id"
      fi
      local rank_prefix lineage_emoji formatted_val
      rank_prefix=$(_rank_prefix "$rank")
      lineage_emoji=$(_lineage_emoji "$lin")
      formatted_val=$(fmt_int "$val")
      # Egg state (lvl 0) shown with 🥚 instead of "lv.0"
      local lvl_label
      if [ "$lvl" = "0" ]; then
        lvl_label="🥚"
      else
        lvl_label="lv.$lvl"
      fi
      printf "  %s  %s%-20s%s  %s%14s%s   %s%s %s %s%s%s\n" \
        "$rank_prefix" "${BOLD}${mark}" "$label" "$RESET" \
        "$mark" "$formatted_val" "$RESET" \
        "$DIM" "$lineage_emoji" "$lin" "$lvl_label" "$star" "$RESET"
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
      local lineage_emoji
      lineage_emoji=$(_lineage_emoji "$lin")
      printf "    %s %s%-12s%s : %d\n" "$lineage_emoji" "$DIM" "$lin" "$RESET" "$count"
    done
  printf "\n"
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
# ── TS render bridge (Phase R3d) ─────────────────────────────────────────────
# Render a ported view via the bundled TS engine (the renderers verified in
# R3c). Streams the engine's output and returns its exit code: 0 = rendered,
# 3 = view not ported, other = error / engine unavailable → the caller falls
# back to the bash view_* function. Node is already a hard dependency; this is
# the same graceful-degradation contract as the R3b tick bridge.
_render_view_live() {
  local view="$1" scope="${2:-}"
  pokemon_engine_available || return 1
  local lang locale sprite_json req
  lang=$(jq -r '.language // "fr"' "$POKEMON_DATA" 2>/dev/null || echo fr)
  locale="$POKEMON_LOCALES_DIR/$lang.json"
  [ -f "$locale" ] || locale="$POKEMON_LOCALES_DIR/fr.json"

  # Sprite (main only): resolve the cached file exactly like view_main does.
  sprite_json="null"
  if [ "$view" = "main" ]; then
    local s_lin s_lvl s_shiny s_show s_variant s_path
    s_lin=$(jq -r '.lineage // "fire"' "$POKEMON_STATE")
    s_lvl=$(jq -r '.current_level' "$POKEMON_STATE")
    s_shiny=$(jq -r '.is_shiny' "$POKEMON_STATE")
    s_show=$(pokemon_evo_field "$s_lin" "$s_lvl" "showdown_id")
    s_variant="normal"; [ "$s_shiny" = "true" ] && s_variant="shiny"
    s_path="$POKEMON_DIR/sprites/$s_variant/$s_show.txt"
    if [ -f "$s_path" ]; then
      sprite_json=$(jq -R -s 'split("\n") | if .[-1] == "" then .[:-1] else . end' "$s_path")
    fi
  fi

  req=$(jq -cn \
    --slurpfile st "$POKEMON_STATE" \
    --slurpfile dt "$POKEMON_DATA" \
    --slurpfile lc "$locale" \
    --arg v "$view" --arg lang "$lang" --arg scope "$scope" \
    --argjson now "$(date -u +%s)" --argjson sprite "$sprite_json" '
    {view: $v, state: $st[0], data: $dt[0], locale: $lc[0], lang: $lang,
     scriptName: "pokemon-status.sh", nowEpoch: $now,
     scope: (if $scope == "" then "session" else $scope end), sprite: $sprite}
  ' 2>/dev/null) || return 1

  # Stream the engine output; PIPESTATUS[1] is node's exit (0=rendered,
  # 3=unported, other=error). Nothing must run between the pipe and this read.
  # Safe against double-output: the engine does a single stdout.write AFTER
  # building the whole string, so a failure writes zero stdout bytes → the
  # `|| view_X` fallback renders cleanly.
  printf '%s' "$req" | node "$POKEMON_ENGINE" render "$view" 2>/dev/null
  return "${PIPESTATUS[1]}"
}

# Apply a single collection transform via the TS engine (Phase R3d-2). Reads
# $POKEMON_STATE; on success echoes the NEW state JSON (rc 0). rc 4 = op refused
# (e.g. team full). rc 1 = engine unavailable / error → caller falls back to the
# bash transform. Args: op, then op-specific string args.
_mutate_state() {
  local op="$1"; shift
  pokemon_engine_available || return 1
  local now args_json req out rc ok
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  if [ "$#" -eq 0 ]; then args_json='[]'; else args_json=$(printf '%s\n' "$@" | jq -R . | jq -cs .); fi
  req=$(jq -cn --slurpfile st "$POKEMON_STATE" --slurpfile dt "$POKEMON_DATA" \
    --arg op "$op" --arg now "$now" --argjson args "$args_json" \
    '{op: $op, state: $st[0], data: $dt[0], now: $now, args: $args}' 2>/dev/null) || return 1
  out=$(printf '%s' "$req" | node "$POKEMON_ENGINE" mutate "$op" 2>/dev/null); rc=$?
  [ "$rc" -ne 0 ] && return 1
  [ -n "$out" ] || return 1                 # empty stdout → fallback (never write a blank save)
  ok=$(jq -r '.ok' <<<"$out" 2>/dev/null) || return 1
  [ "$ok" = "false" ] && return 4           # op refused (e.g. team full)
  [ "$ok" = "true" ]  || return 1           # malformed → fallback
  local new
  new=$(jq -c '.state' <<<"$out" 2>/dev/null) || return 1
  # Guard the resulting state is a non-empty, non-null object before any caller
  # writes it to state.json — a corrupted save is far worse than a fallback.
  [ -n "$new" ] && [ "$new" != "null" ] || return 1
  printf '%s' "$new"
}

case "${1:-}" in
  --shiny)            toggle_shiny ;;
  reset)              ceremonial_reset ;;
  team)               _render_view_live team    || view_team ;;
  pc|storage)         _render_view_live pc      || view_pc ;;
  pokedex|dex)        _render_view_live pokedex || view_pokedex ;;
  stats|lifetime)     _render_view_live stats   || view_stats ;;
  badges)             _render_view_live badges  || view_badges ;;
  inventory|inv|sac)  _render_view_live inventory || view_inventory ;;
  switch)             view_switch "${2:-}" ;;
  hatch)              view_hatch "${2:-}" ;;
  deposit)            view_deposit "${2:-}" ;;
  withdraw)           view_withdraw "${2:-}" ;;
  release)            view_release "${2:-}" "${3:-}" "${4:-}" ;;
  give)               view_give "${2:-}" ;;
  take)               view_take ;;
  trade)              view_trade "${2:-Anonymous}" ;;
  game)               view_game "${@:2}" ;;
  recap|summary)      _render_view_live recap "${2:-}" || view_recap "${2:-}" ;;
  trainer-card|card)  _render_view_live trainer-card || view_trainer_card ;;
  stats-share|share)  view_stats_share "${2:-}" "${3:-}" ;;
  quote)              view_quote "${@:2}" ;;
  bio)                view_bio "${@:2}" ;;
  pins|pinned)        view_pins "${@:2}" ;;
  arena)              view_arena "${2:-status}" "${3:-}" ;;
  login)              view_login ;;
  logout)             view_logout ;;
  leaderboard|lb)     view_leaderboard "${2:-total_tokens}" "${3:-10}" ;;
  aggregate|global)   view_aggregate ;;
  *)                  _render_view_live main || view_main ;;
esac
