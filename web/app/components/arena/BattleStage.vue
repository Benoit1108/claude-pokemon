<script setup lang="ts">
// Battle stage (Phase 2.15) — pixel-art background scene.
//   - background : a hot pixel-art image (/battle-bg/<env>.png) chosen by the
//     `scene` prop ("arena" for PvP) or derived from the opponent's type for
//     wild / ladder battles (water → beach, fire → volcano, …). Painted
//     platforms come with the image ; the combatants are posed on them.
//   - challenger : back-view sprite on the foreground (lower-left) platform.
//   - defender : face-view sprite on the further (mid-right) platform.
//   - HP pills (BattleHpPill) in the corners (foe top-left, you bottom-right).
//   - attack lunges / recoil / victory / defeat / crit-flash + floating damages
//     reuse the existing animation hooks. Replay mode derives HP from
//     `visibleTurns` via deriveHpFromTurns().

import { deriveHpFromTurns } from '~/utils/battle-engine'
import { lineageAccent } from '~/utils/lineage'
import { resolveScene } from '~/utils/battle-scene'
import { stageNameFor } from '~/utils/sprites'
import type { BattleParticipant, BattleSide, BattleTurn } from '~/types/api'
import type { FloatingDamage } from '~/composables/useBattleJuice'

const { t } = useI18n()

const props = defineProps<{
  challenger: BattleParticipant
  defender: BattleParticipant
  challengerHp?: number
  challengerMaxHp?: number
  defenderHp?: number
  defenderMaxHp?: number
  visibleTurns?: BattleTurn[]
  winner: BattleSide | 'draw'
  currentTurn?: BattleTurn | null
  showFinalState?: boolean
  floatingDamages?: FloatingDamage[]
  showIntro?: boolean
  /** Scene hint. "arena" → PvP stadium. Omitted → derived from the defender's
   * combat type (wild / ladder battles get a fitting environment). */
  scene?: string
}>()

const scene = computed(() =>
  resolveScene({ scene: props.scene, defenderLineage: props.defender.lineage }),
)
const bgStyle = computed(() => ({ backgroundImage: `url(${scene.value.bg})` }))

const challengerAttacking = computed(() => props.currentTurn?.actor === 'challenger')
const defenderAttacking = computed(() => props.currentTurn?.actor === 'defender')
const isCritical = computed(() => !!props.currentTurn?.critical)

const challengerName = computed(
  () => props.challenger.display_name || props.challenger.anon_id.slice(0, 8),
)
const defenderName = computed(
  () => props.defender.display_name || props.defender.anon_id.slice(0, 8),
)
const challengerStageName = computed(() =>
  stageNameFor(props.challenger.lineage, props.challenger.level),
)
const defenderStageName = computed(() => stageNameFor(props.defender.lineage, props.defender.level))

const challengerWinner = computed(() => props.showFinalState && props.winner === 'challenger')
const defenderWinner = computed(() => props.showFinalState && props.winner === 'defender')
const challengerLoser = computed(() => props.showFinalState && props.winner === 'defender')
const defenderLoser = computed(() => props.showFinalState && props.winner === 'challenger')

const challengerFloats = computed(
  () => props.floatingDamages?.filter(f => f.side === 'challenger') ?? [],
)
const defenderFloats = computed(
  () => props.floatingDamages?.filter(f => f.side === 'defender') ?? [],
)

function maxHpFor(level: number, override?: number): number {
  return override ?? 50 + level * 2
}
const cMax = computed(() => maxHpFor(props.challenger.level, props.challengerMaxHp))
const dMax = computed(() => maxHpFor(props.defender.level, props.defenderMaxHp))
const cHp = computed(() =>
  props.challengerHp !== undefined
    ? props.challengerHp
    : deriveHpFromTurns('challenger', props.visibleTurns, cMax.value),
)
const dHp = computed(() =>
  props.defenderHp !== undefined
    ? props.defenderHp
    : deriveHpFromTurns('defender', props.visibleTurns, dMax.value),
)

const challengerAccent = computed(() => lineageAccent(props.challenger.lineage))
const defenderAccent = computed(() => lineageAccent(props.defender.lineage))

const showIntroBanner = ref(props.showIntro !== false)
function dismissIntro() {
  showIntroBanner.value = false
}
</script>

<template>
  <div
    class="battle-stage relative isolate w-full rounded-xl border surface-border overflow-hidden mb-6"
    :style="bgStyle"
    :class="{ 'crit-flash': isCritical }"
  >
    <!-- Defender — face-view, posed on the mid-right platform. -->
    <div class="battler" :style="{ left: scene.anchors.foe.x, top: scene.anchors.foe.y }">
      <span class="contact contact-foe" aria-hidden="true" />
      <div class="sprite-anchor sprite-anchor-foe">
        <div
          class="sprite-anim"
          :class="[
            defenderAttacking ? 'sprite-bump-defender' : '',
            challengerAttacking ? 'sprite-recoil' : '',
            defenderWinner ? 'sprite-victory' : '',
            defenderLoser ? 'sprite-defeat' : '',
          ]"
          :style="{
            filter: `drop-shadow(0 5px 6px rgba(0,0,0,.45)) drop-shadow(0 0 12px ${defenderAccent}55)`,
          }"
        >
          <PokemonSprite
            :lineage="defender.lineage"
            :level="defender.level"
            :is-shiny="defender.is_shiny"
            size="xl"
            animated
          />
        </div>
        <div class="floats" aria-hidden="true">
          <FloatingDamage
            v-for="f in defenderFloats"
            :key="f.id"
            :damage="f.damage"
            :effectiveness="f.effectiveness"
            :critical="f.critical"
          />
        </div>
      </div>
    </div>

    <!-- Challenger — back-view, posed on the foreground (lower-left) platform. -->
    <div class="battler" :style="{ left: scene.anchors.ally.x, top: scene.anchors.ally.y }">
      <span class="contact contact-ally" aria-hidden="true" />
      <div class="sprite-anchor sprite-anchor-ally">
        <div
          class="sprite-anim"
          :class="[
            challengerAttacking ? 'sprite-bump-challenger' : '',
            defenderAttacking ? 'sprite-recoil' : '',
            challengerWinner ? 'sprite-victory' : '',
            challengerLoser ? 'sprite-defeat' : '',
          ]"
          :style="{
            filter: `drop-shadow(0 6px 7px rgba(0,0,0,.5)) drop-shadow(0 0 16px ${challengerAccent}77)`,
          }"
        >
          <PokemonSprite
            :lineage="challenger.lineage"
            :level="challenger.level"
            :is-shiny="challenger.is_shiny"
            size="2xl"
            animated
            back
          />
        </div>
        <div class="floats" aria-hidden="true">
          <FloatingDamage
            v-for="f in challengerFloats"
            :key="f.id"
            :damage="f.damage"
            :effectiveness="f.effectiveness"
            :critical="f.critical"
          />
        </div>
      </div>
    </div>

    <!-- HP pills : opponent top-left, you bottom-right (Pokémon convention). -->
    <div class="absolute top-3 left-3 z-20">
      <BattleHpPill
        :name="defenderStageName"
        :level="defender.level"
        :is-shiny="defender.is_shiny"
        :hp="dHp"
        :max-hp="dMax"
        side="defender"
      />
    </div>
    <div class="absolute bottom-3 right-3 z-20">
      <BattleHpPill
        :name="challengerStageName"
        :level="challenger.level"
        :is-shiny="challenger.is_shiny"
        :hp="cHp"
        :max-hp="cMax"
        side="challenger"
      />
    </div>

    <BattleIntroBanner
      v-if="showIntroBanner"
      :challenger-name="challengerName"
      @done="dismissIntro"
    />

    <!-- Trainer name tags (small). -->
    <div
      class="absolute top-1 right-2 max-w-[40%] truncate text-[0.65rem] uppercase tracking-widest text-white/70 bg-black/35 backdrop-blur px-2 py-0.5 rounded pointer-events-none"
    >
      {{ defenderName }}
    </div>
    <div
      class="absolute bottom-1 left-2 max-w-[40%] truncate text-[0.65rem] uppercase tracking-widest text-white/70 bg-black/35 backdrop-blur px-2 py-0.5 rounded pointer-events-none"
    >
      {{ challengerName }} {{ t('battle_stage.you_suffix') }}
    </div>

    <div
      v-if="showFinalState && winner === 'draw'"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div class="px-4 py-2 rounded-md bg-black/70 text-white text-2xl font-bold tracking-widest">
        {{ t('battle_stage.draw_label') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.battle-stage {
  height: 22rem;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  image-rendering: pixelated;
  box-shadow: inset 0 0 60px -8px rgba(0, 0, 0, 0.35);
}
@media (min-width: 768px) {
  .battle-stage {
    height: 26rem;
  }
}

.battler {
  position: absolute;
  width: 0;
  height: 0;
  z-index: 3;
}

/* Contact shadow under the feet — grounds the sprite on the platform. */
.contact {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -40%);
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.45), transparent 72%);
  filter: blur(2px);
  pointer-events: none;
}
.contact-foe {
  width: 5.5rem;
  height: 1.4rem;
}
.contact-ally {
  width: 8rem;
  height: 2rem;
}

/* Centers the sprite on the anchor and sinks it down so the visible feet
 * (Showdown sprites have transparent padding below) land on the platform. */
.sprite-anchor {
  position: absolute;
  left: 0;
  bottom: 0;
}
.sprite-anchor-foe {
  transform: translate(-50%, 22%);
}
.sprite-anchor-ally {
  transform: translate(-50%, 20%);
}

.floats {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  pointer-events: none;
}

@keyframes sprite-bump-c {
  0%,
  100% {
    transform: translateX(0) translateY(0);
  }
  30% {
    transform: translateX(20px) translateY(-6px);
  }
}
@keyframes sprite-bump-d {
  0%,
  100% {
    transform: translateX(0) translateY(0);
  }
  30% {
    transform: translateX(-16px) translateY(4px);
  }
}
@keyframes sprite-recoil {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-8px);
  }
  40% {
    transform: translateX(6px);
  }
}
@keyframes sprite-victory {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
@keyframes sprite-defeat {
  0% {
    transform: translateY(0);
    opacity: 1;
    filter: grayscale(0);
  }
  100% {
    transform: translateY(8px);
    opacity: 0.55;
    filter: grayscale(0.85);
  }
}
@keyframes crit-flash {
  0% {
    background: radial-gradient(
      circle at 50% 50%,
      rgba(255, 224, 130, 0.6) 0%,
      rgba(255, 224, 130, 0.15) 40%,
      transparent 70%
    );
    transform: scale(0.9);
    opacity: 1;
  }
  100% {
    background: radial-gradient(circle at 50% 50%, transparent 0%, transparent 100%);
    transform: scale(1.4);
    opacity: 0;
  }
}
.sprite-bump-challenger {
  animation: sprite-bump-c 600ms ease-out;
}
.sprite-bump-defender {
  animation: sprite-bump-d 600ms ease-out;
}
.sprite-recoil {
  animation: sprite-recoil 500ms ease-out;
}
.sprite-victory {
  animation: sprite-victory 1.6s ease-in-out infinite;
}
.sprite-defeat {
  animation: sprite-defeat 1.4s ease-out forwards;
}
.crit-flash::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: crit-flash 450ms ease-out;
  z-index: 30;
}

@media (prefers-reduced-motion: reduce) {
  .sprite-bump-challenger,
  .sprite-bump-defender,
  .sprite-recoil,
  .sprite-victory,
  .sprite-defeat,
  .crit-flash::after {
    animation: none;
  }
}
</style>
