// Pure formatting helpers. No Vue, no SSR concerns — easy to unit-test.

/**
 * Format a number for display.
 * - >= 1M : '2.6M'
 * - >= 1K : '12K'
 * - else  : locale-formatted with thin spaces ('1 234')
 */
export function fmt(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n.toLocaleString('fr-FR')
}

/**
 * Format a 0-1 ratio as a percentage with 2 decimals : 0.0833 → '8.33%'
 */
export function fmtPct(n: number | undefined | null): string {
  if (n == null) return '—'
  return (n * 100).toFixed(2) + '%'
}

/**
 * Leaderboard rank prefix : 🥇🥈🥉 for top 3, ' N.' for rest.
 */
export function rankPrefix(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return rank.toString().padStart(2, ' ') + '.'
}

/**
 * Public label for a trainer entry : '<pseudo>#<shortid>' if pseudo set,
 * else the full anon_id.
 */
export function trainerLabel(entry: { display_name: string | null; anon_id: string }): string {
  return entry.display_name ? `${entry.display_name}#${entry.anon_id.slice(0, 4)}` : entry.anon_id
}
