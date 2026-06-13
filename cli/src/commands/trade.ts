// trade (un échange par jour) + held-item equip/unequip (give / take). Ported
// byte-identical from the bash view_trade / view_give / view_take.
import { bashPrintf } from '../render/printf.js'
import { RESET, BOLD, DIM, GOLD } from '../render/ansi.js'
import type { CompanionEntry, RecentEvent } from 'claude-pokemon-shared/state-types'

import {
  type CommandInput,
  type CommandResult,
  makeTranslator,
  cloneState,
  wildName,
} from './shared.js'

export function cmdTrade(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const nowEpoch = Number(input.nowEpoch ?? 0)
  const tr = makeTranslator(locale)
  const lang = data.language ?? 'fr'
  const trainer = input.args[0] ?? 'Anonymous'
  let out = bashPrintf(`\n  %s%s${tr('trade.title')}%s\n\n`, BOLD, GOLD, RESET)

  const lastTrade = state.last_trade_at ?? ''
  const cooldownH = Number(data.trade_cooldown_hours ?? 24)
  if (lastTrade !== '') {
    const lastEpoch = Math.floor(Date.parse(lastTrade) / 1000) || 0
    const hoursPassed = Math.floor((nowEpoch - lastEpoch) / 3600)
    if (hoursPassed < cooldownH) {
      return {
        output:
          out +
          bashPrintf(`  %s${tr('trade.cooldown', cooldownH - hoursPassed)}%s\n\n`, DIM, RESET),
        state,
        stateChanged: false,
      }
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
  const shinyStr = shiny ? ' ' + tr('trade.shiny_received') : ''

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

  const destLabel = destination === 'team' ? tr('team.title') : tr('pc.title')
  let lvlStr = `Lv.${level}`
  if (shiny) lvlStr = `${GOLD}★${RESET} ${lvlStr}`
  out += bashPrintf(
    '  %s#%03d %s %s%s   %s%s%s\n',
    BOLD,
    dex,
    name,
    lvlStr,
    shinyStr,
    DIM,
    `(par ${trainer})`,
    RESET,
  )
  out += bashPrintf(`  %s${tr('trade.received', name, shinyStr, destLabel)}%s\n\n`, DIM, RESET)
  return { output: out, state: next, stateChanged: true }
}

// Port of view_give — equip a held item from the inventory.
export function cmdGive(input: CommandInput): CommandResult {
  const { state, data, locale } = input
  const tr = makeTranslator(locale)
  let out = bashPrintf(`\n  %s%s${tr('held.title')}%s\n\n`, BOLD, GOLD, RESET)
  const id = input.args[0] ?? ''
  if (id === '')
    return {
      output: out + bashPrintf(`  %s${tr('held.usage_give')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const count = state.items?.[id] ?? 0
  if (count === 0)
    return {
      output: out + bashPrintf(`  %s${tr('held.no_inventory')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const holdable = data.items?.[id]?.holdable ?? false
  if (holdable !== true)
    return {
      output: out + bashPrintf(`  %s${tr('held.not_holdable')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const name = data.items?.[id]?.name ?? id
  const next = cloneState(state)
  // count > 0 was checked above — the inventory entry exists on the clone.
  const inv = (next.items ??= {})
  inv[id]! -= 1
  if (inv[id]! <= 0) delete inv[id]
  next.held_item = id
  out += bashPrintf(`  %s${tr('held.given', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

// Port of view_take — unequip the held item back to the inventory.
export function cmdTake(input: CommandInput): CommandResult {
  const { state, locale } = input
  const tr = makeTranslator(locale)
  let out = bashPrintf(`\n  %s%s${tr('held.title')}%s\n\n`, BOLD, GOLD, RESET)
  const current = state.held_item ?? ''
  if (current === '')
    return {
      output: out + bashPrintf(`  %s${tr('held.none')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const next = cloneState(state)
  next.items ??= {}
  next.items[current] = (next.items[current] ?? 0) + 1
  next.held_item = null
  out += bashPrintf(`  %s${tr('held.taken')}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}
