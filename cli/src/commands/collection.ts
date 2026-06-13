// Team / PC collection commands (switch, hatch, deposit, withdraw, release).
// Ported from the bash view_* wrappers — byte-identical messages. The state
// mutation itself lives in ../collection.js; what lives here is the
// title/validation/messages.
import { bashPrintf } from '../render/printf.js'
import { teamToPc, pcToTeamOrActive, releaseSlot, switchCompanion, hatch } from '../collection.js'
import { RESET, BOLD, DIM, GOLD } from '../render/ansi.js'

import {
  type CommandInput,
  type CommandResult,
  makeTranslator,
  maxStage,
  lastEvoName,
  rosterEntry,
} from './shared.js'

export function cmdSwitch(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const tr = makeTranslator(locale)
  let out = bashPrintf(`\n  %s%s${tr('switch.title')}%s\n\n`, BOLD, GOLD, RESET)
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
      out += bashPrintf(`   %s${tr('switch.no_active')}%s\n`, DIM, RESET)
    }
    out += '\n'
    const team = state.team ?? []
    if (team.length === 0) {
      out += bashPrintf(`   %s${tr('switch.no_team')}%s\n\n`, DIM, RESET)
    } else {
      team.forEach((entry, i) => (out += rosterEntry(entry, String(i), '', data, locale)))
      out += bashPrintf(`\n  %s${tr('switch.usage')}%s\n\n`, DIM, RESET)
    }
    return { output: out, state, stateChanged: false }
  }
  const team = state.team ?? []
  const slot = Number(slotArg)
  if (slot >= team.length || slot < 0) {
    return {
      output:
        out + bashPrintf(`  %s${tr('switch.out_of_range', team.length - 1)}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  }
  const activeName = lastEvoName(state)
  const targetName = maxStage(team[slot])
  const next = switchCompanion(state, now, slot)
  out += bashPrintf(`  %s${tr('switch.swapped', activeName, targetName)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

export function cmdHatch(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const tr = makeTranslator(locale)
  let out = bashPrintf(`\n  %s%s${tr('hatch.title')}%s\n\n`, BOLD, GOLD, RESET)
  const target = input.args[0] ?? ''
  if (target !== '' && !data.lineages?.[target]) {
    // jq `keys` sorts alphabetically — match it, not insertion order.
    const available = Object.keys(data.lineages ?? {})
      .sort()
      .join(', ')
    return {
      output:
        out +
        bashPrintf(`  %s${tr('hatch.no_lineage_match', target, available)}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  }
  const activeName = lastEvoName(state)
  const activeLevel = Number(state.current_level ?? 0)
  const next = hatch(state, now, data, target || undefined)
  if (activeLevel > 0)
    out += bashPrintf(`  %s${tr('hatch.current_archived', activeName)}%s\n`, DIM, RESET)
  out += bashPrintf(
    `  %s${tr('hatch.egg_starting', target !== '' ? target : 'random')}%s\n\n`,
    BOLD,
    RESET,
  )
  return { output: out, state: next, stateChanged: true }
}

export function cmdDeposit(input: CommandInput): CommandResult {
  const { state, locale } = input
  const tr = makeTranslator(locale)
  let out = bashPrintf(`\n  %s%s${tr('deposit.title')}%s\n\n`, BOLD, GOLD, RESET)
  const slotArg = input.args[0] ?? ''
  if (slotArg === '')
    return {
      output: out + bashPrintf(`  %s${tr('deposit.usage')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const team = state.team ?? []
  if (team.length === 0)
    return {
      output: out + bashPrintf(`  %s${tr('deposit.no_team')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const slot = Number(slotArg)
  if (slot >= team.length || slot < 0) {
    return {
      output:
        out + bashPrintf(`  %s${tr('switch.out_of_range', team.length - 1)}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  }
  const name = maxStage(team[slot])
  const next = teamToPc(state, slot)
  out += bashPrintf(`  %s${tr('deposit.success', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

export function cmdWithdraw(input: CommandInput): CommandResult {
  const { state, locale, now } = input
  const tr = makeTranslator(locale)
  let out = bashPrintf(`\n  %s%s${tr('withdraw.title')}%s\n\n`, BOLD, GOLD, RESET)
  const slotArg = input.args[0] ?? ''
  if (slotArg === '')
    return {
      output: out + bashPrintf(`  %s${tr('withdraw.usage')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const pc = state.pc_storage ?? []
  if (pc.length === 0)
    return {
      output: out + bashPrintf(`  %s${tr('withdraw.no_pc')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  const slot = Number(slotArg)
  if (slot >= pc.length || slot < 0) {
    return {
      output: out + bashPrintf(`  %s${tr('switch.out_of_range', pc.length - 1)}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  }
  const name = maxStage(pc[slot])
  const next = pcToTeamOrActive(state, now, slot)
  if (next === null) {
    return {
      output: out + bashPrintf(`  %s${tr('withdraw.team_full')}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  }
  out += bashPrintf(`  %s${tr('withdraw.success', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}

export function cmdRelease(input: CommandInput): CommandResult {
  const { state, locale } = input
  const tr = makeTranslator(locale)
  let out = bashPrintf(`\n  %s%s${tr('release.title')}%s\n\n`, BOLD, GOLD, RESET)
  const area = input.args[0] ?? ''
  const slotArg = input.args[1] ?? ''
  const confirm = input.args[2] ?? ''
  const usage = (): CommandResult => ({
    output: out + bashPrintf(`  %s${tr('release.usage')}%s\n\n`, DIM, RESET),
    state,
    stateChanged: false,
  })
  if (area === '' || slotArg === '') return usage()
  if (area !== 'team' && area !== 'pc') return usage()
  const list = (area === 'team' ? state.team : state.pc_storage) ?? []
  if (list.length === 0) {
    const key = area === 'team' ? 'team.empty' : 'pc.empty'
    return {
      output: out + bashPrintf(`  %s${tr(key)}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  }
  const slot = Number(slotArg)
  if (slot >= list.length || slot < 0) {
    return {
      output:
        out + bashPrintf(`  %s${tr('switch.out_of_range', list.length - 1)}%s\n\n`, DIM, RESET),
      state,
      stateChanged: false,
    }
  }
  const name = maxStage(list[slot])
  if (confirm !== '--confirm') {
    out += bashPrintf(`  %s${tr('release.confirm_required')}%s\n`, DIM, RESET)
    // "Cible :" is hardcoded French in the bash (not pokemon_t) — keep verbatim.
    out += bashPrintf('  %sCible : %s%s%s (slot %d)%s\n\n', DIM, BOLD, name, RESET, slot, RESET)
    return { output: out, state, stateChanged: false }
  }
  const next = releaseSlot(state, area, slot)
  out += bashPrintf(`  %s${tr('release.released', name)}%s\n\n`, BOLD, RESET)
  return { output: out, state: next, stateChanged: true }
}
