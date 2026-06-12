// Network-view renderers (Phase R3d-4) — leaderboard + aggregate. Pure: given
// the fetched response (or an error marker) → the full ANSI output, including
// the title and the no-endpoint / fetch-failed messages. The actual HTTP fetch
// lives in the `net` engine command (cli.ts); these stay testable.
import { bashPrintf } from './printf.js'
import { t, type Locale } from './i18n.js'
import { fmtInt, tPad, lineageEmoji } from './views.js'
import { sanitizeForTerminal } from '../http.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GOLD = '\x1b[33m'

export type NetResult = { endpoint: false } | { fetchFailed: true } | { resp: Json }

// _rank_prefix: 🥇🥈🥉 for the top 3, else right-justified "N.".
function rankPrefix(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return bashPrintf('%2s.', String(rank))
}

export function renderLeaderboard(data: Json, locale: Locale, metric: string, result: NetResult): string {
  let out = bashPrintf(`\n  %s%s${t(locale, 'leaderboard.title', metric)}%s\n\n`, BOLD, GOLD, RESET)
  if ('endpoint' in result) {
    return out + bashPrintf(`  %s${t(locale, 'leaderboard.no_endpoint')}%s\n\n`, DIM, RESET)
  }
  if ('fetchFailed' in result) {
    return out + bashPrintf(`  %s${t(locale, 'leaderboard.fetch_failed')}%s\n\n`, DIM, RESET)
  }
  const resp = result.resp
  const myId = data.stats_share?.anon_id ?? ''
  out += bashPrintf(`  %s${t(locale, 'leaderboard.subtitle', resp.total_players)}%s\n\n`, DIM, RESET)
  const top: Json[] = Array.isArray(resp.top) ? resp.top : []
  top.forEach((e, i) => {
    const rank = i + 1
    // Server-controlled — strip terminal controls before printing raw.
    const id = sanitizeForTerminal(String(e.anon_id ?? ''))
    const name = sanitizeForTerminal(String(e.display_name ?? ''))
    const lin = e.lineage ?? '-'
    const lvl = e.level
    const isMe = id === myId
    const mark = isMe ? GOLD : DIM
    const star = e.is_shiny === true ? `${GOLD} ✦${RESET}` : ''
    const label = name ? `${name}#${String(id).slice(0, 4)}` : String(id)
    const lvlLabel = String(lvl) === '0' ? '🥚' : `lv.${lvl}`
    out += bashPrintf(
      '  %s  %s%-20s%s  %s%14s%s   %s%s %s %s%s%s\n',
      rankPrefix(rank),
      BOLD + mark,
      label,
      RESET,
      mark,
      fmtInt(e.value),
      RESET,
      DIM,
      lineageEmoji(lin),
      lin,
      lvlLabel,
      star,
      RESET,
    )
  })
  return out + '\n'
}

export function renderAggregate(_data: Json, locale: Locale, result: NetResult): string {
  let out = bashPrintf(`\n  %s%s${t(locale, 'aggregate.title')}%s\n\n`, BOLD, GOLD, RESET)
  if ('endpoint' in result) {
    return out + bashPrintf(`  %s${t(locale, 'leaderboard.no_endpoint')}%s\n\n`, DIM, RESET)
  }
  if ('fetchFailed' in result) {
    return out + bashPrintf(`  %s${t(locale, 'leaderboard.fetch_failed')}%s\n\n`, DIM, RESET)
  }
  const resp = result.resp
  const players = resp.total_players
  if (String(players) === '0' || players == null) {
    return out + bashPrintf(`  %s${t(locale, 'aggregate.empty')}%s\n\n`, DIM, RESET)
  }
  out += bashPrintf(`  %s${tPad(locale, 'aggregate.players', 22)}%s :  %s\n`, DIM, RESET, fmtInt(players))
  out += bashPrintf(`  %s${tPad(locale, 'aggregate.tokens', 22)}%s :  %s\n`, DIM, RESET, fmtInt(resp.total_tokens_combined))
  out += bashPrintf(`  %s${tPad(locale, 'aggregate.shinies', 22)}%s :  %s\n`, DIM, RESET, fmtInt(resp.total_shinies_observed))
  out += bashPrintf(`  %s${tPad(locale, 'aggregate.shiny_rate', 22)}%s :  %s\n\n`, DIM, RESET, resp.shiny_rate_observed ?? 0)
  out += bashPrintf(`  %s%s${t(locale, 'aggregate.distribution')}%s\n`, BOLD, GOLD, RESET)
  const dist: [string, Json][] = Object.entries(resp.active_lineage_distribution ?? {})
  dist.sort((a, b) => Number(b[1]) - Number(a[1]))
  for (const [lin, count] of dist) {
    out += bashPrintf('    %s %s%-12s%s : %d\n', lineageEmoji(lin), DIM, lin, RESET, Number(count))
  }
  return out + '\n'
}
