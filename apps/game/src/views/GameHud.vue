<script setup lang="ts">
/**
 * The HUD and on-screen controls, laid out for a landscape phone first (design 11 §10.3) and
 * equally usable with a mouse. It reads HUD snapshots and sends intents through the InputHub;
 * it never touches the live game state.
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';
import HoldButton from '../components/HoldButton.vue';
import VirtualJoystick from '../components/VirtualJoystick.vue';
import { HOLD_BUY_MS, HOLD_NIGHT_MS, type InputHub } from '../game/input/hub.ts';
import type { GameRuntime } from '../game/runtime.ts';
import { snapshot, useHudStore } from '../stores/hud.ts';

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

const refresh = () => {
  store.hud = snapshot(props.runtime.state, props.runtime.ctx);
};
let timer: number | undefined;
onMounted(() => {
  refresh();
  timer = window.setInterval(refresh, 100);
});
onBeforeUnmount(() => window.clearInterval(timer));

const laneLabel: Record<string, string> = { west: 'W', east: 'E', north: 'N', air: 'air' };
const waveSummary = computed(() =>
  (store.hud?.threats ?? []).map((t) => `${laneLabel[t.lane] ?? t.lane} ${t.total}`).join(' · '),
);
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
      <span class="chip" data-testid="night">
        {{ store.hud.phase === 'night' ? 'Night' : 'Day' }} {{ store.hud.day }}/{{
          store.hud.nights
        }}
      </span>
      <button class="chip wave" data-testid="wave" @click="store.waveOpen = !store.waveOpen">
        {{ store.hud.phase === 'night' ? 'Left' : 'Tonight' }}:
        {{ store.hud.phase === 'night' ? store.hud.enemiesLeft : waveSummary }}
        <small v-if="!touch">Tab</small>
      </button>
      <span class="chip">🏰 {{ store.hud.castleHp }}</span>
      <span class="chip" :class="{ warn: !store.hud.kingAlive }">
        {{
          store.hud.kingAlive
            ? `👑 ${store.hud.kingHp}`
            : `👑 back in ${store.hud.kingRespawnSeconds}s`
        }}
      </span>
    </header>

    <section v-if="store.waveOpen" class="wave-panel" @click="store.waveOpen = false">
      <div v-for="t in store.hud.threats" :key="t.lane">
        <strong>{{ t.lane }}</strong>
        <span v-for="e in t.enemies" :key="e.name"> {{ e.count }} × {{ e.name }}</span>
      </div>
    </section>

    <p v-if="store.message" class="toast">{{ store.message }}</p>

    <div class="right">
      <template v-if="store.hud.phase === 'day' && store.hud.nearby">
        <div class="slot-title">{{ store.hud.nearby.current ?? 'Empty plot' }}</div>
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
          {{ o.kind === 'upgrade' ? '↑ ' : '' }}{{ o.name }} · {{ o.cost }}🪙
          <kbd v-if="!touch">{{ store.hud.nearby.rally || o.option === 1 ? 'R' : 'E' }}</kbd>
        </HoldButton>
      </template>

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
        {{ keyHint('WASD/arrows move · Space ability · hold E/R buy · hold Enter night · Z zoom') }}
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
}
.card {
  min-width: 180px;
  text-align: left;
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
