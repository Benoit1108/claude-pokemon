// Native Node statusline entrypoint (Phase R3d-5). Replaces statusline.sh:
// reads Claude Code's stdin JSON, runs the tick (in-process — no engine spawn),
// writes state, and renders the companion line. Bundled to lib/statusline.mjs.
//
// This is the first piece of the bash-free entrypoint. It imports the shared
// engine directly (zero spawn overhead on the hot path). The randomness for the
// tick is computed here (the "decisions in" pattern), keeping tick() pure.
//
// NOTE: auto-submit (stats push) is intentionally not yet ported here — it has
// no effect on the rendered line, and statusline.sh stays the registered
// command until the switch is validated. It must be added before that switch.
import { readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { tick, type TickDecisions } from './tick.js'
import { renderStatusline, type SpriteDeps } from './statusline.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const POKEMON_DIR = process.env.POKEMON_DIR || join(homedir(), '.claude', 'pokemon')
const DATA_PATH = join(POKEMON_DIR, 'data.json')
const STATE_PATH = join(POKEMON_DIR, 'state.json')

function readJson(path: string): Json {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

function lengthOf(x: unknown): number {
  if (Array.isArray(x)) return x.length
  if (x && typeof x === 'object') return Object.keys(x).length
  return 0
}

// Port of pokemon_pick_starter (jq `keys` is sorted).
function pickStarter(data: Json): string {
  const mode = data.starter_pick ?? 'random'
  if (mode !== 'random' && data.lineages?.[mode]) return mode
  const keys = Object.keys(data.lineages ?? {}).sort()
  return keys[Math.floor(Math.random() * keys.length)] ?? ''
}

// Port of pokemon_roll_shiny.
function rollShiny(data: Json, state: Json): boolean {
  const mode = data.shiny_mode ?? 'random'
  if (mode === 'always') return true
  if (mode === 'never') return false
  let chance = Number(data.shiny_chance ?? 0.01)
  if (Number(state.lifetime_stats?.total_shinies ?? 0) > 0) chance *= 1.25
  if (data.shiny_hunter_mode === true) chance *= 5
  return Math.random() < chance
}

// Port of _pokemon_tick_decisions.
function computeDecisions(state: Json, data: Json): TickDecisions {
  const lineage = state.lineage ?? ''
  const bl = lengthOf(data.berries)
  const wl = lengthOf(data.wild_pool)
  const il = lengthOf(data.items)
  const bxmin = Number(data.battle_xp_min ?? 500)
  const bxmax = Number(data.battle_xp_max ?? 5000)
  return {
    starter: lineage === '' ? pickStarter(data) : null,
    shiny: rollShiny(data, state),
    eevee_fallback_index: Math.floor(Math.random() * 3),
    berry: { fired: Math.random() < Number(data.event_chances?.berry ?? 0.005), index: bl ? Math.floor(Math.random() * bl) : 0 },
    encounter: { fired: Math.random() < Number(data.event_chances?.encounter ?? 0.001), index: wl ? Math.floor(Math.random() * wl) : 0 },
    battle: {
      fired: Math.random() < Number(data.battle_chance_on_encounter ?? 0.3),
      wild_level: Math.floor(Math.random() * 46) + 5,
      bonus_xp_raw: Math.floor(Math.random() * (bxmax - bxmin + 1)) + bxmin,
    },
    item: { fired: Math.random() < Number(data.item_drop_chance_on_encounter ?? 0.3), index: il ? Math.floor(Math.random() * il) : 0 },
  } as TickDecisions
}

function gitBranch(cwd: string): string {
  try {
    return execFileSync('git', ['-C', cwd, 'symbolic-ref', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function main(input: Json): void {
  const cwd = input.workspace?.current_dir ?? input.cwd ?? ''
  const model = input.model?.display_name ?? ''
  const used = input.context_window?.used_percentage
  const usedStr = used === undefined || used === null ? '' : String(used)
  const effort = input.effort?.level ?? ''
  const sessionId = input.session_id ?? 'default'

  // context_tokens, with 1M-window detection (port of statusline.sh:16-36).
  let contextTokens: number | undefined =
    input.context_window?.tokens ?? input.context?.tokens ?? input.context_window?.input_tokens
  if ((contextTokens === undefined || contextTokens === null) && usedStr !== '') {
    const defaultWindow = /1M context|\(1M\)/.test(model) ? 1_000_000 : 200_000
    const windowSize = input.model?.context_window ?? input.context_window?.size ?? defaultWindow
    contextTokens = Math.trunc((Number(used) * Number(windowSize)) / 100)
  }
  contextTokens = Math.round(Number(contextTokens ?? 0)) || 0

  const data = readJson(DATA_PATH)
  let state = readJson(STATE_PATH)

  // Tick (in-process): RNG decisions here, pure tick() owns the logic.
  // POKEMON_NOW_EPOCH is a test seam (mirrors the bash `date` shim) so the
  // differential against statusline.sh can pin the clock; unset → real time.
  const epochOverride = process.env.POKEMON_NOW_EPOCH
  const nowEpoch = epochOverride ? Number(epochOverride) : Math.floor(Date.now() / 1000)
  const now = new Date(nowEpoch * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const pct = usedStr === '' ? null : Math.round(Number(used))
  try {
    const res = tick({
      state,
      data,
      now,
      now_epoch: nowEpoch,
      session_id: sessionId,
      current_tokens: contextTokens,
      used_pct: pct,
      decisions: computeDecisions(state, data),
    })
    state = res.state
    writeFileSync(STATE_PATH + '.tmp', JSON.stringify(state) + '\n')
    renameSync(STATE_PATH + '.tmp', STATE_PATH)
  } catch {
    // If the tick fails, still render from whatever state we have.
  }

  const spriteDeps: SpriteDeps = {
    readSprite: (rel) => {
      try {
        return readFileSync(join(POKEMON_DIR, rel), 'utf8')
      } catch {
        return null
      }
    },
    animFrameCount: (rel) => {
      try {
        return readdirSync(join(POKEMON_DIR, rel)).filter((f) => /^frame_.*\.txt$/.test(f)).length
      } catch {
        return 0
      }
    },
  }

  const branch = cwd ? gitBranch(cwd) : ''
  const projectDir = input.workspace?.project_dir ?? input.workspace?.current_dir ?? input.cwd ?? ''
  const project = projectDir ? basename(projectDir) : ''

  process.stdout.write(
    renderStatusline({ state, data, used: usedStr, project, branch, model, effort }, spriteDeps),
  )
}

readStdin().then((raw) => {
  let input: Json = {}
  try {
    input = JSON.parse(raw)
  } catch {
    input = {}
  }
  main(input)
})
