// Localized string lookup, mirroring bash `pokemon_t` (lib/lib.sh) for the view
// port (Phase R3c). Dotted key path, arrays indexed by integer segment. Not
// found → the key itself (same fallback as bash). When args are passed the
// result is run through bashPrintf (bash applies `printf "$result" "$@"`).
//
// IMPORTANT: bash often interpolates the t() result *into* a printf format
// string ($(pokemon_t …) inside the format), so a literal `%%`/`%s` in a
// message is processed by the caller's printf — callers must embed the result
// in their format in those cases, not pass it as an arg. See views.ts.
import { bashPrintf } from './printf.js'

export type Locale = Record<string, unknown>

export function localeLookup(locale: Locale, key: string): string | undefined {
  const parts = key.split('.')
  let cur: unknown = locale
  for (const p of parts) {
    if (cur == null) return undefined
    if (Array.isArray(cur)) {
      const i = Number(p)
      cur = Number.isInteger(i) ? cur[i] : undefined
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return undefined
    }
  }
  if (cur == null) return undefined
  return typeof cur === 'string' ? cur : String(cur)
}

export function t(
  locale: Locale,
  key: string,
  ...args: Array<string | number | undefined>
): string {
  // `|| key` (not `?? key`) mirrors pokemon_t's `[ -z "$result" ]`: an empty
  // string also falls back to the key.
  const result = localeLookup(locale, key) || key
  return args.length > 0 ? bashPrintf(result, ...args) : result
}
