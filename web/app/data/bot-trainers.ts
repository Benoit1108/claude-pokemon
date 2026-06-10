// Static NPC trainers for the solo ladder. Difficulty rises monotonically
// from Lv.5 (Bug Catcher) to Lv.50 (Champion). Lineages are picked to
// expose the player to varied type matchups across the ladder.
//
// "Defeated" state lives in localStorage (composables/useLadderProgress).
// Battles run client-side via app/utils/battle-engine.ts — same deterministic
// algorithm as the Worker, so replays are bit-identical if you pass the same
// seed.

import type { Lineage } from '~/types/api'

export interface BotTrainer {
  id: string // stable key for localStorage progress (kebab-case)
  name: string
  title: string // flavor text shown above the name
  lineage: Lineage
  level: number
  is_shiny: boolean
  /** Pre-battle quote, shown before the fight starts. */
  quote: string
  /** Reward gained on first victory (cosmetic / progression flavor). */
  reward: string
}

// 15 trainers, sorted ascending by level. Designed so that a Lv.16 Reptincel
// player can beat the first ~6, the next ~4 require Lv.20-30 (Dracaufeu
// territory), and the final 5 push toward the Mega forms.
export const BOT_TRAINERS: BotTrainer[] = [
  {
    id: 'bug-catcher-leo',
    name: 'Léo',
    title: 'Bug Catcher',
    lineage: 'grass',
    level: 5,
    is_shiny: false,
    quote: "J'ai un Bulbizarre, prépare-toi !",
    reward: '+50 reputation',
  },
  {
    id: 'lass-emma',
    name: 'Emma',
    title: 'Lass',
    lineage: 'water',
    level: 8,
    is_shiny: false,
    quote: 'Mon Carapuce est tout neuf — sois gentil avec lui.',
    reward: '+50 reputation',
  },
  {
    id: 'youngster-tom',
    name: 'Tom',
    title: 'Youngster',
    lineage: 'fire',
    level: 12,
    is_shiny: false,
    quote: "Salamèche c'est le meilleur starter, change mon avis.",
    reward: '+75 reputation',
  },
  {
    id: 'hiker-bruno',
    name: 'Bruno',
    title: 'Randonneur',
    lineage: 'electric',
    level: 16,
    is_shiny: false,
    quote: 'Pikachu et moi, on a fait la traversée du parc !',
    reward: '+75 reputation',
  },
  {
    id: 'breeder-sophie',
    name: 'Sophie',
    title: 'Éleveuse',
    lineage: 'eevee',
    level: 20,
    is_shiny: false,
    quote: "Mon Évoli est polyvalent — il s'adapte à tout.",
    reward: '+100 reputation',
  },
  {
    id: 'fisherman-jacques',
    name: 'Jacques',
    title: 'Pêcheur',
    lineage: 'totodile',
    level: 24,
    is_shiny: false,
    quote: "Crocrodil ne lâche jamais sa proie. Toi non plus j'espère.",
    reward: '+100 reputation',
  },
  {
    id: 'gardener-fleur',
    name: 'Fleur',
    title: 'Jardinière',
    lineage: 'chikorita',
    level: 28,
    is_shiny: false,
    quote: 'Mon Macronium parfume tout le quartier.',
    reward: '+125 reputation',
  },
  {
    id: 'firefighter-marc',
    name: 'Marc',
    title: 'Pompier',
    lineage: 'cyndaquil',
    level: 32,
    is_shiny: false,
    quote: "Feurisson m'a déjà sauvé la mise plusieurs fois.",
    reward: '+150 reputation',
  },
  {
    id: 'sailor-ines',
    name: 'Inès',
    title: 'Capitaine',
    lineage: 'water',
    level: 36,
    is_shiny: false,
    quote: "Tortank est le navire amiral de l'océan.",
    reward: '+150 reputation',
  },
  {
    id: 'biologist-ariane',
    name: 'Ariane',
    title: 'Biologiste',
    lineage: 'grass',
    level: 38,
    is_shiny: true,
    quote: "Florizarre shiny ? J'ai eu beaucoup de chance.",
    reward: '+175 reputation + shiny encounter',
  },
  {
    id: 'electrician-zap',
    name: 'Zap',
    title: 'Électricien',
    lineage: 'electric',
    level: 40,
    is_shiny: false,
    quote: "Raichu d'Alola surfe sur les vagues — et sur toi.",
    reward: '+175 reputation',
  },
  {
    id: 'fire-chief-pyra',
    name: 'Pyra',
    title: 'Chef Pompier',
    lineage: 'cyndaquil',
    level: 42,
    is_shiny: false,
    quote: "Typhlosion d'Hisui, forme spectrale. Bonne chance.",
    reward: '+200 reputation',
  },
  {
    id: 'champion-mark',
    name: 'Mark',
    title: 'Vétéran',
    lineage: 'fire',
    level: 45,
    is_shiny: false,
    quote: 'Méga-Dracaufeu X — type Dragon ajouté. Tu vas voir.',
    reward: '+250 reputation',
  },
  {
    id: 'champion-aqua',
    name: 'Aqua',
    title: 'Maître des Mers',
    lineage: 'totodile',
    level: 48,
    is_shiny: false,
    quote: 'Aligatueur Lv.48. Mâchoires comme des cisailles.',
    reward: '+300 reputation',
  },
  {
    id: 'elite-champion',
    name: 'Diane',
    title: 'Champion·ne du Trail',
    lineage: 'eevee',
    level: 50,
    is_shiny: true,
    quote:
      'Mon Mentali shiny te lit comme un livre ouvert. Bats-moi pour être Champion·ne à ton tour.',
    reward: '🏆 Trail Conqueror badge + title on leaderboard',
  },
]

export function findBot(id: string): BotTrainer | undefined {
  return BOT_TRAINERS.find(b => b.id === id)
}

export function isFinalBoss(id: string): boolean {
  return id === 'elite-champion'
}
