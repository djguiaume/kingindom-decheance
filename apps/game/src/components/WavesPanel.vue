<script setup lang="ts">
/**
 * The coming nights (design 11 §8.3, trimmed after playtest 2): tonight and the next night by
 * default, every night behind "All nights". Lane by lane, with icons and counts; the boss
 * night carries the boss's icon.
 */
import { computed, ref } from 'vue';
import type { NightPlan } from '../stores/hud.ts';
import { enemyIcon } from '../theme.ts';

const props = defineProps<{ plans: NightPlan[]; tonight: number }>();
const all = ref(false);
const shown = computed(() =>
  all.value ? props.plans : props.plans.filter((p) => p.night >= props.tonight).slice(0, 2),
);
const laneName: Record<string, string> = { west: 'West', east: 'East', north: 'North', air: 'Air' };
const when = (n: number) =>
  n === props.tonight ? 'Tonight' : n === props.tonight + 1 ? 'Next' : `Night ${n}`;
</script>

<template>
  <div class="waves" data-testid="waves-panel">
    <div
      v-for="p in shown"
      :key="p.night"
      class="night"
      :class="{ tonight: p.night === tonight, past: p.night < tonight }"
      :data-night="p.night"
    >
      <strong class="n">
        {{ when(p.night)
        }}<span v-if="p.boss" class="boss" :title="'Boss night'">{{ enemyIcon(p.boss) }}</span>
      </strong>
      <span v-for="l in p.lanes" :key="l.lane" class="lane">
        <em>{{ laneName[l.lane] ?? l.lane }}</em>
        <span v-for="e in l.enemies" :key="e.id" :title="e.name"
          >{{ enemyIcon(e.id) }}{{ e.count }}</span
        >
      </span>
    </div>
    <button class="more" data-testid="waves-all" @click.stop="all = !all">
      {{ all ? 'Fewer' : 'All nights' }}
    </button>
  </div>
</template>

<style scoped>
.waves {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(20, 26, 40, 0.92);
  border-radius: 8px;
  padding: 8px 10px;
  max-height: 60vh;
  overflow-y: auto;
}
.night {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  padding: 4px 6px;
  border-radius: 6px;
}
.tonight {
  background: rgba(232, 197, 71, 0.25);
  outline: 2px solid rgba(232, 197, 71, 0.8);
}
.past {
  opacity: 0.5;
}
.n {
  min-width: 4.5em;
}
.boss {
  margin-left: 4px;
}
.lane em {
  font-style: normal;
  opacity: 0.7;
  margin-right: 4px;
}
.lane span {
  margin-right: 6px;
}
.more {
  align-self: flex-start;
  background: none;
  border: none;
  color: #e8c547;
  font: inherit;
  font-size: 0.85em;
  padding: 4px 6px;
}
</style>
