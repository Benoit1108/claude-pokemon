import { defineConfig, presetWind4 } from 'unocss'

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — Sprint 5 design pass.
//
// Iteration on the Sprint 4.9 baseline. The audit + mockup pass identified a
// few more gaps :
//   1. Typography needs a real *display* face (Bricolage Grotesque) for
//      headings + a clean body face (DM Sans). Was system + mono only.
//   2. Border radii were too tight (rounded-md = 6px) — the "Pokémon canon
//      moderne" DA reads better at 10/14/20 px.
//   3. Status colors had no `*-soft` background variants → needed for zone
//      badges + battle effectiveness pills.
//   4. Shadows were unused (audit found 8 sites total) but the new tile
//      hover-glow + glow-gold for primary CTA need them.
//   5. Easing curves : single `ease-out` 200ms was fine for fades but the
//      segmented theme thumb + tile hover want a spring curve.
//
// Composition rule unchanged : `card p-4` over `card-md`. Tokens stay
// additive — old utilities (rounded-md numeric, text-xl, etc.) still work.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  presets: [
    presetWind4({
      // .dark / .light class strategy (color-mode module sets these on <html>)
      dark: 'class',
    }),
  ],
  theme: {
    colors: {
      // Lineage accents — same on both themes (Pokémon identity colors)
      lineage: {
        fire: '#ef6c00',
        water: '#268fff',
        grass: '#64b437',
        electric: '#ffda00',
        eevee: '#c2a88a',
        chikorita: '#7eb858',
        cyndaquil: '#e8a32a',
        totodile: '#3d8de8',
      },
      // Brand accent — theme-adaptable shades
      gold: {
        DEFAULT: '#ffd700',
        soft: '#d4a017', // for light mode (better contrast on white)
        strong: '#b8860b', // hover / border on btn-primary
      },
      // Status colors with theme variants.
      status: {
        success: { DEFAULT: '#16a34a', dark: '#22c55e' },
        warning: { DEFAULT: '#d97706', dark: '#f59e0b' },
        danger: { DEFAULT: '#dc2626', dark: '#ef4444' },
        info: { DEFAULT: '#2563eb', dark: '#3b82f6' },
      },
    },
    // Sprint 5 — preset-wind4 follows Tailwind v4 theme key conventions
    // (`theme.font`, `theme.radius`, `theme.ease` etc.), NOT the Tailwind v3
    // names (`theme.fontFamily`, `theme.borderRadius`,
    // `theme.transitionTimingFunction`). Using v3 keys here silently fails :
    // `font-display`, `rounded-pill`, `ease-spring` all turn into unmatched
    // utilities and the shortcuts that reference them drop their styles —
    // visible regression: hero title pale, tile titles invisible. Source :
    // node_modules/@unocss/preset-wind4/dist/rules.mjs uses theme.font[d],
    // theme.radius[s], theme.ease[d].
    font: {
      // 3-font stack : Bricolage Grotesque (display) / DM Sans (body) /
      // JetBrains Mono (code + numbers + ids).
      display: '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif',
      body: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
      mono: '"JetBrains Mono", ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace',
      pixel: '"Press Start 2P", system-ui, monospace',
    },
    radius: {
      // Softer scale matching the mockup. Default rounded-md was 6px ;
      // bumping to 10px gives the friendly "Pokémon canon" feel. Wide
      // impact (every existing `rounded-md` / `rounded-lg` shifts) —
      // intended.
      none: '0',
      sm: '6px',
      DEFAULT: '10px',
      md: '10px',
      lg: '14px',
      xl: '20px',
      '2xl': '28px',
      full: '9999px',
    },
    ease: {
      // Smooth out — default for fades, color shifts.
      out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      // Spring — for translate / scale (theme thumb, tile hover lift).
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },
  rules: [
    // Pixelated rendering for sprite images.
    ['pixel-render', { 'image-rendering': 'pixelated' }],
    // Sprint 5 — branded glow shadow. preset-wind4 doesn't expose a
    // `theme.shadow` slot, so the named `shadow-glow-gold` lives as a rule.
    [
      'shadow-glow-gold',
      {
        'box-shadow': '0 0 0 1px rgb(212 160 23 / 0.30), 0 12px 32px -10px rgb(212 160 23 / 0.45)',
      },
    ],
    // Lineage-soft backgrounds (12-16% opacity). Static map so UnoCSS can
    // generate the rules at build time — `bg-lineage-fire/10` would force
    // a JIT pass per color which is what we want to avoid.
    [
      /^bg-lineage-(fire|water|grass|electric)-soft$/,
      ([, c]) => {
        const colors: Record<string, string> = {
          fire: 'rgb(239 108 0 / 0.12)',
          water: 'rgb(38 143 255 / 0.12)',
          grass: 'rgb(100 180 55 / 0.14)',
          electric: 'rgb(255 218 0 / 0.16)',
        }
        return { 'background-color': colors[c!] }
      },
    ],
    // Status soft backgrounds.
    [
      /^bg-status-(success|warning|danger|info)-soft$/,
      ([, c]) => {
        const colors: Record<string, string> = {
          success: 'rgb(22 163 74 / 0.12)',
          warning: 'rgb(217 119 6 / 0.12)',
          danger: 'rgb(220 38 38 / 0.12)',
          info: 'rgb(37 99 235 / 0.12)',
        }
        return { 'background-color': colors[c!] }
      },
    ],
  ],
  // Shortcuts = semantic class aliases that resolve to dark:/light: variants.
  // Use these in components for theme-adaptive styling.
  shortcuts: {
    // ── Surfaces ───────────────────────────────────────────────────────────
    'surface-bg': 'bg-zinc-50 dark:bg-[#0d1117]',
    'surface-card': 'bg-white dark:bg-[#161b22]',
    'surface-card-hover': 'hover:bg-zinc-100 dark:hover:bg-[#21262d]',
    'surface-border': 'border-zinc-200 dark:border-[#30363d]',
    /** Popovers / dropdowns / modals — sits above `surface-card`. */
    'surface-elevated': 'bg-[#f4f4f5] dark:bg-[#1c2128] shadow-lg shadow-black/20',
    /** Sticky header backdrop. Theme-aware translucent fill, used with
     * `backdrop-blur-md` for the frosted-glass effect. */
    'surface-overlay': 'bg-zinc-50/80 dark:bg-[#0d1117]/80',

    // ── Text colors ────────────────────────────────────────────────────────
    'text-primary': 'text-zinc-900 dark:text-zinc-100',
    'text-secondary': 'text-zinc-600 dark:text-zinc-400',
    'text-muted': 'text-zinc-500 dark:text-zinc-500',
    'text-tertiary': 'text-zinc-400 dark:text-zinc-500',
    'text-accent': 'text-gold-soft dark:text-gold',
    'bg-accent': 'bg-gold-soft dark:bg-gold',
    'border-accent': 'border-gold-soft dark:border-gold',
    /** Status text shortcuts. Theme-aware. */
    'text-success': 'text-status-success dark:text-status-success-dark',
    'text-warning': 'text-status-warning dark:text-status-warning-dark',
    'text-danger': 'text-status-danger dark:text-status-danger-dark',
    'text-info': 'text-status-info dark:text-status-info-dark',

    // ── Typography ─────────────────────────────────────────────────────────
    // Headings use the display face (Bricolage). Body / meta / caption stay
    // on the body face (DM Sans). Mono on JetBrains for code + numbers.
    /** Hero / landing page headline — clamp for fluid scaling. */
    'text-display':
      'font-display font-bold tracking-tight leading-[1.02] text-[clamp(2.5rem,5vw+1rem,4.5rem)] text-primary',
    /** Page title (e.g. "Pokédex", "Mon profil"). */
    'text-h1': 'font-display font-bold tracking-tight text-[2rem] leading-[1.15] text-primary',
    /** Section title within a page. */
    'text-h2':
      'font-display font-semibold text-[1.375rem] leading-[1.25] tracking-tight text-primary',
    /** Card title / subsection. */
    'text-h3': 'font-display font-semibold text-[1.0625rem] leading-[1.3] text-primary',
    /** Small uppercase label above a card section ("Battle log", "Connecté"). */
    'text-label': 'text-xs uppercase tracking-widest text-secondary font-medium',
    /** Body copy — the default reading size in cards. */
    'text-body': 'text-[0.9375rem] leading-[1.55] text-secondary',
    /** Secondary meta info (timestamps, counts). */
    'text-meta': 'text-xs text-tertiary font-medium tracking-wide',
    /** Tiny mono ancillary (anon_id slugs, status codes). */
    'text-caption': 'font-mono text-[0.6875rem] uppercase tracking-widest text-tertiary',

    // ── Card archetypes ────────────────────────────────────────────────────
    /** Default card shape. Compose with `p-X` for padding. */
    card: 'surface-card border surface-border rounded-lg',
    /** Card that reacts to hover (clickable). Lift + accent border. */
    'card-interactive':
      'card transition-default cursor-pointer hover:-translate-y-0.5 hover:border-gold-soft dark:hover:border-gold hover:shadow-md',
    /** Higher elevation, used for popovers/dropdowns. */
    'card-elevated': 'surface-elevated border surface-border rounded-lg',

    // ── Pills & chips ──────────────────────────────────────────────────────
    /** Header chrome pill (version, GitHub stars, status). */
    pill: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border surface-border surface-elevated text-xs font-medium text-secondary transition-default',
    'pill-interactive': 'pill hover:surface-card hover:text-primary cursor-pointer',
    /** Tiny inline badge (tags, status labels). */
    chip: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[0.6875rem] font-mono font-medium tracking-wide',

    // ── Buttons ────────────────────────────────────────────────────────────
    /** Primary CTA — gold accent. */
    'btn-primary':
      'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md bg-accent text-zinc-900 border border-gold-strong font-medium text-sm transition-default cursor-pointer hover:brightness-110 hover:shadow-glow-gold',
    /** Secondary outline — neutral. */
    'btn-secondary':
      'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md surface-elevated border surface-border text-primary font-medium text-sm transition-default cursor-pointer hover:surface-card hover:border-gold-soft dark:hover:border-gold',
    /** Tertiary / ghost — for less-emphasized actions. */
    'btn-ghost':
      'inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-md text-secondary font-medium text-sm transition-default cursor-pointer hover:surface-elevated hover:text-primary',

    // ── Transitions ────────────────────────────────────────────────────────
    'transition-default': 'transition duration-200 ease-out',
    'transition-spring': 'transition duration-200 ease-spring',
    'transition-slow': 'transition duration-400 ease-out',
  },
})
