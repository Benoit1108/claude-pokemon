// Badge metadata — synced manually with claude-pokemon CLI lib/lib.sh
// (pokemon_badge_meta) and lib/locales/{fr,en}.json.
// 15 total : 7 generic + 5 master Gen 1 + 3 master Gen 2.

export interface BadgeMeta {
  emoji: string
  label: string
  description: string
}

export const BADGE_META: Record<string, BadgeMeta> = {
  // Core progression
  hatch: {
    emoji: '🥚',
    label: 'Hatch',
    description: 'First egg hatched (Lv.0 → Lv.1)',
  },
  first_evolution: {
    emoji: '🌱',
    label: 'First evolution',
    description: 'First Lv.16+ evolution',
  },
  first_shiny: {
    emoji: '⭐',
    label: 'Shooting star',
    description: 'First shiny obtained',
  },
  champion: {
    emoji: '🏆',
    label: 'Champion',
    description: 'Reached Lv.100',
  },
  centurion: {
    emoji: '💯',
    label: 'Centurion',
    description: '100M lifetime tokens',
  },
  constellation: {
    emoji: '🌌',
    label: 'Constellation',
    description: '5 shinies in collection',
  },
  master_pokedex: {
    emoji: '💎',
    label: 'Pokédex Master',
    description: '5 lineages encountered',
  },
  // Sprint 2.11 — wild pokédex milestones
  dex_50: {
    emoji: '🔬',
    label: 'Researcher',
    description: '50 wild species observed',
  },
  dex_100: {
    emoji: '📚',
    label: 'Librarian',
    description: '100 wild species observed',
  },
  regional_kanto: {
    emoji: '🏔️',
    label: 'Kanto complete',
    description: 'All 151 Kanto species seen',
  },
  regional_johto: {
    emoji: '🏯',
    label: 'Johto complete',
    description: 'All 100 Johto species seen',
  },
  // Master per Gen 1 lineage
  master_fire: { emoji: '🔥', label: 'Fire Master', description: 'Lv.100 on Fire Lineage' },
  master_water: { emoji: '💧', label: 'Water Master', description: 'Lv.100 on Water Lineage' },
  master_grass: { emoji: '🌿', label: 'Grass Master', description: 'Lv.100 on Grass Lineage' },
  master_electric: {
    emoji: '⚡',
    label: 'Electric Master',
    description: 'Lv.100 on Electric Lineage',
  },
  master_eevee: { emoji: '🦊', label: 'Eevee Master', description: 'Lv.100 on Eevee Lineage' },
  // Master per Gen 2 (Johto) lineage
  master_chikorita: {
    emoji: '🍃',
    label: 'Chikorita Master',
    description: 'Lv.100 on Johto Grass Lineage',
  },
  master_cyndaquil: {
    emoji: '🦔',
    label: 'Cyndaquil Master',
    description: 'Lv.100 on Johto Fire Lineage',
  },
  master_totodile: {
    emoji: '🐊',
    label: 'Totodile Master',
    description: 'Lv.100 on Johto Water Lineage',
  },
}

export const TOTAL_BADGES = Object.keys(BADGE_META).length // 15

export function badgeMeta(id: string): BadgeMeta {
  return BADGE_META[id] ?? { emoji: '❓', label: id, description: 'Unknown badge' }
}
