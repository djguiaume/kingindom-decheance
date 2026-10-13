<script setup lang="ts">
import type { Command } from '@kd/core';
import { onBeforeUnmount, onMounted } from 'vue';
import type { GameRuntime } from '../game/runtime.ts';
import { snapshot, useHudStore } from '../stores/hud.ts';

const props = defineProps<{ runtime: GameRuntime }>();
const store = useHudStore();

const refresh = () => {
  store.hud = snapshot(props.runtime.state, props.runtime.ctx);
};
let timer: number | undefined;
onMounted(() => {
  refresh();
  timer = window.setInterval(refresh, 100);
});
onBeforeUnmount(() => window.clearInterval(timer));

function send(command: Command): void {
  const result = props.runtime.submit(command);
  store.message = result.ok ? '' : result.reason;
  refresh();
}

function restart(): void {
  props.runtime.restart();
  store.message = '';
  refresh();
}
</script>

<template>
  <aside v-if="store.hud" class="hud">
    <div class="row">
      <strong
        >{{ store.hud.phase === 'night' ? 'Night' : 'Day' }} {{ store.hud.day }} /
        {{ store.hud.nights }}</strong
      >
      <span data-testid="gold">Gold {{ store.hud.gold }}</span>
    </div>
    <div class="row">
      <span>Castle {{ store.hud.castleHp }} / {{ store.hud.castleMaxHp }}</span>
      <span v-if="store.hud.phase === 'night'">Enemies {{ store.hud.enemiesLeft }}</span>
    </div>
    <div v-if="!store.hud.kingAlive" class="warn">
      King respawns in {{ store.hud.kingRespawnSeconds }}s
    </div>
    <div v-if="store.hud.lastIncome !== null && store.hud.phase === 'day'" class="muted">
      Last dawn income: {{ store.hud.lastIncome }}
    </div>

    <template v-if="store.hud.phase === 'day'">
      <button class="primary" data-testid="start-night" @click="send({ type: 'startNight' })">
        Start night
      </button>
      <h3>Build (dev panel)</h3>
      <ul class="slots">
        <li v-for="slot in store.hud.slots" :key="slot.id">
          <span class="slot-name">{{ slot.id.replace('slot-', '') }}</span>
          <span v-if="slot.building">{{ slot.building }}</span>
          <button
            v-for="o in slot.build"
            :key="o.id"
            @click="send({ type: 'build', slot: slot.id, building: o.id })"
          >
            {{ o.name }} ({{ o.cost }})
          </button>
          <button
            v-for="u in slot.upgrades"
            :key="u.to"
            @click="send({ type: 'upgrade', slot: slot.id, to: u.to })"
          >
            ↑ {{ u.name }} ({{ u.cost }})
          </button>
        </li>
      </ul>
    </template>

    <div
      v-if="store.hud.phase === 'won' || store.hud.phase === 'lost'"
      class="end"
      data-testid="outcome"
    >
      <strong>{{ store.hud.phase === 'won' ? 'Victory' : 'The castle has fallen' }}</strong>
      <button class="primary" @click="restart">Play again</button>
    </div>
    <p v-if="store.message" class="warn">{{ store.message }}</p>
    <p class="muted">Move the king with WASD or the arrow keys. He attacks enemies in reach.</p>
  </aside>
</template>

<style scoped>
.hud {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 260px;
  max-width: 320px;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.slots {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.slots li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.slot-name {
  min-width: 80px;
  color: var(--muted);
}
.warn {
  color: #ff9b7a;
}
.muted {
  color: var(--muted);
  font-size: 0.85em;
}
.end {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--muted);
  border-radius: 6px;
}
h3 {
  margin: 8px 0 0;
  font-size: 0.95em;
}
</style>
