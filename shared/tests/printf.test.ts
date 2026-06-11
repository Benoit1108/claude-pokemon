// bashPrintf parity with real bash `printf` (Phase R3c keystone). The expected
// values were captured from bash itself — see the commit message / R3c notes.
import { describe, it, expect } from 'vitest'
import { bashPrintf } from '../src/render/printf.js'

describe('bashPrintf — bash printf parity', () => {
  it('left-justifies %-Ns by BYTE width (accents count double)', () => {
    // "Étoile filante" = 15 bytes (É is 2) → 22-15 = 7 pad spaces.
    expect(bashPrintf('[%-22s]', 'Étoile filante')).toBe('[Étoile filante' + ' '.repeat(7) + ']')
    // "Naissance" = 9 bytes → 20-9 = 11 pad spaces.
    expect(bashPrintf('[%-20s]', 'Naissance')).toBe('[Naissance' + ' '.repeat(11) + ']')
  })

  it('zero-pads %0Nd, including the sign', () => {
    expect(bashPrintf('[%03d]', 7)).toBe('[007]')
    expect(bashPrintf('[%05d]', -3)).toBe('[-0003]')
  })

  it('treats a missing argument as empty (%s) — the bancale pc_overflow line', () => {
    // 6 conversions, 5 args → trailing %s is empty (matches the frozen fixture).
    expect(bashPrintf('%s+ %d en PC — bash %s pc — %sbash %s pc%s', '', 1, '', 'pokemon-status.sh', '')).toBe(
      '+ 1 en PC — bash  pc — pokemon-status.shbash  pc',
    )
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

  it('stops output at an invalid conversion (matches bash truncation)', () => {
    // A lone `%` from a resolved %% re-fed into another printf → `% p` is
    // invalid → bash emits text before it and stops. This is exactly the
    // stats.tired_warning quirk.
    expect(bashPrintf('A%pB%s', 'X')).toBe('A')
    expect(bashPrintf('start%z end')).toBe('start')
    expect(bashPrintf('tail%')).toBe('tail')
    expect(bashPrintf('  %s>=90% pendant %d ticks%s\n', '', 7, '')).toBe('  >=90')
  })
})
