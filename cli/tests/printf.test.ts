// bashPrintf — de-fossilized in the audit cleanup. The API keeps bash printf's
// conveniences (missing arg → ''/0, format reuse) but drops the bash BUGS the
// R3c port had frozen (byte-width padding, truncate-on-invalid-conversion).
import { describe, it, expect } from 'vitest'
import { bashPrintf } from '../src/render/printf.js'

describe('bashPrintf', () => {
  it('left-justifies %-Ns by CHARACTER width (accents align correctly)', () => {
    // "Étoile filante" = 14 chars → 22-14 = 8 pad spaces. (The bash fossil
    // padded by BYTES, leaving accented names one short per accent.)
    expect(bashPrintf('[%-22s]', 'Étoile filante')).toBe('[Étoile filante' + ' '.repeat(8) + ']')
    expect(bashPrintf('[%-20s]', 'Naissance')).toBe('[Naissance' + ' '.repeat(11) + ']')
  })

  it('zero-pads %0Nd, including the sign', () => {
    expect(bashPrintf('[%03d]', 7)).toBe('[007]')
    expect(bashPrintf('[%05d]', -3)).toBe('[-0003]')
  })

  it('treats a missing argument as empty (%s) / zero (%d)', () => {
    expect(bashPrintf('a=%s b=%d', 'x')).toBe('a=x b=0')
  })

  it('reuses the format string when args remain (%.0s dash trick)', () => {
    expect(bashPrintf('─%.0s', 1, 2, 3)).toBe('───')
  })

  it('renders %% as a literal percent', () => {
    expect(bashPrintf('30%%')).toBe('30%')
  })

  it('right-justifies %Nd', () => {
    expect(bashPrintf('[%5d]', 42)).toBe('[   42]')
  })

  it('renders an invalid conversion literally instead of truncating', () => {
    // The bash fossil ABORTED output at a stray `%` — which visibly ate the
    // stats.tired_warning message ("  >=90" instead of the whole line). Now a
    // lone % is just text.
    expect(bashPrintf('A%pB%s', 'X')).toBe('A%pBX')
    expect(bashPrintf('start%z end')).toBe('start%z end')
    expect(bashPrintf('tail%')).toBe('tail%')
    expect(bashPrintf('  %s>=90% pendant %d ticks%s\n', '', 7, '')).toBe(
      '  >=90% pendant 7 ticks\n',
    )
  })
})
