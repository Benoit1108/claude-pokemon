// Opt-in stats auto-submit (port of _pokemon_maybe_autosubmit, lib/lib.sh —
// dropped during the bash removal, restored here; it had silently regressed:
// the Node statusline never pushed stats, so leaderboard/arena data went stale
// unless the user ran `share submit` by hand).
//
// Pure planning: decides whether a submit is due (share enabled + companion
// hatched + anon_id/endpoint set + ≥24h since the last one) and builds the
// payload. The caller stamps `last_stats_submit_at` and fires the network call
// (fire-and-forget — a failed push just retries next tick past the cooldown).
//
// Uses the canonical buildSubmitPayload (same as manual `share submit`) — the
// bash auto path had drifted to a leaner clone missing bio/pins; unified now.
import { buildSubmitPayload } from './share.js'
import type { PokemonData, PokemonState } from './state-types.js'

export interface AutoSubmitPlan {
  url: string
  payload: unknown
}

export function planAutoSubmit(
  state: PokemonState,
  data: PokemonData,
  now: string,
  nowEpoch: number,
): AutoSubmitPlan | null {
  const share = data.stats_share
  if (share?.enabled !== true) return null
  const lineage = state.lineage ?? ''
  if (lineage === '' || lineage === 'null') return null
  const anonId = share.anon_id ?? ''
  const endpoint = share.endpoint ?? ''
  if (anonId === '' || endpoint === '') return null
  const last = state.last_stats_submit_at ?? ''
  if (last !== '') {
    const lastEpoch = Math.floor(Date.parse(last) / 1000) || 0
    const hoursPassed = Math.floor((nowEpoch - lastEpoch) / 3600)
    if (hoursPassed < 24) return null
  }
  const payload = buildSubmitPayload(
    data,
    state,
    anonId,
    String(data.version ?? 'unknown'),
    share.display_name ?? '',
    now,
  )
  return { url: `${endpoint}/v1/submit`, payload }
}
