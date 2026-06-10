// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Sprint 3 — exclude the vendored submodule. It's another repo's content,
  // owned + linted by claude-pokemon/. Editing it from here would create
  // divergence (the next `git submodule update --remote` would clobber).
  {
    ignores: ['vendor/**'],
  },
  // Sprint 4.9 — align ESLint with Prettier on void elements. Prettier
  // (authoritative formatter) writes `<img />` ; the eslint-plugin-vue
  // default rejects self-closing on HTML void elements, producing a fight
  // where each --fix pass undoes the other. Set void:'always' so both tools
  // agree on the Prettier style. Also relax attribute-order so :key can
  // appear after :class (cosmetic, low value).
  {
    rules: {
      'vue/html-self-closing': [
        'warn',
        {
          html: { void: 'always', normal: 'always', component: 'always' },
          svg: 'always',
          math: 'always',
        },
      ],
      'vue/attributes-order': 'off',
    },
  },
)
