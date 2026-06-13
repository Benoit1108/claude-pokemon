// game (devine le Pokémon) — quiz command + its helpers, ported byte-identical
// from the bash view_game.
import { bashPrintf } from '../render/printf.js'
import { t, type Locale } from '../render/i18n.js'
import { tPad } from '../render/views/index.js'
import { RESET, BOLD, DIM, GOLD } from '../render/ansi.js'
import type { PokemonData } from 'claude-pokemon-shared/state-types'

import {
  type CommandInput,
  type CommandResult,
  type Translator,
  makeTranslator,
  cloneState,
  wildName,
} from './shared.js'

// Strip diacritics (approximates bash `iconv -t ASCII//TRANSLIT` for Latin).
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
// Port of _game_norm — translit + lowercase + strip spaces/./-, for comparison.
function gameNorm(s: string): string {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/[\s.-]/g, '')
}

// Canonical type → ANSI hue (port of pokemon_type_color, non-retro path). The
// differential strips ANSI so the exact code is cosmetic; kept faithful for
// real use. Retro-theme green isn't threaded here (matches the views.ts GOLD
// placeholder precedent).
const TYPE_COLOR: Record<string, string> = {
  Feu: '\x1b[38;2;239;108;0m',
  Fire: '\x1b[38;2;239;108;0m',
  Eau: '\x1b[38;2;38;143;255m',
  Water: '\x1b[38;2;38;143;255m',
  Plante: '\x1b[38;2;100;180;55m',
  Grass: '\x1b[38;2;100;180;55m',
  Électrik: '\x1b[38;2;255;218;0m',
  Electric: '\x1b[38;2;255;218;0m',
  Psy: '\x1b[38;2;239;65;125m',
  Psychic: '\x1b[38;2;239;65;125m',
  Ténèbres: '\x1b[38;2;120;94;75m',
  Dark: '\x1b[38;2;120;94;75m',
  Vol: '\x1b[38;2;180;180;255m',
  Flying: '\x1b[38;2;180;180;255m',
  Dragon: '\x1b[38;2;110;52;201m',
  Poison: '\x1b[38;2;144;58;156m',
  Normal: '\x1b[38;2;180;170;160m',
  Glace: '\x1b[38;2;108;204;218m',
  Ice: '\x1b[38;2;108;204;218m',
  Combat: '\x1b[38;2;199;58;55m',
  Fighting: '\x1b[38;2;199;58;55m',
  Insecte: '\x1b[38;2;145;162;36m',
  Bug: '\x1b[38;2;145;162;36m',
  Sol: '\x1b[38;2;200;160;90m',
  Ground: '\x1b[38;2;200;160;90m',
  Roche: '\x1b[38;2;180;160;100m',
  Rock: '\x1b[38;2;180;160;100m',
  Spectre: '\x1b[38;2;112;88;152m',
  Ghost: '\x1b[38;2;112;88;152m',
  Acier: '\x1b[38;2;156;156;176m',
  Steel: '\x1b[38;2;156;156;176m',
  Fée: '\x1b[38;2;239;164;213m',
  Fairy: '\x1b[38;2;239;164;213m',
}
function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? '\x1b[37m'
}

function gameHints(data: PokemonData, lang: string, idx: number, locale: Locale): string {
  // The quiz id was drawn from this pool — the entry exists.
  const w = (data.wild_pool ?? [])[idx]!
  const name = wildName(w, lang)
  const type = w.type ?? ''
  const dex = w.national_dex ?? 0
  const first = stripDiacritics(name)[0] ?? ''
  const letters = [...name].length
  const gen = dex <= 151 ? '1' : '2'
  const tcolor = typeColor(type)
  let o = bashPrintf(
    `  %s${tPad(locale, 'game.hint_type', 12)}%s : %s%s%s\n`,
    DIM,
    RESET,
    tcolor,
    type,
    RESET,
  )
  o += bashPrintf(`  %s${tPad(locale, 'game.hint_letters', 12)}%s : %s\n`, DIM, RESET, letters)
  o += bashPrintf(
    `  %s${tPad(locale, 'game.hint_initial', 12)}%s : %s%s.%s\n`,
    DIM,
    RESET,
    BOLD,
    first,
    RESET,
  )
  o += bashPrintf(`  %s${tPad(locale, 'game.hint_gen', 12)}%s : %s\n\n`, DIM, RESET, gen)
  o += bashPrintf(`  %s${t(locale, 'game.prompt_answer')}%s\n\n`, DIM, RESET)
  return o
}

function gameHelp(tr: Translator): string {
  let o = bashPrintf(`  %s${tr('game.help.intro')}%s\n\n`, DIM, RESET)
  o += bashPrintf(
    `  %s/pokemon game%s         %s${tr('game.help.start')}%s\n`,
    BOLD,
    RESET,
    DIM,
    RESET,
  )
  o += bashPrintf(
    `  %s/pokemon game <nom>%s   %s${tr('game.help.submit')}%s\n`,
    BOLD,
    RESET,
    DIM,
    RESET,
  )
  o += bashPrintf(
    `  %s/pokemon game skip%s    %s${tr('game.help.skip')}%s\n`,
    BOLD,
    RESET,
    DIM,
    RESET,
  )
  o += '\n'
  return o
}

export function cmdGame(input: CommandInput): CommandResult {
  const { state, data, locale, now } = input
  const nowEpoch = Number(input.nowEpoch ?? 0)
  const tr = makeTranslator(locale)
  const lang = data.language ?? 'fr'
  const rawAnswer = input.args.join(' ')
  const title = bashPrintf(`\n  %s%s${tr('game.title')}%s\n\n`, BOLD, GOLD, RESET)
  if (rawAnswer === 'help' || rawAnswer === '--help' || rawAnswer === '-h') {
    return { output: title + gameHelp(tr), state, stateChanged: false }
  }
  const noChange = (body: string): CommandResult => ({
    output: title + body,
    state,
    stateChanged: false,
  })
  const lineage = state.lineage ?? ''
  if (lineage === '' || lineage === null)
    return noChange(bashPrintf(`  %s${tr('game.no_active')}%s\n\n`, DIM, RESET))

  const currentQuizId = state.current_quiz?.id ?? ''
  if (rawAnswer === 'skip') {
    if (currentQuizId === '')
      return noChange(bashPrintf(`  %s${tr('game.no_quiz')}%s\n\n`, DIM, RESET))
    const next = cloneState(state)
    delete next.current_quiz
    return {
      output: title + bashPrintf(`  %s${tr('game.skipped')}%s\n\n`, DIM, RESET),
      state: next,
      stateChanged: true,
    }
  }

  if (rawAnswer === '') {
    if (currentQuizId !== '') {
      const idx = (data.wild_pool ?? []).findIndex(w => w.id === currentQuizId)
      return noChange(
        bashPrintf(`  %s${tr('game.in_progress')}%s\n\n`, DIM, RESET) +
          gameHints(data, lang, idx, locale),
      )
    }
    const last = state.last_game_completed_at ?? ''
    const cooldownMin = Number(data.game_cooldown_minutes ?? 15)
    if (last !== '') {
      const lastEpoch = Math.floor(Date.parse(last) / 1000) || 0
      const minPassed = Math.floor((nowEpoch - lastEpoch) / 60)
      if (minPassed < cooldownMin) {
        return noChange(
          bashPrintf(`  %s${tr('game.cooldown', cooldownMin - minPassed)}%s\n\n`, DIM, RESET),
        )
      }
    }
    const idx = Number(input.decisions?.pool_idx ?? 0)
    const next = cloneState(state)
    next.current_quiz = { id: data.wild_pool?.[idx]?.id, started_at: now }
    return { output: title + gameHints(data, lang, idx, locale), state: next, stateChanged: true }
  }

  // Submit an answer.
  if (currentQuizId === '')
    return noChange(bashPrintf(`  %s${tr('game.no_quiz')}%s\n\n`, DIM, RESET))
  const entry = (data.wild_pool ?? []).find(w => w.id === currentQuizId)
  const expected = entry ? wildName(entry, lang) : ''
  const xpReward = Number(data.game_xp_reward ?? 500)
  const frReward = Number(data.game_friendship_reward ?? 2)
  const next = cloneState(state)
  next.lifetime_stats ??= {}
  let out = title
  if (gameNorm(rawAnswer) === gameNorm(expected)) {
    next.total_xp = (next.total_xp ?? 0) + xpReward
    next.friendship = (next.friendship ?? 0) + frReward
    next.lifetime_stats.games_won = (next.lifetime_stats.games_won ?? 0) + 1
    next.lifetime_stats.games_played = (next.lifetime_stats.games_played ?? 0) + 1
    next.last_game_completed_at = now
    delete next.current_quiz
    out += bashPrintf(`  %s${tr('game.win', expected)}%s\n`, GOLD, RESET)
    out += bashPrintf(`  %s${tr('game.win_reward', xpReward, frReward)}%s\n\n`, DIM, RESET)
  } else {
    next.lifetime_stats.games_played = (next.lifetime_stats.games_played ?? 0) + 1
    next.last_game_completed_at = now
    delete next.current_quiz
    out += bashPrintf(`  %s${tr('game.wrong', rawAnswer)}%s\n`, DIM, RESET)
    out += bashPrintf(`  %s${tr('game.reveal', expected)}%s\n\n`, DIM, RESET)
  }
  return { output: out, state: next, stateChanged: true }
}
