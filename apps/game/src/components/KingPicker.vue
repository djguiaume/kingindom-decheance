<script setup lang="ts">
import type { KingSettings } from '@kd/content';
import ArtSprite from './ArtSprite.vue';

defineProps<{
  kings: readonly KingSettings[];
  modelValue: string;
  best: number | null;
}>();
defineEmits<{ 'update:modelValue': [id: string] }>();
</script>

<template>
  <aside class="picker panel" data-testid="king-picker" aria-label="Choose your king">
    <span class="heading">
      <span class="kicker">Choose your king</span>
      <small v-if="best !== null" data-testid="home-best">Best on Greyhollow: {{ best }}</small>
    </span>
    <div class="choices">
      <button
        v-for="king in kings"
        :key="king.id"
        class="king"
        :class="{ selected: modelValue === king.id }"
        :aria-pressed="modelValue === king.id"
        :data-testid="`king-${king.id}`"
        @click="$emit('update:modelValue', king.id)"
      >
        <ArtSprite :name="king.art.idle" icon="crown" class="portrait" />
        <span class="copy">
          <b class="display">{{ king.name }}</b>
          <small>{{ king.description }}</small>
          <span class="ability">{{ king.ability.name }}</span>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.picker {
  position: relative;
  z-index: 1;
  width: min(560px, 43vw);
  padding: 14px;
  display: grid;
  gap: 10px;
}
.heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.kicker {
  color: var(--gold-dark);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.heading small {
  color: var(--muted);
}
.choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.king {
  min-width: 0;
  padding: 10px;
  border: 2px solid color-mix(in srgb, var(--ink) 22%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--paper) 86%, transparent);
  color: var(--ink);
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  align-items: center;
  text-align: left;
}
.king.selected {
  border-color: var(--gold);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--gold) 25%, transparent);
}
.portrait {
  width: 72px;
  height: 72px;
}
.copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}
.copy b {
  font-size: 18px;
}
.copy small {
  line-height: 1.25;
  color: var(--muted);
}
.ability {
  color: var(--gold-dark);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}
@media (max-width: 780px) {
  .picker {
    width: min(94vw, 560px);
  }
}
@media (max-width: 520px) {
  .heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .choices {
    grid-template-columns: 1fr;
  }
}
</style>
