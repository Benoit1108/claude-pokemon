// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { config, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import PokedexCard from '~/components/pokedex/PokedexCard.vue'
import type { WildPokemon } from '~/types/pokedex'

// Sprint 2.13 UA2 — PokedexCard now wraps in <NuxtLink to="/pokedex/<id>">.
// Without a Nuxt runtime we stub it globally as a passthrough <a> so every
// mount in this file picks it up (config.global.stubs applies to all).
const NuxtLinkStub = defineComponent({
  name: 'NuxtLink',
  props: { to: { type: [String, Object], default: '#' } },
  setup(props, { slots }) {
    return () => h('a', { href: typeof props.to === 'string' ? props.to : '#' }, slots.default?.())
  },
})
config.global.stubs = { ...config.global.stubs, NuxtLink: NuxtLinkStub }

const samplePikachu: WildPokemon = {
  id: 'pikachu',
  national_dex: 25,
  name_fr: 'Pikachu',
  name_en: 'Pikachu',
  type: 'Electric',
  emoji: '⚡',
  rarity: 'common',
}

const sampleMewtwo: WildPokemon = {
  id: 'mewtwo',
  national_dex: 150,
  name_fr: 'Mewtwo',
  name_en: 'Mewtwo',
  type: 'Psychic',
  emoji: '🧠',
  rarity: 'legendary',
}

const sampleTyranitar: WildPokemon = {
  id: 'tyranitar',
  national_dex: 248,
  name_fr: 'Tyranocif',
  name_en: 'Tyranitar',
  type: 'Rock',
  emoji: '🦖',
  rarity: 'rare',
}

describe('<PokedexCard />', () => {
  it('renders the FR name by default', () => {
    const wrapper = mount(PokedexCard, {
      props: { pokemon: { ...samplePikachu, name_fr: 'Pikachu', name_en: 'Pikachu-EN' } },
    })
    expect(wrapper.text()).toContain('Pikachu')
    expect(wrapper.text()).not.toContain('Pikachu-EN')
  })

  it('renders the EN name when lang="en"', () => {
    const wrapper = mount(PokedexCard, {
      props: {
        pokemon: { ...samplePikachu, name_fr: 'Pikachu-FR', name_en: 'PikachuEN' },
        lang: 'en',
      },
    })
    expect(wrapper.text()).toContain('PikachuEN')
    expect(wrapper.text()).not.toContain('Pikachu-FR')
  })

  it('renders padded national_dex (#001 ... #251)', () => {
    expect(
      mount(PokedexCard, { props: { pokemon: { ...samplePikachu, national_dex: 1 } } }).text(),
    ).toContain('#001')
    expect(
      mount(PokedexCard, { props: { pokemon: { ...samplePikachu, national_dex: 25 } } }).text(),
    ).toContain('#025')
    expect(
      mount(PokedexCard, { props: { pokemon: { ...samplePikachu, national_dex: 251 } } }).text(),
    ).toContain('#251')
  })

  it('renders the type label', () => {
    const wrapper = mount(PokedexCard, { props: { pokemon: samplePikachu } })
    expect(wrapper.text()).toContain('Electric')
  })

  it('does NOT render rarity label for common', () => {
    const wrapper = mount(PokedexCard, { props: { pokemon: samplePikachu } })
    expect(wrapper.text()).not.toContain('legendary')
    expect(wrapper.text()).not.toContain('rare')
  })

  it('renders ★ legendary for legendary Pokémon', () => {
    const wrapper = mount(PokedexCard, { props: { pokemon: sampleMewtwo } })
    expect(wrapper.text()).toContain('★ legendary')
  })

  it('renders ◆ rare for rare Pokémon', () => {
    const wrapper = mount(PokedexCard, { props: { pokemon: sampleTyranitar } })
    expect(wrapper.text()).toContain('◆ rare')
  })

  it('hot-links the Pokémon Showdown sprite for the species id', () => {
    const wrapper = mount(PokedexCard, { props: { pokemon: samplePikachu } })
    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://play.pokemonshowdown.com/sprites/gen5/pikachu.png')
    expect(img.attributes('alt')).toBe('Pikachu')
  })

  it('keeps the emoji as a fallback when the sprite fails to load', async () => {
    const wrapper = mount(PokedexCard, { props: { pokemon: samplePikachu } })
    await wrapper.find('img').trigger('error')
    expect(wrapper.text()).toContain('⚡')
  })
})
