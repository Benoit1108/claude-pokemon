// CLI engine adapter (Phase R3b) — the bridge that lets the bash CLI consume
// the TypeScript rules engine instead of its own jq reimplementation.
//
// Bundled (esbuild) into `lib/engine.mjs` and invoked once per tick as
//   node lib/engine.mjs derive   < {json on stdin}   > {json on stdout}
// so the hot statusline path pays a single node spawn, not one per helper.
//
// Scope (R3b): the 6 pure numeric derivations only. Stage/evolution display
// fields (name/emoji/color) stay on the bash side until R3c (views → TS), as
// they live in lib/data.json and aren't carried by the shared engine.
//
// Output contract — multipliers are emitted as fixed-1-decimal STRINGS so the
// bash substitution stays byte-identical to the old printf '%.1f' values
// ("2.0" / "1.2" / "0.5"); the rest are integers.
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import {
  thresholdFor,
  levelFromXp,
  xpToNext,
  progressPct,
  xpMultiplier,
  typeMatchMultiplier,
} from './index.js'

export interface DeriveInput {
  thresholds: number[]
  total_xp: number
  /** Optional override; defaults to levelFromXp(thresholds, total_xp). */
  level?: number | null
  lineage: string
  /** % of context window in use; null → neutral multipliers. */
  used_pct?: number | null
}

export interface DeriveOutput {
  level: number
  threshold: number
  xp_to_next: number
  progress_pct: number
  /** Fixed 1-decimal string, e.g. "2.0". */
  xp_multiplier: string
  /** Fixed 1-decimal string, e.g. "1.2". */
  type_match_mult: string
}

export function derive(input: DeriveInput): DeriveOutput {
  const { thresholds, lineage } = input
  const totalXp = Number(input.total_xp)
  const usedPct = input.used_pct == null ? null : Number(input.used_pct)
  const level = input.level == null ? levelFromXp(thresholds, totalXp) : Number(input.level)

  // pokemon_type_match_mult defaults used_pct to 50 when absent (lib.sh).
  const typeMatch = typeMatchMultiplier(lineage, usedPct == null ? 50 : usedPct)

  return {
    level,
    threshold: thresholdFor(thresholds, level),
    xp_to_next: xpToNext(thresholds, totalXp, level),
    progress_pct: progressPct(thresholds, totalXp, level),
    xp_multiplier: xpMultiplier(usedPct).toFixed(1),
    type_match_mult: typeMatch.toFixed(1),
  }
}

const COMMANDS: Record<string, (input: unknown) => unknown> = {
  derive: (input) => derive(input as DeriveInput),
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

async function main(): Promise<void> {
  const command = process.argv[2]
  const handler = command ? COMMANDS[command] : undefined
  if (!handler) {
    process.stderr.write(
      `engine: unknown command ${JSON.stringify(command)} (expected: ${Object.keys(COMMANDS).join(', ')})\n`,
    )
    process.exit(2)
  }
  const raw = await readStdin()
  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    process.stderr.write('engine: invalid JSON on stdin\n')
    process.exit(2)
    return
  }
  process.stdout.write(JSON.stringify(handler(input)))
}

// Run only when executed as a script (the bundled entrypoint), never when
// imported (the vitest parity test imports `derive` directly — main() must not
// fire and block on stdin there).
function invokedAsScript(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    // Compare REAL paths: the bash bridge builds $POKEMON_ENGINE from a logical
    // pwd, and dotfile managers symlink ~/.claude — a raw URL compare would
    // mismatch and silently disable the engine (every tick falls back to bash).
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (invokedAsScript()) {
  main().catch((err) => {
    process.stderr.write(`engine: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
