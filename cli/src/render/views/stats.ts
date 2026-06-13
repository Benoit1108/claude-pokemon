// The stats view. Reproduces the bash view's `printf` sequence byte-for-byte
// (verified against the R3a fixtures, ANSI-stripped).
import { bashPrintf } from '../printf.js'
import { t } from '../i18n.js'
import { RESET, BOLD, DIM, GOLD } from '../ansi.js'
import type { XpMultipliers } from 'claude-pokemon-shared/state-types'
import { jqStr, tPad, fmtInt, type RenderContext } from './format.js'

export function renderStats(ctx: RenderContext): string {
  const { state, data, locale } = ctx
  const ls = state.lifetime_stats ?? {}
  let out = bashPrintf(`\n  %s%s${t(locale, 'stats.title')}%s\n\n`, BOLD, GOLD, RESET)

  const shinies = Number(ls.total_shinies ?? 0)
  const completed = Array.isArray(ls.lineages_completed) ? ls.lineages_completed.length : 0
  const totalLineages = Object.keys(data.lineages ?? {}).length
  const firstShiny = ls.first_shiny_at ?? '—'

  out += bashPrintf(
    `  %s${tPad(locale, 'stats.total_tokens', 22)}%s :  %s\n`,
    DIM,
    RESET,
    fmtInt(ls.total_tokens),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'stats.total_evolutions', 22)}%s :  %s\n`,
    DIM,
    RESET,
    fmtInt(ls.total_evolutions),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'stats.total_shinies', 22)}%s :  %s\n`,
    DIM,
    RESET,
    fmtInt(shinies),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'stats.max_level', 22)}%s :  Lv.%s\n`,
    DIM,
    RESET,
    jqStr(ls.max_level),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'stats.total_companions', 22)}%s :  %s\n`,
    DIM,
    RESET,
    fmtInt(ls.total_companions ?? ls.total_compagnons),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'stats.lineages_completed', 22)}%s :  %s / %s\n`,
    DIM,
    RESET,
    completed,
    totalLineages,
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'stats.first_shiny', 22)}%s :  %s\n\n`,
    DIM,
    RESET,
    String(firstShiny).slice(0, 10),
  )

  const mults: XpMultipliers | undefined = state.last_xp_multipliers
  if (mults != null) {
    out += bashPrintf(`  %s%s${t(locale, 'stats.multipliers_title')}%s\n\n`, BOLD, GOLD, RESET)
    const ctxM = mults.context
    const tm = mults.type_match
    const db = mults.daily_bonus
    const st = mults.status
    out += bashPrintf(`  %s${tPad(locale, 'stats.context', 22)}%s : ×%s\n`, DIM, RESET, ctxM)
    out += bashPrintf(`  %s${tPad(locale, 'stats.type_match', 22)}%s : ×%s\n`, DIM, RESET, tm)
    out += bashPrintf(`  %s${tPad(locale, 'stats.daily_bonus', 22)}%s : ×%s\n`, DIM, RESET, db)
    out += bashPrintf(`  %s${tPad(locale, 'stats.status', 22)}%s : ×%s\n`, DIM, RESET, st)
    const combined = (Number(ctxM) * Number(tm) * Number(db) * Number(st)).toFixed(2)
    out += bashPrintf(
      `  %s${tPad(locale, 'stats.combined', 22)}%s : %s×%s%s\n\n`,
      DIM,
      RESET,
      BOLD,
      combined,
      RESET,
    )
  }

  const status = state.status ?? 'ok'
  const streak = Number(state.high_context_streak ?? 0)
  if (status === 'tired') {
    out += bashPrintf(`  %s${t(locale, 'stats.tired_warning', streak)}%s\n\n`, BOLD, RESET)
  }
  if (shinies > 0) {
    out += bashPrintf(`  %s${t(locale, 'stats.shiny_charm')}%s\n\n`, GOLD, RESET)
  }
  return out
}
