// Native Node /pokemon dispatcher (Phase R3d-5). Replaces the pokemon-status.sh
// dispatch + all its engine bridges (_render_view_live / _cmd / _arena / _share
// / _config / _render_net / _login / _logout): reads data/state/locale, routes
// each subcommand to the engine IN-PROCESS, applies the data/state/secret/
// session ops to disk, and prints the output. Bundled to lib/pokemon.mjs.
//
// State/data writes are atomic (tmp + rename); no flock (the /pokemon commands
// are rare + sequential — the statusline tick has its own single-writer path).
import { readFileSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { renderView } from './render/index.js'
import { renderLeaderboard, renderAggregate, type NetResult } from './render/net.js'
import { runCommand } from './commands.js'
import { runConfig } from './config.js'
import { runShare, buildSubmitPayload, renderForget, renderSubmit } from './share.js'
import { runArena } from './arena.js'
import { runLogin, runLogout } from './auth.js'
import { evoField } from './render/views.js'
import type { Locale } from './render/i18n.js'
import {
  POKEMON_DIR,
  STATE_PATH,
  loadData,
  saveUserConfig,
  readJsonFile,
  writeJsonAtomic,
  nowEpochSeconds,
  epochToIso,
} from './entry-io.js'
import { httpJson } from './http.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const SECRET_FILE = join(POKEMON_DIR, '.arena-secret')
const SESSION_FILE = join(POKEMON_DIR, '.session')

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}
function writeSecretFile(path: string, value: string): void {
  writeFileSync(path, value, { mode: 0o600 })
  // `mode` only applies on CREATE — an existing file (older install, restored
  // backup, manual edit) keeps its old perms. Re-tighten explicitly so a
  // pre-existing world-readable secret can't survive a rotation.
  chmodSync(path, 0o600)
}
function rm(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // already gone
  }
}

const out = (s: string): void => {
  process.stdout.write(s)
}

const nowEpoch = nowEpochSeconds()
const nowIso = epochToIso(nowEpoch)

// ── Routing tables (KNOWN is DERIVED from them — no third hand-kept list) ────
// Alias → view name (no state change).
const renderViews: Record<string, string> = {
  team: 'team',
  pc: 'pc',
  storage: 'pc',
  pokedex: 'pokedex',
  dex: 'pokedex',
  stats: 'stats',
  lifetime: 'stats',
  badges: 'badges',
  inventory: 'inventory',
  inv: 'inventory',
  sac: 'inventory',
  'trainer-card': 'trainer-card',
  card: 'trainer-card',
}
// Alias → engine `cmd` runner name (mutating commands).
const cmdMap: Record<string, string> = {
  '--shiny': 'shiny',
  reset: 'reset',
  switch: 'switch',
  hatch: 'hatch',
  deposit: 'deposit',
  withdraw: 'withdraw',
  release: 'release',
  give: 'give',
  take: 'take',
  trade: 'trade',
  game: 'game',
}
// Subcommands with dedicated if-branches in main().
const DIRECT_SUBS = [
  'recap',
  'summary',
  'quote',
  'bio',
  'pins',
  'pinned',
  'leaderboard',
  'lb',
  'aggregate',
  'global',
  'stats-share',
  'share',
  'arena',
  'login',
  'logout',
] as const
// Anything NOT known falls to the `main` view (the historical `*)` default).
const KNOWN = new Set<string>([...Object.keys(renderViews), ...Object.keys(cmdMap), ...DIRECT_SUBS])

async function getJson(endpoint: string, path: string): Promise<NetResult> {
  if (!endpoint) return { endpoint: false }
  const r = await httpJson(`${endpoint}${path}`)
  if (!r.ok || r.status < 200 || r.status >= 300) return { fetchFailed: true }
  return { resp: r.body }
}

// Inject randomness for trade/game (the "decisions in" pattern), forced
// deterministic by single-entry pools in tests.
function lengthOf(x: unknown): number {
  if (Array.isArray(x)) return x.length
  if (x && typeof x === 'object') return Object.keys(x).length
  return 0
}
function cmdDecisions(data: PokemonData): {
  pool_idx: number
  trade_level: number
  trade_shiny: boolean
} {
  const pool = lengthOf(data.wild_pool) || 1
  return {
    pool_idx: Math.floor(Math.random() * pool),
    trade_level: Math.floor(Math.random() * 46) + 5,
    trade_shiny: Math.floor(Math.random() * 20) === 0,
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const sub = argv[0] ?? ''
  const rest = argv.slice(1)

  // EXISTS-but-corrupt is fatal (a save must never be silently re-initialized);
  // missing state is fine (fresh install — the views render an empty egg).
  const dataRead = loadData()
  if (!dataRead.ok) {
    process.stderr.write(
      dataRead.missing
        ? `${dataRead.file} absent — lance d'abord : npx claude-pokemon install\n`
        : `${dataRead.file} corrompu (${dataRead.error}) — répare-le ou relance : npx claude-pokemon install\n`,
    )
    process.exitCode = 1
    return
  }
  const stateRead = readJsonFile(STATE_PATH)
  if (!stateRead.ok && !stateRead.missing) {
    process.stderr.write(
      `state.json corrompu (${stateRead.error}) — répare-le ou restaure un backup : npx claude-pokemon import <fichier>\n`,
    )
    process.exitCode = 1
    return
  }
  const data = dataRead.data as PokemonData
  const dataMode = dataRead.mode
  const state: PokemonState = stateRead.ok ? (stateRead.value as PokemonState) : {}
  const lang = data.language ?? 'fr'
  let locale: Locale
  try {
    locale = JSON.parse(readFileSync(join(POKEMON_DIR, 'locales', `${lang}.json`), 'utf8'))
  } catch {
    const fallback = readJsonFile(join(POKEMON_DIR, 'locales', 'fr.json'))
    locale = (fallback.ok ? fallback.value : {}) as Locale
  }

  // ── render views (no state change) ─────────────────────────────────────────
  if (sub in renderViews || sub === '' || !KNOWN.has(sub)) {
    const view = renderViews[sub] ?? 'main'
    let sprite: string[] | null = null
    if (view === 'main') {
      const lineage = state.lineage ?? 'fire'
      const showdownId = evoField(data, state, lineage, Number(state.current_level), 'showdown_id')
      const variant = state.is_shiny === true ? 'shiny' : 'normal'
      const content = readText(join(POKEMON_DIR, 'sprites', variant, `${showdownId}.txt`))
      if (content) {
        const lines = content.split('\n')
        if (lines.length && lines[lines.length - 1] === '') lines.pop()
        sprite = lines
      }
    }
    const { output } = renderView({ view, state, data, locale, lang, nowEpoch, sprite })
    out(output)
    // Ack the one-time XP-rebalance notice (mirrors view_main: it writes the
    // flag while rendering). The engine render is pure, so the entrypoint
    // persists it — else the notice would re-fire every /pokemon.
    if (
      view === 'main' &&
      Number(state.total_xp ?? 0) >= 1000 &&
      state.xp_rebalance_v2_acknowledged !== true
    ) {
      state.xp_rebalance_v2_acknowledged = true
      writeJsonAtomic(STATE_PATH, state)
    }
    return
  }

  if (sub === 'recap' || sub === 'summary') {
    const { output } = renderView({
      view: 'recap',
      state,
      data,
      locale,
      lang,
      nowEpoch,
      scope: rest[0] || 'session',
    })
    out(output)
    return
  }

  // ── mutating commands via the engine `cmd` runner ──────────────────────────
  if (sub in cmdMap) {
    const name = cmdMap[sub]! // `sub in cmdMap` guarantees the key exists
    const res = runCommand({
      name,
      args: rest,
      state,
      data,
      locale,
      now: nowIso,
      nowEpoch,
      decisions: cmdDecisions(data),
    })
    if (res) {
      if (res.stateChanged) writeJsonAtomic(STATE_PATH, res.state)
      out(res.output)
      return
    }
  }

  // ── config (quote / bio / pins) ────────────────────────────────────────────
  if (sub === 'quote' || sub === 'bio' || sub === 'pins' || sub === 'pinned') {
    const cmd = sub === 'pinned' ? 'pins' : sub
    const res = runConfig({ cmd, args: rest, data, state, locale } as never)
    if (res.changed) saveUserConfig(res.data, dataMode)
    out(res.output)
    return
  }

  // ── network views (leaderboard / aggregate) ────────────────────────────────
  if (sub === 'leaderboard' || sub === 'lb') {
    const endpoint: string = data?.stats_share?.endpoint ?? ''
    const metric = rest[0] || 'total_tokens'
    const limit = rest[1] || '10'
    out(
      renderLeaderboard(
        data,
        locale,
        metric,
        await getJson(endpoint, `/v1/leaderboard?metric=${metric}&limit=${limit}`),
      ),
    )
    return
  }
  if (sub === 'aggregate' || sub === 'global') {
    const endpoint: string = data?.stats_share?.endpoint ?? ''
    out(renderAggregate(data, locale, await getJson(endpoint, '/v1/aggregate')))
    return
  }

  // ── stats-share (status/enable/disable/name/forget/submit) ─────────────────
  if (sub === 'stats-share' || sub === 'share') {
    const shareSub = rest[0] ?? ''
    const endpoint: string = data?.stats_share?.endpoint ?? ''
    if (shareSub === 'forget') {
      const anonId: string = data?.stats_share?.anon_id ?? ''
      let ok = false
      if (anonId && endpoint) {
        const r = await httpJson(`${endpoint}/v1/forget?anon_id=${anonId}`, { method: 'DELETE' })
        ok = r.ok && r.status >= 200 && r.status < 300 && r.body != null
      }
      const res = renderForget(data, locale, anonId, ok)
      if (res.changed) saveUserConfig(res.data, dataMode)
      out(res.output)
      return
    }
    if (shareSub === 'submit' || shareSub === 'push') {
      const enabled = data?.stats_share?.enabled === true
      let code = 0
      let cooldownS = 0
      if (enabled && endpoint) {
        const payload = buildSubmitPayload(
          data,
          state,
          data.stats_share?.anon_id ?? '',
          data.version ?? 'unknown',
          data.stats_share?.display_name ?? '',
          nowIso,
        )
        const r = await httpJson(`${endpoint}/v1/submit`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (r.ok) {
          code = r.status
          if (code === 429)
            cooldownS = (r.body as { cooldown_remaining_s?: number })?.cooldown_remaining_s ?? 0
        } else {
          code = r.kind === 'parse' ? (r.status ?? 0) : 0
        }
      }
      const res = renderSubmit(state, locale, enabled, code, cooldownS, nowIso)
      if (res.changed) writeJsonAtomic(STATE_PATH, res.state)
      out(res.output)
      return
    }
    const res = runShare({
      args: rest,
      data,
      locale,
      anonId: randomBytes(4).toString('hex'),
    } as never)
    if (res) {
      if (res.changed) saveUserConfig(res.data, dataMode)
      out(res.output)
      return
    }
  }

  // ── arena (status/enable/.../pair/link/live) ───────────────────────────────
  if (sub === 'arena') {
    const res = await runArena({
      args: rest,
      data,
      state,
      locale,
      arenaSecret: readText(SECRET_FILE),
      now: nowIso,
    })
    if (res) {
      if (res.dataChanged) saveUserConfig(res.data, dataMode)
      if (res.stateChanged) writeJsonAtomic(STATE_PATH, res.state)
      if (res.secret?.action === 'save') writeSecretFile(SECRET_FILE, res.secret.value)
      else if (res.secret?.action === 'clear') rm(SECRET_FILE)
      out(res.output)
      return
    }
  }

  // ── auth (login / logout) ──────────────────────────────────────────────────
  if (sub === 'login') {
    const endpoint: string = data?.stats_share?.endpoint ?? ''
    const clientId = process.env.POKEMON_GITHUB_CLIENT_ID || 'Ov23liiZGFKFIT78EDcz'
    const { sessionToken } = await runLogin(
      { endpoint, clientId },
      {
        write: s => process.stderr.write(s),
        sleep: sec => new Promise(r => setTimeout(r, sec * 1000)),
        now: () => Math.floor(Date.now() / 1000),
      },
    )
    if (sessionToken) writeSecretFile(SESSION_FILE, sessionToken)
    else process.exitCode = 1
    return
  }
  if (sub === 'logout') {
    const endpoint: string = data?.stats_share?.endpoint ?? ''
    const res = await runLogout({ endpoint, token: readText(SESSION_FILE) })
    if (res.session?.action === 'clear') rm(SESSION_FILE)
    out(res.output)
    return
  }

  // Unknown → main view (matches the bash default).
  const { output } = renderView({ view: 'main', state, data, locale, lang, nowEpoch })
  out(output)
}

void main()
