<script setup lang="ts">
/**
 * The coming nights (design 11 §8.3, trimmed after playtest 2): tonight and the next night by
 * default, every night behind "All nights". Lane by lane, with icons and counts; the boss
 * night carries the boss's icon. A linen panel under the night track (corpus 14 §3.1, zone 4).
 */
import { computed, ref } from 'vue';
import type { NightPlan } from '../stores/hud.ts';
import { enemyIcon } from '../theme.ts';
import ArtSprite from './ArtSprite.vue';
import GameIcon from './GameIcon.vue';

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
  <div class="waves panel" data-testid="waves-panel">
    <div
      v-for="p in shown"
      :key="p.night"
      class="night"
      :class="{ tonight: p.night === tonight, past: p.night < tonight }"
      :data-night="p.night"
    >
      <strong class="n display">
        {{ when(p.night)
        }}<span v-if="p.boss" class="boss" title="Boss night"
          ><GameIcon :name="enemyIcon(p.boss)"
        /></span>
      </strong>
      <span v-for="l in p.lanes" :key="l.lane" class="lane">
        <em>{{ laneName[l.lane] ?? l.lane }}</em>
        <span v-for="e in l.enemies" :key="e.id" class="foe" :title="e.name"
          ><ArtSprite :name="e.id" :icon="enemyIcon(e.id)" class="foe-art" />{{ e.count }}</span
        >
      </span>
    </div>
    <button class="more" data-testid="waves-all" @click.stop="all = !all">
      {{ all ? 'Fewer' : 'All six nights' }}
    </button>
  </div>
</template>

<style scoped>
.waves {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  max-height: 60vh;
  overflow-y: auto;
  font-size: 13px;
}
.night {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
  padding: 4px 8px;
  border-radius: 8px;
}
.tonight {
  background: var(--linen-deep);
}
.past {
  opacity: 0.5;
}
.n {
  min-width: 4.6em;
  font-size: 14px;
}
.boss {
  margin-left: 4px;
  color: var(--enemy);
}
.lane {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 700;
}
.lane em {
  font-style: normal;
  font-weight: 500;
  color: var(--muted);
  margin-right: 3px;
}
.foe {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  margin-right: 5px;
}
.foe .gi {
  color: var(--enemy);
  font-size: 15px;
}
/* The enemy's own painting, so the player learns its look before it arrives. */
.foe-art:not(.gi) {
  font-size: 24px;
  margin: -5px 0;
}
.more {
  align-self: flex-start;
  background: none;
  box-shadow: none;
  min-height: 32px;
  color: var(--muted);
  font-size: 12px;
  padding: 4px 8px;
}
</style>
