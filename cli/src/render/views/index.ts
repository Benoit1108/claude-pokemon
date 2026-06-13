// Barrel for the CLI view renderers (split out of the former single views.ts in
// a pure structural refactor). Re-exports every renderer + primitive from the
// sibling modules in this directory; importers point at `./views/index.js`
// (`render/index.ts`, `render/net.ts`, `live.ts`, `arena.ts`, `commands/game.ts`,
// `statusline.ts`, `tick.ts`, `pokemon-entry.ts`) and the tests.

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
