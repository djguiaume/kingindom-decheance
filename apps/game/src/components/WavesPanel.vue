<script setup lang="ts">
/**
 * All six nights at a glance (design 11 §8.3): lane by lane, with icons and counts; tonight is
 * highlighted and the boss night carries the boss's icon.
 */
import type { NightPlan } from '../stores/hud.ts';
import { enemyIcon } from '../theme.ts';

defineProps<{ plans: NightPlan[]; tonight: number }>();
const laneName: Record<string, string> = { west: 'West', east: 'East', north: 'North', air: 'Air' };
</script>

<template>
  <div class="waves" data-testid="waves-panel">
    <div
      v-for="p in plans"
      :key="p.night"
      class="night"
      :class="{ tonight: p.night === tonight, past: p.night < tonight }"
      :data-night="p.night"
    >
      <strong class="n">
        {{ p.night
        }}<span v-if="p.boss" class="boss" :title="'Boss night'">{{ enemyIcon(p.boss) }}</span>
      </strong>
      <span v-for="l in p.lanes" :key="l.lane" class="lane">
        <em>{{ laneName[l.lane] ?? l.lane }}</em>
        <span v-for="e in l.enemies" :key="e.id" :title="e.name"
          >{{ enemyIcon(e.id) }}{{ e.count }}</span
        >
      </span>
    </div>
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
  max-height: 70vh;
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
  min-width: 2.2em;
}
.boss {
  margin-left: 2px;
}
.lane em {
  font-style: normal;
  opacity: 0.7;
  margin-right: 4px;
}
.lane span {
  margin-right: 6px;
}
</style>
