// Shared contract + helpers for the /pokemon mutating commands (split out of the
// former single commands.ts in a pure structural refactor). The handler slices
// (collection / game / trade / misc) import the CommandInput/CommandResult
// contract and these small helpers from here.
//
// Contract: stdin {state, data, locale, now, args} → stdout {output, state,
// stateChanged}. Unknown command → null (→ exit 3 → bash fallback). bash writes
// the returned state (guarded) under flock and prints the output.
import { bashPrintf } from '../render/printf.js'
import { t, type Locale } from '../render/i18n.js'

import type { CompanionEntry, PokemonData, PokemonState, WildPoolEntry } from '../state-types.js'
import { RESET, BOLD, DIM, GOLD } from '../render/ansi.js'

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

/** Bound translator: `tr('key', ...args)` === `t(locale, 'key', ...args)`. */
export type Translator = (k: string, ...a: Array<string | number>) => string

export function makeTranslator(locale: Locale): Translator {
  return (k, ...a) => t(locale, k, ...a)
}

export function cloneState(state: PokemonState): PokemonState {
  return JSON.parse(JSON.stringify(state))
}

// jq `.wild_pool[$i]["name_" + $lang]` — missing locale column renders empty.
export function wildName(w: WildPoolEntry, lang: string): string {
  const v = (w as unknown as Record<string, unknown>)[`name_${lang}`]
  return typeof v === 'string' ? v : ''
}

export function maxStage(entry: CompanionEntry | undefined): string {
  return entry?.max_stage ?? 'Œuf'
}

export function lastEvoName(state: PokemonState): string {
  const h = state.evolution_history ?? []
  return (h.length ? h[h.length - 1]?.name : undefined) ?? 'Œuf'
}

// Port of _print_roster_entry. `%-22s` is byte-width padding (bashPrintf).
export function rosterEntry(entry: CompanionEntry, slot: string, marker: string, data: PokemonData, locale: Locale): string {
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
