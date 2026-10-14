<script setup lang="ts">
/**
 * Edge arrows toward off-screen threats (design 11 §9.1): tonight's spawns by day; enemy
 * groups, the boss and buildings under attack by night. Positions come from the pure
 * `buildArrows`; this component only measures the screen and draws them.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { CameraView } from '../game/camera.ts';
import { buildArrows, type Arrow, type ArrowLayout } from '../game/indicators.ts';
import type { GameRuntime } from '../game/runtime.ts';
import { useHudStore } from '../stores/hud.ts';

const props = defineProps<{ runtime: GameRuntime; camera: CameraView }>();
const store = useHudStore();
const arrows = shallowRef<Arrow[]>([]);
const probe = ref<HTMLDivElement>();
const lastHit = new Map<string, number>();

/** Arrows sit 40 CSS px inside the safe area (and below the top bar). */
const MARGIN = 40;
const TOP_BAR = 52;

function layout(w: number, h: number): ArrowLayout {
  const safe = probe.value ? getComputedStyle(probe.value) : null;
  const px = (v: string | undefined) => Number.parseFloat(v ?? '0') || 0;
  const inset = {
    top: px(safe?.paddingTop) + MARGIN + TOP_BAR,
    right: px(safe?.paddingRight) + MARGIN,
    bottom: px(safe?.paddingBottom) + MARGIN,
    left: px(safe?.paddingLeft) + MARGIN,
  };
  // Keep clear of the right-hand controls and, on touch, the joystick corner.
  const avoid = [{ left: w - 240, top: h * 0.35, right: w, bottom: h }];
  if (store.device === 'touch') avoid.push({ left: 0, top: h - 240, right: 240, bottom: h });
  return { inset, avoid };
}

let frame = 0;
let last = 0;
function tick(now: number) {
  frame = requestAnimationFrame(tick);
  if (now - last < 66) return; // ~15 updates a second is plenty for arrows
  last = now;
  const cam = props.camera;
  if (cam.width === 0) return;
  arrows.value = buildArrows(
    props.runtime.state,
    props.runtime.ctx,
    cam,
    layout(cam.width, cam.height),
    lastHit,
    now,
  );
}

let unsubscribe = () => {};
onMounted(() => {
  unsubscribe = props.runtime.onEvents((events) => {
    const now = performance.now();
    for (const e of events) {
      if (e.type !== 'hit') continue;
      if (e.target.kind === 'castle') lastHit.set('castle', now);
      if (e.target.kind === 'building') lastHit.set(`b${e.target.id}`, now);
    }
  });
  frame = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  unsubscribe();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <div class="arrows" data-testid="edge-arrows">
    <div ref="probe" class="probe" />
    <div
      v-for="a in arrows"
      :key="a.key"
      class="arrow"
      :class="[a.kind, `s${a.size}`]"
      :data-kind="a.kind"
      :style="{ left: `${a.x}px`, top: `${a.y}px`, '--c': a.color }"
    >
      <span class="tip" :style="{ transform: `rotate(${a.angle}rad)` }" />
      <span class="label">{{ a.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.arrows {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.probe {
  position: absolute;
  visibility: hidden;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
    env(safe-area-inset-left);
}
.arrow {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  --r: 18px;
  width: calc(var(--r) * 2);
  height: calc(var(--r) * 2);
  border-radius: 50%;
  background: rgba(20, 26, 40, 0.8);
  border: 3px solid var(--c);
}
.arrow.s2 {
  --r: 22px;
}
.arrow.s3 {
  --r: 27px;
}
.tip {
  position: absolute;
  inset: 0;
}
.tip::after {
  /* A triangle just outside the disc, pointing at the target. */
  content: '';
  position: absolute;
  left: calc(100% + 1px);
  top: 50%;
  border-left: 12px solid var(--c);
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  transform: translateY(-50%);
}
.label {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}
.spawn .label {
  position: absolute;
  top: calc(100% + 4px);
  background: rgba(20, 26, 40, 0.8);
  padding: 2px 6px;
  border-radius: 6px;
}
.castle,
.building {
  animation: pulse 0.8s ease-in-out infinite alternate;
}
@keyframes pulse {
  to {
    box-shadow: 0 0 0 6px rgba(255, 77, 77, 0.35);
  }
}
</style>
