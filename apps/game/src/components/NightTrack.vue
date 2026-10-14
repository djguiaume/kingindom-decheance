<script setup lang="ts">
/**
 * The run's progress in the top bar (playtest 2): one pip per night, the nights already held
 * filled, the current one highlighted, the boss night marked with its icon. By night it also
 * counts the enemies left. Tapping it opens the waves panel.
 */
import type { Phase } from '@kd/core';

defineProps<{
  day: number;
  nights: number;
  phase: Phase;
  /** Night number → boss icon. */
  bosses: Record<number, string>;
  enemiesLeft: number;
}>();
</script>

<template>
  <button class="track" data-testid="night">
    <span class="label">{{ phase === 'night' ? 'Night' : 'Day' }} {{ day }}</span>
    <span class="pips" aria-hidden="true">
      <span
        v-for="n in nights"
        :key="n"
        class="pip"
        :class="{
          done: n < day || phase === 'won',
          now: n === day && phase !== 'won',
          night: phase === 'night',
          boss: !!bosses[n],
        }"
        :data-pip="n"
        >{{ bosses[n] ?? '' }}</span
      >
    </span>
    <span v-if="phase === 'night'" class="left" data-testid="enemies-left">
      {{ enemiesLeft }} left
    </span>
  </button>
</template>

<style scoped>
.track {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(20, 26, 40, 0.75);
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  min-height: 36px;
  color: inherit;
  font: inherit;
}
.label {
  font-weight: 700;
  white-space: nowrap;
}
.pips {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pip {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(232, 197, 71, 0.7);
  display: inline-grid;
  place-items: center;
  font-size: 12px;
  line-height: 1;
}
.pip.done {
  background: #e8c547;
  border-color: #e8c547;
}
.pip.now {
  width: 18px;
  height: 18px;
  border-color: #fff;
  box-shadow: 0 0 0 3px rgba(232, 197, 71, 0.45);
}
.pip.now.night {
  background: #3b4f8f;
}
.pip.boss {
  width: 22px;
  height: 22px;
  border-color: #c0392b;
}
.left {
  opacity: 0.85;
  white-space: nowrap;
}
</style>
