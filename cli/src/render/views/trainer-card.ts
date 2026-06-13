// The trainer-card view (boxed summary). Reproduces the bash view's `printf`
// sequence byte-for-byte (verified against the R3a fixtures, ANSI-stripped).
import { bashPrintf } from '../printf.js'
import { t } from '../i18n.js'
import { RESET, BOLD, DIM, GOLD } from '../ansi.js'
import type { BadgeEntry } from 'claude-pokemon-shared/state-types'
import {
  jqStr,
  tPad,
  fmtInt,
  boxTop,
  boxBottom,
  lineageEmoji,
  BADGE_EMOJI,
  type RenderContext,
} from './format.js'
import { evoField } from './stage.js'

export function renderTrainerCard(ctx: RenderContext): string {
  const { state, data, locale } = ctx
  let out = '\n'
  out += boxTop(t(locale, 'trainer_card.title'), 64)

  const lineage = state.lineage ?? 'fire'
  const level = Number(state.current_level)
  const isShiny = state.is_shiny === true
  const createdAt = jqStr(state.created_at ?? '—')
  const ls = state.lifetime_stats ?? {}
  const share = data.stats_share ?? {}
  // jq '… // ""' → null becomes "".
  const shareEnabled = share.enabled === true
  const shareAnon = share.anon_id ?? ''
  const shareName = share.display_name ?? ''

  const lineageLabel = data.lineages?.[lineage]?.label ?? lineage
  const totalLineages = Object.keys(data.lineages ?? {}).length
  const stageName = evoField(data, state, lineage, level, 'name')
  const stageEmoji = evoField(data, state, lineage, level, 'emoji')
  const shinyMark = isShiny ? ` ${GOLD}✦${RESET}` : ''

  let label: string
  if (shareName && shareAnon) label = `${shareName}#${String(shareAnon).slice(0, 4)}`
  else if (shareAnon) label = String(shareAnon)
  else label = t(locale, 'trainer_card.unnamed')

  out += bashPrintf('\n  %s🎮 %s%s%s%s\n', BOLD, GOLD, label, RESET, shinyMark)
  out += bashPrintf(
    `  %s${t(locale, 'trainer_card.trainer_since', createdAt.slice(0, 10))}%s\n\n`,
    DIM,
    RESET,
  )

  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.companion', 22)}%s :  %s %s%s%s · Lv.%s\n`,
    DIM,
    RESET,
    stageEmoji,
    BOLD,
    stageName,
    RESET,
    level,
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.lineage', 22)}%s :  %s %s\n\n`,
    DIM,
    RESET,
    lineageEmoji(lineage),
    lineageLabel,
  )

  out += bashPrintf(`  %s%s${t(locale, 'trainer_card.stats_section')}%s\n`, BOLD, GOLD, RESET)
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.tokens', 22)}%s :  %s\n`,
    DIM,
    RESET,
    fmtInt(ls.total_tokens ?? 0),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.xp', 22)}%s :  %s\n`,
    DIM,
    RESET,
    fmtInt(state.total_xp),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.friendship', 22)}%s :  %s\n`,
    DIM,
    RESET,
    fmtInt(state.friendship ?? 0),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.shinies', 22)}%s :  %s\n`,
    DIM,
    RESET,
    Number(ls.total_shinies ?? 0),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.lineages_done', 22)}%s :  %s / %s\n`,
    DIM,
    RESET,
    Array.isArray(ls.lineages_completed) ? ls.lineages_completed.length : 0,
    totalLineages,
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.games', 22)}%s :  %s / %s\n`,
    DIM,
    RESET,
    Number(ls.games_won ?? 0),
    Number(ls.games_played ?? 0),
  )
  out += bashPrintf(
    `  %s${tPad(locale, 'trainer_card.pokedex', 22)}%s :  %s / 251\n\n`,
    DIM,
    RESET,
    Object.keys(state.pokedex_wild ?? {}).length,
  )

  const badges: BadgeEntry[] = Array.isArray(state.badges) ? state.badges : []
  if (badges.length > 0) {
    out += bashPrintf(
      `  %s%s${t(locale, 'trainer_card.badges_section', badges.length)}%s\n`,
      BOLD,
      GOLD,
      RESET,
    )
    for (const b of badges) {
      out += bashPrintf('  %s · %s\n', BADGE_EMOJI[b.id] ?? '?', t(locale, `badges.${b.id}.0`))
    }
    out += '\n'
  }

  out += bashPrintf(`  %s%s${t(locale, 'trainer_card.share_section')}%s\n`, BOLD, GOLD, RESET)
  if (shareEnabled) {
    out += bashPrintf(`  %s${t(locale, 'trainer_card.share_active', shareAnon)}%s\n`, DIM, RESET)
    if (shareName)
      out += bashPrintf(`  %s${t(locale, 'trainer_card.share_pseudo', shareName)}%s\n`, DIM, RESET)
  } else {
    out += bashPrintf(`  %s${t(locale, 'trainer_card.share_inactive')}%s\n`, DIM, RESET)
  }
  out += bashPrintf(`  %s${t(locale, 'trainer_card.arena_soon')}%s\n`, DIM, RESET)

  out += boxBottom(64)
  out += '\n'
  return out
}
