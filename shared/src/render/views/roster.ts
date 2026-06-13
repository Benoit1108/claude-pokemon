// The box-free list views: badges, inventory, team, pc. Each reproduces the
// bash view's `printf` sequence byte-for-byte (verified against the R3a
// fixtures, ANSI-stripped).
import { bashPrintf } from '../printf.js'
import { t } from '../i18n.js'
import { RESET, BOLD, DIM, GOLD } from '../ansi.js'
import type { BadgeEntry, CompanionEntry, StageDef } from '../../state-types.js'
import { jqStr, BADGE_EMOJI, type RenderContext } from './format.js'

// ── badges ───────────────────────────────────────────────────────────────────
// Exact display order from view_badges (note: dex_50/dex_100/regional_* are NOT
// listed in the bash view, so they are intentionally omitted here too).
const BADGE_ORDER = [
  'hatch',
  'first_evolution',
  'first_shiny',
  'champion',
  'centurion',
  'constellation',
  'master_pokedex',
  'master_fire',
  'master_water',
  'master_grass',
  'master_electric',
  'master_eevee',
  'master_chikorita',
  'master_cyndaquil',
  'master_totodile',
]

export function renderBadges(ctx: RenderContext): string {
  const { state, locale } = ctx
  let out = bashPrintf(`\n  %s%s${t(locale, 'badges.title')}%s\n\n`, BOLD, GOLD, RESET)
  const badges: BadgeEntry[] = Array.isArray(state.badges) ? state.badges : []
  for (const id of BADGE_ORDER) {
    const earnedAt = badges.find((b) => b && b.id === id)?.earned_at ?? ''
    const emoji = BADGE_EMOJI[id] ?? '?'
    const label = t(locale, `badges.${id}.0`)
    const desc = t(locale, `badges.${id}.1`)
    if (earnedAt) {
      out += bashPrintf(
        '   %s  %s%-22s%s  %s%s%s\n     %s%s%s\n',
        emoji,
        BOLD,
        label,
        RESET,
        GOLD,
        String(earnedAt).slice(0, 10),
        RESET,
        DIM,
        desc,
        RESET,
      )
    } else {
      out += bashPrintf('   %s%s  %-22s%s\n     %s%s%s\n', DIM, '▢', label, RESET, DIM, desc, RESET)
    }
  }
  out += '\n'
  return out
}

// ── inventory ──────────────────────────────────────────────────────────────────
export function renderInventory(ctx: RenderContext): string {
  const { state, data, locale } = ctx
  let out = bashPrintf(`\n  %s%s${t(locale, 'inventory.title')}%s\n\n`, BOLD, GOLD, RESET)
  const items: Record<string, number> = state.items && typeof state.items === 'object' ? state.items : {}
  const entries = Object.entries(items)
  if (entries.length === 0) {
    out += bashPrintf(`  %s${t(locale, 'inventory.empty')}%s\n\n`, DIM, RESET)
  } else {
    for (const [itemId, qty] of entries) {
      const meta = data.items?.[itemId]
      const name = meta?.name ?? itemId
      const emoji = meta?.emoji ?? '?'
      const desc = meta?.desc == null ? '' : String(meta.desc)
      out += bashPrintf(
        '   %s  %s%-18s%s  %s×%d%s\n     %s%s%s\n',
        emoji,
        BOLD,
        name,
        RESET,
        DIM,
        Number(qty),
        RESET,
        DIM,
        desc,
        RESET,
      )
    }
    out += '\n'
  }
  const eeveeForm = state.eevee_form ?? ''
  if (eeveeForm) {
    const stages: StageDef[] = data.lineages?.eevee?.stages ?? []
    const formName = stages.find((s) => s && s.showdown_id === eeveeForm)?.name
    const msg = t(locale, 'inventory.eevee_form', formName)
    out += bashPrintf('  %s%s%s\n\n', DIM, msg, RESET)
  }
  return out
}

// ── roster (team / pc) ─────────────────────────────────────────────────────────
function renderRoster(ctx: RenderContext, field: 'team' | 'pc_storage', title: string): string {
  const { state, data } = ctx
  let out = bashPrintf('\n  %s%s%s%s\n\n', BOLD, GOLD, title, RESET)
  const list: CompanionEntry[] = Array.isArray(state[field]) ? (state[field] as CompanionEntry[]) : []
  if (list.length === 0) {
    out += bashPrintf(`  %s${t(ctx.locale, 'team.empty')}%s\n\n`, DIM, RESET)
    return out
  }
  let i = 0
  for (const e of list) {
    const lin = jqStr(e.lineage)
    const star = e.is_shiny === true ? `${GOLD}★${RESET} ` : ''
    const name = jqStr(e.max_stage)
    const lvl = Number(e.level)
    const label = data.lineages?.[lin]?.label ?? lin
    // Missing dates render '?' (the bash-era jq leak printed the string "null").
    const created = e.created_at ? String(e.created_at).slice(0, 10) : '?'
    const completed = e.completed_at ? String(e.completed_at).slice(0, 10) : '?'
    out += bashPrintf(
      '   %s[%d]%s  %s%-22s  %sLv.%d%s  %s%s%s  (%s%s%s → %s%s%s)\n',
      BOLD,
      i,
      RESET,
      star,
      name,
      BOLD,
      lvl,
      RESET,
      DIM,
      label,
      RESET,
      DIM,
      created,
      RESET,
      DIM,
      completed,
      RESET,
    )
    i++
  }
  out += '\n'
  return out
}

export function renderTeam(ctx: RenderContext): string {
  let out = renderRoster(ctx, 'team', t(ctx.locale, 'team.title'))
  const pcCount = Array.isArray(ctx.state.pc_storage) ? ctx.state.pc_storage.length : 0
  if (pcCount > 0) {
    // Clean hint (R3d-6): the old bash line garbled the script path via a
    // printf format-reuse quirk; now the source of truth, we point at the
    // /pokemon slash command (bash/node-agnostic, always correct).
    out += bashPrintf(`  %s%s%s\n\n`, DIM, t(ctx.locale, 'team.pc_overflow', pcCount), RESET)
  }
  return out
}

export function renderPc(ctx: RenderContext): string {
  return renderRoster(ctx, 'pc_storage', t(ctx.locale, 'pc.title'))
}
