// SVG badge generator. Pure function — easy to unit-test by checking output
// contains expected fields and is well-formed.

import type { KVRecord } from '../types'

const LINEAGE_LABELS: Record<string, string> = {
  fire: 'Feu',
  water: 'Eau',
  grass: 'Plante',
  electric: 'Électrik',
  eevee: 'Eevee',
  chikorita: 'Plante (Johto)',
  cyndaquil: 'Feu (Johto)',
  totodile: 'Eau (Johto)',
}
const LINEAGE_EMOJI: Record<string, string> = {
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  electric: '⚡',
  eevee: '🦊',
  chikorita: '🌱',
  cyndaquil: '🦔',
  totodile: '🐊',
}
const LINEAGE_ACCENT: Record<string, string> = {
  fire: '#ef6c00',
  water: '#268fff',
  grass: '#64b437',
  electric: '#ffda00',
  eevee: '#c2a88a',
  chikorita: '#7eb858',
  cyndaquil: '#e8a32a',
  totodile: '#3d8de8',
}

export function escapeXml(s: unknown): string {
  return String(s).replace(
    /[<>&"']/g,
    c =>
      (
        ({
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&apos;',
        }) as Record<string, string>
      )[c],
  )
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

export function svgBadge(record: KVRecord): string {
  const display = record.display_name
    ? `${escapeXml(record.display_name)}#${record.anon_id.slice(0, 4)}`
    : escapeXml(record.anon_id)
  const lineage = record.stats.active.lineage || 'fire'
  const lineageLabel = LINEAGE_LABELS[lineage] || lineage
  const lineageEmoji = LINEAGE_EMOJI[lineage] || '🥚'
  const accent = LINEAGE_ACCENT[lineage] || '#ffd700'
  const lvl = record.stats.active.current_level || 0
  const lt = record.stats.lifetime
  const tokens = fmtTokens(lt.total_tokens || 0)
  const shinies = lt.total_shinies || 0
  const badges = (record.stats.badges || []).length
  const shinyMark = record.stats.active.is_shiny ? ' ✦' : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="100" role="img" aria-label="claude-pokemon stats for ${display}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect width="480" height="100" rx="10" fill="url(#bg)" stroke="${accent}" stroke-width="1" stroke-opacity="0.4"/>
  <rect x="0" y="0" width="6" height="100" rx="3" fill="url(#accent)"/>
  <text x="22" y="28" font-family="ui-monospace,Menlo,monospace" font-size="15" fill="#fff" font-weight="700">🎮 ${display}${shinyMark}</text>
  <text x="22" y="52" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="${accent}">${lineageEmoji} ${escapeXml(lineageLabel)} · Lv.${lvl}</text>
  <text x="22" y="78" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#9ba3af">⚡ ${tokens} tokens · ⭐ ${shinies} · 🏆 ${badges}/15</text>
  <text x="458" y="20" font-family="ui-monospace,Menlo,monospace" font-size="9" fill="#4a5562" text-anchor="end">claude-pokemon</text>
</svg>`
}

export function svgPlaceholder(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="100" role="img" aria-label="${escapeXml(message)}">
  <rect width="480" height="100" rx="10" fill="#0d1117" stroke="#30363d"/>
  <text x="240" y="55" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="#8b949e" text-anchor="middle">${escapeXml(message)}</text>
  <text x="458" y="20" font-family="ui-monospace,Menlo,monospace" font-size="9" fill="#4a5562" text-anchor="end">claude-pokemon</text>
</svg>`
}
