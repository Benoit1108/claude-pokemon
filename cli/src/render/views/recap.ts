// The recap view (session / today scopes). Reproduces the bash view's `printf`
// sequence byte-for-byte (verified against the R3a fixtures, ANSI-stripped).
//
// The session/today scopes depend on the wall clock (bash used `date`); we take
// nowEpoch from the context. The fixtures only exercise the deterministic
// no-active-session path (sessions:{}), which never reads the clock.
import { bashPrintf } from '../printf.js'
import { t } from '../i18n.js'
import { RESET, BOLD, DIM, GOLD } from '../ansi.js'
import type { BadgeEntry, EvolutionEntry, RecentEvent, WildPoolEntry } from 'claude-pokemon-shared/state-types'
import { jqStr, tPad, fmtInt, BADGE_EMOJI, type RenderContext } from './format.js'

export function renderRecap(ctx: RenderContext, scope = 'session'): string {
  const { state, data, locale } = ctx
  let out = bashPrintf(`\n  %s%s${t(locale, 'recap.title')}%s\n\n`, BOLD, GOLD, RESET)

  const sessions = state.sessions ?? {}
  const activeSid = (): string => {
    const entries = Object.entries(sessions)
    if (entries.length === 0) return ''
    entries.sort((a, b) => {
      const la = a[1].last_seen ?? ''
      const lb = b[1].last_seen ?? ''
      return la < lb ? -1 : la > lb ? 1 : 0
    })
    return entries[entries.length - 1]![0] // entries.length > 0 checked above
  }

  let sinceIso: string
  let label: string
  let sid = ''
  if (scope === 'today') {
    const now = ctx.nowEpoch ?? 0
    sinceIso = new Date(now * 1000).toISOString().slice(0, 10) + 'T00:00:00Z'
    label = t(locale, 'recap.scope_today')
  } else if (scope === 'session' || scope === '') {
    sid = activeSid()
    if (!sid || sid === 'null') {
      out += bashPrintf(`  %s${t(locale, 'recap.no_session')}%s\n\n`, DIM, RESET)
      return out
    }
    sinceIso = jqStr(sessions[sid]?.first_seen)
    label = t(locale, 'recap.scope_session')
  } else {
    out += bashPrintf(`  %s${t(locale, 'recap.unknown_scope', scope)}%s\n\n`, DIM, RESET)
    return out
  }

  const nowEpoch = ctx.nowEpoch ?? 0
  const sinceEpoch = Number.isFinite(Date.parse(sinceIso)) ? Math.floor(Date.parse(sinceIso) / 1000) : nowEpoch
  const durMin = Math.floor((nowEpoch - sinceEpoch) / 60)
  const durLabel = durMin < 60 ? `${durMin}min` : `${Math.floor(durMin / 60)}h${bashPrintf('%02d', durMin % 60)}`

  out += bashPrintf(`  %s${t(locale, 'recap.context', label, durLabel)}%s\n\n`, DIM, RESET)

  if (scope === 'session' || scope === '') {
    const baseline = sessions[sid]?.baseline ?? null
    if (baseline !== null) {
      const xpDelta = Number(state.total_xp) - Number(baseline.total_xp)
      const frDelta = Number(state.friendship ?? 0) - Number(baseline.friendship)
      const tokDelta = Number(state.lifetime_stats?.total_tokens) - Number(baseline.lifetime_tokens)
      const lvlNow = Number(state.current_level)
      const lvlThen = Number(baseline.current_level)
      out += bashPrintf(`  %s%s${t(locale, 'recap.deltas')}%s\n`, BOLD, GOLD, RESET)
      out += bashPrintf(`    %s${tPad(locale, 'recap.tokens_consumed', 22)}%s :  %s\n`, DIM, RESET, fmtInt(tokDelta))
      out += bashPrintf(`    %s${tPad(locale, 'recap.xp_gained', 22)}%s :  +%s\n`, DIM, RESET, fmtInt(xpDelta))
      out += bashPrintf(
        `    %s${tPad(locale, 'recap.friendship_gained', 22)}%s :  +%s\n`,
        DIM,
        RESET,
        fmtInt(frDelta),
      )
      if (lvlNow > lvlThen) {
        out += bashPrintf(
          `    %s${tPad(locale, 'recap.level_progress', 22)}%s :  Lv.%s → %sLv.%s%s\n`,
          DIM,
          RESET,
          lvlThen,
          GOLD,
          lvlNow,
          RESET,
        )
      } else if (lvlNow === 0) {
        const threshold1 = data.thresholds?.[1] ?? 1
        const pct = Math.trunc((Number(state.total_xp) / threshold1) * 100)
        out += bashPrintf(`    %s${tPad(locale, 'recap.hatch_progress', 22)}%s :  %s%% ${t(locale, 'recap.toward_lv1')}\n`, DIM, RESET, pct)
      } else {
        out += bashPrintf(`    %s${tPad(locale, 'recap.level_stable', 22)}%s :  Lv.%s\n`, DIM, RESET, lvlNow)
      }
      out += '\n'
    }
  }

  const lang = data.language ?? 'fr'
  // bash: `jq '.wild_pool[] | select(.id==$id) | .[…]'` → empty string on no
  // match (not the literal "null"); a matched-but-null field → "null".
  const wildName = (id: string): string => {
    const w = (data.wild_pool ?? []).find((p) => p.id === id)
    return w === undefined ? '' : jqStr(w[`name_${lang}` as keyof WildPoolEntry])
  }
  const wildEmoji = (id: string): string => {
    const w = (data.wild_pool ?? []).find((p) => p.id === id)
    return w === undefined ? '' : jqStr((w as { emoji?: unknown }).emoji)
  }

  // jq `select(.at >= $since)`: a MISSING timestamp is null, and `null >= "str"`
  // is false → excluded. A jqStr coercion to "null" would wrongly include it
  // ("null" >= date is true lexicographically).
  const sinceFilter = (v: unknown): boolean => typeof v === 'string' && v >= sinceIso

  const allEvents: RecentEvent[] = Array.isArray(state.recent_events) ? state.recent_events : []
  const events = allEvents.filter((e) => sinceFilter(e.at))
  if (events.length === 0) {
    out += bashPrintf(`  %s${t(locale, 'recap.no_events')}%s\n\n`, DIM, RESET)
  } else {
    out += bashPrintf(`  %s%s${t(locale, 'recap.events_title', events.length)}%s\n`, BOLD, GOLD, RESET)
    for (const ev of events) {
      const timeShort = jqStr(ev.at).slice(11, 16)
      const eid = jqStr(ev.id ?? '')
      const exp = ev.xp ?? 0
      const ename = jqStr(ev.name ?? '')
      const eemoji = jqStr(ev.emoji ?? '')
      const wlvl = ev.wild_level ?? 0
      switch (ev.type) {
        case 'berry':
          out += bashPrintf('    %s%s%s  🍇 %s%s %s +%s XP\n', DIM, timeShort, RESET, eemoji, RESET, ename, exp)
          break
        case 'encounter':
          out += bashPrintf(
            `    %s%s%s  🎯 %s%s %s ${t(ctx.locale, 'recap.ev_encountered')}\n`,
            DIM, timeShort, RESET, wildEmoji(eid), RESET, wildName(eid),
          )
          break
        case 'battle_won':
          out += bashPrintf(
            `    %s%s%s  ⚔️  %s${t(ctx.locale, 'recap.battle_won_label')}%s vs %s Lv.%s (+%s XP)\n`,
            DIM,
            timeShort,
            RESET,
            GOLD,
            RESET,
            wildName(eid),
            wlvl,
            exp,
          )
          break
        case 'battle_lost':
          out += bashPrintf(
            `    %s%s%s  💢 %s${t(ctx.locale, 'recap.battle_lost_label')}%s vs %s Lv.%s\n`,
            DIM,
            timeShort,
            RESET,
            DIM,
            RESET,
            wildName(eid),
            wlvl,
          )
          break
        case 'item':
          out += bashPrintf(
            `    %s%s%s  🎁 %s%s %s ${t(ctx.locale, 'recap.ev_obtained')}\n`,
            DIM, timeShort, RESET, eemoji, RESET, ename,
          )
          break
      }
    }
    out += '\n'
  }

  const allEvos: EvolutionEntry[] = Array.isArray(state.evolution_history) ? state.evolution_history : []
  const evos = allEvos.filter((e) => sinceFilter(e.evolved_at))
  if (evos.length > 0) {
    out += bashPrintf(`  %s%s${t(locale, 'recap.evolutions_title')}%s\n`, BOLD, GOLD, RESET)
    for (const ev of evos) {
      out += bashPrintf(
        '    %s%s%s  ✨ Lv.%s — %s%s%s\n',
        DIM,
        jqStr(ev.evolved_at).slice(11, 16),
        RESET,
        jqStr(ev.level),
        BOLD,
        jqStr(ev.name),
        RESET,
      )
    }
    out += '\n'
  }

  const allBadges: BadgeEntry[] = Array.isArray(state.badges) ? state.badges : []
  const newBadges = allBadges.filter((b) => sinceFilter(b.earned_at))
  if (newBadges.length > 0) {
    out += bashPrintf(`  %s%s${t(locale, 'recap.badges_title')}%s\n`, BOLD, GOLD, RESET)
    for (const b of newBadges) {
      out += bashPrintf(
        '    %s%s%s  %s  %s%s%s\n',
        DIM,
        jqStr(b.earned_at).slice(11, 16),
        RESET,
        BADGE_EMOJI[b.id] ?? '?',
        BOLD,
        t(locale, `badges.${b.id}.0`),
        RESET,
      )
    }
    out += '\n'
  }
  return out
}
