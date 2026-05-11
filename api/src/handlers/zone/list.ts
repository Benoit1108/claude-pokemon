// GET /v1/zones — public list of wild zones (Sprint 4.5).
// No auth, no cooldown. Used by the arena web to render the zone selector
// map. Returns the catalog as-is — clients filter / sort by level bracket
// against their own trainer level.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { ZONES } from '../../data/zones'

export async function handleZoneList(_env: Env): Promise<Response> {
  return jsonResp({
    zones: ZONES.map(z => ({
      id: z.id,
      name_fr: z.name_fr,
      name_en: z.name_en,
      emoji: z.emoji,
      flavor_fr: z.flavor_fr,
      level_min: z.level_min,
      level_max: z.level_max,
      // Sizes only — the full species lists are exposed via /v1/zones/<id>
      // for the detail page. Keeps the index payload tight.
      wild_pool_size: z.wild_pool.length,
      rare_pool_size: z.rare_pool?.length ?? 0,
      legendary_pool_size: z.legendary_pool?.length ?? 0,
    })),
  })
}
