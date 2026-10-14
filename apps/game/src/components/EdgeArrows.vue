<script setup lang="ts">
/**
 * Edge arrows toward off-screen threats (design 11 §9.1): tonight's spawns by day; enemy
 * groups, the boss and buildings under attack by night. Positions come from the pure
 * `buildArrows`; this component only measures the screen and draws them.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import type { CameraView } from '../game/camera.ts';
import { buildArrows, pinSize, type Arrow, type ArrowLayout } from '../game/indicators.ts';
import type { GameRuntime } from '../game/runtime.ts';
import { useHudStore } from '../stores/hud.ts';
import GameIcon from './GameIcon.vue';

const props = defineProps<{ runtime: GameRuntime; camera: CameraView }>();
const store = useHudStore();
const arrows = shallowRef<Arrow[]>([]);
const probe = ref<HTMLDivElement>();
const root = ref<HTMLDivElement>();
const lastHit = new Map<string, number>();

/** Markers hug the screen edge (inside the safe area), like Thronefall's. */
const EDGE = 6;
/** Room kept between a marker and a HUD panel. */
const GAP = 4;
/** HUD panels and buttons the markers keep clear of; measured, so they follow the HUD layout. */
const HUD_SELECTOR = '.hud .panel, .hud button';

/** How often the HUD panels are measured again: measuring forces a layout, so not every frame. */
const MEASURE_MS = 250;
let panels: ArrowLayout['avoid'] = [];
let measuredAt = -Infinity;
function hudPanels(): ArrowLayout['avoid'] {
  const now = performance.now();
  if (now - measuredAt < MEASURE_MS) return panels;
  measuredAt = now;
  const origin = root.value?.getBoundingClientRect() ?? { left: 0, top: 0 };
  panels = [];
  for (const el of document.querySelectorAll(HUD_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    panels.push({
      left: r.left - origin.left - GAP,
      top: r.top - origin.top - GAP,
      right: r.right - origin.left + GAP,
      bottom: r.bottom - origin.top + GAP,
    });
  }
  return panels;
}

function layout(w: number, h: number): ArrowLayout {
  const safe = probe.value ? getComputedStyle(probe.value) : null;
  const px = (v: string | undefined) => Number.parseFloat(v ?? '0') || 0;
  const inset = {
    top: px(safe?.paddingTop) + EDGE,
    right: px(safe?.paddingRight) + EDGE,
    bottom: px(safe?.paddingBottom) + EDGE,
    left: px(safe?.paddingLeft) + EDGE,
  };
  const avoid = [...hudPanels()];
  // The joystick appears under the left thumb, low on the left.
  if (store.device === 'touch')
    avoid.push({
      left: 0,
      top: h - Math.min(160, h * 0.45),
      right: Math.min(200, w * 0.25),
      bottom: h,
    });
  return { inset, avoid };
}

/** Marker body and tip styles; the size comes from `pinSize` so placement and drawing agree. */
function pin(a: Arrow) {
  const { width: w, height: h, font } = pinSize(a.size, a.parts);
  // The tip sits on the body's edge in the arrow's direction (an ellipse is close enough to the
  // pill for the tip to overlap it, as it is the same colour).
  const tx = Math.cos(a.angle) * (w / 2 - 2);
  const ty = Math.sin(a.angle) * (h / 2 - 2);
  return {
    body: { width: `${w}px`, height: `${h}px`, fontSize: `${font}px` },
    tip: { transform: `translate(${tx}px, ${ty}px) rotate(${a.angle}rad)` },
  };
}

/**
 * Markers ease toward their new spot instead of jumping: the camera moves every frame and a
 * marker can slide out of an area to avoid, and both read as jitter when applied at once.
 */
const EASE = 0.45;
const shown = new Map<string, { x: number; y: number }>();
function ease(next: Arrow[]): Arrow[] {
  const keep = new Set<string>();
  const out = next.map((a) => {
    keep.add(a.key);
    const prev = shown.get(a.key);
    const at = prev
      ? { x: prev.x + (a.x - prev.x) * EASE, y: prev.y + (a.y - prev.y) * EASE }
      : { x: a.x, y: a.y };
    shown.set(a.key, at);
    return { ...a, ...at };
  });
  for (const key of shown.keys()) if (!keep.has(key)) shown.delete(key);
  return out;
}

let frame = 0;
let last = 0;
function tick(now: number) {
  frame = requestAnimationFrame(tick);
  if (now - last < 66) return; // ~15 updates a second is plenty for arrows
  last = now;
  const cam = props.camera;
  if (cam.width === 0) return;
  arrows.value = ease(
    buildArrows(
      props.runtime.state,
      props.runtime.ctx,
      cam,
      layout(cam.width, cam.height),
      lastHit,
      now,
    ),
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
  <div ref="root" class="arrows" data-testid="edge-arrows">
    <div ref="probe" class="probe" />
    <div
      v-for="a in arrows"
      :key="a.key"
      class="arrow"
      :class="[a.kind, `s${a.size}`, { here: a.onScreen }]"
      :data-kind="a.kind"
      :style="{ left: `${a.x}px`, top: `${a.y}px`, '--c': a.color }"
    >
      <span class="tip" :style="pin(a).tip" />
      <span class="body" :style="pin(a).body">
        <span v-for="(p, i) in a.parts" :key="i" class="part">
          <GameIcon class="icon" :name="p.icon" />
          <b v-if="p.count !== null">{{ p.count }}</b>
        </span>
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
  /* Glide between the ~15 updates a second instead of stepping. */
  transition:
    left 66ms linear,
    top 66ms linear;
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
  font-size: 1.15em;
}
.part b {
  font: 700 1em var(--display);
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
/* One of ours under attack: a white pin with a red glyph and a pulsing red halo, so it reads
   apart from enemy groups (corpus 14 §3.3). */
.castle .body,
.building .body {
  background: #fff;
  color: var(--enemy);
  border-color: var(--enemy);
  animation: pulse 0.8s ease-in-out infinite alternate;
}
@keyframes pulse {
  to {
    box-shadow: 0 0 0 6px rgba(196, 65, 47, 0.4);
  }
}
</style>
