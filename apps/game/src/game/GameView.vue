<script setup lang="ts">
/**
 * The only component that touches Phaser (ADR-005): creates the game on mount,
 * destroys it on unmount.
 */
import Phaser from 'phaser';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { colors } from '../theme.ts';
import { PlayScene, SCALE } from './PlayScene.ts';
import type { GameRuntime } from './runtime.ts';

const props = defineProps<{ runtime: GameRuntime }>();
const host = ref<HTMLDivElement>();
let game: Phaser.Game | null = null;

onMounted(() => {
  const b = props.runtime.ctx.bounds;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host.value!,
    width: (b.maxX - b.minX) * SCALE,
    height: (b.maxY - b.minY) * SCALE,
    backgroundColor: colors.ground,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: new PlayScene(props.runtime),
    banner: false,
  });
});

onBeforeUnmount(() => {
  game?.destroy(true);
  game = null;
});
</script>

<template>
  <div ref="host" class="game-host" data-testid="game" />
</template>

<style scoped>
.game-host {
  width: 100%;
  max-width: 960px;
}
</style>
