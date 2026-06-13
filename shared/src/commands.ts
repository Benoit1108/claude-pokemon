// Mutating CLI commands (Phase R3d-4b). These port the bash view_* wrappers
// that validate args, apply a collection transform (already in collection.ts),
// and render a result message — byte-identical to the bash. The state mutation
// itself was already shared; what moves here is the title/validation/messages,
// so the Node entrypoint (R3d-5) can dispatch them without bash.
//
// Contract: stdin {state, data, locale, now, args} → stdout {output, state,
// stateChanged}. Unknown command → null (→ exit 3 → bash fallback). bash writes
// the returned state (guarded) under flock and prints the output.
import { bashPrintf } from './render/printf.js'
import { t, type Locale } from './render/i18n.js'
import { tPad } from './render/views.js'
import { teamToPc, pcToTeamOrActive, releaseSlot, switchCompanion, hatch, ceremonialReset } from './collection.js'

import type { CompanionEntry, PokemonData, PokemonState, RecentEvent, WildPoolEntry } from './state-types.js'
import { RESET, BOLD, DIM, GOLD } from './render/ansi.js'

function cloneState(state: PokemonState): PokemonState {
  return JSON.parse(JSON.stringify(state))
}

// jq `.wild_pool[$i]["name_" + $lang]` — missing locale column renders empty.
function wildName(w: WildPoolEntry, lang: string): string {
  const v = (w as unknown as Record<string, unknown>)[`name_${lang}`]
  return typeof v === 'string' ? v : ''
}


export interface CommandInput {
  name: string
  args: string[]
  state: PokemonState
  data: PokemonData
  locale: Locale
  now: string
  /** Epoch seconds — for cooldown checks (game / trade). */
  nowEpoch?: number
  /** Injected randomness (game / trade), like the tick. */
  decisions?: { pool_idx?: number; trade_level?: number; trade_shiny?: boolean }
}
export interface CommandResult {
  output: string
  state: PokemonState
  stateChanged: boolean
}

function maxStage(entry: CompanionEntry | undefined): string {
  return entry?.max_stage ?? 'Œuf'
}

function lastEvoName(state: PokemonState): string {
  const h = state.evolution_history ?? []
  return (h.length ? h[h.length - 1]?.name : undefined) ?? 'Œuf'
}

// Port of _print_roster_entry. `%-22s` is byte-width padding (bashPrintf).
function rosterEntry(entry: CompanionEntry, slot: string, marker: string, data: PokemonData, locale: Locale): string {
  const lin = entry.lineage ?? ''
  const lvl = entry.level ?? 0 // %d of a missing level rendered 0 in bash too
  const name = entry.max_stage ?? (entry.evolution_history?.length ? entry.evolution_history.at(-1)?.name : undefined) ?? 'Œuf'
  const star = entry.is_shiny === true ? `${GOLD}★${RESET} ` : ''
  const label = data.lineages?.[lin]?.label ?? lin
  const markerStr = marker === 'active' ? `  ${GOLD}${t(locale, 'common.active_marker')}${RESET}` : ''
  return bashPrintf(
    '   %s[%s]%s  %s%-22s  %sLv.%d%s  %s%s%s%s\n',
    BOLD, slot, RESET, star, name, BOLD, lvl, RESET, DIM, label, RESET, markerStr,
  )
}

function cmdSwitch(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  let out = bashPrintf(`\n  %s%s${L('switch.title')}%s\n\n`, BOLD, GOLD, RESET)
  const slotArg = input.args[0] ?? ''
  if (slotArg === '') {
    const activeLineage = state.lineage ?? ''
    const activeLevel = Number(state.current_level ?? 0)
    if (activeLineage !== '' && activeLevel > 0) {
      const activeEntry = {
        lineage: state.lineage,
        is_shiny: state.is_shiny,
        level: state.current_level,
        max_stage: lastEvoName(state),
        evolution_history: state.evolution_history,
      }
      out += rosterEntry(activeEntry, '-', 'active', data, locale)
    } else {
      out += bashPrintf(`   %s${L('switch.no_active')}%s\n`, DIM, RESET)
    }
    out += '\n'
    const team = state.team ?? []
    if (team.length === 0) {
      out += bashPrintf(`   %s${L('switch.no_team')}%s\n\n`, DIM, RESET)
    } else {
      team.forEach((entry, i) => (out += rosterEntry(entry, String(i), '', data, locale)))
      out += bashPrintf(`\n  %s${L('switch.usage')}%s\n\n`, DIM, RESET)
    }
    return { output: out, state, stateChanged: false }
  }
  const team = state.team ?? []
  const slot = Number(slotArg)
  if (slot >= team.length || slot < 0) {
    return { output: out + bashPrintf(`  %s${L('switch.out_of_range', team.length - 1)}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const activeName = lastEvoName(state)
  const targetName = maxStage(team[slot])
  const next = switchCompanion(state, now, slot)
  out += bashPrintf(`  %s${L('switch.swapped', activeName, targetName)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

function cmdHatch(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  let out = bashPrintf(`\n  %s%s${L('hatch.title')}%s\n\n`, BOLD, GOLD, RESET)
  const target = input.args[0] ?? ''
  if (target !== '' && !data.lineages?.[target]) {
    // jq `keys` sorts alphabetically — match it, not insertion order.
    const available = Object.keys(data.lineages ?? {}).sort().join(', ')
    return { output: out + bashPrintf(`  %s${L('hatch.no_lineage_match', target, available)}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const activeName = lastEvoName(state)
  const activeLevel = Number(state.current_level ?? 0)
  const next = hatch(state, now, data, target || undefined)
  if (activeLevel > 0) out += bashPrintf(`  %s${L('hatch.current_archived', activeName)}%s\n`, DIM, RESET)
  out += bashPrintf(`  %s${L('hatch.egg_starting', target !== '' ? target : 'random')}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

function cmdDeposit(input: CommandInput): CommandResult {
  const { state, locale } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  let out = bashPrintf(`\n  %s%s${L('deposit.title')}%s\n\n`, BOLD, GOLD, RESET)
  const slotArg = input.args[0] ?? ''
  if (slotArg === '') return { output: out + bashPrintf(`  %s${L('deposit.usage')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const team = state.team ?? []
  if (team.length === 0) return { output: out + bashPrintf(`  %s${L('deposit.no_team')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const slot = Number(slotArg)
  if (slot >= team.length || slot < 0) {
    return { output: out + bashPrintf(`  %s${L('switch.out_of_range', team.length - 1)}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const name = maxStage(team[slot])
  const next = teamToPc(state, slot)
  out += bashPrintf(`  %s${L('deposit.success', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

function cmdWithdraw(input: CommandInput): CommandResult {
  const { state, locale, now } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  let out = bashPrintf(`\n  %s%s${L('withdraw.title')}%s\n\n`, BOLD, GOLD, RESET)
  const slotArg = input.args[0] ?? ''
  if (slotArg === '') return { output: out + bashPrintf(`  %s${L('withdraw.usage')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const pc = state.pc_storage ?? []
  if (pc.length === 0) return { output: out + bashPrintf(`  %s${L('withdraw.no_pc')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const slot = Number(slotArg)
  if (slot >= pc.length || slot < 0) {
    return { output: out + bashPrintf(`  %s${L('switch.out_of_range', pc.length - 1)}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const name = maxStage(pc[slot])
  const next = pcToTeamOrActive(state, now, slot)
  if (next === null) {
    return { output: out + bashPrintf(`  %s${L('withdraw.team_full')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  out += bashPrintf(`  %s${L('withdraw.success', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

function cmdRelease(input: CommandInput): CommandResult {
  const { state, locale } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  let out = bashPrintf(`\n  %s%s${L('release.title')}%s\n\n`, BOLD, GOLD, RESET)
  const area = input.args[0] ?? ''
  const slotArg = input.args[1] ?? ''
  const confirm = input.args[2] ?? ''
  const usage = (): CommandResult => ({ output: out + bashPrintf(`  %s${L('release.usage')}%s\n\n`, DIM, RESET), state, stateChanged: false })
  if (area === '' || slotArg === '') return usage()
  if (area !== 'team' && area !== 'pc') return usage()
  const list = (area === 'team' ? state.team : state.pc_storage) ?? []
  if (list.length === 0) {
    const key = area === 'team' ? 'team.empty' : 'pc.empty'
    return { output: out + bashPrintf(`  %s${L(key)}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const slot = Number(slotArg)
  if (slot >= list.length || slot < 0) {
    return { output: out + bashPrintf(`  %s${L('switch.out_of_range', list.length - 1)}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const name = maxStage(list[slot])
  if (confirm !== '--confirm') {
    out += bashPrintf(`  %s${L('release.confirm_required')}%s\n`, DIM, RESET)
    // "Cible :" is hardcoded French in the bash (not pokemon_t) — keep verbatim.
    out += bashPrintf('  %sCible : %s%s%s (slot %d)%s\n\n', DIM, BOLD, name, RESET, slot, RESET)
    return { output: out, state, stateChanged: false }
  }
  const next = releaseSlot(state, area, slot)
  out += bashPrintf(`  %s${L('release.released', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

// Port of toggle_shiny — no title, no indent (verbatim bash printf).
function cmdShiny(input: CommandInput): CommandResult {
  const next = cloneState(input.state)
  const newVal = input.state.is_shiny !== true
  next.is_shiny = newVal
  const out = bashPrintf('%s✦ shiny → %s%s\n\n', GOLD, newVal ? 'true' : 'false', RESET)
  return { output: out, state: next, stateChanged: true }
}

function cmdReset(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const lineage = state.lineage ?? ''
  const currentLevel = Number(state.current_level ?? 0)
  if (lineage === '' || currentLevel === 0) {
    return { output: bashPrintf(`\n  %s${L('reset.no_active')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const next = ceremonialReset(state, now, data)
  let out = bashPrintf(`\n  %s${L('reset.archived')}%s\n`, BOLD, RESET)
  out += bashPrintf(`  %s${L('reset.egg_awaits')}%s\n\n`, DIM, RESET)
  return { output: out, state: next, stateChanged: true }
}

// Port of view_give — equip a held item from the inventory.
function cmdGive(input: CommandInput): CommandResult {
  const { state, data, locale } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  let out = bashPrintf(`\n  %s%s${L('held.title')}%s\n\n`, BOLD, GOLD, RESET)
  const id = input.args[0] ?? ''
  if (id === '') return { output: out + bashPrintf(`  %s${L('held.usage_give')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const count = state.items?.[id] ?? 0
  if (count === 0) return { output: out + bashPrintf(`  %s${L('held.no_inventory')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const holdable = data.items?.[id]?.holdable ?? false
  if (holdable !== true) return { output: out + bashPrintf(`  %s${L('held.not_holdable')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const name = data.items?.[id]?.name ?? id
  const next = cloneState(state)
  // count > 0 was checked above — the inventory entry exists on the clone.
  const inv = (next.items ??= {})
  inv[id]! -= 1
  if (inv[id]! <= 0) delete inv[id]
  next.held_item = id
  out += bashPrintf(`  %s${L('held.given', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

// Port of view_take — unequip the held item back to the inventory.
function cmdTake(input: CommandInput): CommandResult {
  const { state, locale } = input
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  let out = bashPrintf(`\n  %s%s${L('held.title')}%s\n\n`, BOLD, GOLD, RESET)
  const current = state.held_item ?? ''
  if (current === '') return { output: out + bashPrintf(`  %s${L('held.none')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  const next = cloneState(state)
  next.items ??= {}
  next.items[current] = (next.items[current] ?? 0) + 1
  next.held_item = null
  out += bashPrintf(`  %s${L('held.taken')}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

// ── game (devine le Pokémon) ────────────────────────────────────────────────
// Strip diacritics (approximates bash `iconv -t ASCII//TRANSLIT` for Latin).
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '') // eslint-disable-line no-misleading-character-class
}
// Port of _game_norm — translit + lowercase + strip spaces/./-, for comparison.
function gameNorm(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[\s.-]/g, '')
}

// Canonical type → ANSI hue (port of pokemon_type_color, non-retro path). The
// differential strips ANSI so the exact code is cosmetic; kept faithful for
// real use. Retro-theme green isn't threaded here (matches the views.ts GOLD
// placeholder precedent).
const TYPE_COLOR: Record<string, string> = {
  Feu: '\x1b[38;2;239;108;0m', Fire: '\x1b[38;2;239;108;0m',
  Eau: '\x1b[38;2;38;143;255m', Water: '\x1b[38;2;38;143;255m',
  Plante: '\x1b[38;2;100;180;55m', Grass: '\x1b[38;2;100;180;55m',
  'Électrik': '\x1b[38;2;255;218;0m', Electric: '\x1b[38;2;255;218;0m',
  Psy: '\x1b[38;2;239;65;125m', Psychic: '\x1b[38;2;239;65;125m',
  'Ténèbres': '\x1b[38;2;120;94;75m', Dark: '\x1b[38;2;120;94;75m',
  Vol: '\x1b[38;2;180;180;255m', Flying: '\x1b[38;2;180;180;255m',
  Dragon: '\x1b[38;2;110;52;201m',
  Poison: '\x1b[38;2;144;58;156m',
  Normal: '\x1b[38;2;180;170;160m',
  Glace: '\x1b[38;2;108;204;218m', Ice: '\x1b[38;2;108;204;218m',
  Combat: '\x1b[38;2;199;58;55m', Fighting: '\x1b[38;2;199;58;55m',
  Insecte: '\x1b[38;2;145;162;36m', Bug: '\x1b[38;2;145;162;36m',
  Sol: '\x1b[38;2;200;160;90m', Ground: '\x1b[38;2;200;160;90m',
  Roche: '\x1b[38;2;180;160;100m', Rock: '\x1b[38;2;180;160;100m',
  Spectre: '\x1b[38;2;112;88;152m', Ghost: '\x1b[38;2;112;88;152m',
  Acier: '\x1b[38;2;156;156;176m', Steel: '\x1b[38;2;156;156;176m',
  'Fée': '\x1b[38;2;239;164;213m', Fairy: '\x1b[38;2;239;164;213m',
}
function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? '\x1b[37m'
}

function gameHints(data: PokemonData, lang: string, idx: number, locale: Locale): string {
  // The quiz id was drawn from this pool — the entry exists.
  const w = (data.wild_pool ?? [])[idx]!
  const name = wildName(w, lang)
  const type = w.type ?? ''
  const dex = w.national_dex ?? 0
  const first = stripDiacritics(name)[0] ?? ''
  const letters = [...name].length
  const gen = dex <= 151 ? '1' : '2'
  const tcolor = typeColor(type)
  let o = bashPrintf(`  %s${tPad(locale, 'game.hint_type', 12)}%s : %s%s%s\n`, DIM, RESET, tcolor, type, RESET)
  o += bashPrintf(`  %s${tPad(locale, 'game.hint_letters', 12)}%s : %s\n`, DIM, RESET, letters)
  o += bashPrintf(`  %s${tPad(locale, 'game.hint_initial', 12)}%s : %s%s.%s\n`, DIM, RESET, BOLD, first, RESET)
  o += bashPrintf(`  %s${tPad(locale, 'game.hint_gen', 12)}%s : %s\n\n`, DIM, RESET, gen)
  o += bashPrintf(`  %s${t(locale, 'game.prompt_answer')}%s\n\n`, DIM, RESET)
  return o
}

function gameHelp(L: (k: string, ...a: Array<string | number>) => string): string {
  let o = bashPrintf(`  %s${L('game.help.intro')}%s\n\n`, DIM, RESET)
  o += bashPrintf(`  %s/pokemon game%s         %s${L('game.help.start')}%s\n`, BOLD, RESET, DIM, RESET)
  o += bashPrintf(`  %s/pokemon game <nom>%s   %s${L('game.help.submit')}%s\n`, BOLD, RESET, DIM, RESET)
  o += bashPrintf(`  %s/pokemon game skip%s    %s${L('game.help.skip')}%s\n`, BOLD, RESET, DIM, RESET)
  o += '\n'
  return o
}

function cmdGame(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const nowEpoch = Number(input.nowEpoch ?? 0)
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const lang = data.language ?? 'fr'
  const rawAnswer = input.args.join(' ')
  const title = bashPrintf(`\n  %s%s${L('game.title')}%s\n\n`, BOLD, GOLD, RESET)
  if (rawAnswer === 'help' || rawAnswer === '--help' || rawAnswer === '-h') {
    return { output: title + gameHelp(L), state, stateChanged: false }
  }
  const noChange = (body: string): CommandResult => ({ output: title + body, state, stateChanged: false })
  const lineage = state.lineage ?? ''
  if (lineage === '' || lineage === null) return noChange(bashPrintf(`  %s${L('game.no_active')}%s\n\n`, DIM, RESET))

  const currentQuizId = state.current_quiz?.id ?? ''
  if (rawAnswer === 'skip') {
    if (currentQuizId === '') return noChange(bashPrintf(`  %s${L('game.no_quiz')}%s\n\n`, DIM, RESET))
    const next = cloneState(state)
    delete next.current_quiz
    return { output: title + bashPrintf(`  %s${L('game.skipped')}%s\n\n`, DIM, RESET), state: next, stateChanged: true }
  }

  if (rawAnswer === '') {
    if (currentQuizId !== '') {
      const idx = (data.wild_pool ?? []).findIndex((w) => w.id === currentQuizId)
      return noChange(bashPrintf(`  %s${L('game.in_progress')}%s\n\n`, DIM, RESET) + gameHints(data, lang, idx, locale))
    }
    const last = state.last_game_completed_at ?? ''
    const cooldownMin = Number(data.game_cooldown_minutes ?? 15)
    if (last !== '') {
      const lastEpoch = Math.floor(Date.parse(last) / 1000) || 0
      const minPassed = Math.floor((nowEpoch - lastEpoch) / 60)
      if (minPassed < cooldownMin) {
        return noChange(bashPrintf(`  %s${L('game.cooldown', cooldownMin - minPassed)}%s\n\n`, DIM, RESET))
      }
    }
    const idx = Number(input.decisions?.pool_idx ?? 0)
    const next = cloneState(state)
    next.current_quiz = { id: data.wild_pool?.[idx]?.id, started_at: now }
    return { output: title + gameHints(data, lang, idx, locale), state: next, stateChanged: true }
  }

  // Submit an answer.
  if (currentQuizId === '') return noChange(bashPrintf(`  %s${L('game.no_quiz')}%s\n\n`, DIM, RESET))
  const entry = (data.wild_pool ?? []).find((w) => w.id === currentQuizId)
  const expected = entry ? wildName(entry, lang) : ''
  const xpReward = Number(data.game_xp_reward ?? 500)
  const frReward = Number(data.game_friendship_reward ?? 2)
  const next = cloneState(state)
  next.lifetime_stats ??= {}
  let out = title
  if (gameNorm(rawAnswer) === gameNorm(expected)) {
    next.total_xp = (next.total_xp ?? 0) + xpReward
    next.friendship = (next.friendship ?? 0) + frReward
    next.lifetime_stats.games_won = (next.lifetime_stats.games_won ?? 0) + 1
    next.lifetime_stats.games_played = (next.lifetime_stats.games_played ?? 0) + 1
    next.last_game_completed_at = now
    delete next.current_quiz
    out += bashPrintf(`  %s${L('game.win', expected)}%s\n`, GOLD, RESET)
    out += bashPrintf(`  %s${L('game.win_reward', xpReward, frReward)}%s\n\n`, DIM, RESET)
  } else {
    next.lifetime_stats.games_played = (next.lifetime_stats.games_played ?? 0) + 1
    next.last_game_completed_at = now
    delete next.current_quiz
    out += bashPrintf(`  %s${L('game.wrong', rawAnswer)}%s\n`, DIM, RESET)
    out += bashPrintf(`  %s${L('game.reveal', expected)}%s\n\n`, DIM, RESET)
  }
  return { output: out, state: next, stateChanged: true }
}

// ── trade (un échange par jour) ─────────────────────────────────────────────
function cmdTrade(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const nowEpoch = Number(input.nowEpoch ?? 0)
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const lang = data.language ?? 'fr'
  const trainer = input.args[0] ?? 'Anonymous'
  let out = bashPrintf(`\n  %s%s${L('trade.title')}%s\n\n`, BOLD, GOLD, RESET)

  const lastTrade = state.last_trade_at ?? ''
  const cooldownH = Number(data.trade_cooldown_hours ?? 24)
  if (lastTrade !== '') {
    const lastEpoch = Math.floor(Date.parse(lastTrade) / 1000) || 0
    const hoursPassed = Math.floor((nowEpoch - lastEpoch) / 3600)
    if (hoursPassed < cooldownH) {
      return { output: out + bashPrintf(`  %s${L('trade.cooldown', cooldownH - hoursPassed)}%s\n\n`, DIM, RESET), state, stateChanged: false }
    }
  }

  const idx = Number(input.decisions?.pool_idx ?? 0)
  const level = Number(input.decisions?.trade_level ?? 5)
  const shiny = input.decisions?.trade_shiny === true
  // pool_idx was rolled against this pool — the entry exists.
  const w = (data.wild_pool ?? [])[idx]!
  const sid = w.id
  const name = wildName(w, lang)
  const dex = w.national_dex ?? 0
  const shinyStr = shiny ? ' ' + L('trade.shiny_received') : ''

  const next = cloneState(state)
  const team = next.team ?? []
  const destination = team.length >= 6 ? 'PC' : 'team'
  const entry: CompanionEntry = {
    lineage: 'trade-' + sid,
    is_shiny: shiny,
    level,
    total_xp: 0,
    max_stage: name,
    evolution_history: [{ level, name, evolved_at: now, is_shiny: shiny }],
    eevee_form: null,
    items: {},
    created_at: now,
    completed_at: now,
    source: 'trade',
  }
  if (destination === 'team') next.team = [...team, entry]
  else next.pc_storage = [...(next.pc_storage ?? []), entry]
  next.last_trade_at = now
  const tradeEvent: RecentEvent = { type: 'trade', id: sid, name, at: now }
  next.recent_events = [tradeEvent, ...(next.recent_events ?? [])].slice(0, 10)

  const destLabel = destination === 'team' ? L('team.title') : L('pc.title')
  let lvlStr = `Lv.${level}`
  if (shiny) lvlStr = `${GOLD}★${RESET} ${lvlStr}`
  out += bashPrintf('  %s#%03d %s %s%s   %s%s%s\n', BOLD, dex, name, lvlStr, shinyStr, DIM, `(par ${trainer})`, RESET)
  out += bashPrintf(`  %s${L('trade.received', name, shinyStr, destLabel)}%s\n\n`, DIM, RESET)
  return { output: out, state: next, stateChanged: true }
}

export function runCommand(input: CommandInput): CommandResult | null {
  switch (input.name) {
    case 'deposit':
      return cmdDeposit(input)
    case 'withdraw':
      return cmdWithdraw(input)
    case 'release':
      return cmdRelease(input)
    case 'switch':
      return cmdSwitch(input)
    case 'hatch':
      return cmdHatch(input)
    case 'shiny':
      return cmdShiny(input)
    case 'reset':
      return cmdReset(input)
    case 'give':
      return cmdGive(input)
    case 'take':
      return cmdTake(input)
    case 'game':
      return cmdGame(input)
    case 'trade':
      return cmdTrade(input)
    default:
      return null
  }
}
