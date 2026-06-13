// Statusline render unit tests (Phase R3d-5). The byte-exact parity vs bash is
// covered by tests/cli/statusline-bridge.bats; these guard the pure render
// functions independently (incl. colors) so a regression is caught even where
// bash isn't available.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { themeAccent, ansiColor, rainbowName, trimSprite, renderInline, renderStatusline } from '../src/statusline.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8'))

describe('theme colors', () => {
  it('themeAccent per theme', () => {
    expect(themeAccent('retro')).toBe('\x1b[38;5;46m')
    expect(themeAccent('dark')).toBe('\x1b[38;5;51m')
    expect(themeAccent('light')).toBe('\x1b[38;5;94m')
    expect(themeAccent('default')).toBe('\x1b[38;5;220m')
  })
  it('ansiColor canonical + retro collapse', () => {
    expect(ansiColor('default', 'green')).toBe('\x1b[32m')
    expect(ansiColor('default', 'gold')).toBe('\x1b[38;5;220m')
    expect(ansiColor('retro', 'red')).toBe('\x1b[38;5;34m')
    expect(ansiColor('retro', 'blue')).toBe('\x1b[38;5;28m')
    expect(ansiColor('default', 'nope')).toBe('')
  })
  it('rainbowName cycles 6 colors per char', () => {
    const out = rainbowName('AB')
    expect(out).toBe('\x1b[91mA\x1b[93mB')
  })
})

describe('trimSprite', () => {
  it('crops the bounding box + strips common leading whitespace', () => {
    const content = ['', '   \x1b[31m▀▀\x1b[0m  ', '   \x1b[31m▄▄\x1b[0m', ''].join('\n')
    expect(trimSprite(content)).toEqual(['\x1b[31m▀▀\x1b[0m  ', '\x1b[31m▄▄\x1b[0m'])
  })
})

describe('renderInline', () => {
  const base = { lineage: 'fire', current_level: 40, total_xp: 120_000_000, is_shiny: false, evolution_flash_remaining: 0 }
  it('renders name/level/gauge with stage color (no ANSI strip)', () => {
    const out = renderInline(base, data)
    expect(out).toContain('Lv.40')
    expect(out).toContain('%')
    expect(out).toMatch(/[▰▱]/)
    expect(out).toContain('\x1b[1m') // BOLD present
  })
  it('shiny prepends a gold star', () => {
    const out = renderInline({ ...base, is_shiny: true }, data)
    expect(out).toContain('★')
    expect(out.startsWith(themeAccent('default') + '★')).toBe(true)
  })
  it('Lv.MAX shows the rainbow name + ✦', () => {
    const maxLevel = (data.thresholds as number[]).length - 1
    const out = renderInline({ ...base, current_level: maxLevel }, data)
    expect(out).toContain('Lv.MAX ✦')
  })
})

describe('renderStatusline', () => {
  const noSprite = { readSprite: () => null, animFrameCount: () => 0 }
  const ctx = (over = {}) => ({
    state: { lineage: 'fire', current_level: 40, total_xp: 120_000_000, is_shiny: false, evolution_flash_remaining: 0 },
    data,
    used: '30',
    project: 'arena',
    branch: 'main',
    model: 'Sonnet',
    effort: 'medium',
    ...over,
  })
  it('appends gauge + project + branch + model + effort', () => {
    const out = renderStatusline(ctx(), noSprite)
    expect(out).toContain('arena')
    expect(out).toContain('main')
    expect(out).toContain('Sonnet')
    expect(out).toContain('◇med')
    expect(out).toContain('30%')
    expect(out).toMatch(/[█░]/)
  })
  it('omits the gauge when used is empty', () => {
    const out = renderStatusline(ctx({ used: '' }), noSprite)
    expect(out).not.toMatch(/\[[█░]+\]/)
  })
  it('high context uses the red gauge color', () => {
    const out = renderStatusline(ctx({ used: '90' }), noSprite)
    expect(out).toContain('\x1b[91m[') // BRIGHT_RED gauge
  })
})
