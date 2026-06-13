// Barrel + dispatcher for the /pokemon mutating commands (Phase R3d-4b), split
// out of the former single commands.ts in a pure structural refactor. Preserves
// the EXACT public import surface: `runCommand` and the CommandInput /
// CommandResult types stay importable from `./commands.js` (via the thin
// commands.ts shim) for pokemon-entry.ts and the tests.
//
// Contract: stdin {state, data, locale, now, args} → stdout {output, state,
// stateChanged}. Unknown command → null (→ exit 3 → bash fallback). bash writes
// the returned state (guarded) under flock and prints the output.
import type { CommandInput, CommandResult } from './shared.js'
import { cmdSwitch, cmdHatch, cmdDeposit, cmdWithdraw, cmdRelease } from './collection.js'
import { cmdGame } from './game.js'
import { cmdTrade, cmdGive, cmdTake } from './trade.js'
import { cmdShiny, cmdReset } from './misc.js'

export type { CommandInput, CommandResult } from './shared.js'

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
