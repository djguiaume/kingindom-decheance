<script setup lang="ts">
import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
} from 'vue';
import { CameraView } from '../game/camera.ts';
import GameView from '../game/GameView.vue';
import EdgeArrows from '../components/EdgeArrows.vue';
import SoundToggle from '../components/SoundToggle.vue';
import GameIcon from '../components/GameIcon.vue';
import { attachAudio } from '../audio/attach.ts';
import { fullscreen } from '../fullscreen.ts';
import { audio } from '../audio/engine.ts';
import { InputHub } from '../game/input/hub.ts';
import { attachKeyboard } from '../game/input/keyboard.ts';
import { GameRuntime } from '../game/runtime.ts';
import { loadProfile, runSetup } from '../progression.ts';
import { useHudStore } from '../stores/hud.ts';
import GameHud from './GameHud.vue';

const store = useHudStore();
// markRaw: the runtime holds live simulation state, which Vue must not make reactive (ADR-005).
// The run setup screen saved its choices in the profile; Play starts with them (13 §6.1).
const runtime = markRaw(
  new GameRuntime(prototypeContent, {
    ...prototypeRun,
    ...runSetup(loadProfile(), prototypeContent),
    seed: Math.floor(Math.random() * 2 ** 31),
  }),
);
const hub = markRaw(new InputHub(runtime));
const camera = markRaw(new CameraView());
const battlefieldTop = ref(0);
let toolbarObserver: ResizeObserver | null = null;

/** Keep the rendered battlefield below the actual toolbar, including safe areas and boss HP. */
function measureToolbar(): void {
  if (store.hud?.phase !== 'night') {
    battlefieldTop.value = 0;
    return;
  }
  let bottom = 0;
  for (const el of document.querySelectorAll('[data-battlefield-obstacle]')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) bottom = Math.max(bottom, r.bottom);
  }
  battlefieldTop.value = Math.ceil(bottom + 4);
}

async function observeToolbar(): Promise<void> {
  await nextTick();
  toolbarObserver?.disconnect();
  for (const el of document.querySelectorAll('[data-battlefield-obstacle]'))
    toolbarObserver?.observe(el);
  measureToolbar();
}
watch(() => [store.hud?.phase, !!store.hud?.boss], observeToolbar);

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
let detachAudio = () => {};
onMounted(() => {
  toolbarObserver = new ResizeObserver(measureToolbar);
  void observeToolbar();
  window.addEventListener('resize', measureToolbar);
  detachKeyboard = attachKeyboard(hub);
  detachAudio = attachAudio(runtime, audio);
  media.addEventListener('change', onMedia);
  document.addEventListener('visibilitychange', onVisibility);
});
onBeforeUnmount(() => {
  toolbarObserver?.disconnect();
  window.removeEventListener('resize', measureToolbar);
  detachKeyboard();
  detachAudio();
  media.removeEventListener('change', onMedia);
  document.removeEventListener('visibilitychange', onVisibility);
});

const showRotate = computed(() => portraitPhone.value);

function restart(): void {
  runtime.restart();
  store.paused = false;
  store.message = '';
}
</script>

<template>
  <div class="play">
    <GameView :runtime="runtime" :camera="camera" :top-inset="battlefieldTop" />
    <EdgeArrows :runtime="runtime" :camera="camera" />
    <GameHud :runtime="runtime" :hub="hub" @restart="restart" @fullscreen="fullscreen" />
    <SoundToggle />
    <div v-if="showRotate" class="rotate" data-testid="rotate">
      <div class="phone"><GameIcon name="turn" /></div>
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
  color: var(--gold);
  animation: turn 1.6s ease-in-out infinite;
}
@keyframes turn {
  50% {
    transform: rotate(90deg);
  }
}
</style>
