// Small standalone commands: shiny toggle + ceremonial reset. Ported
// byte-identical from the bash toggle_shiny / view_reset.
import { bashPrintf } from '../render/printf.js'
import { ceremonialReset } from '../collection.js'
import { RESET, BOLD, DIM, GOLD } from '../render/ansi.js'

import { type CommandInput, type CommandResult, makeTranslator, cloneState } from './shared.js'

// Port of toggle_shiny — no title, no indent (verbatim bash printf).
export function cmdShiny(input: CommandInput): CommandResult {
  const next = cloneState(input.state)
  const newVal = input.state.is_shiny !== true
  next.is_shiny = newVal
  const out = bashPrintf('%s✦ shiny → %s%s\n\n', GOLD, newVal ? 'true' : 'false', RESET)
  return { output: out, state: next, stateChanged: true }
}

export function cmdReset(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const tr = makeTranslator(locale)
  const lineage = state.lineage ?? ''
  const currentLevel = Number(state.current_level ?? 0)
  if (lineage === '' || currentLevel === 0) {
    return { output: bashPrintf(`\n  %s${tr('reset.no_active')}%s\n\n`, DIM, RESET), state, stateChanged: false }
  }
  const next = ceremonialReset(state, now, data)
  let out = bashPrintf(`\n  %s${tr('reset.archived')}%s\n`, BOLD, RESET)
  out += bashPrintf(`  %s${tr('reset.egg_awaits')}%s\n\n`, DIM, RESET)
  return { output: out, state: next, stateChanged: true }
}
