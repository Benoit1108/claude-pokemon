// Procedural battle sound effects via Web Audio API. No assets — every sound
// is synthesized from oscillators + envelopes, so the bundle stays
// dependency-free and copyright-safe.
//
// Phase 2.12 — 3-state sound theme (cycled by the 🔊 button) :
//   - 'silent'     : no sound.
//   - '8bit'       : sharp square/sawtooth blips with a snappy envelope (NES-y).
//   - 'orchestral' : softer sine/triangle voices, slower attack/release + a
//                    detuned second voice for body (mellower, fuller).
//
// Browser autoplay policy : the AudioContext stays suspended until the first
// user gesture. We resume() on theme change + every play call so the first
// user-triggered sound unlocks subsequent battle sounds automatically.

export type SoundTheme = 'silent' | '8bit' | 'orchestral'

const STORAGE_KEY = 'arena-sound-theme'
const LEGACY_KEY = 'arena-sound-enabled' // pre-2.12 boolean toggle
const CYCLE: SoundTheme[] = ['silent', '8bit', 'orchestral']

interface NoteOptions {
  frequency: number
  duration: number // seconds
  type?: OscillatorType
  /** Linear ramp from `frequency` to `to` over `duration`. */
  to?: number
  /** Peak gain (0..1). Default 0.18 — loud but not painful. */
  gain?: number
  /** Delay before this note plays, relative to "now", in seconds. */
  startAt?: number
  /** Attack time (s). 8-bit is snappy (~5 ms) ; orchestral is soft (~40 ms). */
  attack?: number
  /** Cents of detune for a doubled voice (orchestral body). 0 = single voice. */
  detune?: number
}

let _ctx: AudioContext | null = null
let _master: GainNode | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_ctx) return _ctx
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  _ctx = new Ctor()
  return _ctx
}

// Single master bus so overlapping notes (esp. orchestral's doubled voices +
// sustained chords) stay well under clipping and match the "not painful" intent.
function getMaster(ctx: AudioContext): GainNode {
  if (_master) return _master
  _master = ctx.createGain()
  _master.gain.value = 0.6
  _master.connect(ctx.destination)
  return _master
}

function voice(ctx: AudioContext, opts: NoteOptions, detuneCents: number): void {
  const startAt = ctx.currentTime + (opts.startAt ?? 0)
  const peak = opts.gain ?? 0.18
  const attack = opts.attack ?? 0.005
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = opts.type ?? 'square'
  osc.frequency.setValueAtTime(opts.frequency, startAt)
  if (detuneCents) osc.detune.setValueAtTime(detuneCents, startAt)
  if (opts.to !== undefined) {
    osc.frequency.linearRampToValueAtTime(opts.to, startAt + opts.duration)
  }
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(peak, startAt + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + opts.duration)
  osc.connect(gain).connect(getMaster(ctx))
  osc.start(startAt)
  osc.stop(startAt + opts.duration)
}

function playNote(ctx: AudioContext, opts: NoteOptions): void {
  voice(ctx, opts, 0)
  // Orchestral body : a second, slightly detuned + quieter voice.
  if (opts.detune) voice(ctx, { ...opts, gain: (opts.gain ?? 0.18) * 0.6 }, opts.detune)
}

/** Re-shape a note for the active theme : 8-bit keeps it sharp, orchestral
 * softens the waveform + envelope and adds a detuned voice for warmth. */
function shape(note: NoteOptions, theme: SoundTheme): NoteOptions {
  if (theme === 'orchestral') {
    return {
      ...note,
      type: note.type === 'sawtooth' ? 'triangle' : 'sine',
      gain: (note.gain ?? 0.18) * 0.85,
      attack: 0.04,
      duration: note.duration * 1.5,
      detune: 7,
    }
  }
  return { ...note, attack: 0.005 }
}

export function useSoundEffects() {
  // SSR-safe : per-instance ref, hydrated from localStorage on the client.
  const theme = ref<SoundTheme>('silent')
  const enabled = computed(() => theme.value !== 'silent')

  onMounted(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === '8bit' || stored === 'orchestral' || stored === 'silent') {
        theme.value = stored
      } else if (localStorage.getItem(LEGACY_KEY) === '1') {
        theme.value = '8bit' // migrate the old on/off toggle
      }
    } catch {
      theme.value = 'silent'
    }
  })

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, theme.value)
    } catch {
      /* localStorage blocked (private mode, etc.) — silently ignore */
    }
  }

  /** Cycle silent → 8-bit → orchestral → silent. */
  function cycleSound() {
    const i = CYCLE.indexOf(theme.value)
    theme.value = CYCLE[(i + 1) % CYCLE.length]!
    persist()
    if (theme.value !== 'silent') {
      const ctx = getContext()
      if (ctx && ctx.state === 'suspended') void ctx.resume()
    }
  }

  function play(notes: NoteOptions[]) {
    if (theme.value === 'silent') return
    const ctx = getContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    for (const n of notes) playNote(ctx, shape(n, theme.value))
  }

  /** Light damage / regular hit — short low-mid blip. */
  function playHit() {
    play([{ frequency: 220, to: 110, duration: 0.12, gain: 0.14 }])
  }

  /** Super-effective hit — slightly punchier, two-tone. */
  function playSuperEffective() {
    play([
      { frequency: 330, to: 220, duration: 0.1, gain: 0.16 },
      { frequency: 440, to: 220, duration: 0.14, gain: 0.16, startAt: 0.06 },
    ])
  }

  /** Critical — three-note descending arpeggio for impact. */
  function playCritical() {
    play([
      { frequency: 880, duration: 0.07, gain: 0.18 },
      { frequency: 660, duration: 0.07, gain: 0.18, startAt: 0.06 },
      { frequency: 440, duration: 0.18, gain: 0.18, startAt: 0.12, to: 110 },
    ])
  }

  /** Victory — ascending major triad C-E-G with sustain. */
  function playWin() {
    play([
      { frequency: 523.25, duration: 0.14, gain: 0.16 }, // C5
      { frequency: 659.25, duration: 0.14, gain: 0.16, startAt: 0.12 }, // E5
      { frequency: 783.99, duration: 0.32, gain: 0.18, startAt: 0.24 }, // G5
    ])
  }

  /** Defeat — downward sweep, sad. */
  function playDefeat() {
    play([{ frequency: 440, to: 110, duration: 0.6, gain: 0.16, type: 'sawtooth' }])
  }

  /** Draw — flat double tone, neutral. */
  function playDraw() {
    play([
      { frequency: 330, duration: 0.16, gain: 0.14 },
      { frequency: 330, duration: 0.16, gain: 0.14, startAt: 0.18 },
    ])
  }

  return {
    theme,
    enabled,
    cycleSound,
    playHit,
    playSuperEffective,
    playCritical,
    playWin,
    playDefeat,
    playDraw,
  }
}
