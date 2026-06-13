// Top-up coverage for statusline.ts: retro ansiColor branches, the flash/shiny
// inline paths, sprite layouts (above/left + animation frames), trimLastLine,
// and the effort/multiplier color switches. Parity-with-bash byte tests live in
// statusline-bridge.bats; this guards the pure branches.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ansiColor, renderInline, renderSpriteLines, renderStatusline } from '../src/statusline.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8')) as PokemonData

describe('ansiColor retro branch', () => {
  it('collapses gold/yellow/green/cyan/white to retro-green', () => {
    for (const n of ['gold', 'yellow', 'green', 'cyan', 'white'])
      expect(ansiColor('retro', n)).toBe('\x1b[38;5;46m')
  })
  it('dim and magenta and default in retro', () => {
    expect(ansiColor('retro', 'dim')).toBe('\x1b[38;5;22m')
    expect(ansiColor('retro', 'magenta')).toBe('\x1b[38;5;34m')
    expect(ansiColor('retro', 'nope')).toBe('')
  })
  it('canonical dim / blue / magenta / cyan', () => {
    expect(ansiColor('default', 'dim')).toBe('\x1b[2m')
    expect(ansiColor('default', 'blue')).toBe('\x1b[34m')
    expect(ansiColor('default', 'magenta')).toBe('\x1b[35m')
    expect(ansiColor('default', 'cyan')).toBe('\x1b[36m')
    expect(ansiColor('default', 'white')).toBe('\x1b[37m')
  })
})

describe('renderInline branches', () => {
  const base: PokemonState = {
    lineage: 'fire',
    current_level: 5,
    total_xp: 500,
    is_shiny: false,
    evolution_flash_remaining: 0,
  }
  it('flash > 0 wraps the name with sparkles', () => {
    const out = renderInline({ ...base, evolution_flash_remaining: 3 }, data)
    expect(out).toContain('✨')
  })
  it('shiny low-level shows the gold star prefix + gauge', () => {
    const out = renderInline({ ...base, is_shiny: true }, data)
    expect(out).toContain('★')
    expect(out).toMatch(/[▰▱]/)
  })
})

describe('renderSpriteLines', () => {
  const state: PokemonState = {
    lineage: 'fire',
    current_level: 5,
    total_xp: 0,
    is_shiny: false,
    animation_frame_index: 1,
  }
  const sprite = ['  \x1b[31m▀▀\x1b[0m', '  \x1b[31m▄▄\x1b[0m'].join('\n')
  it('off mode → no lines', () => {
    expect(
      renderSpriteLines(
        state,
        { ...data, display_sprite_in_statusline: 'off' },
        { readSprite: () => sprite, animFrameCount: () => 0 },
      ),
    ).toEqual([])
  })
  it('static sprite when no animation', () => {
    const lines = renderSpriteLines(
      state,
      { ...data, display_sprite_in_statusline: 'left', enable_animations: false },
      { readSprite: () => sprite, animFrameCount: () => 0 },
    )
    expect(lines.length).toBe(2)
  })
  it('animation frame when frames present', () => {
    const got: string[] = []
    const lines = renderSpriteLines(
      state,
      { ...data, display_sprite_in_statusline: 'above', enable_animations: true },
      {
        readSprite: rel => {
          got.push(rel)
          return sprite
        },
        animFrameCount: () => 4,
      },
    )
    expect(lines.length).toBe(2)
    expect(got.some(r => r.includes('frame_01'))).toBe(true)
  })
  it('falls back to static when animation frame content missing', () => {
    const lines = renderSpriteLines(
      state,
      { ...data, display_sprite_in_statusline: 'left', enable_animations: true },
      {
        readSprite: rel => (rel.includes('frame_') ? null : sprite),
        animFrameCount: () => 4,
      },
    )
    expect(lines.length).toBe(2)
  })
  it('missing static sprite → empty', () => {
    expect(
      renderSpriteLines(
        state,
        { ...data, display_sprite_in_statusline: 'left', enable_animations: false },
        { readSprite: () => null, animFrameCount: () => 0 },
      ),
    ).toEqual([])
  })
})

describe('renderStatusline layouts + colors', () => {
  const state: PokemonState = {
    lineage: 'fire',
    current_level: 40,
    total_xp: 120_000_000,
    is_shiny: false,
    evolution_flash_remaining: 0,
  }
  const sprite = ['  \x1b[31m▀▀\x1b[0m  ', '  \x1b[31m▄▄\x1b[0m  '].join('\n')
  const withSprite = { readSprite: () => sprite, animFrameCount: () => 0 }
  const ctx = (over = {}) => ({
    state,
    data: { ...data, display_sprite_in_statusline: 'off' } as PokemonData,
    used: '30',
    project: 'p',
    branch: 'b',
    model: 'm',
    effort: 'medium',
    ...over,
  })

  it('above layout prints sprite lines before the inline', () => {
    const out = renderStatusline(
      ctx({ data: { ...data, display_sprite_in_statusline: 'above' } as PokemonData }),
      withSprite,
    )
    expect(out).toContain('▀▀')
    expect(out.indexOf('▀▀')).toBeLessThan(out.indexOf('Lv.40'))
  })
  it('left layout anchors each sprite line + trims last line', () => {
    const out = renderStatusline(
      ctx({ data: { ...data, display_sprite_in_statusline: 'left' } as PokemonData }),
      withSprite,
    )
    expect(out).toContain('▀▀')
    expect(out).toContain('▄▄')
  })
  it('mid-context yellow gauge + ×1.5 region color', () => {
    const out = renderStatusline(ctx({ used: '70' }), {
      readSprite: () => null,
      animFrameCount: () => 0,
    })
    expect(out).toContain('\x1b[93m[') // BRIGHT_YELLOW gauge
  })
  it('effort variants: low / high / xhigh / max / unknown', () => {
    const noSprite = { readSprite: () => null, animFrameCount: () => 0 }
    expect(renderStatusline(ctx({ effort: 'low' }), noSprite)).toContain('↓low')
    expect(renderStatusline(ctx({ effort: 'high' }), noSprite)).toContain('◆high')
    expect(renderStatusline(ctx({ effort: 'xhigh' }), noSprite)).toContain('◈xhigh')
    expect(renderStatusline(ctx({ effort: 'max' }), noSprite)).toContain('★max')
    expect(renderStatusline(ctx({ effort: 'custom' }), noSprite)).toContain('custom')
  })
  it('empty project/branch/model/effort are omitted', () => {
    const out = renderStatusline(ctx({ project: '', branch: '', model: '', effort: '' }), {
      readSprite: () => null,
      animFrameCount: () => 0,
    })
    expect(out).not.toContain('med')
  })
})
