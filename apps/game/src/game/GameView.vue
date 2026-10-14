<script setup lang="ts">
/**
 * The only component that touches Phaser (ADR-005): creates the game on mount, destroys it on
 * unmount. The canvas fills its container and follows window and orientation changes.
 */
import Phaser from 'phaser';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useHudStore } from '../stores/hud.ts';
import { colors } from '../theme.ts';
import type { CameraView } from './camera.ts';
import { PlayScene } from './PlayScene.ts';
import type { GameRuntime } from './runtime.ts';

const props = defineProps<{ runtime: GameRuntime; camera: CameraView; topInset: number }>();
const store = useHudStore();
const host = ref<HTMLDivElement>();
let game: Phaser.Game | null = null;

onMounted(() => {
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host.value!,
    backgroundColor: colors.background,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: new PlayScene(props.runtime, {
      zoomClose: () => store.zoomClose,
      toggleZoom: () => (store.zoomClose = !store.zoomClose),
      camera: props.camera,
      topInset: () => props.topInset,
    }),
    banner: false,
  });
});

watch(
  () => props.topInset,
  async () => {
    await nextTick();
    game?.scale.getParentBounds();
    game?.scale.refresh();
  },
);

onBeforeUnmount(() => {
  game?.destroy(true);
  game = null;
});
</script>

<template>
  <div ref="host" class="game-host" data-testid="game" :style="{ top: `${topInset}px` }" />
</template>

<style scoped>
.game-host {
  position: absolute;
  inset: 0;
}
</style>
