// stats-share config subcommands (Phase R3d-4b): status / enable / disable /
// name. Pure: (data, locale, args, anonId) → { data, output, changed }. The
// `share` engine command supplies anonId (crypto) for enable; the network
// subcommands (forget / submit) stay bash for now → the command returns null
// for them so the dispatcher falls back.
import { bashPrintf } from './render/printf.js'
import { t, type Locale } from './render/i18n.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const GOLD = '\x1b[33m'

const NAME_RE = /^[a-zA-Z0-9_-]{2,24}$/

export interface ShareInput {
  args: string[]
  data: Json
  locale: Locale
  /** anon_id for `enable --confirm` (engine generates via crypto). */
  anonId: string
}

export interface ShareOutput {
  data: Json
  output: string
  changed: boolean
}

/** Returns null for subcommands the engine doesn't own (forget/submit/unknown)
 *  → the bash dispatcher falls back. */
export function runShare(input: ShareInput): ShareOutput | null {
  const { args, locale, anonId } = input
  const data: Json = JSON.parse(JSON.stringify(input.data))
  const L = (k: string, ...a: Array<string | number>): string => t(locale, k, ...a)
  const sub = args[0] ?? ''
  const share = data.stats_share ?? {}
  const enabled = share.enabled === true
  const endpoint = share.endpoint ?? ''
  const anonCur = share.anon_id ?? ''
  const displayName = share.display_name ?? ''
  let changed = false
  const ensure = (): Json => (data.stats_share ??= {})

  let out = bashPrintf(`\n  %s%s${L('share.title')}%s\n\n`, BOLD, GOLD, RESET)

  switch (sub) {
    case 'enable':
    case 'on': {
      if (enabled) {
        out += bashPrintf(`  %s${L('share.already_enabled')}%s\n\n`, DIM, RESET)
        out += bashPrintf('  %s%s%s\n\n', DIM, `anon_id : ${anonCur}`, RESET)
        break
      }
      if (args[1] !== '--confirm') {
        out += bashPrintf(`  %s${L('share.privacy_notice')}%s\n\n`, DIM, RESET)
        out += bashPrintf(`  %s${L('share.confirm_hint')}%s\n\n`, BOLD, RESET)
        break
      }
      ensure().enabled = true
      data.stats_share.anon_id = anonId
      changed = true
      out += bashPrintf(`  %s${L('share.enabled', anonId)}%s\n\n`, GOLD, RESET)
      break
    }
    case 'disable':
    case 'off': {
      if (!enabled) {
        out += bashPrintf(`  %s${L('share.already_disabled')}%s\n\n`, DIM, RESET)
        break
      }
      ensure().enabled = false
      changed = true
      out += bashPrintf(`  %s${L('share.disabled')}%s\n\n`, DIM, RESET)
      out += bashPrintf(`  %s${L('share.disable_hint')}%s\n\n`, DIM, RESET)
      break
    }
    case 'name':
    case 'pseudo': {
      const newName = args[1] ?? ''
      if (newName === '') {
        out += displayName
          ? bashPrintf(`  %s${L('share.name_current', displayName)}%s\n\n`, GOLD, RESET)
          : bashPrintf(`  %s${L('share.name_unset')}%s\n\n`, DIM, RESET)
        out += bashPrintf(`  %s${L('share.name_usage')}%s\n\n`, DIM, RESET)
        break
      }
      if (newName === 'clear' || newName === 'remove') {
        ensure().display_name = null
        changed = true
        out += bashPrintf(`  %s${L('share.name_cleared')}%s\n\n`, DIM, RESET)
        break
      }
      if (!NAME_RE.test(newName)) {
        out += bashPrintf(`  %s${L('share.name_invalid')}%s\n\n`, DIM, RESET)
        break
      }
      ensure().display_name = newName
      changed = true
      out += bashPrintf(`  %s${L('share.name_set', newName)}%s\n\n`, GOLD, RESET)
      out += bashPrintf(`  %s${L('share.name_set_hint')}%s\n\n`, DIM, RESET)
      break
    }
    case 'status':
    case '': {
      if (enabled) {
        out += bashPrintf(`  %s${L('share.status_enabled', anonCur)}%s\n`, GOLD, RESET)
        out += displayName
          ? bashPrintf(`  %s${L('share.status_pseudo', displayName)}%s\n`, GOLD, RESET)
          : bashPrintf(`  %s${L('share.status_no_pseudo')}%s\n`, DIM, RESET)
        out += bashPrintf(`  %s${L('share.status_endpoint', endpoint)}%s\n\n`, DIM, RESET)
      } else {
        out += bashPrintf(`  %s${L('share.status_disabled')}%s\n\n`, DIM, RESET)
      }
      out += bashPrintf(`  %s${L('share.usage')}%s\n\n`, DIM, RESET)
      break
    }
    default:
      // forget / submit (network) / unknown → bash handles it.
      return null
  }

  return { data, output: out, changed }
}
