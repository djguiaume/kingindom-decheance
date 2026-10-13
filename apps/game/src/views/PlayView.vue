<script setup lang="ts">
import { placeholderContent } from '@kd/content/placeholder';
import { markRaw } from 'vue';
import GameView from '../game/GameView.vue';
import { GameRuntime } from '../game/runtime.ts';
import HudPanel from './HudPanel.vue';

// markRaw: the runtime holds live simulation state, which Vue must not make reactive (ADR-005).
const runtime = markRaw(
  new GameRuntime(placeholderContent, {
    mapId: 'placeholder',
    weaponId: 'sword',
    seed: Math.floor(Math.random() * 2 ** 31),
  }),
);
</script>

<template>
  <div class="play">
    <GameView :runtime="runtime" />
    <HudPanel :runtime="runtime" />
  </div>
</template>

<style scoped>
.play {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}
</style>
