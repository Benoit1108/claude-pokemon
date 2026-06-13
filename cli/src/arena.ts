// Async PvP arena commands (Phase R3d-4b): status / enable / disable /
// regenerate / opponents / challenge / battle. The engine does the HTTP fetch
// (Node) and battle-replay rendering; bash owns the arena_secret FILE (a
// separate chmod-600 file), so runArena returns a `secret` op signal instead of
// touching the filesystem. live / pair / link → null (handled elsewhere).
import { execFileSync } from 'node:child_process'
import { bashPrintf } from './render/printf.js'
import { t, type Locale } from './render/i18n.js'
import { lineageEmoji } from './render/views.js'
import { runLive } from './live.js'
import { httpJson, describeFailure, describeBody, sanitizeForTerminal } from './http.js'
import { RESET, BOLD, DIM, GOLD } from './render/ansi.js'
import type { PokemonData, PokemonState, WildSeenEntry } from 'claude-pokemon-shared/state-types'

// External arena-worker payloads. Only the read fields are typed; the rest
// stays unknown at the httpJson boundary.
interface ArenaTeam {
  anon_id: string
  lineage: string
  level: number
  is_shiny: boolean
  display_name?: string
}
interface BattleTurn {
  turn?: number | string
  actor?: string
  effectiveness?: number | string
  critical?: boolean
  damage?: number
}
interface BattleSide {
  display_name?: string
  anon_id?: string
  lineage?: string
  is_shiny?: boolean
  level?: number
}
interface BattleBody {
  challenger?: BattleSide
  defender?: BattleSide
  turns?: BattleTurn[]
  winner?: string
  reason?: string
  battle_id?: string
}
interface BattleResp extends BattleBody {
  /** Some endpoints nest the battle under `.battle`, others return it flat. */
  battle?: BattleBody
}
interface TrainerStats {
  active?: { lineage?: string | null; is_shiny?: boolean; current_level?: number }
  lifetime?: {
    total_tokens?: number
    total_evolutions?: number
    total_shinies?: number
    max_level?: number
    total_companions?: number
    /** @deprecated old key, read-only back-compat */
    total_compagnons?: number
    lineages_completed?: string[]
    games_won?: number
    games_played?: number
  }
  badges?: string[]
  pokedex_seen_ids?: string[]
}
interface TrainerResp {
  stats?: TrainerStats
}
interface ArenaResp {
  arena_secret?: string
  error?: string
  details?: string[]
  battle?: BattleBody
  total?: number
  opponents?: Array<{
    anon_id?: string
    lineage?: string
    level?: number
    display_name?: string
    is_shiny?: boolean
  }>
  code?: string
  expires_at?: string
  anon_id?: string
}

// Port of _arena_build_team — null when there's no active companion.
export function buildTeam(
  state: PokemonState,
  anonId: string,
  displayName: string,
): ArenaTeam | null {
  const lineage = state.lineage ?? ''
  const level = Number(state.current_level ?? 0)
  if (!lineage || level < 1) return null
  const team: ArenaTeam = { anon_id: anonId, lineage, level, is_shiny: state.is_shiny ?? false }
  if (displayName !== '') team.display_name = displayName
  return team
}

// Port of _arena_render_battle — challenger vs defender + turn log + winner.
export function renderBattle(locale: Locale, raw: BattleResp): string {
  const b: BattleBody = raw.battle ?? raw
  const c = b.challenger ?? {}
  const d = b.defender ?? {}
  // Server-controlled strings — strip terminal controls before printing raw.
  const cName = sanitizeForTerminal(String(c.display_name ?? c.anon_id ?? ''))
  const dName = sanitizeForTerminal(String(d.display_name ?? d.anon_id ?? ''))
  const cEmoji = lineageEmoji(c.lineage)
  const dEmoji = lineageEmoji(d.lineage)
  const cStar = c.is_shiny === true ? '★' : ''
  const dStar = d.is_shiny === true ? '★' : ''
  let out = bashPrintf(
    '  %s%s %s %s%s %sLv.%s%s   %svs%s   %s%s %s %s%s %sLv.%s%s\n\n',
    BOLD,
    cEmoji,
    cName,
    cStar,
    RESET,
    DIM,
    c.level,
    RESET,
    DIM,
    RESET,
    BOLD,
    dEmoji,
    dName,
    dStar,
    RESET,
    DIM,
    d.level,
    RESET,
  )
  for (const turn of b.turns ?? []) {
    const who = turn.actor === 'challenger' ? cEmoji : dEmoji
    const eff = String(turn.effectiveness)
    const effLabel = eff === '2.0' || eff === '2' ? '2.0×' : eff === '0.5' ? '0.5×' : ''
    const critLabel = turn.critical === true ? ' CRIT!' : ''
    out += bashPrintf(
      '  %sTurn %2s%s  %s -%s HP %s%s%s\n',
      DIM,
      String(turn.turn),
      RESET,
      who,
      turn.damage,
      DIM,
      effLabel + critLabel,
      RESET,
    )
  }
  out += '\n'
  const winner = b.winner
  if (winner === 'challenger')
    out += bashPrintf(
      `  %s%s${t(locale, 'arena.winner_challenger', cName)}%s\n\n`,
      BOLD,
      GOLD,
      RESET,
    )
  else if (winner === 'defender')
    out += bashPrintf(`  %s%s${t(locale, 'arena.winner_defender', dName)}%s\n\n`, BOLD, GOLD, RESET)
  else out += bashPrintf(`  %s${t(locale, 'arena.winner_draw')}%s\n\n`, DIM, RESET)
  out += bashPrintf(
    `  %s${t(locale, 'arena.battle_summary', (b.turns ?? []).length, b.reason)}%s\n\n`,
    DIM,
    RESET,
  )
  return out
}

export interface ArenaInput {
  args: string[]
  data: PokemonData
  state: PokemonState
  locale: Locale
  /** Current arena_secret file contents ('' if none). */
  arenaSecret: string
  now: string
}

export type SecretOp = { action: 'save'; value: string } | { action: 'clear' } | null

export interface ArenaOutput {
  data: PokemonData
  output: string
  dataChanged: boolean
  secret: SecretOp
  state: PokemonState
  stateChanged: boolean
}

const PAIR_CODE_RE = /^[A-HJ-NP-TV-Z2-9]{6}$/

// Port of _link_apply_trainer_to_state: rewrite state from a TrainerResponse.
export function applyTrainerToState(
  state: PokemonState,
  trainer: TrainerResp,
  now: string,
): PokemonState {
  const s: PokemonState = JSON.parse(JSON.stringify(state))
  const active = trainer.stats?.active ?? {}
  const lt = trainer.stats?.lifetime ?? {}
  s.lineage = active.lineage
  s.is_shiny = active.is_shiny
  s.current_level = active.current_level
  s.lifetime_stats ??= {}
  s.lifetime_stats.total_tokens = lt.total_tokens ?? 0
  s.lifetime_stats.total_evolutions = lt.total_evolutions ?? 0
  s.lifetime_stats.total_shinies = lt.total_shinies ?? 0
  s.lifetime_stats.max_level = lt.max_level ?? 0
  s.lifetime_stats.total_companions = lt.total_companions ?? lt.total_compagnons ?? 0
  s.lifetime_stats.lineages_completed = lt.lineages_completed ?? []
  s.lifetime_stats.games_won = lt.games_won ?? 0
  s.lifetime_stats.games_played = lt.games_played ?? 0
  s.badges = (trainer.stats?.badges ?? []).map(id => ({ id, earned_at: now }))
  const wild: Record<string, WildSeenEntry> = {}
  for (const id of trainer.stats?.pokedex_seen_ids ?? [])
    wild[id] = { count: 1, first_seen_at: now }
  s.pokedex_wild = wild
  s.last_updated = now
  return s
}

// QR of the pair URL via the optional `qrencode` binary (like chafa for sprites
// — absent → graceful hint). Returns the indented QR block or null.
function qrBlock(url: string): string | null {
  try {
    const out = execFileSync('qrencode', ['-t', 'ANSIUTF8', '-m', '1', url], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString()
    return out
      .replace(/\n$/, '')
      .split('\n')
      .map(l => '  ' + l)
      .join('\n')
  } catch {
    return null
  }
}

// GET with curl -sf semantics: null on network failure OR non-2xx.
async function getJson<T>(url: string): Promise<T | null> {
  const r = await httpJson(url)
  if (!r.ok || r.status < 200 || r.status >= 300) return null
  return r.body as T
}
// POST that keeps the parsed body even on HTTP errors (the worker speaks JSON
// on errors); `failure` carries a real description when there was no body at
// all (network / non-JSON) — threaded into the *_failed messages instead of
// the old bare "{}".
async function postJson(
  url: string,
  init: RequestInit,
): Promise<{ body: ArenaResp; failure: string | null }> {
  const r = await httpJson(url, init)
  if (!r.ok) return { body: {}, failure: describeFailure(r) }
  return { body: r.body as ArenaResp, failure: null }
}

// Shared context handed to every subcommand handler. `data` is the working
// (deep-cloned) copy; mutating it is how handlers persist arena/stats_share
// changes (caller reads `ctx.data` back after dispatch). `out` is append-only
// via `append`; `line` is the indented one-liner helper. Handlers set the
// mutation flags / secretOp directly on the context.
interface ArenaCtx {
  input: ArenaInput
  data: PokemonData
  locale: Locale
  now: string
  endpoint: string
  webUrl: string
  anonId: string
  displayName: string
  enabled: boolean
  secret: string
  L: (k: string, ...a: Array<string | number>) => string
  append: (s: string) => void
  line: (k: string, color: string, ...a: Array<string | number>) => void
  ensureArena: () => NonNullable<PokemonData['arena']>
  secretOp: SecretOp
  dataChanged: boolean
  stateOut: PokemonState
  stateChanged: boolean
}

async function handleEnable(ctx: ArenaCtx): Promise<void> {
  const { input, endpoint, anonId, displayName, enabled, now, L, append, line, ensureArena } = ctx
  if (!anonId) {
    line('arena.no_anon_id', DIM)
    return
  }
  if (enabled) {
    line('arena.already_enabled', DIM)
    return
  }
  if (input.args[1] !== '--confirm') {
    line('arena.privacy_notice', DIM)
    line('arena.confirm_hint', BOLD)
    return
  }
  const team = buildTeam(input.state, anonId, displayName)
  if (!team) {
    line('arena.no_active', DIM)
    return
  }
  const { body: resp, failure } = await postJson(`${endpoint}/v1/arena/enable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(team),
  })
  const sec = resp.arena_secret ?? ''
  if (!sec) {
    const errCode = resp.error ?? ''
    let errMsg: string
    if (errCode === 'validation') errMsg = sanitizeForTerminal((resp.details ?? []).join('; '))
    else if (errCode === 'already_enabled') errMsg = L('arena.already_enabled')
    else if (errCode === '') errMsg = failure ?? describeBody(resp)
    else errMsg = sanitizeForTerminal(String(errCode))
    // err message as an arg, never in the format (a literal % would corrupt).
    append(bashPrintf('  %s%s%s\n\n', DIM, L('arena.enable_failed', errMsg), RESET))
    return
  }
  ctx.secretOp = { action: 'save', value: sec }
  const arena = ensureArena()
  arena.enabled = true
  arena.enabled_at = now
  ctx.dataChanged = true
  line('arena.enabled', GOLD, anonId)
}

async function handleDisable(ctx: ArenaCtx): Promise<void> {
  const { endpoint, anonId, enabled, secret, line, ensureArena } = ctx
  if (!enabled) {
    line('arena.already_disabled', DIM)
    return
  }
  if (!secret) {
    line('arena.no_secret', DIM)
    return
  }
  // Best-effort — failures only surface via POKEMON_DEBUG.
  await httpJson(`${endpoint}/v1/arena/disable?anon_id=${anonId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${secret}` },
  })
  ctx.secretOp = { action: 'clear' }
  ensureArena().enabled = false
  ctx.dataChanged = true
  line('arena.disabled', DIM)
}

async function handleRegenerate(ctx: ArenaCtx): Promise<void> {
  const { input, endpoint, anonId, displayName, enabled, secret, line } = ctx
  if (!enabled) {
    line('arena.not_enabled', DIM)
    return
  }
  if (!secret) {
    line('arena.no_secret', DIM)
    return
  }
  const team = buildTeam(input.state, anonId, displayName)
  if (!team) {
    line('arena.no_active', DIM)
    return
  }
  const { body: resp, failure } = await postJson(`${endpoint}/v1/arena/regenerate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify(team),
  })
  const newSec = resp.arena_secret ?? ''
  if (!newSec) {
    line('arena.regen_failed', DIM, failure ?? describeBody(resp))
    return
  }
  ctx.secretOp = { action: 'save', value: newSec }
  line('arena.regen_ok', GOLD)
}

async function handleOpponents(ctx: ArenaCtx): Promise<void> {
  const { input, endpoint, L, append, line } = ctx
  const limit = input.args[1] ?? '10'
  const resp = await getJson<ArenaResp>(`${endpoint}/v1/arena/opponents?limit=${limit}`)
  if (resp === null) {
    line('arena.fetch_failed', DIM)
    return
  }
  line('arena.opponents_count', DIM, resp.total ?? 0)
  for (const o of resp.opponents ?? []) {
    const shinyMark = o.is_shiny === true ? ' ★' : ''
    append(
      bashPrintf(
        '  %s#%s%s  %s  Lv.%s  %s%s\n',
        DIM,
        sanitizeForTerminal(String(o.anon_id ?? '')),
        RESET,
        lineageEmoji(o.lineage),
        o.level,
        sanitizeForTerminal(String(o.display_name ?? o.anon_id ?? '')),
        shinyMark,
      ),
    )
  }
  append(bashPrintf(`\n  %s${L('arena.opponents_hint')}%s\n\n`, DIM, RESET))
}

async function handleChallenge(ctx: ArenaCtx): Promise<void> {
  const { input, locale, endpoint, webUrl, anonId, enabled, secret, append, line, ensureArena } =
    ctx
  const target = input.args[1] ?? ''
  if (!target) {
    line('arena.challenge_usage', DIM)
    return
  }
  if (!enabled) {
    line('arena.not_enabled', DIM)
    return
  }
  if (!secret) {
    line('arena.no_secret', DIM)
    return
  }
  const { body: resp, failure } = await postJson(`${endpoint}/v1/arena/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ challenger_anon_id: anonId, defender_anon_id: target }),
  })
  const battleId = resp.battle?.battle_id ?? ''
  if (!battleId) {
    line('arena.challenge_failed', DIM, failure ?? describeBody(resp))
    return
  }
  ensureArena().last_battle_id = battleId
  ctx.dataChanged = true
  append(renderBattle(locale, resp as BattleResp))
  line('arena.replay', DIM, webUrl, battleId)
}

async function handleBattle(ctx: ArenaCtx): Promise<void> {
  const { input, data, locale, endpoint, webUrl, append, line } = ctx
  const id = input.args[1] || (data.arena?.last_battle_id ?? '')
  if (!id) {
    line('arena.battle_usage', DIM)
    return
  }
  const resp = await getJson<BattleResp>(`${endpoint}/v1/arena/battle/${id}`)
  if (resp === null) {
    line('arena.battle_not_found', DIM, id)
    return
  }
  append(renderBattle(locale, resp))
  line('arena.replay', DIM, webUrl, id)
}

function handleStatus(ctx: ArenaCtx): void {
  const { endpoint, anonId, enabled, L, append } = ctx
  if (enabled) append(bashPrintf(`  %s${L('arena.status_enabled', anonId)}%s\n`, GOLD, RESET))
  else append(bashPrintf(`  %s${L('arena.status_disabled')}%s\n`, DIM, RESET))
  append(bashPrintf(`  %s${L('arena.status_endpoint', endpoint)}%s\n\n`, DIM, RESET))
  append(bashPrintf(`  %s${L('arena.usage')}%s\n\n`, DIM, RESET))
}

async function handlePair(ctx: ArenaCtx): Promise<void> {
  const { endpoint, anonId, enabled, secret, webUrl, L, append, line } = ctx
  // bash prints arena.title (already in `out`) then pair.title.
  append(bashPrintf(`\n  %s%s${L('pair.title')}%s\n\n`, BOLD, GOLD, RESET))
  if (!enabled || !anonId) {
    line('live.not_enabled', DIM)
    return
  }
  if (!secret) {
    line('arena.no_secret', DIM)
    return
  }
  const { body: resp, failure } = await postJson(`${endpoint}/v1/arena/pair/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
    body: JSON.stringify({ anon_id: anonId }),
  })
  const code = resp.code ?? ''
  if (!code) {
    line('pair.failed', DIM, failure ?? describeBody(resp))
    return
  }
  const pairUrl = `${webUrl}/pair?code=${code}`
  append(
    bashPrintf(`  %s${L('pair.code_label')}%s   %s%s%s\n\n`, DIM, RESET, BOLD + GOLD, code, RESET),
  )
  append(bashPrintf(`  %s${L('pair.url_label')}%s\n`, DIM, RESET))
  append(bashPrintf('  %s%s%s\n\n', BOLD, pairUrl, RESET))
  const qr = qrBlock(pairUrl)
  if (qr !== null) {
    append(bashPrintf(`  %s${L('pair.qr_label')}%s\n`, DIM, RESET))
    append(qr + '\n\n')
  } else {
    append(bashPrintf(`  %s${L('pair.qr_hint')}%s\n\n`, DIM, RESET))
  }
  append(bashPrintf(`  %s${L('pair.expires', resp.expires_at ?? '')}%s\n\n`, DIM, RESET))
  append(bashPrintf(`  %s${L('pair.warning')}%s\n\n`, DIM, RESET))
}

async function handleLink(ctx: ArenaCtx): Promise<void> {
  const { input, data, endpoint, anonId, enabled, now, L, append, ensureArena } = ctx
  // bash prints arena.title (already in `out`) then link.title.
  append(bashPrintf(`\n  %s%s${L('link.title')}%s\n\n`, BOLD, GOLD, RESET))
  const code = input.args[1] ?? ''
  if (!code) {
    append(bashPrintf(`  %s${L('link.usage')}%s\n\n`, DIM, RESET))
    return
  }
  const upper = code.toUpperCase()
  if (!PAIR_CODE_RE.test(upper)) {
    append(bashPrintf(`  %s${L('link.invalid_code')}%s\n\n`, DIM, RESET))
    return
  }
  if (enabled && anonId)
    append(bashPrintf(`  %s${L('link.warn_existing', anonId)}%s\n\n`, DIM, RESET))
  const { body: resp, failure } = await postJson(`${endpoint}/v1/arena/pair/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: upper }),
  })
  const newAnon = resp.anon_id ?? ''
  const newSecret = resp.arena_secret ?? ''
  if (!newAnon || !newSecret) {
    append(bashPrintf(`  %s${L('link.failed', failure ?? describeBody(resp))}%s\n\n`, DIM, RESET))
    return
  }
  ctx.secretOp = { action: 'save', value: newSecret }
  const arena = ensureArena()
  data.stats_share ??= {}
  data.stats_share.anon_id = newAnon
  arena.enabled = true
  arena.enabled_at = now
  ctx.dataChanged = true
  const trainer = await getJson<TrainerResp>(`${endpoint}/v1/trainer/${newAnon}`)
  if (trainer !== null) {
    ctx.stateOut = applyTrainerToState(input.state, trainer, now)
    ctx.stateChanged = true
    append(bashPrintf(`  %s${L('link.state_synced')}%s\n`, DIM, RESET))
  } else {
    append(bashPrintf(`  %s${L('link.no_remote_state')}%s\n`, DIM, RESET))
  }
  append(bashPrintf(`  %s${L('link.success', newAnon)}%s\n\n`, GOLD, RESET))
}

/** Returns null for live/pair/link/unknown → bash dispatcher falls back. */
export async function runArena(input: ArenaInput): Promise<ArenaOutput | null> {
  const { locale, now } = input
  const data: PokemonData = JSON.parse(JSON.stringify(input.data))
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const sub = input.args[0] ?? 'status'
  const endpoint = data.stats_share?.endpoint ?? ''
  const webUrl = data.arena?.web_url ?? 'https://claude-pokemon-arena.pages.dev'
  const anonId = data.stats_share?.anon_id ?? ''
  const displayName = data.stats_share?.display_name ?? ''
  const enabled = data.arena?.enabled === true
  const secret = input.arenaSecret
  let out = bashPrintf(`\n  %s%s${L('arena.title')}%s\n\n`, BOLD, GOLD, RESET)
  const ctx: ArenaCtx = {
    input,
    data,
    locale,
    now,
    endpoint,
    webUrl,
    anonId,
    displayName,
    enabled,
    secret,
    L,
    append: (s: string): void => {
      out += s
    },
    line: (k: string, color: string, ...a: Array<string | number>): void => {
      out += bashPrintf(`  %s${L(k, ...a)}%s\n\n`, color, RESET)
    },
    ensureArena: (): NonNullable<PokemonData['arena']> => (data.arena ??= {}),
    secretOp: null,
    dataChanged: false,
    stateOut: input.state,
    stateChanged: false,
  }

  switch (sub) {
    case 'enable':
    case 'on':
      await handleEnable(ctx)
      break
    case 'disable':
    case 'off':
      await handleDisable(ctx)
      break
    case 'regenerate':
    case 'rotate':
      await handleRegenerate(ctx)
      break
    case 'opponents':
    case 'list':
      await handleOpponents(ctx)
      break
    case 'challenge':
    case 'fight':
      await handleChallenge(ctx)
      break
    case 'battle':
    case 'view':
      await handleBattle(ctx)
      break
    case 'status':
    case '':
      handleStatus(ctx)
      break
    case 'pair':
      await handlePair(ctx)
      break
    case 'link':
      await handleLink(ctx)
      break
    case 'live': {
      // bash prints arena.title (already in `out`) then delegates to the live
      // subcommand, which does its own enabled/secret gate.
      if (!enabled || !anonId) {
        out += bashPrintf(`\n  %s${L('live.not_enabled')}%s\n\n`, DIM, RESET)
        break
      }
      if (!secret) {
        out += bashPrintf(`\n  %s${L('arena.no_secret')}%s\n\n`, DIM, RESET)
        break
      }
      const r = await runLive({ args: input.args.slice(1), data, locale, secret })
      return {
        data: r.data,
        output: out + r.output,
        dataChanged: r.dataChanged,
        secret: null,
        state: ctx.stateOut,
        stateChanged: false,
      }
    }
    default:
      // unknown → bash handles it.
      return null
  }

  return {
    data,
    output: out,
    dataChanged: ctx.dataChanged,
    secret: ctx.secretOp,
    state: ctx.stateOut,
    stateChanged: ctx.stateChanged,
  }
}
