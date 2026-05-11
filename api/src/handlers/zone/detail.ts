// GET /v1/zones/<zone_id> — full zone detail with species lists (Sprint 4.5).
// Read-only, no auth. Web zone-detail page uses this to list which species
// the player might encounter.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { getZone } from '../../data/zones'

export async function handleZoneDetail(pathname: string, _env: Env): Promise<Response> {
  const m = pathname.match(/^\/v1\/zones\/([a-z][a-z0-9-]{1,32})$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)
  const zoneId = m[1]!

  const zone = getZone(zoneId)
  if (!zone) return jsonResp({ error: 'zone_not_found' }, 404)

  return jsonResp({
    id: zone.id,
    name_fr: zone.name_fr,
    name_en: zone.name_en,
    emoji: zone.emoji,
    flavor_fr: zone.flavor_fr,
    level_min: zone.level_min,
    level_max: zone.level_max,
    wild_pool: zone.wild_pool,
    rare_pool: zone.rare_pool ?? [],
    legendary_pool: zone.legendary_pool ?? [],
  })
}
