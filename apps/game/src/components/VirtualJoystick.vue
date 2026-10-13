<script setup lang="ts">
/**
 * Floating virtual joystick (design 11 §10.3): touching anywhere in the zone places the stick
 * under the thumb; dragging steers; distance sets speed (full at 48 CSS px); lifting stops.
 * Only touch and pen start it, so a mouse click on the map does not.
 */
import { ref } from 'vue';

const FULL_SPEED_PX = 48;
const emit = defineEmits<{ move: [x: number, y: number] }>();
const origin = ref<{ x: number; y: number } | null>(null);
const knob = ref({ x: 0, y: 0 });
let pointer: number | null = null;

function down(e: PointerEvent) {
  if (e.pointerType === 'mouse' || pointer !== null) return;
  pointer = e.pointerId;
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  origin.value = { x: e.clientX, y: e.clientY };
  knob.value = { x: 0, y: 0 };
}
function moveEvt(e: PointerEvent) {
  if (e.pointerId !== pointer || !origin.value) return;
  let dx = e.clientX - origin.value.x;
  let dy = e.clientY - origin.value.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > FULL_SPEED_PX) {
    dx = (dx / len) * FULL_SPEED_PX;
    dy = (dy / len) * FULL_SPEED_PX;
  }
  knob.value = { x: dx, y: dy };
  emit('move', dx / FULL_SPEED_PX, dy / FULL_SPEED_PX);
}
function up(e: PointerEvent) {
  if (e.pointerId !== pointer) return;
  pointer = null;
  origin.value = null;
  emit('move', 0, 0);
}
</script>

<template>
  <div
    class="zone"
    data-testid="joystick-zone"
    @pointerdown="down"
    @pointermove="moveEvt"
    @pointerup="up"
    @pointercancel="up"
  >
    <div v-if="origin" class="base" :style="{ left: `${origin.x}px`, top: `${origin.y}px` }">
      <div class="knob" :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }" />
    </div>
  </div>
</template>

<style scoped>
.zone {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 45%;
  height: 70%;
  touch-action: none;
  pointer-events: auto;
}
.base {
  position: fixed;
  width: 112px;
  height: 112px;
  margin: -56px 0 0 -56px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.45);
  background: rgba(0, 0, 0, 0.15);
  display: grid;
  place-items: center;
}
.knob {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
}
</style>
