<script setup lang="ts">
/**
 * Sound on/off, top right next to pause (corpus 14 §3.1, zone 3) on every device, plus the M key. The choice is remembered on this
 * device. It stays clickable above the pause menu.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { audio } from '../audio/engine.ts';
import GameIcon from './GameIcon.vue';

const muted = ref(audio.muted);
const off = audio.onMuted((m) => (muted.value = m));

function toggle(): void {
  audio.setMuted(!audio.muted);
}

function onKey(e: KeyboardEvent): void {
  if (e.code === 'KeyM' && !e.repeat) toggle();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  off();
});
</script>

<template>
  <button
    class="sound panel round"
    :aria-label="muted ? 'Sound off' : 'Sound on'"
    :aria-pressed="!muted"
    data-testid="sound"
    :data-muted="muted"
    @click="toggle"
  >
    <GameIcon :name="muted ? 'mute' : 'sound'" />
  </button>
</template>

<style scoped>
.sound {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  /* Left of the pause button (40 px + 8 px gap). */
  right: calc(max(12px, env(safe-area-inset-right)) + 48px);
  width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  font-size: 18px;
  display: grid;
  place-items: center;
  touch-action: manipulation;
}
/* Same scale as the other HUD zones on larger screens (corpus 14 §3.5). */
@media (min-width: 900px) and (min-height: 600px) {
  .sound {
    zoom: 1.3;
  }
}
</style>
