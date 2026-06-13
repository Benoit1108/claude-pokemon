// Live PvP commands (Phase R3d-4b): invite / accept / status / move / forfeit.
// One-shot per subcommand (the user re-runs `status` to refresh — no polling).
// Renders HP/state + the local player's move hints.
import { bashPrintf } from './render/printf.js'
import { t, type Locale } from './render/i18n.js'
import { lineageEmoji } from './render/views.js'
import { httpJson, describeFailure, describeBody, sanitizeForTerminal } from './http.js'
import { movesForParticipant } from 'claude-pokemon-shared/moves'
import { RESET, BOLD, DIM, GOLD } from './render/ansi.js'
import type { PokemonData } from 'claude-pokemon-shared/state-types'

// External arena-worker live-battle payloads. Only the read fields are typed;
// httpJson hands them back as unknown and we narrow at the call boundary.
interface LiveParticipant {
  anon_id?: string
  snapshot?: { lineage?: string; level?: number }
  hp?: number | null
  has_pending_action?: boolean
}
interface LiveStatusResp {
  state?: string
  turn_no?: number
  challenger?: LiveParticipant
  defender?: LiveParticipant
  winner?: string
  reason?: string
  error?: string
  battle_id?: string
}

// Move hints come from the SAME pool the worker validates against
// (movesForParticipant: curated starter sets + learnsets for wilds). The old
// private stage/move tables here had already drifted from stages.ts/moves.ts
// (charizard-megay missing → wrong hints at Lv.100) — dedup'd away.
// Move names are intentionally hardcoded French (mirrors the move catalog).
function printMoves(lin: string, lvl: number): string {
  const moves = movesForParticipant(lin, lvl)
  let out = bashPrintf('  %sTes attaques :%s\n', BOLD, RESET)
  for (const m of moves) out += bashPrintf('    %s• %s%s\n', GOLD, m.name, RESET)
  out += bashPrintf('\n  %s/pokemon arena live move "<nom>"%s\n\n', DIM, RESET)
  return out
}

// Port of _live_render_status — HP/state + (if it's my turn) move hints.
export function renderLiveStatus(resp: LiveStatusResp, me: string): string {
  const state = sanitizeForTerminal(String(resp.state ?? ''))
  const turnNo = resp.turn_no ?? 0
  const c = resp.challenger ?? {}
  const d = resp.defender ?? {}
  // No `?? ''` on the anon ids: bash uses bare `jq -r '.challenger.anon_id'`,
  // so a missing id prints `''` here vs the literal `null` bash emits — an
  // intentional, untested-path drift (strictly nicer). Don't add a fallback.
  const cId = c.anon_id
  const cLin = c.snapshot?.lineage ?? '?'
  const cLvl = c.snapshot?.level ?? 0
  const cHp = c.hp ?? 0
  const cPending = c.has_pending_action === true
  const dId = d.anon_id
  const dLin = d.snapshot?.lineage ?? '?'
  const dLvl = d.snapshot?.level ?? 0
  const dHp = d.hp
  const dPending = d.has_pending_action === true

  let out = bashPrintf(
    '  %s── Live PvP — état: %s%s · tour %s%s\n',
    BOLD,
    GOLD,
    state,
    turnNo,
    RESET,
  )
  out += bashPrintf(
    '  %s%s %s Lv.%s · HP %s · %s%s\n',
    DIM,
    lineageEmoji(cLin),
    cId,
    cLvl,
    cHp,
    cPending ? 'commit ✓' : '... en attente',
    RESET,
  )
  if (dHp === null || dHp === undefined) {
    out += bashPrintf(
      "  %s%s %s · en attente d'acceptation%s\n\n",
      DIM,
      lineageEmoji(dLin),
      dId,
      RESET,
    )
  } else {
    out += bashPrintf(
      '  %s%s %s Lv.%s · HP %s · %s%s\n\n',
      DIM,
      lineageEmoji(dLin),
      dId,
      dLvl,
      dHp,
      dPending ? 'commit ✓' : '... en attente',
      RESET,
    )
  }

  if (state === 'finished' || state === 'abandoned') {
    out += bashPrintf(
      '  %s🏁 Combat terminé · winner=%s · reason=%s%s\n\n',
      GOLD,
      sanitizeForTerminal(String(resp.winner ?? '')),
      sanitizeForTerminal(String(resp.reason ?? '')),
      RESET,
    )
    return out
  }
  if (state === 'active' && me === cId && !cPending) out += printMoves(cLin, cLvl)
  else if (state === 'active' && me === dId && !dPending) out += printMoves(dLin, dLvl)
  return out
}

export interface LiveInput {
  args: string[]
  data: PokemonData
  locale: Locale
  secret: string
}
export interface LiveOutput {
  data: PokemonData
  output: string
  dataChanged: boolean
}

// GET with curl -sf semantics (null on failure or non-2xx).
async function getLive(url: string): Promise<LiveStatusResp | null> {
  const r = await httpJson(url)
  if (!r.ok || r.status < 200 || r.status >= 300) return null
  return r.body as LiveStatusResp
}
// POST keeping the body on HTTP errors; `failure` = real description when none.
async function postLive(
  url: string,
  init: RequestInit,
): Promise<{ body: LiveStatusResp; failure: string | null }> {
  const r = await httpJson(url, init)
  if (!r.ok) return { body: {}, failure: describeFailure(r) }
  return { body: r.body as LiveStatusResp, failure: null }
}

export async function runLive(input: LiveInput): Promise<LiveOutput> {
  const { locale, secret } = input
  const data: PokemonData = JSON.parse(JSON.stringify(input.data))
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const sub = input.args[0] ?? 'status'
  const endpoint = data.stats_share?.endpoint ?? ''
  const webUrl = data.arena?.web_url ?? 'https://claude-pokemon-arena.pages.dev'
  const anonId = data.stats_share?.anon_id ?? ''
  let dataChanged = false
  let out = ''
  const lastId = (): string => data.arena?.last_live_battle_id ?? ''
  const setLast = (id: string): void => {
    data.arena ??= {}
    data.arena.last_live_battle_id = id
    dataChanged = true
  }
  const spectator = (id: string): void => {
    out += bashPrintf(`  %s${L('live.spectator_url', webUrl, id)}%s\n\n`, DIM, RESET)
  }
  const msg = (k: string, color: string, ...a: Array<string | number>): void => {
    out += bashPrintf(`\n  %s${L(k, ...a)}%s\n\n`, color, RESET)
  }

  switch (sub) {
    case 'invite': {
      const opp = input.args[1] ?? ''
      if (!opp) {
        msg('live.invite_usage', DIM)
        break
      }
      const { body: resp, failure } = await postLive(`${endpoint}/v1/arena/live/invite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ challenger_anon_id: anonId, defender_anon_id: opp }),
      })
      const id = resp.battle_id ?? ''
      if (!id) {
        msg('live.invite_failed', DIM, failure ?? describeBody(resp))
        break
      }
      setLast(id)
      out += bashPrintf(`\n  %s${L('live.invite_sent', opp, id)}%s\n`, GOLD, RESET)
      out += bashPrintf(`  %s${L('live.spectator_url', webUrl, id)}%s\n\n`, DIM, RESET)
      break
    }
    case 'accept': {
      const id = input.args[1] || lastId()
      if (!id) {
        msg('live.accept_usage', DIM)
        break
      }
      const { body: resp, failure } = await postLive(`${endpoint}/v1/arena/live/${id}/accept`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      })
      if (resp.state !== 'active') {
        msg('live.accept_failed', DIM, failure ?? describeBody(resp))
        break
      }
      setLast(id)
      out += bashPrintf(`\n  %s${L('live.accepted', id)}%s\n\n`, GOLD, RESET)
      const status = await getLive(`${endpoint}/v1/arena/live/${id}`)
      if (status !== null) {
        out += renderLiveStatus(status, anonId)
        spectator(id)
      } else {
        out += bashPrintf(`\n  %s${L('live.not_found', id)}%s\n\n`, DIM, RESET)
      }
      break
    }
    case 'status':
    case '': {
      const id = input.args[1] || lastId()
      if (!id) {
        msg('live.status_usage', DIM)
        break
      }
      const resp = await getLive(`${endpoint}/v1/arena/live/${id}`)
      if (resp === null) {
        msg('live.not_found', DIM, id)
        break
      }
      out += renderLiveStatus(resp, anonId)
      spectator(id)
      break
    }
    case 'move':
    case 'attack': {
      const name = input.args[1] ?? ''
      const id = lastId()
      if (!id) {
        msg('live.move_no_battle', DIM)
        break
      }
      if (!name) {
        msg('live.move_usage', DIM)
        break
      }
      const { body: resp, failure } = await postLive(`${endpoint}/v1/arena/live/${id}/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify({ anon_id: anonId, move_id: name }),
      })
      if (failure) {
        msg('live.move_failed', DIM, failure)
        break
      }
      if (resp.error) {
        msg('live.move_failed', DIM, sanitizeForTerminal(String(resp.error)))
        break
      }
      out += bashPrintf(`\n  %s${L('live.move_committed', name)}%s\n\n`, GOLD, RESET)
      out += renderLiveStatus(resp, anonId)
      spectator(id)
      break
    }
    case 'forfeit':
    case 'abandon': {
      const id = input.args[1] || lastId()
      if (!id) {
        msg('live.forfeit_usage', DIM)
        break
      }
      const { body: resp } = await postLive(`${endpoint}/v1/arena/live/${id}/forfeit`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
      })
      msg('live.forfeited', DIM, sanitizeForTerminal(String(resp.state ?? '')))
      break
    }
    default:
      msg('live.unknown_subcmd', DIM, sub)
  }
  return { data, output: out, dataChanged }
}
