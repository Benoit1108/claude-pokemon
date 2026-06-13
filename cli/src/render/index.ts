// View render dispatch (Phase R3c). Maps a view name to its TS renderer. Views
// not yet ported return { supported: false } so the bash dispatcher can fall
// back to its own implementation (same graceful-degradation contract as R3b).
import {
  renderBadges,
  renderInventory,
  renderTeam,
  renderPc,
  renderStats,
  renderPokedex,
  renderMain,
  renderTrainerCard,
  renderRecap,
  type RenderContext,
} from './views/index.js'
import type { Locale } from './i18n.js'
import type { PokemonState, PokemonData } from 'claude-pokemon-shared/state-types'

export interface RenderInput {
  view: string
  state: PokemonState
  data: PokemonData
  locale: Locale
  lang?: string
  /** recap scope (session|today|…) and clock for the duration line. */
  scope?: string
  nowEpoch?: number
  /** Pre-rendered sprite lines for the main view. */
  sprite?: string[] | null
}

const RENDERERS: Record<string, (ctx: RenderContext, input: RenderInput) => string> = {
  badges: renderBadges,
  inventory: renderInventory,
  team: renderTeam,
  pc: renderPc,
  stats: renderStats,
  pokedex: renderPokedex,
  main: renderMain,
  'trainer-card': renderTrainerCard,
  recap: (ctx, input) => renderRecap(ctx, input.scope ?? 'session'),
}

export const SUPPORTED_VIEWS = Object.keys(RENDERERS)

export function renderView(input: RenderInput): { supported: boolean; output: string } {
  const renderer = RENDERERS[input.view]
  if (!renderer) return { supported: false, output: '' }
  const ctx: RenderContext = {
    state: input.state,
    data: input.data,
    locale: input.locale,
    lang: input.lang ?? 'fr',
    nowEpoch: input.nowEpoch,
    sprite: input.sprite,
  }
  return { supported: true, output: renderer(ctx, input) }
}
