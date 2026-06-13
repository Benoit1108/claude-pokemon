// Statusline render (Phase R3d-5). Ports lib.sh's pokemon_render_inline +
// pokemon_render_sprite_statusline + pokemon_trim_sprite + the statusline.sh
// orchestration (sprite layout, context gauge, project/branch/model/effort).
//
// This is the hot path (every prompt) and the most visible output, so colors
// are part of the contract — unlike the ANSI-stripped view tests, the parity
// here is checked WITH ansi codes (theme pinned). Theme-aware color helpers are
// ported faithfully (pokemon_theme_accent / pokemon_ansi_color /
// pokemon_rainbow_name), reading data.theme.
import { evoField } from './render/views.js'
import { progressPct, xpMultiplier } from 'claude-pokemon-shared/xp'
import type { PokemonState, PokemonData } from 'claude-pokemon-shared/state-types'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const WHITE = '\x1b[37m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const BRIGHT_RED = '\x1b[91m'
const BRIGHT_YELLOW = '\x1b[93m'
const BRIGHT_GREEN = '\x1b[92m'
const BRIGHT_MAGENTA = '\x1b[95m'

export function themeAccent(theme: string): string {
  switch (theme) {
    case 'retro':
      return '\x1b[38;5;46m'
    case 'dark':
      return '\x1b[38;5;51m'
    case 'light':
      return '\x1b[38;5;94m'
    default:
      return '\x1b[38;5;220m'
  }
}

export function ansiColor(theme: string, name: string): string {
  if (theme === 'retro') {
    switch (name) {
      case 'dim':
        return '\x1b[38;5;22m'
      case 'gold':
      case 'yellow':
      case 'green':
      case 'cyan':
      case 'white':
        return '\x1b[38;5;46m'
      case 'red':
      case 'magenta':
        return '\x1b[38;5;34m'
      case 'blue':
        return '\x1b[38;5;28m'
      default:
        return ''
    }
  }
  switch (name) {
    case 'dim':
      return '\x1b[2m'
    case 'white':
      return '\x1b[37m'
    case 'green':
      return '\x1b[32m'
    case 'yellow':
      return '\x1b[33m'
    case 'red':
      return '\x1b[31m'
    case 'blue':
      return '\x1b[34m'
    case 'magenta':
      return '\x1b[35m'
    case 'cyan':
      return '\x1b[36m'
    case 'gold':
      return themeAccent(theme)
    default:
      return ''
  }
}

export function rainbowName(name: string): string {
  const rainbows = ['\x1b[91m', '\x1b[93m', '\x1b[92m', '\x1b[96m', '\x1b[94m', '\x1b[95m']
  let out = ''
  const chars = [...name]
  chars.forEach((ch, i) => (out += rainbows[i % rainbows.length] + ch))
  return out
}

// Port of _xp_fmt (awk %.1f for the fractional K/M cases).
function xpFmt(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return v === Math.trunc(v) ? `${Math.trunc(v)}M` : `${v.toFixed(1)}M`
  }
  if (n >= 1000) {
    const v = n / 1000
    return v === Math.trunc(v) ? `${Math.trunc(v)}K` : `${v.toFixed(1)}K`
  }
  return String(n)
}

// Port of pokemon_trim_sprite — crop the sprite to its non-empty bounding box
// and strip the common leading whitespace + cursor-hide codes.
export function trimSprite(content: string): string[] {
  const lines = content.split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  const stripAnsi = (s: string): string => s.replace(/\x1b\[[?0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex
  let first = -1
  let last = -1
  let minLead = 0
  let minSet = false
  for (let i = 0; i < lines.length; i++) {
    const bare = stripAnsi(lines[i]!) // i < lines.length
    const test = bare.replace(/[ \t]+$/, '')
    if (/[^ \t]/.test(test)) {
      if (first === -1) first = i
      last = i
      const m = bare.match(/[^ \t]/)
      const lead = m ? (m.index ?? 0) : 0
      if (!minSet || lead < minLead) {
        minLead = lead
        minSet = true
      }
    }
  }
  if (first === -1) return []
  if (!minSet) minLead = 0
  const out: string[] = []
  for (let i = first; i <= last; i++) {
    let line = lines[i]!.replace(/\x1b\[[?]25[lh]/g, '') // eslint-disable-line no-control-regex -- i in [first,last] ⊂ array bounds
    let strip = minLead
    while (strip > 0 && line[0] === ' ') {
      line = line.slice(1)
      strip--
    }
    out.push(line)
  }
  return out
}

// Port of pokemon_render_inline — companion name/level/XP gauge (the line that
// is always printed).
export function renderInline(state: PokemonState, data: PokemonData): string {
  const theme = String(data.theme ?? 'default')
  const GOLD = themeAccent(theme)
  const lineage = state.lineage ?? 'fire'
  const level = Number(state.current_level)
  const totalXp = Number(state.total_xp)
  const flash = Number(state.evolution_flash_remaining ?? 0)
  const isShiny = state.is_shiny === true
  const thresholds: number[] = data.thresholds ?? []
  const maxLevel = thresholds.length - 1
  const name = evoField(data, state, lineage, level, 'name')
  const emoji = evoField(data, state, lineage, level, 'emoji')
  const color = evoField(data, state, lineage, level, 'color')

  let shinyPrefix = ''
  let shinyColor = ''
  if (isShiny) {
    shinyPrefix = `${GOLD}★${RESET} `
    shinyColor = GOLD
  }

  if (level >= maxLevel) {
    return `${shinyPrefix}${BOLD}${emoji} ${rainbowName(name)}${RESET} ${BOLD}Lv.MAX ✦${RESET}`
  }

  let colorCode = color === 'rainbow' ? ansiColor(theme, 'gold') : ansiColor(theme, color)
  if (shinyColor) colorCode = shinyColor

  let pct = progressPct(thresholds, totalXp, level)
  if (!Number.isFinite(pct)) pct = 0

  const currentThreshold = thresholds[level] ?? 0
  const maxL = thresholds.length - 1
  const nextThreshold = (level >= maxL ? thresholds[maxL] : thresholds[level + 1])! // both indices ≤ maxL, in-bounds
  let xpInLevel = totalXp - currentThreshold
  let nextLevelSize = nextThreshold - currentThreshold
  if (xpInLevel < 0) xpInLevel = 0
  if (nextLevelSize < 1) nextLevelSize = 1
  const xpLabel = xpFmt(xpInLevel)
  const nextLabel = xpFmt(nextLevelSize)

  const pctColor = pct >= 75 ? themeAccent(theme) : '\x1b[36m'

  const gaugeWidth = 10
  let filled = Math.trunc(pct / 10)
  if (filled > gaugeWidth) filled = gaugeWidth
  if (filled < 0) filled = 0
  const empty = gaugeWidth - filled
  const gaugeFilled = '▰'.repeat(filled)
  const gaugeEmpty = '▱'.repeat(empty)

  let gaugeColor = colorCode
  if (color === 'dim' && !shinyColor) gaugeColor = '\x1b[96m'

  const LEVEL_COLOR = '\x1b[2m\x1b[37m'

  if (flash > 0) {
    const sparkle = '\x1b[93m✨\x1b[0m'
    return (
      `${shinyPrefix}${colorCode}${BOLD}${emoji} ${sparkle}${name}${sparkle}${RESET} ` +
      `${LEVEL_COLOR}Lv.${level}${RESET} ${colorCode}${xpLabel}${RESET}/${DIM}${nextLabel}${RESET} ` +
      `${gaugeColor}${gaugeFilled}${DIM}${gaugeEmpty}${RESET} ${pctColor}${pct}%${RESET}`
    )
  }
  return (
    `${shinyPrefix}${colorCode}${BOLD}${emoji} ${name}${RESET} ` +
    `${LEVEL_COLOR}Lv.${level}${RESET} ${colorCode}${xpLabel}${RESET}/${DIM}${nextLabel}${RESET} ` +
    `${gaugeColor}${gaugeFilled}${DIM}${gaugeEmpty}${RESET} ${pctColor}${pct}%${RESET}`
  )
}

export interface SpriteDeps {
  /** Read POKEMON_DIR/<relPath>; null if missing. */
  readSprite: (relPath: string) => string | null
  /** Count frame_*.txt in POKEMON_DIR/<relDir>; 0 if the dir is absent. */
  animFrameCount: (relDir: string) => number
}

// Port of pokemon_render_sprite_statusline — returns the (trimmed) sprite lines.
export function renderSpriteLines(state: PokemonState, data: PokemonData, deps: SpriteDeps): string[] {
  const mode = String(data.display_sprite_in_statusline ?? 'off')
  if (!['left', 'right', 'above', 'true'].includes(mode)) return []
  const lineage = state.lineage ?? 'fire'
  const level = Number(state.current_level)
  const showdownId = evoField(data, state, lineage, level, 'showdown_id')
  const variant = state.is_shiny === true ? 'shiny' : 'normal'

  if (data.enable_animations === true) {
    const animRel = `sprites-mini-anim/${variant}/${showdownId}`
    const nFrames = deps.animFrameCount(animRel)
    if (nFrames > 0) {
      const frameIdx = Number(state.animation_frame_index ?? 0) % nFrames
      const frameRel = `${animRel}/frame_${String(frameIdx).padStart(2, '0')}.txt`
      const content = deps.readSprite(frameRel)
      if (content !== null) return trimSprite(content)
    }
  }
  const content = deps.readSprite(`sprites-mini/${variant}/${showdownId}.txt`)
  if (content === null) return []
  return trimSprite(content)
}

// Port of the trailing-trim awk in statusline.sh (sprite-left last line).
function trimLastLine(line: string): string {
  let s = line
  let changed = true
  while (changed) {
    changed = false
    const t1 = s.replace(/[ \t]+$/, '')
    if (t1 !== s) {
      s = t1
      changed = true
    }
    const t2 = s.replace(/\x1b\[0?m$/, '') // eslint-disable-line no-control-regex
    if (t2 !== s) {
      s = t2
      changed = true
    }
  }
  return s + RESET
}

const SPRITE_ANCHOR = '\x1b[2;30m·\x1b[0m'

export interface StatuslineCtx {
  state: PokemonState
  data: PokemonData
  /** Claude's context_window.used_percentage as a string, or '' if absent. */
  used: string
  project: string
  branch: string
  model: string
  effort: string
}

// Port of statusline.sh body (after the tick): sprite layout + inline + gauge +
// project/branch/model/effort. Returns the full statusline string (may be
// multi-line for sprite "above"/"left" layouts).
export function renderStatusline(ctx: StatuslineCtx, deps: SpriteDeps): string {
  const { state, data, used, project, branch, model, effort } = ctx
  const spriteLines = renderSpriteLines(state, data, deps)
  const n = spriteLines.length

  let layout = String(data.display_sprite_in_statusline ?? 'off')
  if (layout === 'left' || layout === 'right' || layout === 'true') layout = 'left'
  else if (layout === 'above') layout = 'above'
  else layout = 'off'

  let out = ''
  if (layout === 'above' && n > 0) {
    for (let i = 0; i < n; i++) out += `${spriteLines[i]}\n`
  }
  if (layout === 'left' && n > 1) {
    for (let i = 0; i < n - 1; i++) out += `${SPRITE_ANCHOR}${spriteLines[i]}\n`
  }
  if (layout === 'left' && n > 0) {
    out += `${SPRITE_ANCHOR}${trimLastLine(spriteLines[n - 1]!)}  ` // n > 0, so index n-1 exists
  }

  out += renderInline(state, data)
  out += `  ${DIM}│${RESET}`

  if (used !== '') {
    const usedInt = Math.round(Number(used))
    const gaugeTotal = 10
    let filled = Math.trunc((usedInt * gaugeTotal) / 100)
    if (filled > gaugeTotal) filled = gaugeTotal
    const empty = gaugeTotal - filled
    const gaugeColor = usedInt >= 85 ? BRIGHT_RED : usedInt >= 60 ? BRIGHT_YELLOW : BRIGHT_GREEN
    const bar = '█'.repeat(filled) + '░'.repeat(empty)
    const mult = xpMultiplier(Number(used)).toFixed(1)
    let multColor: string
    switch (mult) {
      case '2.0':
        multColor = BRIGHT_GREEN
        break
      case '1.5':
        multColor = '\x1b[32m'
        break
      case '1.0':
        multColor = DIM + WHITE
        break
      case '0.5':
        multColor = BRIGHT_RED
        break
      default:
        multColor = WHITE
    }
    out += `  ${gaugeColor}[${bar}]${RESET} ${DIM}${usedInt}%${RESET} ${multColor}×${mult}${RESET}`
  }

  if (project !== '') out += `  ${BOLD}${CYAN}${project}${RESET}`
  if (branch !== '') out += ` ${YELLOW}${branch}${RESET}`
  if (model !== '') out += `  ${BRIGHT_MAGENTA}${model}${RESET}`

  if (effort !== '') {
    let label: string
    let color: string
    switch (effort) {
      case 'low':
        label = '↓low'
        color = DIM + WHITE
        break
      case 'medium':
        label = '◇med'
        color = CYAN
        break
      case 'high':
        label = '◆high'
        color = YELLOW
        break
      case 'xhigh':
        label = '◈xhigh'
        color = BRIGHT_YELLOW
        break
      case 'max':
        label = '★max'
        color = BRIGHT_RED
        break
      default:
        label = effort
        color = WHITE
    }
    out += ` ${color}${label}${RESET}`
  }

  return out
}
