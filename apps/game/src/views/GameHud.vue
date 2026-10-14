<script setup lang="ts">
/**
 * The HUD and on-screen controls, laid out for a landscape phone first (design 11 §10.3) and
 * equally usable with a mouse. It reads HUD snapshots and sends intents through the InputHub;
 * it never touches the live game state.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import HoldButton from '../components/HoldButton.vue';
import NightTrack from '../components/NightTrack.vue';
import VirtualJoystick from '../components/VirtualJoystick.vue';
import WavesPanel from '../components/WavesPanel.vue';
import { HOLD_BUY_MS, HOLD_NIGHT_MS, type InputHub } from '../game/input/hub.ts';
import type { GameRuntime } from '../game/runtime.ts';
import { nightPlans, snapshot, useHudStore } from '../stores/hud.ts';
import { enemyIcon } from '../theme.ts';

const props = defineProps<{ runtime: GameRuntime; hub: InputHub }>();
const emit = defineEmits<{ restart: []; fullscreen: [] }>();
const store = useHudStore();
const touch = computed(() => store.device === 'touch');
const keyHint = (key: string) => (touch.value ? '' : key);

let stick = { x: 0, y: 0 };
function onStick(x: number, y: number) {
  stick = { x, y };
  props.hub.move(x, y, 'touch');
}
function charge(e: PointerEvent) {
  props.hub.ability(e.pointerType === 'mouse' ? 'keyboard' : 'touch', stick);
}

const plans = nightPlans(props.runtime.ctx);
const bosses = Object.fromEntries(
  plans.filter((p) => p.boss).map((p) => [p.night, enemyIcon(p.boss!)]),
);
function rally(e: PointerEvent) {
  props.hub.rally(e.pointerType === 'mouse' ? 'keyboard' : 'touch');
}

const refresh = () => {
  store.hud = snapshot(props.runtime.state, props.runtime.ctx);
};

/** A short card at dawn: the night just held, what it paid, what it cost (playtest 2). */
const DAWN_CARD_MS = 3000;
const dawnCard = ref<{ night: number; income: number; killed: number; lost: number } | null>(null);
let dawnTimer: number | undefined;
let timer: number | undefined;
let unsubscribe = () => {};
onMounted(() => {
  refresh();
  timer = window.setInterval(refresh, 100);
  unsubscribe = props.runtime.onEvents((events) => {
    // The last dawn ends the run: the outcome screen says it instead.
    if (events.some((e) => e.type === 'won')) return;
    const dawn = events.find((e) => e.type === 'dawn');
    const night = dawn && props.runtime.state.history.at(-1);
    if (!night) return;
    dawnCard.value = {
      night: night.night,
      income: night.income,
      killed: night.enemiesKilled,
      lost: night.buildingsLost,
    };
    window.clearTimeout(dawnTimer);
    dawnTimer = window.setTimeout(() => (dawnCard.value = null), DAWN_CARD_MS);
  });
});
onBeforeUnmount(() => {
  window.clearInterval(timer);
  window.clearTimeout(dawnTimer);
  unsubscribe();
});

const rallyLabel = computed(() => {
  const h = store.hud;
  if (!h) return '';
  if (h.phase === 'night') return h.followers > 0 ? `Drop ${h.followers}` : 'Rally';
  return h.flagHere ? 'Take flag' : 'Plant flag';
});
const showRally = computed(() => {
  const h = store.hud;
  if (!h) return false;
  if (h.phase === 'night') return h.hasBarracks;
  return h.phase === 'day' && (h.flagHere || h.flagsCarried > 0);
});
const cooldownStyle = computed(() => ({
  background: `conic-gradient(rgba(0,0,0,0.55) ${(store.hud?.abilityCooldown ?? 0) * 360}deg, transparent 0)`,
}));
</script>

<template>
  <div v-if="store.hud" class="hud" :class="{ touch }">
    <VirtualJoystick @move="onStick" />

    <header class="top">
      <button class="icon" aria-label="Pause" data-testid="pause" @click="hub.togglePause()">
        II
      </button>
      <span class="chip" data-testid="gold">🪙 {{ store.hud.gold }}</span>
      <NightTrack
        :day="store.hud.day"
        :nights="store.hud.nights"
        :phase="store.hud.phase"
        :bosses="bosses"
        :enemies-left="store.hud.enemiesLeft"
        @click="store.waveOpen = !store.waveOpen"
      />
      <span class="chip">🏰 {{ store.hud.castleHp }}</span>
      <span class="chip" :class="{ warn: !store.hud.kingAlive }">
        {{
          store.hud.kingAlive
            ? `👑 ${store.hud.kingHp}`
            : `👑 back in ${store.hud.kingRespawnSeconds}s`
        }}
      </span>
    </header>

    <div v-if="store.hud.boss" class="boss-bar" data-testid="boss-bar">
      <span>{{ store.hud.boss.name }}</span>
      <div class="bar">
        <div :style="{ width: `${(100 * store.hud.boss.hp) / store.hud.boss.maxHp}%` }" />
      </div>
    </div>

    <section v-if="store.waveOpen" class="wave-panel" @click="store.waveOpen = false">
      <WavesPanel :plans="plans" :tonight="store.hud.day" />
    </section>

    <p v-if="store.message" class="toast">{{ store.message }}</p>

    <div v-if="dawnCard" class="dawn-card" data-testid="dawn-card">
      <strong>Night {{ dawnCard.night }} survived</strong>
      <span>+{{ dawnCard.income }} 🪙 · {{ dawnCard.killed }} enemies beaten</span>
      <span v-if="dawnCard.lost > 0" class="warn"
        >{{ dawnCard.lost }} building{{ dawnCard.lost > 1 ? 's' : '' }} lost (rebuilt free)</span
      >
    </div>

    <div class="right">
      <template v-if="store.hud.phase === 'day' && store.hud.nearby">
        <div class="slot-title" data-testid="slot-title">
          <strong>{{ store.hud.nearby.current ?? 'Empty plot' }}</strong>
          <small v-if="store.hud.nearby.currentStats">{{ store.hud.nearby.currentStats }}</small>
        </div>
        <HoldButton
          v-if="store.hud.nearby.rally"
          :duration="HOLD_BUY_MS"
          :external-holding="store.keyHold === 'buy-0'"
          data-testid="rally"
          @confirm="hub.mainAction()"
        >
          Guard: {{ store.hud.nearby.rally.replace('gate_', '') }} ↻ <kbd v-if="!touch">E</kbd>
        </HoldButton>
        <HoldButton
          v-for="o in store.hud.nearby.offers"
          :key="o.option"
          class="card"
          :duration="HOLD_BUY_MS"
          :disabled="!o.affordable"
          :external-holding="
            store.keyHold === (store.hud.nearby.rally || o.option === 1 ? 'buy-1' : 'buy-0')
          "
          :data-testid="`buy-${o.option}`"
          @confirm="hub.buy(o.option)"
        >
          <span class="offer">
            <span class="offer-head">
              {{ o.kind === 'upgrade' ? '↑ ' : '' }}{{ o.name }} · {{ o.cost }}🪙
              <kbd v-if="!touch">{{ store.hud.nearby.rally || o.option === 1 ? 'R' : 'E' }}</kbd>
            </span>
            <small v-if="o.stats" class="offer-stats" data-testid="offer-stats">{{
              o.stats
            }}</small>
            <small class="offer-desc">{{ o.description }}</small>
          </span>
        </HoldButton>
      </template>

      <button
        v-if="showRally"
        class="rally-btn"
        :data-testid="store.hud.phase === 'night' ? 'rally-night' : 'rally-day'"
        @pointerdown.prevent="rally"
      >
        <span class="flag" aria-hidden="true">⚑</span>
        {{ rallyLabel }}
        <kbd v-if="!touch">F</kbd>
      </button>

      <button
        v-if="store.hud.phase === 'night' && store.hud.abilityName"
        class="charge"
        data-testid="charge"
        :disabled="store.hud.abilityCooldown > 0"
        @pointerdown.prevent="charge"
      >
        <span class="ring" :style="cooldownStyle" />
        {{ store.hud.abilityName }}
        <kbd v-if="!touch">Space</kbd>
      </button>

      <HoldButton
        v-if="store.hud.phase === 'day'"
        class="primary night"
        :duration="HOLD_NIGHT_MS"
        :external-holding="store.keyHold === 'night'"
        data-testid="start-night"
        @confirm="hub.startNight()"
      >
        Start night (hold) <kbd v-if="!touch">Enter</kbd>
      </HoldButton>
    </div>

    <div
      v-if="store.hud.phase === 'won' || store.hud.phase === 'lost'"
      class="modal"
      data-testid="outcome"
    >
      <h2>{{ store.hud.phase === 'won' ? 'Victory!' : 'The castle has fallen' }}</h2>
      <button class="primary big" @click="emit('restart')">Play again</button>
    </div>

    <div v-else-if="store.paused" class="modal" data-testid="pause-menu">
      <h2>Paused</h2>
      <button class="primary big" @click="hub.togglePause()">Resume</button>
      <button class="big" @click="emit('fullscreen')">Full screen</button>
      <button class="big" @click="emit('restart')">Restart run</button>
      <p class="hint">
        {{
          keyHint(
            'WASD/arrows move · Space ability · F rally / flag · hold E/R buy · hold Enter night · Tab waves · Z zoom',
          )
        }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Keep everything clear of notches, rounded corners and the home bar. */
  padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right))
    max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
  font-size: max(14px, 2.6vmin);
}
.hud button,
.hud .chip,
.wave-panel,
.modal {
  pointer-events: auto;
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.chip {
  background: rgba(20, 26, 40, 0.75);
  border-radius: 999px;
  padding: 6px 12px;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  color: inherit;
  font: inherit;
}
.icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  font-weight: 700;
}
.wave-panel {
  margin-top: 6px;
  background: rgba(20, 26, 40, 0.9);
  border-radius: 8px;
  padding: 8px 12px;
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}
.toast {
  position: absolute;
  top: 25%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 26, 40, 0.85);
  padding: 6px 12px;
  border-radius: 6px;
  color: #ffb199;
}
.right {
  position: absolute;
  right: max(8px, env(safe-area-inset-right));
  bottom: max(8px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.slot-title {
  background: rgba(20, 26, 40, 0.75);
  padding: 4px 10px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  max-width: 260px;
}
.slot-title small {
  opacity: 0.8;
  font-size: 0.75em;
}
.card {
  width: 260px;
  text-align: left;
}
.offer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.offer-head {
  font-weight: 700;
}
.offer-stats {
  font-size: 0.75em;
  color: #ffe9a3;
}
.offer-desc {
  font-size: 0.72em;
  opacity: 0.75;
  line-height: 1.2;
}
.rally-btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 11px;
  line-height: 1.1;
  touch-action: none;
  margin-right: 8px;
  display: grid;
  place-items: center;
  align-content: center;
}
.rally-btn .flag {
  font-size: 18px;
  color: #e8c547;
}
.dawn-card {
  position: absolute;
  top: 22%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 26, 40, 0.9);
  border: 2px solid #e8c547;
  border-radius: 10px;
  padding: 10px 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  animation: rise 0.3s ease-out;
}
.dawn-card strong {
  font-size: 1.2em;
  color: #e8c547;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
}
.boss-bar {
  position: absolute;
  top: calc(max(8px, env(safe-area-inset-top)) + 56px);
  left: 50%;
  transform: translateX(-50%);
  width: min(60vw, 420px);
  text-align: center;
  font-weight: 700;
  text-shadow: 0 1px 2px #000;
}
.boss-bar .bar {
  height: 10px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.5);
  overflow: hidden;
  margin-top: 2px;
}
.boss-bar .bar div {
  height: 100%;
  background: #c0392b;
}
.charge {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 13px;
  overflow: hidden;
  touch-action: none;
  display: grid;
  place-items: center;
}
.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}
.night {
  min-width: 180px;
}
.modal {
  position: absolute;
  inset: 0;
  background: rgba(10, 14, 24, 0.75);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.big {
  min-width: 200px;
  min-height: 52px;
}
.hint {
  color: var(--muted);
  font-size: 13px;
}
kbd {
  font-size: 11px;
  opacity: 0.7;
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 0 4px;
  margin-left: 4px;
}
.warn {
  color: #ffb199;
}
</style>
