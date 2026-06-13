// The main `/pokemon` view (boxed companion card). Reproduces the bash view's
// `printf` sequence byte-for-byte (verified against the R3a fixtures,
// ANSI-stripped). The 345-line bash port is decomposed here into private
// sub-functions that `renderMain` concatenates — the output is identical.
import { bashPrintf } from '../printf.js'
import { t } from '../i18n.js'
import { RESET, BOLD, DIM, GOLD } from '../ansi.js'
import type { PokemonState, PokemonData, BadgeEntry, StageDef } from 'claude-pokemon-shared/state-types'
import { jqStr, tPad, fmtInt, boxTop, boxBottom, BADGE_EMOJI, type RenderContext } from './format.js'
import { resolveStageDefault, eeveeFormStage, evoField, stageFieldWithFallback } from './stage.js'
import { renderRecentEvents, renderEvolutionHistory, renderFullChain } from './main-sections.js'

function progressBar(pct: number, width = 20): string {
  let filled = Math.floor((pct * width) / 100)
  if (filled > width) filled = width
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function renderRebalanceNotice(ctx: RenderContext, totalXp: number): string {
  if (totalXp < 1000) return ''
  if (ctx.state.xp_rebalance_v2_acknowledged === true) return ''
  const { locale } = ctx
  let out = '\n'
  out += boxTop(t(locale, 'main.xp_rebalance_title'), 70)
  out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line1'))
  out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line2'))
  out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line3'))
  out += bashPrintf('  %s\n', t(locale, 'main.xp_rebalance_line4'))
  out += bashPrintf('\n  %s%s%s\n', DIM, t(locale, 'main.xp_rebalance_footer'), RESET)
  out += boxBottom(70)
  out += '\n'
  return out
}

// Values computed once at the top of renderMain and shared with the sub-renderers
// so each section reproduces the exact bash output without recomputation drift.
export interface MainCtx {
  state: PokemonState
  data: PokemonData
  threshold: (lvl: number) => number
  maxLevel: number
  lineage: string
  level: number
  totalXp: number
  isShiny: boolean
  createdAt: string
  name: string
  emoji: string
  lineageLabel: string
  curStageLvl: number
  stages: StageDef[]
  nextLvl: number | null
}

function renderHeader(ctx: RenderContext, m: MainCtx): string {
  const { locale } = ctx
  let out = '\n'
  out += boxTop(t(locale, 'main.companion'), 64)

  // Sprite (when the cached file exists). bash: `printf '  %s\n' "$line"` per
  // line + a trailing newline. Absent → no block (matches the R3a fixtures).
  if (ctx.sprite && ctx.sprite.length > 0) {
    for (const line of ctx.sprite) out += `  ${line}\n`
    out += '\n'
  }

  const shinyBadge = m.isShiny ? `${GOLD}★ SHINY${RESET}  ` : ''
  out += bashPrintf(
    `  %s%s${t(locale, 'main.companion')}%s   %s%s%s%s   %s${t(locale, 'main.since', m.createdAt.slice(0, 10))}%s\n\n`,
    BOLD,
    '',
    RESET,
    shinyBadge,
    DIM,
    m.lineageLabel,
    RESET,
    DIM,
    RESET,
  )
  return out
}

function renderXpBar(ctx: RenderContext, m: MainCtx): string {
  const { locale } = ctx
  const { level, totalXp, maxLevel, curStageLvl, stages, nextLvl, name, emoji, threshold } = m
  let out = ''
  if (level >= maxLevel) {
    out += bashPrintf(
      '  %s   %s%s%s   %s%sLv.%d%s   %sLv.MAX ✦%s\n\n',
      emoji,
      name,
      RESET,
      RESET,
      '',
      BOLD,
      level,
      RESET,
      BOLD,
      RESET,
    )
  } else if (nextLvl === null) {
    const curThreshold = threshold(curStageLvl)
    const nextThreshold = threshold(maxLevel)
    const bandTotal = nextThreshold - curThreshold
    const remaining = nextThreshold - totalXp
    let pct = Math.floor(((totalXp - curThreshold) * 100) / bandTotal)
    pct = Math.max(0, Math.min(100, pct))
    out += bashPrintf('  %s   %s%s%s%s   %s%sLv.%d%s\n\n', emoji, '', BOLD, name, RESET, '', BOLD, level, RESET)
    out += bashPrintf(`  %s%s%s   %s%d%% ${t(locale, 'main.toward_max')}%s\n\n`, '', progressBar(pct), RESET, DIM, pct, RESET)
    out += bashPrintf(`  %s${tPad(locale, 'main.xp_total', 22)}%s :  %s tokens\n`, DIM, RESET, fmtInt(totalXp))
    out += bashPrintf(
      `  %s${tPad(locale, 'main.remaining', 22)}%s :  %s tokens (Lv.%d)\n\n`,
      DIM,
      RESET,
      fmtInt(remaining),
      maxLevel,
    )
  } else {
    const curThreshold = threshold(curStageLvl)
    const nextThreshold = threshold(nextLvl)
    const bandXp = totalXp - curThreshold
    const bandTotal = nextThreshold - curThreshold
    const remaining = nextThreshold - totalXp
    let pct = Math.floor((bandXp * 100) / bandTotal)
    pct = Math.max(0, Math.min(100, pct))
    const nextStage = stages.filter((s) => s.min_level > level).sort((a, b) => a.min_level - b.min_level)[0]
    const nextName = jqStr(nextStage?.name)
    const nextEmoji = jqStr(nextStage?.emoji)
    out += bashPrintf('  %s   %s%s%s%s   %s%sLv.%d%s\n\n', emoji, '', BOLD, name, RESET, '', BOLD, level, RESET)
    out += bashPrintf(
      '  %s%s%s   %s%d%% vers %s %s%s\n\n',
      '',
      progressBar(pct),
      RESET,
      DIM,
      pct,
      nextEmoji,
      nextName,
      RESET,
    )
    out += bashPrintf(`  %s${tPad(locale, 'main.xp_total', 22)}%s :  %s tokens\n`, DIM, RESET, fmtInt(totalXp))
    out += bashPrintf(
      `  %s${tPad(locale, 'main.stage_progress', 22)}%s :  %s / %s\n`,
      DIM,
      RESET,
      fmtInt(bandXp),
      fmtInt(bandTotal),
    )
    out += bashPrintf(
      `  %s${tPad(locale, 'main.remaining', 22)}%s :  %s tokens (Lv.%d)\n\n`,
      DIM,
      RESET,
      fmtInt(remaining),
      nextLvl,
    )
  }
  return out
}

function renderStatFields(ctx: RenderContext, m: MainCtx): string {
  const { locale } = ctx
  const { state, data, lineage, level } = m
  let out = ''

  // Moves
  const moves = stageFieldWithFallback(data, state, lineage, level, (s) => {
    const mv: unknown[] = Array.isArray(s.moves) ? s.moves : []
    return mv.length === 0 ? '' : mv.join(', ')
  })
  if (moves) out += bashPrintf(`  %s${tPad(locale, 'main.moves', 22)}%s :  %s\n\n`, DIM, RESET, moves)

  // Types (lang from data.json, as in bash)
  const typesStage: unknown[] = (() => {
    if (lineage === 'eevee' && level >= 30 && state.eevee_form) {
      const st = eeveeFormStage(data, state.eevee_form)
      if (st && Array.isArray(st.types)) return st.types
    }
    const st = resolveStageDefault(data, lineage, level)
    return st && Array.isArray(st.types) ? st.types : []
  })()
  if (typesStage.length > 0) {
    let line = bashPrintf(`  %s${tPad(locale, 'main.types', 22)}%s :  `, DIM, RESET)
    let first = true
    for (const ty of typesStage) {
      if (!first) line += ' '
      line += `${''}[ ${String(ty)} ]${RESET}`
      first = false
    }
    out += line + '\n\n'
  }

  // Pokédex entry
  const lang = data.language ?? 'fr'
  const pokedexEntry = stageFieldWithFallback(data, state, lineage, level, (s) => {
    const v = s[`pokedex_${lang}`]
    return v == null ? '' : String(v)
  })
  if (pokedexEntry) {
    out += bashPrintf(`  %s${tPad(locale, 'main.pokedex_entry', 22)}%s :  %s%s%s\n\n`, DIM, RESET, DIM, pokedexEntry, RESET)
  }

  // Held item
  const heldItem = state.held_item ?? ''
  if (heldItem) {
    const meta = data.items?.[heldItem]
    const heldName = meta?.name ?? heldItem
    const heldEmoji = meta?.emoji ?? '?'
    out += bashPrintf(`  %s${tPad(locale, 'main.held_item', 22)}%s :  %s %s\n\n`, DIM, RESET, heldEmoji, heldName)
  }

  // Injured banner. (The bash original had a quoting bug that printed the
  // LITERAL text "\033[91m" — fixed now that the engine is the source of
  // truth: a real bright-red escape.)
  const injured = Number(state.injured_ticks_remaining ?? 0)
  if (injured > 0) {
    out += bashPrintf(
      `  %s${t(locale, 'main.status_injured')}%s   %s(${injured} ticks remaining)%s\n\n`,
      BOLD + '\x1b[91m',
      RESET,
      DIM,
      RESET,
    )
  }

  // Friendship
  const friendship = Number(state.friendship ?? 0)
  if (friendship > 0) {
    let heart = '💗'
    if (friendship >= 100) heart = '💖'
    if (friendship >= 500) heart = '💞'
    out += bashPrintf(`  %s${tPad(locale, 'main.friendship', 22)}%s :  %s %s\n\n`, DIM, RESET, heart, friendship)
  }

  // Badges summary
  const badges: BadgeEntry[] = Array.isArray(state.badges) ? state.badges : []
  if (badges.length > 0) {
    let line = bashPrintf(`  %s${tPad(locale, 'main.badges', 22)}%s :  `, DIM, RESET)
    for (const b of badges) line += bashPrintf('%s ', BADGE_EMOJI[b.id] ?? '?')
    line += bashPrintf(' %s(%d/%d)%s\n\n', DIM, badges.length, 15, RESET)
    out += line
  }
  return out
}

function renderFooter(ctx: RenderContext): string {
  const { locale } = ctx
  let out = ''
  out += bashPrintf(
    `  %s${tPad(locale, 'common.subcommands', 22)}%s : team, pc, pokedex, stats, badges, switch, hatch, deposit, withdraw, give, take, trade, reset, --shiny\n`,
    DIM,
    RESET,
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'common.example', 22)}%s : %s/pokemon team%s\n\n`,
    DIM,
    RESET,
    DIM,
    RESET,
  )
  return out
}

// ── main ─────────────────────────────────────────────────────────────────────
export function renderMain(ctx: RenderContext): string {
  const { state, data } = ctx
  const thresholds: number[] = data.thresholds ?? []
  const threshold = (lvl: number): number => thresholds[lvl]! // lvl is always an in-bounds level index
  const maxLevel = thresholds.length - 1

  const lineage = state.lineage ?? 'fire'
  const level = Number(state.current_level)
  const totalXp = Number(state.total_xp)
  const isShiny = state.is_shiny === true
  const createdAt = jqStr(state.created_at)

  const name = evoField(data, state, lineage, level, 'name')
  const emoji = evoField(data, state, lineage, level, 'emoji')
  const lineageLabel = data.lineages?.[lineage]?.label ?? 'null'

  // Current stage min_level + next stage min_level.
  const curStage = resolveStageDefault(data, lineage, level)
  const curStageLvl = curStage ? Number(curStage.min_level) : 0
  const stages: StageDef[] = data.lineages?.[lineage]?.stages ?? []
  const nextStages = stages.filter((s) => s.min_level > level)
  const nextLvl =
    nextStages.length === 0 ? null : Math.min(...nextStages.map((s) => Number(s.min_level)))

  const m: MainCtx = {
    state,
    data,
    threshold,
    maxLevel,
    lineage,
    level,
    totalXp,
    isShiny,
    createdAt,
    name,
    emoji,
    lineageLabel,
    curStageLvl,
    stages,
    nextLvl,
  }

  let out = ''
  out += renderRebalanceNotice(ctx, totalXp)
  out += renderHeader(ctx, m)
  out += renderXpBar(ctx, m)
  out += renderStatFields(ctx, m)
  out += boxBottom(64)
  out += '\n'
  out += renderRecentEvents(ctx, m)
  out += renderEvolutionHistory(ctx, m)
  out += renderFullChain(ctx, m)
  out += renderFooter(ctx)
  return out
}
