// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@unocss/nuxt', '@nuxtjs/color-mode', '@nuxt/eslint', '@nuxtjs/i18n'],

  // Sprint 5 — i18n. Mirrors the CLI's lib/locales/{fr,en}.json split.
  // strategy: 'no_prefix' keeps URLs language-agnostic ; the user's chosen
  // locale lives in a cookie + the <html lang="..."> attribute. Switching is
  // exposed in AppHeader via a small chip.
  i18n: {
    defaultLocale: 'fr',
    strategy: 'no_prefix',
    locales: [
      { code: 'fr', name: 'Français', file: 'fr.json' },
      { code: 'en', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'arena-i18n',
      redirectOn: 'root',
      fallbackLocale: 'fr',
    },
  },
  devtools: { enabled: true },

  // Sprint 5 — register the small global stylesheet (fonts baseline +
  // ambient body bg + reveal keyframes). Token system + utilities still
  // live in uno.config.ts.
  css: ['~/assets/css/global.css'],

  app: {
    // GameBoy-dither page transition — subtle scale + saturation/contrast
    // shift that mimics a pixelated fade between routes. CSS-only, ~250 ms,
    // 'out-in' mode so the leaving page finishes before the next enters.
    pageTransition: { name: 'gb-dither', mode: 'out-in' },
    head: {
      title: 'claude-pokemon arena',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            "Web arena for claude-pokemon — leaderboard, trainer cards, async battles between trainers raised in Claude Code's statusline.",
        },
        { name: 'theme-color', content: '#0d1117', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#fafafa', media: '(prefers-color-scheme: light)' },
        { property: 'og:title', content: 'claude-pokemon arena' },
        { property: 'og:type', content: 'website' },
      ],
      // Sprint 5 — 3-font stack (Bricolage Grotesque display / DM Sans body /
      // JetBrains Mono code). Preconnect to fonts.gstatic to shave a TLS
      // handshake off first paint ; `display=swap` so text shows in fallback
      // until the webfont arrives (no FOIT).
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  colorMode: {
    preference: 'system', // honor OS preference by default
    fallback: 'dark', // fallback when prefers-color-scheme is unavailable
    classSuffix: '', // produces class="dark" or class="light" on <html>
    storageKey: 'arena-color-mode',
  },

  // API base for the claude-pokemon Worker. Override with NUXT_PUBLIC_API_BASE
  // env var in CI / Cloudflare Pages.
  //
  // Sprint 5 — version pill + GitHub stars pill in AppHeader.
  // `version` reads `npm_package_version` (set automatically by npm during
  // any script execution). `githubStars` is populated at build time by
  // scripts/fetch-github-stars.mjs running as a `prebuild` / `predev` hook
  // and exported as `NUXT_PUBLIC_GITHUB_STARS` env var.
  runtimeConfig: {
    public: {
      apiBase: 'https://claude-pokemon-api.benoit-dev.workers.dev',
      version: process.env.npm_package_version || '0.1.0',
      githubStars: process.env.NUXT_PUBLIC_GITHUB_STARS || '0',
    },
  },
  compatibilityDate: '2026-05-06',

  // Cloudflare Pages preset. Falls back to node-server in `npm run dev`.
  nitro: {
    preset: process.env.NITRO_PRESET || 'node-server',
  },

  typescript: {
    strict: true,
  },

  // ESLint config : focus on logic + Vue rules. Formatting is delegated to
  // Prettier (single source of truth via .prettierrc.json) — stylistic disabled
  // here to avoid double-formatting conflicts.
  eslint: {
    config: {
      stylistic: false,
    },
  },

  // Flatten subdirectory prefixes — components are organized in folders for
  // human readability but used by their bare name : <LeaderboardTable />,
  // not <LeaderboardLeaderboardTable />.
  components: [{ path: '~/components', pathPrefix: false }],
})
