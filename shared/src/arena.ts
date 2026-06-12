// Async PvP arena commands (Phase R3d-4b): status / enable / disable /
// regenerate / opponents / challenge / battle. The engine does the HTTP fetch
// (Node) and battle-replay rendering; bash owns the arena_secret FILE (a
// separate chmod-600 file), so runArena returns a `secret` op signal instead of
// touching the filesystem. live / pair / link → null (handled elsewhere).
import { bashPrintf } from './render/printf.js'
import { t, type Locale } from './render/i18n.js'
import { lineageEmoji } from './render/views.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GOLD = '\x1b[33m'

// Port of _arena_build_team — null when there's no active companion.
export function buildTeam(state: Json, anonId: string, displayName: string): Json | null {
  const lineage = state.lineage ?? ''
  const level = Number(state.current_level ?? 0)
  if (!lineage || level < 1) return null
  const team: Json = { anon_id: anonId, lineage, level, is_shiny: state.is_shiny ?? false }
  if (displayName !== '') team.display_name = displayName
  return team
}

// Port of _arena_render_battle — challenger vs defender + turn log + winner.
export function renderBattle(locale: Locale, raw: Json): string {
  const b = raw.battle ?? raw
  const c = b.challenger ?? {}
  const d = b.defender ?? {}
  const cName = c.display_name ?? c.anon_id
  const dName = d.display_name ?? d.anon_id
  const cEmoji = lineageEmoji(c.lineage)
  const dEmoji = lineageEmoji(d.lineage)
  const cStar = c.is_shiny === true ? '★' : ''
  const dStar = d.is_shiny === true ? '★' : ''
  let out = bashPrintf(
    '  %s%s %s %s%s %sLv.%s%s   %svs%s   %s%s %s %s%s %sLv.%s%s\n\n',
    BOLD, cEmoji, cName, cStar, RESET, DIM, c.level, RESET,
    DIM, RESET,
    BOLD, dEmoji, dName, dStar, RESET, DIM, d.level, RESET,
  )
  for (const turn of b.turns ?? []) {
    const who = turn.actor === 'challenger' ? cEmoji : dEmoji
    const eff = String(turn.effectiveness)
    const effLabel = eff === '2.0' || eff === '2' ? '2.0×' : eff === '0.5' ? '0.5×' : ''
    const critLabel = turn.critical === true ? ' CRIT!' : ''
    out += bashPrintf('  %sTurn %2s%s  %s -%s HP %s%s%s\n', DIM, String(turn.turn), RESET, who, turn.damage, DIM, effLabel + critLabel, RESET)
  }
  out += '\n'
  const winner = b.winner
  if (winner === 'challenger') out += bashPrintf(`  %s%s${t(locale, 'arena.winner_challenger', cName)}%s\n\n`, BOLD, GOLD, RESET)
  else if (winner === 'defender') out += bashPrintf(`  %s%s${t(locale, 'arena.winner_defender', dName)}%s\n\n`, BOLD, GOLD, RESET)
  else out += bashPrintf(`  %s${t(locale, 'arena.winner_draw')}%s\n\n`, DIM, RESET)
  out += bashPrintf(`  %s${t(locale, 'arena.battle_summary', (b.turns ?? []).length, b.reason)}%s\n\n`, DIM, RESET)
  return out
}

export interface ArenaInput {
  args: string[]
  data: Json
  state: Json
  locale: Locale
  /** Current arena_secret file contents ('' if none). */
  arenaSecret: string
  now: string
}

export type SecretOp = { action: 'save'; value: string } | { action: 'clear' } | null

export interface ArenaOutput {
  data: Json
  output: string
  dataChanged: boolean
  secret: SecretOp
}

async function getJson(url: string, init?: RequestInit): Promise<Json | null> {
  try {
    const r = await fetch(url, init)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}
// POST that returns the parsed body even on error (bash uses `curl -s`, not -sf).
async function postJson(url: string, init: RequestInit): Promise<Json> {
  try {
    return await (await fetch(url, init)).json()
  } catch {
    return {}
  }
}

/** Returns null for live/pair/link/unknown → bash dispatcher falls back. */
export async function runArena(input: ArenaInput): Promise<ArenaOutput | null> {
  const { locale, now } = input
  const data: Json = JSON.parse(JSON.stringify(input.data))
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const sub = input.args[0] ?? 'status'
  const endpoint = data.stats_share?.endpoint ?? ''
  const webUrl = data.arena?.web_url ?? 'https://claude-pokemon-arena.pages.dev'
  const anonId = data.stats_share?.anon_id ?? ''
  const displayName = data.stats_share?.display_name ?? ''
  const enabled = data.arena?.enabled === true
  const secret = input.arenaSecret
  let secretOp: SecretOp = null
  let dataChanged = false
  let out = bashPrintf(`\n  %s%s${L('arena.title')}%s\n\n`, BOLD, GOLD, RESET)
  const line = (k: string, color: string, ...a: Array<string | number>): void => {
    out += bashPrintf(`  %s${L(k, ...a)}%s\n\n`, color, RESET)
  }
  const ensureArena = (): Json => (data.arena ??= {})

  switch (sub) {
    case 'enable':
    case 'on': {
      if (!anonId) { line('arena.no_anon_id', DIM); break }
      if (enabled) { line('arena.already_enabled', DIM); break }
      if (input.args[1] !== '--confirm') {
        line('arena.privacy_notice', DIM)
        line('arena.confirm_hint', BOLD)
        break
      }
      const team = buildTeam(input.state, anonId, displayName)
      if (!team) { line('arena.no_active', DIM); break }
      const resp = await postJson(`${endpoint}/v1/arena/enable`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(team),
      })
      const sec = resp.arena_secret ?? ''
      if (!sec) {
        const errCode = resp.error ?? ''
        let errMsg: string
        if (errCode === 'validation') errMsg = (resp.details ?? []).join('; ')
        else if (errCode === 'already_enabled') errMsg = L('arena.already_enabled')
        else if (errCode === '') errMsg = typeof resp === 'string' ? resp : JSON.stringify(resp)
        else errMsg = errCode
        // err message as an arg, never in the format (a literal % would corrupt).
        out += bashPrintf('  %s%s%s\n\n', DIM, L('arena.enable_failed', errMsg), RESET)
        break
      }
      secretOp = { action: 'save', value: sec }
      ensureArena().enabled = true
      data.arena.enabled_at = now
      dataChanged = true
      line('arena.enabled', GOLD, anonId)
      break
    }
    case 'disable':
    case 'off': {
      if (!enabled) { line('arena.already_disabled', DIM); break }
      if (!secret) { line('arena.no_secret', DIM); break }
      await fetch(`${endpoint}/v1/arena/disable?anon_id=${anonId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${secret}` },
      }).catch(() => undefined)
      secretOp = { action: 'clear' }
      ensureArena().enabled = false
      dataChanged = true
      line('arena.disabled', DIM)
      break
    }
    case 'regenerate':
    case 'rotate': {
      if (!enabled) { line('arena.not_enabled', DIM); break }
      if (!secret) { line('arena.no_secret', DIM); break }
      const team = buildTeam(input.state, anonId, displayName)
      if (!team) { line('arena.no_active', DIM); break }
      const resp = await postJson(`${endpoint}/v1/arena/regenerate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify(team),
      })
      const newSec = resp.arena_secret ?? ''
      if (!newSec) { line('arena.regen_failed', DIM, JSON.stringify(resp)); break }
      secretOp = { action: 'save', value: newSec }
      line('arena.regen_ok', GOLD)
      break
    }
    case 'opponents':
    case 'list': {
      const limit = input.args[1] ?? '10'
      const resp = await getJson(`${endpoint}/v1/arena/opponents?limit=${limit}`)
      if (resp === null) { line('arena.fetch_failed', DIM); break }
      line('arena.opponents_count', DIM, resp.total ?? 0)
      for (const o of resp.opponents ?? []) {
        const shinyMark = o.is_shiny === true ? ' ★' : ''
        out += bashPrintf(
          '  %s#%s%s  %s  Lv.%s  %s%s\n',
          DIM, o.anon_id, RESET, lineageEmoji(o.lineage), o.level, o.display_name ?? o.anon_id, shinyMark,
        )
      }
      out += bashPrintf(`\n  %s${L('arena.opponents_hint')}%s\n\n`, DIM, RESET)
      break
    }
    case 'challenge':
    case 'fight': {
      const target = input.args[1] ?? ''
      if (!target) { line('arena.challenge_usage', DIM); break }
      if (!enabled) { line('arena.not_enabled', DIM); break }
      if (!secret) { line('arena.no_secret', DIM); break }
      const resp = await postJson(`${endpoint}/v1/arena/challenge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ challenger_anon_id: anonId, defender_anon_id: target }),
      })
      const battleId = resp.battle?.battle_id ?? ''
      if (!battleId) { line('arena.challenge_failed', DIM, JSON.stringify(resp)); break }
      ensureArena().last_battle_id = battleId
      dataChanged = true
      out += renderBattle(locale, resp)
      line('arena.replay', DIM, webUrl, battleId)
      break
    }
    case 'battle':
    case 'view': {
      const id = input.args[1] || (data.arena?.last_battle_id ?? '')
      if (!id) { line('arena.battle_usage', DIM); break }
      const resp = await getJson(`${endpoint}/v1/arena/battle/${id}`)
      if (resp === null) { line('arena.battle_not_found', DIM, id); break }
      out += renderBattle(locale, resp)
      line('arena.replay', DIM, webUrl, id)
      break
    }
    case 'status':
    case '': {
      if (enabled) out += bashPrintf(`  %s${L('arena.status_enabled', anonId)}%s\n`, GOLD, RESET)
      else out += bashPrintf(`  %s${L('arena.status_disabled')}%s\n`, DIM, RESET)
      out += bashPrintf(`  %s${L('arena.status_endpoint', endpoint)}%s\n\n`, DIM, RESET)
      out += bashPrintf(`  %s${L('arena.usage')}%s\n\n`, DIM, RESET)
      break
    }
    default:
      // live / pair / link / unknown → bash handles it.
      return null
  }

  return { data, output: out, dataChanged, secret: secretOp }
}
