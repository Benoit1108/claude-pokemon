// CLI view renderers ported from lib/pokemon-status.sh (Phase R3c). Each
// function reproduces the bash view's `printf` sequence byte-for-byte (verified
// against the R3a fixtures, ANSI-stripped). Colors are cosmetic here — the
// fixtures strip ANSI, so only visible text + spacing must match.
//
// This module: the shared low-level formatting primitives + the RenderContext
// shape, used across every view slice.
import { t, type Locale } from '../i18n.js'
import { DIM, BOLD, RESET } from '../ansi.js'
import type { PokemonState, PokemonData } from '../../state-types.js'

export interface RenderContext {
  state: PokemonState
  data: PokemonData
  locale: Locale
  /** Active UI language; read by the pokedex slice (data.wild_pool name_<lang>). */
  lang: string
  /** Unix epoch seconds for the recap session/today duration (bash used `date`).
   *  Optional: the deterministic recap path (no active session) never reads it. */
  nowEpoch?: number
  /** Pre-rendered sprite lines (main view). Absent → no sprite block, matching
   *  the R3a fixtures (captured with no sprite files on disk). */
  sprite?: string[] | null
}

// jq string interpolation renders null/absent as the literal "null".
export function jqStr(v: unknown): string {
  return v === null || v === undefined ? 'null' : String(v)
}

// pokemon_t_pad pads by CHARACTER count (wc -m), unlike bashPrintf's %-Ns which
// pads by bytes. Code-point count matches `wc -m` for these locale strings.
export function padChars(s: string, width: number): string {
  const len = [...s].length
  return s + ' '.repeat(Math.max(0, width - len))
}

export function tPad(locale: Locale, key: string, width: number): string {
  return padChars(t(locale, key), width)
}

// fmt_int: group digits in 3s with a SPACE separator (matches the awk version).
export function fmtInt(n: number | string | undefined): string {
  let s = String(Math.trunc(Number(n) || 0))
  let neg = ''
  if (s.startsWith('-')) {
    neg = '-'
    s = s.slice(1)
  }
  let out = ''
  while (s.length > 3) {
    out = ' ' + s.slice(-3) + out
    s = s.slice(0, -3)
  }
  return neg + s + out
}

export function stripAnsiStr(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

// pokemon_box_top / pokemon_box_bottom. Title visible length is char-counted
// (wc -m) after stripping ANSI; dashes fill the rest. Titles passed here are
// plain (no ANSI), but we strip to match bash exactly.
export function boxTop(title: string, width: number): string {
  let titleVisible = 0
  if (title) titleVisible = [...stripAnsiStr(title)].length + 2
  let dashCount = width - titleVisible - 2
  if (dashCount < 4) dashCount = 4
  const dashes = '─'.repeat(dashCount)
  if (title) return `${DIM}╭─ ${BOLD}${title}${RESET} ${dashes}╮${RESET}\n`
  return `${DIM}╭${dashes}──╮${RESET}\n`
}

export function boxBottom(width: number): string {
  return `${DIM}╰${'─'.repeat(width - 2)}╯${RESET}\n`
}

// _lineage_emoji (lib/pokemon-status.sh).
const LINEAGE_EMOJI: Record<string, string> = {
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  electric: '⚡',
  eevee: '🦊',
  chikorita: '🌱',
  cyndaquil: '🦔',
  totodile: '🐊',
}
export function lineageEmoji(lineage: string | undefined): string {
  return LINEAGE_EMOJI[lineage ?? ''] ?? '❓'
}

// Badge emoji map — shared by the badges list view, the main-view summary, the
// recap "new badges" section, and the trainer card.
export const BADGE_EMOJI: Record<string, string> = {
  hatch: '🥚',
  first_evolution: '🌱',
  first_shiny: '⭐',
  champion: '🏆',
  centurion: '💯',
  constellation: '🌌',
  master_pokedex: '💎',
  dex_50: '🔬',
  dex_100: '📚',
  regional_kanto: '🏔️',
  regional_johto: '🏯',
  master_fire: '🔥',
  master_water: '💧',
  master_grass: '🌿',
  master_electric: '⚡',
  master_eevee: '🦊',
  master_chikorita: '🍃',
  master_cyndaquil: '🦔',
  master_totodile: '🐊',
}
