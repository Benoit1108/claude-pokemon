// Battle scene resolution (Phase 2.15) — picks the pixel-art background and
// the sprite standing positions for the BattleStage.
//
// The decor is a hot anime-style image in /public/battle-bg/ with a single
// centered battle ring (classic Pokémon layout). `scene="arena"` forces the
// stadium ; otherwise the environment is derived from the opponent's combat
// type (water → beach, fire → volcano, …) so wild / ladder battles get a
// fitting backdrop. Because the ring is consistently centered across every
// background, both combatants share one anchor set (no per-env tuning).

import { lineageToCombatType, type CombatType } from 'claude-pokemon-shared'

export interface SceneAnchor {
  x: string
  y: string
}
export interface SceneAnchors {
  ally: SceneAnchor
  foe: SceneAnchor
}
export interface BattleScene {
  env: string
  bg: string
  anchors: SceneAnchors
}

const TYPE_TO_ENV: Record<CombatType, string> = {
  grass: 'prairie',
  bug: 'prairie',
  water: 'plage',
  fire: 'volcan',
  ice: 'neige',
  fighting: 'dojo',
  normal: 'dojo',
  electric: 'usine',
  steel: 'usine',
  poison: 'usine',
  psychic: 'ville',
  ghost: 'ville',
  dark: 'ville',
  fairy: 'ville',
  rock: 'canyon',
  ground: 'canyon',
  dragon: 'canyon',
  flying: 'canyon',
}

const AVAILABLE = new Set([
  'arena',
  'neige',
  'plage',
  'volcan',
  'dojo',
  'prairie',
  'usine',
  'ville',
  'canyon',
])

// Standing positions on the central ring : the player (back-view) stands at
// the near/front edge, slightly left ; the opponent (face-view) at the far/back
// edge, slightly right. In % of the stage box. Consistent for every background
// since the painted ring is always centered.
const DEFAULT_ANCHORS: SceneAnchors = { ally: { x: '33%', y: '89%' }, foe: { x: '66%', y: '63%' } }

// Per-env overrides if a specific background's ring drifts. Empty today — the
// ring is consistent across the set.
const ANCHOR_OVERRIDES: Record<string, SceneAnchors> = {}

/**
 * Resolve the battle scene from an explicit `scene` hint or the opponent's
 * lineage. A recognized `scene` wins ; otherwise the environment is derived
 * from the defender's combat type (no defender → 'normal' → dojo). Falls back
 * to prairie if the value is somehow unknown, so we never render a missing
 * image.
 */
export function resolveScene(opts: { scene?: string; defenderLineage?: string }): BattleScene {
  let env =
    opts.scene && AVAILABLE.has(opts.scene)
      ? opts.scene
      : TYPE_TO_ENV[lineageToCombatType(opts.defenderLineage)]
  if (!env || !AVAILABLE.has(env)) env = 'prairie'
  return { env, bg: `/battle-bg/${env}.png`, anchors: ANCHOR_OVERRIDES[env] ?? DEFAULT_ANCHORS }
}
