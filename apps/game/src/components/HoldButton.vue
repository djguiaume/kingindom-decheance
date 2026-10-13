<script setup lang="ts">
/**
 * Press-and-hold button (design 11 §10.3): a ring fills while held and the action fires when it
 * is full, so a brush of the thumb never spends gold. Works with touch, mouse and pen (Pointer
 * Events). `externalHolding` lets a keyboard hold show the same ring.
 */
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ duration: number; disabled?: boolean; externalHolding?: boolean }>();
const emit = defineEmits<{ confirm: [] }>();
const holding = ref(false);
let timer: number | undefined;

function start(e: PointerEvent) {
  if (props.disabled) return;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  holding.value = true;
  timer = window.setTimeout(() => {
    holding.value = false;
    emit('confirm');
  }, props.duration);
}
function cancel() {
  holding.value = false;
  clearTimeout(timer);
}
onBeforeUnmount(cancel);
</script>

<template>
  <button
    class="hold"
    :class="{ holding: holding || externalHolding, disabled }"
    :style="{ '--hold-ms': `${duration}ms` }"
    @pointerdown.prevent="start"
    @pointerup="cancel"
    @pointercancel="cancel"
    @pointerleave="cancel"
    @contextmenu.prevent
  >
    <span class="fill" />
    <span class="content"><slot /></span>
  </button>
</template>

<style scoped>
.hold {
  position: relative;
  overflow: hidden;
  min-height: 48px;
  min-width: 48px;
  touch-action: none;
}
.fill {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.35);
  transform: scaleX(0);
  transform-origin: left;
}
.holding .fill {
  transform: scaleX(1);
  transition: transform var(--hold-ms) linear;
}
.content {
  position: relative;
}
.disabled {
  opacity: 0.5;
}
</style>
