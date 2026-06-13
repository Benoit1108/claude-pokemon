// Collection state transforms (Phase R3d-2) — ported from lib/lib.sh's jq
// functions (active_to_archive, reset_active, load_team_to_active, team_to_pc,
// pc_to_team_or_active, release_slot). Pure: state in → new state out (never
// mutates the input). Behavior frozen by the R3d-2 characterization fixtures;
// typed against the domain contract (state-types.ts) in the audit cleanup.
//
// jq is null-safe (`null.name` is null, not an error) and functional — these
// helpers reproduce that: missing fields read as undefined, deletes/slices
// return fresh arrays.
import type { CompanionEntry, PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function removeAt<T>(arr: T[], idx: number): T[] {
  return [...arr.slice(0, idx), ...arr.slice(idx + 1)]
}

// jq `(.evolution_history | last.name) // "Œuf"`
function lastStageName(state: PokemonState): string {
  const hist = Array.isArray(state.evolution_history) ? state.evolution_history : []
  const name = hist.length ? hist[hist.length - 1]?.name : undefined
  return name ?? 'Œuf'
}

// pokemon_active_to_archive: move the active companion into team[] (overflow →
// pc_storage if team already has 6); bump lifetime stats. Egg (lineage null) is
// left untouched.
export function activeToArchive(state: PokemonState, now: string): PokemonState {
  if (state.lineage == null) return clone(state)
  const lin = state.lineage
  const s = clone(state)
  const team = Array.isArray(s.team) ? s.team : []
  s.team = team
  team.push({
    lineage: s.lineage,
    is_shiny: s.is_shiny,
    level: s.current_level,
    total_xp: s.total_xp,
    max_stage: lastStageName(s),
    evolution_history: s.evolution_history,
    eevee_form: s.eevee_form,
    items: s.items,
    created_at: s.created_at,
    completed_at: now,
  })
  if (team.length > 6) {
    const pc = Array.isArray(s.pc_storage) ? s.pc_storage : []
    s.pc_storage = pc
    pc.push(team[0]!) // team.length > 6 here, so team[0] exists
    s.team = team.slice(1)
  }
  const ls = (s.lifetime_stats = s.lifetime_stats ?? {})
  if ((s.current_level ?? 0) >= 100) {
    ls.total_companions = (ls.total_companions ?? ls.total_compagnons ?? 0) + 1
    delete ls.total_compagnons
  }
  const completed = Array.isArray(ls.lineages_completed) ? ls.lineages_completed : []
  if (completed.indexOf(lin) === -1 && (s.current_level ?? 0) >= 100) {
    ls.lineages_completed = [...completed, lin]
  }
  return s
}

// pokemon_reset_active: fresh egg. forcedLineage null → random pick on next tick.
export function resetActive(
  state: PokemonState,
  now: string,
  forcedLineage?: string | null,
): PokemonState {
  const s = clone(state)
  s.lineage = forcedLineage != null && forcedLineage !== '' ? forcedLineage : null
  s.is_shiny = false
  s.current_level = 0
  s.total_xp = 0
  s.evolution_history = []
  s.evolution_flash_remaining = 10
  s.created_at = now
  s.eevee_form = null
  s.items = {}
  return s
}

// pokemon_archive_to_team: archive + reset (Lv.100 auto-archive / hatch path).
export function archiveToTeam(state: PokemonState, now: string): PokemonState {
  return resetActive(activeToArchive(state, now), now)
}

function loadEntryToActive(s: PokemonState, entry: CompanionEntry, now: string): void {
  s.lineage = entry.lineage
  s.is_shiny = entry.is_shiny
  s.current_level = entry.level
  s.total_xp = entry.total_xp
  s.evolution_history = entry.evolution_history ?? []
  s.eevee_form = entry.eevee_form
  s.items = entry.items ?? {}
  s.created_at = entry.created_at
  s.last_updated = now
  s.evolution_flash_remaining = 3
}

// pokemon_load_team_to_active: team[idx] → active; remove from team.
export function loadTeamToActive(state: PokemonState, now: string, idx: number): PokemonState {
  const s = clone(state)
  const team = s.team ?? []
  loadEntryToActive(s, team[idx]!, now) // idx is bounds-checked by the caller
  s.team = removeAt(team, idx)
  return s
}

// pokemon_team_to_pc: team[idx] → pc_storage (order preserved).
export function teamToPc(state: PokemonState, idx: number): PokemonState {
  const s = clone(state)
  const team = s.team ?? []
  const pc = Array.isArray(s.pc_storage) ? s.pc_storage : []
  s.pc_storage = pc
  pc.push(team[idx]!) // idx is bounds-checked by the caller
  s.team = removeAt(team, idx)
  return s
}

// pokemon_pc_to_team_or_active: pc[idx] → active (if active is an empty egg),
// else → team (if room), else null (caller shows "team full").
export function pcToTeamOrActive(
  state: PokemonState,
  now: string,
  idx: number,
): PokemonState | null {
  const activeEmpty = state.lineage == null || state.current_level === 0
  const teamFull = (Array.isArray(state.team) ? state.team.length : 0) >= 6
  const s = clone(state)
  const pc = s.pc_storage ?? []
  if (activeEmpty) {
    loadEntryToActive(s, pc[idx]!, now) // idx is bounds-checked by the caller
    s.pc_storage = removeAt(pc, idx)
    return s
  }
  if (!teamFull) {
    const team = Array.isArray(s.team) ? s.team : []
    s.team = team
    team.push(pc[idx]!) // idx is bounds-checked by the caller
    s.pc_storage = removeAt(pc, idx)
    return s
  }
  return null
}

// pokemon_release_slot: delete team[idx] or pc_storage[idx].
export function releaseSlot(state: PokemonState, area: string, idx: number): PokemonState {
  const s = clone(state)
  if (area === 'team') s.team = removeAt(s.team ?? [], idx)
  else if (area === 'pc') s.pc_storage = removeAt(s.pc_storage ?? [], idx)
  return s
}

// pokemon_check_badges: award any newly-earned achievement badges (idempotent).
// Conditions mirror lib/lib.sh exactly; badges are appended in the same order.
// `data` provides wild_pool for the regional-dex badges.
export function checkBadges(state: PokemonState, now: string, data: PokemonData): PokemonState {
  const s = clone(state)
  const badges = Array.isArray(s.badges) ? s.badges : []
  s.badges = badges
  const add = (id: string): void => {
    if (!badges.some(b => b && b.id === id)) badges.push({ id, earned_at: now })
  }
  const ls = s.lifetime_stats ?? {}
  const hist = Array.isArray(s.evolution_history) ? s.evolution_history : []
  const wildSeen = Object.keys(s.pokedex_wild ?? {})
  const wildCount = wildSeen.length
  const pool = Array.isArray(data?.wild_pool) ? data.wild_pool : []
  const kanto = pool
    .filter(w => (w.national_dex ?? 0) >= 1 && (w.national_dex ?? 0) <= 151)
    .map(w => w.id)
  const johto = pool
    .filter(w => (w.national_dex ?? 0) >= 152 && (w.national_dex ?? 0) <= 251)
    .map(w => w.id)
  const hasAllOf = (ids: string[]): boolean =>
    ids.length > 0 && ids.every(id => wildSeen.includes(id))
  const completed = Array.isArray(ls.lineages_completed) ? ls.lineages_completed : []
  const pokedexSeen = Object.values(s.pokedex ?? {}).filter(v => v && v.seen).length

  if (hist.some(e => e.level === 1)) add('hatch')
  if (hist.some(e => (e.level ?? 0) >= 16)) add('first_evolution')
  if ((ls.total_shinies ?? 0) > 0) add('first_shiny')
  if ((ls.max_level ?? 0) >= 100) add('champion')
  if ((ls.total_tokens ?? 0) >= 100000000) add('centurion')
  if ((ls.total_shinies ?? 0) >= 5) add('constellation')
  if (pokedexSeen >= 5) add('master_pokedex')
  if (wildCount >= 50) add('dex_50')
  if (wildCount >= 100) add('dex_100')
  if (hasAllOf(kanto)) add('regional_kanto')
  if (hasAllOf(johto)) add('regional_johto')
  for (const lin of [
    'fire',
    'water',
    'grass',
    'electric',
    'eevee',
    'chikorita',
    'cyndaquil',
    'totodile',
  ]) {
    if (completed.includes(lin)) add(`master_${lin}`)
  }
  return s
}

// ── Combined ops mirroring the bash subcommands (switch / hatch / reset) ─────
// switch <slot>: archive active, then load team[slot] into active.
export function switchCompanion(state: PokemonState, now: string, slot: number): PokemonState {
  return loadTeamToActive(activeToArchive(state, now), now, slot)
}

// hatch <lineage?>: archive active if it exists, reset to a fresh egg, recheck badges.
export function hatch(
  state: PokemonState,
  now: string,
  data: PokemonData,
  forcedLineage?: string | null,
): PokemonState {
  let s = state
  if (Number(state.current_level) > 0) s = activeToArchive(s, now)
  s = resetActive(s, now, forcedLineage)
  return checkBadges(s, now, data)
}

// ceremonial reset: archive + reset, then recheck badges.
export function ceremonialReset(state: PokemonState, now: string, data: PokemonData): PokemonState {
  return checkBadges(archiveToTeam(state, now), now, data)
}
