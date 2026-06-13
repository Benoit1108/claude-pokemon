// Stage-resolution helpers ported from lib/pokemon-status.sh, shared by the main
// view and the trainer card. The jq null semantics are load-bearing here.
import type { PokemonState, PokemonData, StageDef } from 'claude-pokemon-shared/state-types'
import { jqStr } from './format.js'

// Resolve the active stage by the default rule (highest min_level ≤ level),
// reproducing jq semantics: `min_level <= null` is always FALSE (null is the
// smallest value in jq), unlike JS where null coerces to 0.
export function resolveStageDefault(
  data: PokemonData,
  lineage: string,
  level: unknown,
): StageDef | null {
  const stages: StageDef[] = data.lineages?.[lineage]?.stages ?? []
  const n = Number(level)
  if (level === null || level === undefined || level === '' || !Number.isFinite(n)) return null
  const candidates = stages.filter(s => s.min_level <= n)
  if (candidates.length === 0) return null
  const maxLvl = Math.max(...candidates.map(s => s.min_level))
  return stages.find(s => s.min_level === maxLvl) ?? null
}

export function eeveeFormStage(data: PokemonData, form: string): StageDef | null {
  const stages: StageDef[] = data.lineages?.eevee?.stages ?? []
  return stages.find(s => s.showdown_id === form) ?? null
}

// pokemon_evo_field: Eevee Lv.30+ resolves via state.eevee_form; else default.
export function evoField(
  data: PokemonData,
  state: PokemonState,
  lineage: string,
  level: unknown,
  field: string,
): string {
  const n = Number(level)
  const valid = level !== null && level !== undefined && level !== '' && Number.isFinite(n)
  if (lineage === 'eevee' && valid && n >= 30) {
    const form = state.eevee_form
    if (form) {
      const st = eeveeFormStage(data, form)
      return jqStr(st ? st[field] : null)
    }
  }
  const st = resolveStageDefault(data, lineage, level)
  return jqStr(st ? st[field] : null)
}

// Resolve a stage field that the bash view reads "eevee-form-first, fallback to
// default if empty" (moves/types/pokedex_entry). Returns the resolved value.
export function stageFieldWithFallback(
  data: PokemonData,
  state: PokemonState,
  lineage: string,
  level: number,
  read: (stage: StageDef) => string,
): string {
  let value = ''
  if (lineage === 'eevee' && level >= 30) {
    const form = state.eevee_form
    if (form) {
      const st = eeveeFormStage(data, form)
      if (st) value = read(st)
    }
  }
  if (value === '') {
    const st = resolveStageDefault(data, lineage, level)
    if (st) value = read(st)
  }
  return value
}
