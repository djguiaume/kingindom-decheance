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

/**
 * Marker body size per arrow size, in CSS px: a red pill sized to its icons and counts, so the
 * tip can sit on its edge (one shape, like a map pin).
 */
const HEIGHT = { 1: 30, 2: 36, 3: 44 } as const;
function pin(a: Arrow) {
  const h = HEIGHT[a.size];
  const font = Math.round(h * 0.45);
  const partW = (p: Arrow['parts'][number]) =>
    font * 1.3 + (p.count === null ? 0 : String(p.count).length * font * 0.62);
  const w = Math.max(
    h,
    a.parts.reduce((n, p) => n + partW(p), 0) + (a.parts.length - 1) * 6 + h * 0.6,
  );
  // The tip sits on the body's edge in the arrow's direction (an ellipse is close enough to the
  // pill for the tip to overlap it, as it is the same colour).
  const tx = Math.cos(a.angle) * (w / 2 - 2);
  const ty = Math.sin(a.angle) * (h / 2 - 2);
  return {
    body: { width: `${w}px`, height: `${h}px`, fontSize: `${font}px` },
    tip: { transform: `translate(${tx}px, ${ty}px) rotate(${a.angle}rad)` },
  };
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
      <span class="tip" :style="pin(a).tip" />
      <span class="body" :style="pin(a).body">
        <span v-for="(p, i) in a.parts" :key="i" class="part"
          ><span class="icon">{{ p.icon }}</span
          ><b v-if="p.count !== null">{{ p.count }}</b></span
        >
      </span>
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
  width: 0;
  height: 0;
}
.body {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 999px;
  background: var(--c);
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  color: #fff;
  white-space: nowrap;
}
.part {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}
.icon {
  /* Emoji placeholders drawn as white silhouettes until the art pass brings real icons. */
  filter: brightness(0) invert(1);
}
.part b {
  font-weight: 800;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
}
.tip {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}
.tip::after {
  /* A triangle pointing at the target, its base hidden under the body's edge. */
  content: '';
  position: absolute;
  left: -2px;
  top: -9px;
  border-left: 14px solid var(--c);
  border-top: 9px solid transparent;
  border-bottom: 9px solid transparent;
}
.castle .body,
.building .body {
  animation: pulse 0.8s ease-in-out infinite alternate;
}
.castle .icon,
.building .icon,
.boss .icon {
  filter: none;
}
@keyframes pulse {
  to {
    box-shadow: 0 0 0 6px rgba(255, 77, 77, 0.35);
  }
}
</style>
