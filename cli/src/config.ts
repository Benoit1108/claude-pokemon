// Trainer-profile config commands (Phase R3d-4b): quote / bio / pins. These
// mutate data.json (stats_share.{quote,bio,pinned_badges}) with validation and
// render a confirmation. Pure: (data, state, locale, args) → { data, output }.
// The engine `config` command calls this; bash persists the returned data.
//
// Decomposition note: one cohesive module per concern (config vs collection vs
// tick vs render) so a future refactor can touch one without the others.
import { bashPrintf } from './render/printf.js'
import { t, type Locale } from './render/i18n.js'
import { RESET, BOLD, DIM, GOLD } from './render/ansi.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const charLen = (s: string): number => [...s].length

export interface ConfigInput {
  cmd: 'quote' | 'bio' | 'pins'
  args: string[]
  data: PokemonData
  state: PokemonState
  locale: Locale
}

export interface ConfigOutput {
  data: PokemonData
  output: string
  /** True only when data was mutated — bash rewrites data.json only then (show
   *  actions must not reformat the file). */
  changed: boolean
}

function ensureShare(data: PokemonData): void {
  data.stats_share ??= {}
}

function isClear(action: string): boolean {
  return action === 'clear' || action === 'remove' || action === 'reset'
}

export function runConfig(input: ConfigInput): ConfigOutput {
  const { cmd, args, locale } = input
  const data: PokemonData = JSON.parse(JSON.stringify(input.data))
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const action = args[0] ?? ''
  let changed = false
  const mutate = (fn: (share: NonNullable<PokemonData['stats_share']>) => void): void => {
    ensureShare(data)
    fn(data.stats_share!)
    changed = true
  }

  if (cmd === 'quote') {
    let out = bashPrintf(`\n  %s%s${L('quote.title')}%s\n\n`, BOLD, GOLD, RESET)
    const current = data.stats_share?.quote ?? ''
    if (action === '') {
      out += current
        ? bashPrintf('  %s"%s"%s\n\n', GOLD, current, RESET)
        : bashPrintf(`  %s${L('quote.unset')}%s\n\n`, DIM, RESET)
      out += bashPrintf(`  %s${L('quote.usage')}%s\n\n`, DIM, RESET)
    } else if (isClear(action)) {
      mutate((share) => { share.quote = null })
      out += bashPrintf(`  %s${L('quote.cleared')}%s\n\n`, DIM, RESET)
    } else {
      const text = args.join(' ')
      const len = charLen(text)
      if (len > 80) out += bashPrintf(`  %s${L('quote.too_long', len)}%s\n\n`, DIM, RESET)
      else if (/[\r\n]/.test(text)) out += bashPrintf(`  %s${L('quote.no_newline')}%s\n\n`, DIM, RESET)
      else {
        mutate((share) => { share.quote = text })
        out += bashPrintf(`  %s${L('quote.set', text)}%s\n\n`, GOLD, RESET)
        out += bashPrintf(`  %s${L('quote.set_hint')}%s\n\n`, DIM, RESET)
      }
    }
    return { data, output: out, changed }
  }

  if (cmd === 'bio') {
    let out = bashPrintf(`\n  %s%s${L('bio.title')}%s\n\n`, BOLD, GOLD, RESET)
    const current: string = data.stats_share?.bio ?? ''
    if (action === '') {
      if (current) {
        for (const line of current.split('\n')) out += bashPrintf('  %s%s%s\n', GOLD, line, RESET)
        out += '\n'
      } else {
        out += bashPrintf(`  %s${L('bio.unset')}%s\n\n`, DIM, RESET)
      }
      out += bashPrintf(`  %s${L('bio.usage')}%s\n\n`, DIM, RESET)
    } else if (isClear(action)) {
      mutate((share) => { share.bio = null })
      out += bashPrintf(`  %s${L('bio.cleared')}%s\n\n`, DIM, RESET)
    } else {
      const text = args.join('\n')
      const len = charLen(text)
      const lines = text.split('\n').length
      if (len > 160) out += bashPrintf(`  %s${L('bio.too_long', len)}%s\n\n`, DIM, RESET)
      else if (lines > 4) out += bashPrintf(`  %s${L('bio.too_many_lines', lines)}%s\n\n`, DIM, RESET)
      else {
        mutate((share) => { share.bio = text })
        out += bashPrintf(`  %s${L('bio.set')}%s\n\n`, GOLD, RESET)
        out += bashPrintf(`  %s${L('bio.set_hint')}%s\n\n`, DIM, RESET)
      }
    }
    return { data, output: out, changed }
  }

  // pins
  let out = bashPrintf(`\n  %s%s${L('pins.title')}%s\n\n`, BOLD, GOLD, RESET)
  const owned: string[] = Array.isArray(input.state.badges) ? input.state.badges.map((b) => b.id) : []
  const current: string[] = (data.stats_share?.pinned_badges as string[] | undefined) ?? []
  if (action === '') {
    if (current.length > 0) {
      for (const pin of current) out += bashPrintf('  %s★ %s%s\n', GOLD, pin, RESET)
      out += '\n'
    } else {
      out += bashPrintf(`  %s${L('pins.unset')}%s\n\n`, DIM, RESET)
    }
    out += bashPrintf(`  %s${L('pins.usage')}%s\n`, DIM, RESET)
    out += bashPrintf(`  %s${L('pins.owned')}%s %s\n\n`, DIM, RESET, owned.join(', '))
  } else if (isClear(action)) {
    mutate((share) => { share.pinned_badges = [] })
    out += bashPrintf(`  %s${L('pins.cleared')}%s\n\n`, DIM, RESET)
  } else if (action === 'set') {
    const pins = args
      .slice(1)
      .join(' ')
      .replace(/,/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    if (pins.length === 0) out += bashPrintf(`  %s${L('pins.empty')}%s\n\n`, DIM, RESET)
    else if (pins.length > 3) out += bashPrintf(`  %s${L('pins.too_many', pins.length)}%s\n\n`, DIM, RESET)
    else {
      const bad = pins.find((p) => !owned.includes(p))
      if (bad !== undefined) out += bashPrintf(`  %s${L('pins.not_owned', bad)}%s\n\n`, DIM, RESET)
      else {
        mutate((share) => { share.pinned_badges = pins })
        out += bashPrintf(`  %s${L('pins.set')}%s\n\n`, GOLD, RESET)
        out += bashPrintf(`  %s${L('pins.set_hint')}%s\n\n`, DIM, RESET)
      }
    }
  } else {
    out += bashPrintf(`  %s${L('pins.usage')}%s\n\n`, DIM, RESET)
  }
  return { data, output: out, changed }
}
