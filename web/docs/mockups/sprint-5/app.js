// Sprint 5 mockup runtime — theme toggle + segmented control thumb
;(function () {
  const KEY = 'cp-mockup-theme'
  const root = document.documentElement

  function effective(mode) {
    if (mode === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return mode
  }

  function moveThumb(group, mode) {
    const selected = group.querySelector(`[data-theme-value="${mode}"]`)
    const thumb = group.querySelector('.theme-thumb')
    if (!selected || !thumb) return
    // selected.offsetLeft is measured from group's border-box; thumb's `left:0`
    // sits at the padding-box edge (i.e. inside the 1px border), so subtract it.
    const borderLeft = parseFloat(getComputedStyle(group).borderLeftWidth) || 0
    thumb.style.width = selected.offsetWidth + 'px'
    thumb.style.transform = `translateX(${selected.offsetLeft - borderLeft}px)`
  }

  function apply(mode) {
    root.setAttribute('data-theme', effective(mode))
    document.querySelectorAll('[data-theme-toggle]').forEach(group => {
      group.querySelectorAll('[data-theme-value]').forEach(btn => {
        btn.setAttribute('aria-pressed', btn.dataset.themeValue === mode)
      })
      moveThumb(group, mode)
    })
  }

  function init() {
    const saved = localStorage.getItem(KEY) || 'dark'

    document.querySelectorAll('[data-theme-toggle]').forEach(group => {
      group.querySelectorAll('[data-theme-value]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.themeValue
          localStorage.setItem(KEY, mode)
          apply(mode)
        })
      })
    })

    apply(saved)
    // Re-align thumbs after fonts load (width can shift)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => apply(localStorage.getItem(KEY) || 'dark'))
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (localStorage.getItem(KEY) === 'system') apply('system')
    })

    window.addEventListener('resize', () => apply(localStorage.getItem(KEY) || 'dark'))
  }

  if (document.readyState !== 'loading') init()
  else document.addEventListener('DOMContentLoaded', init)
})()
