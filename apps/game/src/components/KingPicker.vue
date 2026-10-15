<script setup lang="ts">
import type { KingSettings, Weapon } from '@kd/content';
import ArtSprite from './ArtSprite.vue';

defineProps<{
  kings: readonly KingSettings[];
  modelValue: string;
  isUnlocked: (entry: { unlock?: { level: number } }) => boolean;
  /** The weapons the king can carry; the row is left out when absent. */
  weapons?: readonly Weapon[];
  weaponId?: string;
}>();
defineEmits<{ 'update:modelValue': [id: string]; 'update:weaponId': [id: string] }>();
</script>

<template>
  <section class="picker" data-testid="king-picker" aria-label="Choose your king">
    <span class="heading">
      <span class="kicker">Choose your king</span>
      <small>Your choice changes movement, survivability and the active ability.</small>
    </span>
    <div class="choices">
      <button
        v-for="king in kings"
        :key="king.id"
        class="king"
        :class="{ selected: modelValue === king.id, locked: !isUnlocked(king) }"
        :aria-pressed="modelValue === king.id"
        :disabled="!isUnlocked(king)"
        :data-testid="`king-${king.id}`"
        @click="$emit('update:modelValue', king.id)"
      >
        <ArtSprite :name="king.art.idle" icon="crown" class="portrait" />
        <span class="copy">
          <b class="display">{{ king.name }}</b>
          <small>{{ king.description }}</small>
          <span class="ability">{{ king.ability.name }}</span>
          <span v-if="!isUnlocked(king)" class="unlock">
            Unlocks at level {{ king.unlock?.level ?? '?' }}
          </span>
        </span>
      </button>
    </div>
    <div v-if="weapons" class="weapons" data-testid="weapon-picker">
      <span class="kicker">Weapon</span>
      <button
        v-for="w in weapons"
        :key="w.id"
        class="weapon"
        :class="{ selected: weaponId === w.id }"
        :aria-pressed="weaponId === w.id"
        :disabled="!isUnlocked(w)"
        :data-testid="`weapon-${w.id}`"
        @click="$emit('update:weaponId', w.id)"
      >
        <b>{{ w.name }}</b>
        <small>{{ w.description }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.picker {
  width: 100%;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, auto) auto;
  align-content: start;
  gap: 16px;
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
  text-align: right;
}
.choices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
  gap: 12px;
  align-content: start;
  overflow-y: auto;
  padding: 2px;
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
.weapons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(250px, 100%), 1fr));
  gap: 8px 12px;
  padding: 2px;
}
.weapons .kicker {
  grid-column: 1 / -1;
}
.weapon {
  min-width: 0;
  padding: 8px 10px;
  border: 2px solid color-mix(in srgb, var(--ink) 22%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--paper) 86%, transparent);
  color: var(--ink);
  display: grid;
  gap: 2px;
  text-align: left;
}
.weapon small {
  line-height: 1.25;
  color: var(--muted);
}
.weapon.selected,
.king.selected {
  border-color: var(--gold);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--gold) 25%, transparent);
}
.king.locked {
  opacity: 0.58;
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
.unlock {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}
@media (max-width: 780px) {
  .heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .heading small {
    text-align: left;
  }
}
@media (max-height: 460px) {
  .picker {
    gap: 8px;
  }
  .heading small {
    display: none;
  }
  .king {
    grid-template-columns: 58px 1fr;
    padding: 7px;
  }
  .portrait {
    width: 58px;
    height: 58px;
  }
}
</style>
