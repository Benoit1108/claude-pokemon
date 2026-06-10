// Lineage → emoji / label / color mapping.
// Single source of truth on the frontend (starter accents synced with worker svg.ts).
//
// Phase 2.14 — the arena now hosts wild & traded Pokémon, not just the 8
// starter lineages. A lineage can be a starter key (`fire`), a species id
// (`psyduck`), or a traded species (`trade-psyduck`). Starters keep their
// curated branding ; everything else resolves to its canonical combat type
// (via the shared engine) and renders from the per-type palette below.

import { lineageToCombatType, type CombatType } from 'claude-pokemon-shared'
import type { Lineage } from '~/types/api'

export const LINEAGE_EMOJI: Record<string, string> = {
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  electric: '⚡',
  eevee: '🦊',
  chikorita: '🌱',
  cyndaquil: '🦔',
  totodile: '🐊',
}

export const LINEAGE_LABELS: Record<string, string> = {
  fire: 'Fire',
  water: 'Water',
  grass: 'Grass',
  electric: 'Electric',
  eevee: 'Eevee',
  chikorita: 'Grass (Johto)',
  cyndaquil: 'Fire (Johto)',
  totodile: 'Water (Johto)',
}

// Solid accent color (borders, focus rings, pinned-badge highlights). Distinct
// from the gradient — full opacity, picked to read on dark + light surfaces.
export const LINEAGE_ACCENT: Record<string, string> = {
  fire: '#ef6c00',
  water: '#268fff',
  grass: '#64b437',
  electric: '#ffda00',
  eevee: '#c2a88a',
  chikorita: '#7eb858',
  cyndaquil: '#e8a32a',
  totodile: '#3d8de8',
}

// Per canonical combat type — used for any non-starter lineage (wild / traded).
const TYPE_EMOJI: Record<CombatType, string> = {
  normal: '⭐',
  fire: '🔥',
  water: '💧',
  electric: '⚡',
  grass: '🌿',
  ice: '❄️',
  fighting: '🥊',
  poison: '☠️',
  ground: '⛰️',
  flying: '🕊️',
  psychic: '🔮',
  bug: '🐛',
  rock: '🪨',
  ghost: '👻',
  dragon: '🐉',
  dark: '🌙',
  steel: '⚙️',
  fairy: '🧚',
}

const TYPE_LABEL: Record<CombatType, string> = {
  normal: 'Normal',
  fire: 'Fire',
  water: 'Water',
  electric: 'Electric',
  grass: 'Grass',
  ice: 'Ice',
  fighting: 'Fighting',
  poison: 'Poison',
  ground: 'Ground',
  flying: 'Flying',
  psychic: 'Psychic',
  bug: 'Bug',
  rock: 'Rock',
  ghost: 'Ghost',
  dragon: 'Dragon',
  dark: 'Dark',
  steel: 'Steel',
  fairy: 'Fairy',
}

const TYPE_ACCENT: Record<CombatType, string> = {
  normal: '#9099a1',
  fire: '#ff9c54',
  water: '#4d90d5',
  electric: '#f3d23b',
  grass: '#63bb5b',
  ice: '#74cec0',
  fighting: '#ce4069',
  poison: '#ab6ac8',
  ground: '#d97746',
  flying: '#8fa8dd',
  psychic: '#f97176',
  bug: '#90c12c',
  rock: '#c7b78b',
  ghost: '#5269ac',
  dragon: '#0a6dc4',
  dark: '#595366',
  steel: '#5a8ea1',
  fairy: '#ec8fe6',
}

const FALLBACK_ACCENT = 'var(--accent, #fbbf24)'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Subtle (<15% opacity) backdrop gradient derived from a solid accent — keeps
 * the tint from fighting the surface tokens for legibility. */
function gradientFromHex(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  return `linear-gradient(135deg, rgba(${r},${g},${b},0.14) 0%, rgba(${r},${g},${b},0.06) 60%, transparent 100%)`
}

/** Resolve a lineage to its canonical combat type (starter, `psyduck`,
 * `trade-psyduck` → all handled by the shared engine ; unknown → normal). */
function typeOf(lineage: string): CombatType {
  return lineageToCombatType(lineage)
}

export function lineageEmoji(lineage: Lineage | string | null | undefined): string {
  if (!lineage) return '❓'
  return LINEAGE_EMOJI[lineage] ?? TYPE_EMOJI[typeOf(lineage)] ?? '❓'
}

/** Display label for a lineage. Starters keep their curated label ; wild /
 * traded Pokémon show their canonical type (the sprite carries the species
 * identity, so the type label adds the combat-relevant info). */
export function lineageLabel(lineage: Lineage | string | null | undefined): string {
  if (!lineage) return '—'
  return LINEAGE_LABELS[lineage] ?? TYPE_LABEL[typeOf(lineage)] ?? '—'
}

export function lineageAccent(lineage: Lineage | string | null | undefined): string {
  if (!lineage) return FALLBACK_ACCENT
  return LINEAGE_ACCENT[lineage] ?? TYPE_ACCENT[typeOf(lineage)] ?? FALLBACK_ACCENT
}

// Subtle CSS linear-gradient tinted by lineage. Used as battle / ladder
// backdrops to give each fight a flavor.
export const LINEAGE_GRADIENT: Record<string, string> = {
  fire: 'linear-gradient(135deg, rgba(239,108,0,0.14) 0%, rgba(255,140,40,0.06) 60%, transparent 100%)',
  water:
    'linear-gradient(135deg, rgba(38,143,255,0.14) 0%, rgba(80,180,255,0.06) 60%, transparent 100%)',
  grass:
    'linear-gradient(135deg, rgba(100,180,55,0.14) 0%, rgba(140,200,80,0.06) 60%, transparent 100%)',
  electric:
    'linear-gradient(135deg, rgba(255,218,0,0.14) 0%, rgba(255,200,40,0.06) 60%, transparent 100%)',
  eevee:
    'linear-gradient(135deg, rgba(194,168,138,0.14) 0%, rgba(220,190,160,0.06) 60%, transparent 100%)',
  chikorita:
    'linear-gradient(135deg, rgba(126,184,88,0.14) 0%, rgba(160,210,110,0.06) 60%, transparent 100%)',
  cyndaquil:
    'linear-gradient(135deg, rgba(232,163,42,0.14) 0%, rgba(255,180,60,0.06) 60%, transparent 100%)',
  totodile:
    'linear-gradient(135deg, rgba(61,141,232,0.14) 0%, rgba(100,180,255,0.06) 60%, transparent 100%)',
}

export function lineageGradient(lineage: Lineage | string | null | undefined): string {
  if (!lineage) return 'none'
  return LINEAGE_GRADIENT[lineage] ?? gradientFromHex(TYPE_ACCENT[typeOf(lineage)])
}
