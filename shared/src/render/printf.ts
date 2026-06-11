// A faithful subset of bash `printf`, for the CLI view port (Phase R3c).
//
// The bash views (lib/pokemon-status.sh) lay out every line with `printf`, and
// the R3a render fixtures froze that exact output. To reproduce them byte-for-
// byte we must match bash's quirks, not Node's:
//   - field width is counted in BYTES, not code points (`%-22s` on "Étoile"
//     pads to 22 *bytes* — É is 2 bytes in UTF-8);
//   - a missing argument formats as "" (%s) or 0 (%d) rather than throwing;
//   - when more args than conversions remain, the format string is REUSED
//     (this is how `printf '─%.0s' $(seq 1 N)` draws N dashes).
//
// Supported specs: %%, %[-][0][width][.prec]s, %[-][0][width]d/i. That covers
// every conversion used by the deterministic views.

type Arg = string | number

// A valid conversion at the start of a slice (excluding %%, handled separately).
const VALID_SPEC = /^%[-+ 0]*\d*(?:\.\d+)?[sdi]/

function byteLen(s: string): number {
  return Buffer.byteLength(s, 'utf8')
}

// Truncate to at most `n` bytes without splitting a multibyte sequence.
function truncateBytes(s: string, n: number): string {
  if (byteLen(s) <= n) return s
  let out = ''
  let used = 0
  for (const ch of s) {
    const b = byteLen(ch)
    if (used + b > n) break
    out += ch
    used += b
  }
  return out
}

function formatSpec(spec: string, raw: Arg | undefined): string {
  const m = /^%([-+ 0]*)(\d*)(?:\.(\d+))?([sdi])$/.exec(spec)
  if (!m) return spec
  const flags = m[1]
  const width = m[2] ? parseInt(m[2], 10) : 0
  const prec = m[3] !== undefined ? parseInt(m[3], 10) : undefined
  const conv = m[4]
  const leftJustify = flags.includes('-')
  const zeroPad = flags.includes('0') && !leftJustify

  let s: string
  if (conv === 's') {
    s = raw === undefined || raw === null ? '' : String(raw)
    if (prec !== undefined) s = truncateBytes(s, prec)
  } else {
    const n = raw === undefined || raw === '' ? 0 : Math.trunc(Number(raw))
    s = String(Number.isNaN(n) ? 0 : n)
  }

  const len = byteLen(s)
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
  truncated: boolean
  hadConv: boolean
}

// One scan over the format. Bash stops output at the first INVALID conversion
// (a `%` not forming `%%` or a valid spec) — e.g. a lone `%` from a resolved
// `%%` re-fed into another printf. We model that with `truncated`.
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
    if (!m) return { out, ai, truncated: true, hadConv } // invalid conversion → stop
    const spec = m[0]
    out += formatSpec(spec, args[ai++])
    hadConv = true
    i += spec.length
  }
  return { out, ai, truncated: false, hadConv }
}

export function bashPrintf(fmt: string, ...args: Arg[]): string {
  let out = ''
  let ai = 0
  for (;;) {
    const r = onePass(fmt, args, ai)
    out += r.out
    ai = r.ai
    if (r.truncated) break
    // Bash reuses the format while args remain AND it has ≥1 conversion.
    if (!(ai < args.length && r.hadConv)) break
  }
  return out
}
