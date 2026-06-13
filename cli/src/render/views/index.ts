// Barrel for the CLI view renderers (split out of the former single views.ts in
// a pure structural refactor). Preserves the EXACT public import surface: every
// symbol the old `./views.js` exported is re-exported here, from the same
// specifier, so sibling files (`render/index.ts`, `render/net.ts`, `live.ts`,
// `arena.ts`, `commands.ts`, `statusline.ts`, `tick.ts`, `pokemon-entry.ts`)
// and the tests keep resolving `./views.js` / `../render/views.js` unchanged.

// Shared formatting primitives + the RenderContext shape.
export { padChars, tPad, fmtInt, lineageEmoji } from './format.js'
export type { RenderContext } from './format.js'

// Stage-resolution helpers exported by the original module.
export { resolveStageDefault, evoField } from './stage.js'

// View renderers.
export { renderBadges, renderInventory, renderTeam, renderPc } from './roster.js'
export { renderMain } from './main.js'
export { renderRecap } from './recap.js'
export { renderTrainerCard } from './trainer-card.js'
export { renderStats } from './stats.js'
export { renderPokedex } from './pokedex.js'
