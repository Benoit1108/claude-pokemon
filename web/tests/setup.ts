// Global vitest setup. Installs vue-i18n on every mount so any component
// that calls `useI18n()` (auto-imported in dev) resolves correctly under
// happy-dom. Tests assert against the EN locale by default since the
// existing assertions were written before i18n was introduced and contain
// English strings (e.g. "No trainer has shared their stats yet", "wins!").
//
// Locale messages are loaded straight from `i18n/locales/{fr,en}.json` so
// translations stay in sync with what the app actually renders — no stub
// or fixture to maintain.

import { config } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import fr from '../i18n/locales/fr.json'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, fr },
  // Silence the "Not found 'X' key" warnings during tests — the assertions
  // are what catches missing strings.
  missingWarn: false,
  fallbackWarn: false,
})

config.global.plugins = [...(config.global.plugins ?? []), i18n]
