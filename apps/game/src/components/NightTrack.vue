<script setup lang="ts">
/**
 * The run's progress, top centre (playtest 2; corpus 14 §3.1, zone 2): six markers on a line,
 * the nights already held filled, a sun or moon on the current one, the boss night marked with
 * its icon. By night it also counts the enemies left. Tapping it opens the waves panel.
 */
import type { Phase } from '@kd/core';
import type { IconId } from '../icons.ts';
import GameIcon from './GameIcon.vue';

defineProps<{
  day: number;
  nights: number;
  phase: Phase;
  /** Night number → boss icon. */
  bosses: Record<number, IconId>;
  enemiesLeft: number;
  touch: boolean;
}>();
</script>

<template>
  <button class="track panel" data-testid="night">
    <span class="label display">{{ phase === 'night' ? 'Night' : 'Day' }} {{ day }}</span>
    <span class="line" aria-hidden="true">
      <span
        v-for="n in nights"
        :key="n"
        class="pip"
        :class="{
          done: n < day || phase === 'won',
          now: n === day && phase !== 'won',
          night: phase === 'night',
          boss: !!bosses[n] && !(n === day && phase !== 'won'),
        }"
        :data-pip="n"
      >
        <GameIcon v-if="n === day && phase !== 'won'" :name="phase === 'night' ? 'moon' : 'sun'" />
        <GameIcon v-else-if="bosses[n]" :name="bosses[n]" />
      </span>
    </span>
    <span v-if="phase === 'night'" class="left" data-testid="enemies-left">
      <GameIcon name="skull" /><b>{{ enemiesLeft }}</b> left
    </span>
    <kbd v-else-if="!touch">Tab</kbd>
  </button>
</template>

<style scoped>
.track {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  min-height: 40px;
}
.label {
  font-size: 15px;
  white-space: nowrap;
}
.line {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 11px;
}
.line::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1.5px;
  background: var(--line);
}
.pip {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--linen);
  border: 1.5px solid var(--muted);
  display: inline-grid;
  place-items: center;
}
.pip.done {
  background: var(--ink);
  border-color: var(--ink);
}
.pip.now {
  width: 22px;
  height: 22px;
  border: none;
  background: var(--linen);
  color: var(--gold);
  font-size: 22px;
}
.pip.now.night {
  color: var(--night);
}
.pip.boss {
  width: 19px;
  height: 19px;
  border: none;
  background: var(--enemy);
  color: #fff;
  font-size: 12px;
}
.left {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.left b {
  font: 700 15px var(--display);
  color: var(--ink);
}
</style>
