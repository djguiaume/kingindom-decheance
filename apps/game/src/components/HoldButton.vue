<script setup lang="ts">
/**
 * Press-and-hold button (design 11 §10.3): the button fills while held and the action fires when it
 * is full, so a brush of the thumb never spends gold. Works with touch, mouse and pen (Pointer
 * Events). `externalHolding` lets a keyboard hold show the same fill.
 */
import { onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ duration: number; disabled?: boolean; externalHolding?: boolean }>();
const emit = defineEmits<{ confirm: [] }>();
const holding = ref(false);
let timer: number | undefined;
let started = 0;

function start(e: PointerEvent) {
  if (props.disabled) return;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  holding.value = true;
  started = e.timeStamp;
  timer = window.setTimeout(() => {
    holding.value = false;
    emit('confirm');
  }, props.duration);
}
function cancel() {
  holding.value = false;
  clearTimeout(timer);
}
/**
 * Letting go: on a busy page the release can arrive before the timer gets to run although the
 * button was held long enough (the browser handles input before timers); the hold still counts.
 */
function release(e: PointerEvent) {
  // Event times, not handling times, so a quick tap handled late never counts as a hold.
  const full = holding.value && e.timeStamp - started >= props.duration;
  cancel();
  if (full) emit('confirm');
}
onBeforeUnmount(cancel);
</script>

<template>
  <button
    class="hold"
    :class="{ holding: holding || externalHolding, disabled }"
    :style="{ '--hold-ms': `${duration}ms` }"
    @pointerdown.prevent="start"
    @pointerup="release"
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
  /* The whole button fills left to right while held: a wash of gold (money) or the button's
     --fill, with a solid leading edge so progress reads at a glance. */
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 0;
  background: color-mix(in srgb, var(--fill, var(--gold)) 38%, transparent);
  box-shadow: inset -3px 0 0 var(--fill, var(--gold));
}
.holding .fill {
  /* Width rather than a scale, so the leading edge keeps its thickness. */
  width: 100%;
  transition: width var(--hold-ms) linear;
}
.content {
  position: relative;
}
.disabled {
  filter: grayscale(1);
  opacity: 0.75;
}
</style>
