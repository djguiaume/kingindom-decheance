<script setup lang="ts">
/**
 * Sound on/off, top-right on every device, plus the M key. The choice is remembered on this
 * device. It stays clickable above the pause menu.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { audio } from '../audio/engine.ts';

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
    class="sound"
    :aria-label="muted ? 'Sound off' : 'Sound on'"
    :aria-pressed="!muted"
    data-testid="sound"
    :data-muted="muted"
    @click="toggle"
  >
    {{ muted ? '🔇' : '🔊' }}
  </button>
</template>

<style scoped>
.sound {
  position: absolute;
  top: max(8px, env(safe-area-inset-top));
  right: max(8px, env(safe-area-inset-right));
  width: 44px;
  height: 44px;
  border-radius: 50%;
  padding: 0;
  font-size: 20px;
  line-height: 1;
  background: rgba(20, 26, 40, 0.75);
  border: none;
  touch-action: manipulation;
}
</style>
