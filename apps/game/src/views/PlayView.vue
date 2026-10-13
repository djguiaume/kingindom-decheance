<script setup lang="ts">
import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { computed, markRaw, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import GameView from '../game/GameView.vue';
import { InputHub } from '../game/input/hub.ts';
import { attachKeyboard } from '../game/input/keyboard.ts';
import { GameRuntime } from '../game/runtime.ts';
import { useHudStore } from '../stores/hud.ts';
import GameHud from './GameHud.vue';

const store = useHudStore();
// markRaw: the runtime holds live simulation state, which Vue must not make reactive (ADR-005).
const runtime = markRaw(
  new GameRuntime(prototypeContent, { ...prototypeRun, seed: Math.floor(Math.random() * 2 ** 31) }),
);
const hub = markRaw(new InputHub(runtime));

// Phones play in landscape only (design 11 §10.4): portrait shows a rotate screen and pauses.
const portraitPhone = ref(false);
const media = window.matchMedia(
  '(orientation: portrait) and (pointer: coarse) and (max-width: 900px)',
);
const onMedia = () => (portraitPhone.value = media.matches);
onMedia();

watchEffect(() => {
  runtime.paused = store.paused || portraitPhone.value;
});

// Phones suspend background tabs: pause when the page is hidden.
const onVisibility = () => {
  if (document.hidden) store.paused = true;
};

let detachKeyboard = () => {};
onMounted(() => {
  detachKeyboard = attachKeyboard(hub);
  media.addEventListener('change', onMedia);
  document.addEventListener('visibilitychange', onVisibility);
});
onBeforeUnmount(() => {
  detachKeyboard();
  media.removeEventListener('change', onMedia);
  document.removeEventListener('visibilitychange', onVisibility);
});

const showRotate = computed(() => portraitPhone.value);

function restart(): void {
  runtime.restart();
  store.paused = false;
  store.message = '';
}

/** Full screen, plus a landscape lock where the browser allows it (a convenience, ADR-009). */
async function fullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.();
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    // Not supported (e.g. iOS Safari): the game works without it.
  }
}
</script>

<template>
  <div class="play">
    <GameView :runtime="runtime" />
    <GameHud :runtime="runtime" :hub="hub" @restart="restart" @fullscreen="fullscreen" />
    <div v-if="showRotate" class="rotate" data-testid="rotate">
      <div class="phone">📱</div>
      <p>Turn your phone sideways to play.</p>
    </div>
  </div>
</template>

<style scoped>
.play {
  position: fixed;
  inset: 0;
  overflow: hidden;
  /* No page scroll, pull-to-refresh, double-tap zoom, selection or long-press menu. */
  touch-action: none;
  overscroll-behavior: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.rotate {
  position: absolute;
  inset: 0;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  font-size: 18px;
}
.phone {
  font-size: 64px;
  animation: turn 1.6s ease-in-out infinite;
}
@keyframes turn {
  50% {
    transform: rotate(90deg);
  }
}
</style>
