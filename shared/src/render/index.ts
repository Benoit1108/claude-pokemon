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
  type RenderContext,
} from './views.js'
import type { Locale } from './i18n.js'

export interface RenderInput {
  view: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  locale: Locale
  lang?: string
  scriptName?: string
}

const RENDERERS: Record<string, (ctx: RenderContext) => string> = {
  badges: renderBadges,
  inventory: renderInventory,
  team: renderTeam,
  pc: renderPc,
  stats: renderStats,
  pokedex: renderPokedex,
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
    scriptName: input.scriptName ?? 'pokemon-status.sh',
  }
  return { supported: true, output: renderer(ctx) }
}
