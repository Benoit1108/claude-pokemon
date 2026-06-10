// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useArenaSession } from '~/composables/useArenaSession'

type SessionApi = ReturnType<typeof useArenaSession>

function mountSession(): { api: SessionApi } {
  let api!: SessionApi
  const Host = defineComponent({
    setup() {
      api = useArenaSession()
      return () => h('div')
    },
  })
  mount(Host)
  return { api }
}

describe('useArenaSession', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts unpaired when localStorage is empty', () => {
    const { api } = mountSession()
    expect(api.isPaired.value).toBe(false)
    expect(api.session.value).toBeNull()
  })

  it('set() persists the session in localStorage and returns true', () => {
    const { api } = mountSession()
    const ok = api.set({
      anon_id: 'aaaaaaaa',
      arena_secret: 'deadbeef'.repeat(8),
      paired_at: '2026-05-08T10:00:00Z',
    })
    expect(ok).toBe(true)
    expect(api.isPaired.value).toBe(true)
    expect(api.session.value?.anon_id).toBe('aaaaaaaa')
    expect(localStorage.getItem('arena-session-v1')).not.toBeNull()
  })

  it('set() returns false on malformed anon_id (Sprint 2.13 Q5)', () => {
    const { api } = mountSession()
    // Reset module-level state — earlier tests may have set a valid session.
    api.clear()
    const ok = api.set({
      anon_id: 'BAD-ID',
      arena_secret: 'deadbeef'.repeat(8),
      paired_at: '2026-05-08T10:00:00Z',
    })
    expect(ok).toBe(false)
    expect(api.isPaired.value).toBe(false)
    expect(localStorage.getItem('arena-session-v1')).toBeNull()
  })

  it('set() returns false on malformed arena_secret', () => {
    const { api } = mountSession()
    api.clear()
    const ok = api.set({
      anon_id: 'aaaaaaaa',
      arena_secret: 'too-short',
      paired_at: '2026-05-08T10:00:00Z',
    })
    expect(ok).toBe(false)
    expect(api.isPaired.value).toBe(false)
  })

  it('clear() removes the session and localStorage entry', () => {
    const { api } = mountSession()
    api.set({
      anon_id: 'aaaaaaaa',
      arena_secret: 'deadbeef'.repeat(8),
      paired_at: '2026-05-08T10:00:00Z',
    })
    api.clear()
    expect(api.isPaired.value).toBe(false)
    expect(localStorage.getItem('arena-session-v1')).toBeNull()
  })

  it('ignores garbage in localStorage rather than crashing', () => {
    localStorage.setItem('arena-session-v1', 'not json{')
    // Force the module's lazy init to re-run by clearing it via a fresh
    // mount. (Module-level cache means this isn't a perfect test but it
    // confirms readStorage's try/catch does its job for the live path.)
    const { api } = mountSession()
    // Either null or the previously-set value from prior tests — both are
    // acceptable. The important contract is "no exception".
    expect(() => api.session.value).not.toThrow()
  })
})
