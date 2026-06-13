// printf-style formatting for the CLI views (de-fossilized in the audit
// cleanup). The API keeps bash printf's useful conveniences — missing argument
// formats as "" / 0, the format string is REUSED while args remain (how
// `printf '─%.0s' …` draws N dashes) — but drops the bash bugs the original
// port reproduced byte-for-byte while the bash oracle still existed:
//   - field width is now counted in CHARACTERS (code points), not bytes —
//     `%-22s` aligns "Évoli" correctly instead of one short per accent;
//   - an invalid conversion (stray `%`) renders literally instead of silently
//     TRUNCATING the rest of the output (a translator typing `%` in a locale
//     string used to eat the whole message).
//
// Supported specs: %%, %[-][0][width][.prec]s, %[-][0][width]d/i.

// Optional/absent domain fields (e.g. an old save's missing level) flow in as
// `undefined`; formatSpec already renders them as '' / 0, matching jq's
// null-coalescing. The public signature accepts them so callers don't have to
// pre-coalesce (and risk diverging from the byte-exact bash output).
type Arg = string | number | undefined

// A valid conversion at the start of a slice (excluding %%, handled separately).
const VALID_SPEC = /^%[-+ 0]*\d*(?:\.\d+)?[sdi]/

function charLen(s: string): number {
  return [...s].length
}

// Truncate to at most `n` characters (code points).
function truncateChars(s: string, n: number): string {
  const chars = [...s]
  return chars.length <= n ? s : chars.slice(0, n).join('')
}

function formatSpec(spec: string, raw: Arg | undefined): string {
  const m = /^%([-+ 0]*)(\d*)(?:\.(\d+))?([sdi])$/.exec(spec)
  if (!m) return spec
  const flags = m[1] ?? '' // group 1 is `[-+ 0]*` — always matches (possibly empty)
  const width = m[2] ? parseInt(m[2], 10) : 0
  const prec = m[3] !== undefined ? parseInt(m[3], 10) : undefined
  const conv = m[4]
  const leftJustify = flags.includes('-')
  const zeroPad = flags.includes('0') && !leftJustify

  let s: string
  if (conv === 's') {
    s = raw === undefined || raw === null ? '' : String(raw)
    if (prec !== undefined) s = truncateChars(s, prec)
  } else {
    const n = raw === undefined || raw === '' ? 0 : Math.trunc(Number(raw))
    s = String(Number.isNaN(n) ? 0 : n)
  }

  const len = charLen(s)
  if (width > len) {
    const padLen = width - len
    if (leftJustify) {
      s = s + ' '.repeat(padLen)
    } else if (zeroPad && conv !== 's') {
      // Zero-pad after an optional sign: %05d of -3 → "-0003".
      if (s.startsWith('-')) s = '-' + '0'.repeat(padLen) + s.slice(1)
      else s = '0'.repeat(padLen) + s
    } else {
      s = ' '.repeat(padLen) + s
    }
  }
  return s
}

interface PassResult {
  out: string
  ai: number
  hadConv: boolean
}

function onePass(fmt: string, args: Arg[], startAi: number): PassResult {
  let out = ''
  let ai = startAi
  let hadConv = false
  let i = 0
  while (i < fmt.length) {
    const ch = fmt[i]
    if (ch !== '%') {
      out += ch
      i++
      continue
    }
    if (fmt[i + 1] === '%') {
      out += '%'
      i += 2
      continue
    }
    const m = VALID_SPEC.exec(fmt.slice(i))
    if (!m) {
      // Invalid conversion → emit the '%' literally and keep going (bash
      // aborted the whole output here; that fossil ate real messages).
      out += '%'
      i++
      continue
    }
    const spec = m[0]
    out += formatSpec(spec, args[ai++])
    hadConv = true
    i += spec.length
  }
  return { out, ai, hadConv }
}

export function bashPrintf(fmt: string, ...args: Arg[]): string {
  let out = ''
  let ai = 0
  for (;;) {
    const r = onePass(fmt, args, ai)
    out += r.out
    ai = r.ai
    // The format is reused while args remain AND it has ≥1 conversion.
    if (!(ai < args.length && r.hadConv)) break
  }
  return out
}
