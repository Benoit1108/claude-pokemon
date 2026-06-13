// The trailing iterating sections of the main view: the "recent events" feed,
// the "evolution history" box, and the "full chain" box. Split out of main.ts to
// keep each module decomposed; the output is identical to the bash port.
import { bashPrintf } from '../printf.js'
import { t } from '../i18n.js'
import { RESET, BOLD, DIM, GOLD } from '../ansi.js'
import type { EvolutionEntry, RecentEvent, WildPoolEntry } from 'claude-pokemon-shared/state-types'
import { jqStr, fmtInt, boxTop, boxBottom, type RenderContext } from './format.js'
import { evoField } from './stage.js'
import type { MainCtx } from './main.js'

export function renderRecentEvents(ctx: RenderContext, m: MainCtx): string {
  const { locale } = ctx
  const { state, data } = m
  const lang = data.language ?? 'fr'
  let out = ''
  // Recent events (no scenario exercises this; ported for completeness)
  const events: RecentEvent[] = Array.isArray(state.recent_events) ? state.recent_events : []
  if (events.length > 0) {
    out += bashPrintf(`  %s${t(locale, 'main.recent_events')}%s\n`, BOLD, RESET)
    for (const ev of events.slice(0, 3)) {
      const at = jqStr(ev.at).replace(/T/g, ' ')
      const ename = jqStr(ev.name ?? '')
      const eemoji = jqStr(ev.emoji ?? '')
      const eid = jqStr(ev.id ?? '')
      const exp = ev.xp ?? 0
      const wildName = (id: string): string => {
        const w = (data.wild_pool ?? []).find(p => p.id === id)
        return jqStr(w?.[`name_${lang}` as keyof WildPoolEntry])
      }
      const wildEmoji = (id: string): string => {
        const w = (data.wild_pool ?? []).find(p => p.id === id)
        return jqStr((w as { emoji?: unknown } | undefined)?.emoji)
      }
      switch (ev.type) {
        case 'berry':
          out += bashPrintf(
            '   🍇 %s%s %s +%s XP   %s%s%s\n',
            eemoji,
            RESET,
            ename,
            exp,
            DIM,
            at,
            RESET,
          )
          break
        case 'encounter':
          out += bashPrintf('   ✨ %s %s   %s%s%s\n', wildEmoji(eid), wildName(eid), DIM, at, RESET)
          break
        case 'battle_won':
          out += bashPrintf(
            `   ⚔️  ${t(locale, 'battle.won', wildName(eid), exp)}   %s%s%s\n`,
            DIM,
            at,
            RESET,
          )
          break
        case 'battle_lost':
          out += bashPrintf(
            `   💔 ${t(locale, 'battle.lost', wildName(eid))}   %s%s%s\n`,
            DIM,
            at,
            RESET,
          )
          break
        case 'item':
          out += bashPrintf('   🎁 %s%s %s obtenu   %s%s%s\n', eemoji, RESET, ename, DIM, at, RESET)
          break
        case 'trade':
          out += bashPrintf(
            `   🔄 ${t(locale, 'trade.title')}: %s   %s%s%s\n`,
            ename,
            DIM,
            at,
            RESET,
          )
          break
        default:
          out += bashPrintf('   • %s   %s%s%s\n', jqStr(ev.type), DIM, at, RESET)
      }
    }
    out += '\n'
  }
  return out
}

export function renderEvolutionHistory(ctx: RenderContext, m: MainCtx): string {
  const { locale } = ctx
  const { state, data, lineage } = m
  let out = ''
  // Evolution history
  const history: EvolutionEntry[] = Array.isArray(state.evolution_history)
    ? state.evolution_history
    : []
  if (history.length > 0) {
    out += boxTop(t(locale, 'main.history'), 64)
    for (const h of history) {
      // Entries can predate fields (old saves): render clean placeholders
      // instead of the bash-era "Lv.null … null" garbage.
      const lvl = h.level
      const ename = h.name ?? '?'
      const eat = h.evolved_at ? h.evolved_at.replace(/T/g, ' ') : ''
      const eshiny = h.is_shiny === true
      const eemoji = evoField(data, state, lineage, lvl ?? 'null', 'emoji')
      const star = eshiny ? `${GOLD}★${RESET} ` : ''
      out += bashPrintf(
        '  %sLv.%-3s%s  %s  %s%-22s  %s%s%s\n',
        DIM,
        lvl === undefined ? '?' : String(lvl),
        RESET,
        eemoji,
        star,
        ename,
        DIM,
        eat,
        RESET,
      )
    }
    out += '\n'
    out += boxBottom(64)
    out += '\n'
  }
  return out
}

export function renderFullChain(ctx: RenderContext, m: MainCtx): string {
  const { locale } = ctx
  const { state, lineage, lineageLabel, curStageLvl, stages, threshold } = m
  let out = ''
  out += boxTop(`${t(locale, 'main.full_chain')} — ${lineageLabel}`, 64)
  const eeveeFormId = lineage === 'eevee' ? (state.eevee_form ?? '') : ''
  for (const s of stages) {
    const imin = Number(s.min_level)
    const iname = jqStr(s.name)
    const iemoji = jqStr(s.emoji)
    const ishow = s.showdown_id
    const ithresh = threshold(imin)
    let marker: string
    let style: string
    if (eeveeFormId && imin === 30) {
      if (ishow === eeveeFormId) {
        marker = `${BOLD}►${RESET}`
        style = ''
      } else {
        marker = ' '
        style = DIM
      }
    } else if (imin < curStageLvl) {
      marker = `${BOLD}✓${RESET}`
      style = DIM
    } else if (imin === curStageLvl) {
      marker = `${BOLD}►${RESET}`
      style = ''
    } else {
      marker = ' '
      style = DIM
    }
    out += bashPrintf(
      '   %s  %sLv.%-3d%s  %s  %s%-22s%s  %s%s tokens%s\n',
      marker,
      style,
      imin,
      RESET,
      iemoji,
      style,
      iname,
      RESET,
      DIM,
      fmtInt(ithresh),
      RESET,
    )
  }
  out += boxBottom(64)
  out += '\n'
  return out
}
