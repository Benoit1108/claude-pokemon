// The pokedex grid view (lineages + wild encounters). Reproduces the bash
// view's `printf`/`awk` sequence byte-for-byte (verified against the R3a
// fixtures, ANSI-stripped).
import { bashPrintf } from '../printf.js'
import { t } from '../i18n.js'
import { RESET, BOLD, DIM, GOLD } from '../ansi.js'
import type { WildPoolEntry } from '../../state-types.js'
import { jqStr, padChars, type RenderContext } from './format.js'

export function renderPokedex(ctx: RenderContext): string {
  const { state, data, locale } = ctx
  let out = bashPrintf(`\n  %s%s${t(locale, 'pokedex.title_lineages')}%s\n\n`, BOLD, GOLD, RESET)

  const dex = state.pokedex ?? {}
  for (const [lin, info] of Object.entries(data.lineages ?? {})) {
    const label = info.label as string
    const entry = dex[lin] ?? {}
    const seen = entry.seen ?? false
    const shiny = entry.shiny_seen ?? false
    const count = Number(entry.count ?? 0)
    const shinyCount = Number(entry.shiny_count ?? 0)
    if (seen === true) {
      const shinyStr = shiny === true ? `  ${GOLD}${t(locale, 'pokedex.shiny_seen')}${RESET}` : ''
      out += bashPrintf(
        '   %s✓%s  %-20s %s×%d   %s: %d%s\n',
        BOLD,
        RESET,
        label,
        DIM,
        count,
        t(locale, 'pokedex.shinies'),
        shinyCount,
        shinyStr,
      )
    } else {
      out += bashPrintf('   ▢  %s%-20s%s  %s—%s\n', DIM, label, RESET, DIM, RESET)
    }
  }

  // Wild encounters — language comes from data.json (as in the bash view).
  const wild = state.pokedex_wild ?? {}
  const wildSeen = Object.keys(wild).length
  const pool: WildPoolEntry[] = Array.isArray(data.wild_pool) ? data.wild_pool : []
  const totalWild = pool.length
  const lang = data.language ?? 'fr'

  out += bashPrintf(
    `\n  %s%s${t(locale, 'pokedex.title_wild')}%s   %s(%d / %d)%s\n\n`,
    BOLD,
    GOLD,
    RESET,
    DIM,
    wildSeen,
    totalWild,
    RESET,
  )

  const sorted = [...pool].sort((a, b) => Number(a.national_dex) - Number(b.national_dex))
  let col = 0
  for (const w of sorted) {
    const id = w.id
    const seen = Object.prototype.hasOwnProperty.call(wild, id)
    const marker = seen ? `${BOLD}✓${RESET}` : `${DIM}▢${RESET}`
    const style = seen ? '' : DIM
    const nameDisp = seen ? jqStr(w[`name_${lang}` as keyof WildPoolEntry]) : '???'
    const rarity = (w as { rarity?: unknown }).rarity ?? 'common'
    const rarityMarker = rarity === 'legendary' ? `${GOLD}★${RESET}` : ' '
    // The wild-grid name field is padded by AWK %-12s (lib/pokemon-status.sh),
    // which counts CHARACTERS in a UTF-8 locale — unlike bash printf's byte
    // %-Ns. So pre-pad by char count, then emit with a plain %s.
    out += bashPrintf(
      '  %s #%03d %s %s%s%s',
      marker,
      Number(w.national_dex),
      rarityMarker,
      style,
      padChars(nameDisp, 12),
      RESET,
    )
    col++
    if (col >= 4) {
      out += '\n'
      col = 0
    }
  }
  if (col > 0) out += '\n'
  out += '\n'
  return out
}
