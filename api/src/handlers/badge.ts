// GET /v1/badge/<anon_id>.svg  → live SVG card for embedding in GitHub READMEs.
// Self-contained (no external <image href>) so GitHub camo doesn't strip it.

import type { Env } from '../env.d'
import { svgResp } from '../lib/http'
import { getStats } from '../lib/kv'
import { svgBadge, svgPlaceholder } from '../lib/svg'

export async function handleBadge(pathname: string, env: Env): Promise<Response> {
  const m = pathname.match(/^\/v1\/badge\/([a-f0-9]{8,16})\.svg$/)
  if (!m) {
    return svgResp(svgPlaceholder('invalid badge URL'), 400, 0)
  }
  const anon_id = m[1]!
  const record = await getStats(env, anon_id)
  if (!record) {
    return svgResp(svgPlaceholder('trainer not found'), 404, 60)
  }
  return svgResp(svgBadge(record), 200, 300)
}
