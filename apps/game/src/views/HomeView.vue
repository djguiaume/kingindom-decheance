<template>
  <section class="home" :class="{ painted: !!backdropUrl }" :style="backdrop">
    <div class="menu">
      <div class="logo" aria-label="Kingdom Déchéance">
        <span class="t1 display"
          >Kingdom<ArtSprite name="crown" icon="crown" class="tipped"
        /></span>
        <span class="t2">Déchéance</span>
      </div>
      <p class="tagline">
        Build by day, defend by night. Greyhollow: six nights, three roads and an open sky.
      </p>
      <nav class="choices">
        <RouterLink class="primary big" to="/play" data-testid="play">Play</RouterLink>
        <div class="row">
          <button data-testid="how-to-play" @click="sheet = 'how'">
            <GameIcon name="book" /> How to play
          </button>
          <button disabled class="soon" data-testid="tutorial" title="The tutorial comes next">
            Tutorial <small>soon</small>
          </button>
          <button data-testid="settings" aria-label="Settings" @click="sheet = 'settings'">
            <GameIcon name="gear" />
          </button>
        </div>
      </nav>
    </div>

    <!-- The king who rides out (the king choice, B6, will make this card a picker). -->
    <aside class="king panel" data-testid="king-card">
      <ArtSprite name="portrait" icon="crown" class="portrait" />
      <span class="who">
        <span class="kicker">Your king</span>
        <b class="display">The Panda King</b>
        <small>Spear strikes on its own. <b>Charge</b> rolls through a crowd.</small>
        <small v-if="best !== null" class="best" data-testid="home-best"
          >Best on Greyhollow: {{ best }}</small
        >
      </span>
    </aside>

    <div v-if="sheet" class="modal" @click.self="sheet = null">
      <div
        class="sheet panel capped"
        role="dialog"
        :aria-label="sheet === 'how' ? 'How to play' : 'Settings'"
      >
        <button class="close" aria-label="Close" @click="sheet = null">
          <GameIcon name="close" />
        </button>
        <template v-if="sheet === 'how'">
          <h2 class="display">How to play</h2>
          <p>
            By day, walk to a plot and build. At night, hold the line: your spear strikes on its
            own, towers shoot, soldiers follow your flag. Hold six nights to win.
          </p>
          <div class="controls" data-testid="controls">
            <div class="col">
              <h3>Computer</h3>
              <div class="ctl">
                <span>Walk</span><span><kbd>WASD</kbd> or arrows</span>
              </div>
              <div class="ctl">
                <span>Build, upgrade</span><span>hold <kbd>E</kbd> / <kbd>R</kbd></span>
              </div>
              <div class="ctl">
                <span>Grow the castle</span><span>hold <kbd>E</kbd> at the castle</span>
              </div>
              <div class="ctl">
                <span>Call the night</span><span>hold <kbd>Enter</kbd></span>
              </div>
              <div class="ctl">
                <span>Charge</span><span><kbd>Space</kbd></span>
              </div>
              <div class="ctl">
                <span>Flag, rally</span><span><kbd>F</kbd></span>
              </div>
              <div class="ctl">
                <span>Nights ahead, zoom</span><span><kbd>Tab</kbd> <kbd>Z</kbd></span>
              </div>
              <div class="ctl">
                <span>Sound, pause</span><span><kbd>M</kbd> <kbd>Esc</kbd></span>
              </div>
            </div>
            <div class="col">
              <h3>Phone, held sideways</h3>
              <div class="ctl"><span>Walk</span><span>drag on the left half</span></div>
              <div class="ctl"><span>Build, upgrade</span><span>hold a card</span></div>
              <div class="ctl"><span>Call the night</span><span>hold the moon button</span></div>
              <div class="ctl"><span>Charge, rally</span><span>round buttons, right</span></div>
              <div class="ctl"><span>Nights ahead</span><span>tap the night track</span></div>
            </div>
          </div>
        </template>
        <template v-else>
          <h2 class="display">Settings</h2>
          <button class="big" data-testid="settings-sound" @click="audio.setMuted(!muted)">
            <GameIcon :name="muted ? 'mute' : 'sound'" /> Sound {{ muted ? 'off' : 'on' }}
          </button>
          <button class="big" @click="fullscreen()">Full screen</button>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { prototypeRun } from '@kd/content/prototype';
import { computed, onBeforeUnmount, ref } from 'vue';
import { audio } from '../audio/engine.ts';
import ArtSprite from '../components/ArtSprite.vue';
import GameIcon from '../components/GameIcon.vue';
import { fullscreen } from '../fullscreen.ts';
import { loadProfile } from '../progression.ts';
import { backdropUrl } from '../ui-art.ts';

const sheet = ref<'how' | 'settings' | null>(null);
const muted = ref(audio.muted);
onBeforeUnmount(audio.onMuted((m) => (muted.value = m)));
const best = loadProfile().records[prototypeRun.mapId]?.score ?? null;
const backdrop = computed(() =>
  backdropUrl ? { '--backdrop': `url("${backdropUrl}")` } : undefined,
);
</script>

<style scoped>
/* The title screen (F16): the painted kingdom behind, linen and ink in front (corpus 14 §2.1). */
.home {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: max(20px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) 36px
    max(24px, env(safe-area-inset-left));
  background: var(--linen);
  color: var(--ink);
  overflow: hidden;
}
/* The backdrop, veiled in ink on the left so the title reads on top of it. */
.painted {
  background:
    linear-gradient(
      90deg,
      rgba(16, 22, 38, 0.86) 0%,
      rgba(16, 22, 38, 0.6) 34%,
      rgba(16, 22, 38, 0) 62%
    ),
    var(--backdrop) center / cover no-repeat,
    var(--bg);
  color: var(--linen);
}
.menu {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 2.4vh, 16px);
  align-items: flex-start;
  max-width: min(560px, 60vw);
}
.logo {
  position: relative;
  display: flex;
  flex-direction: column;
  line-height: 0.95;
}
.painted .logo {
  text-shadow: 0 3px 14px rgba(0, 0, 0, 0.55);
}
.t1 {
  position: relative;
  font-size: clamp(44px, 11vmin, 92px);
  font-weight: 900;
  letter-spacing: -0.01em;
}
.t2 {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-size: clamp(36px, 9vmin, 74px);
  padding-left: 0.9em;
  color: var(--trim);
}
.home:not(.painted) .t2 {
  color: inherit;
}
.tipped {
  position: absolute;
  right: -0.42em;
  top: -0.3em;
  font-size: 0.62em;
  color: var(--gold);
  transform: rotate(24deg);
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.4));
}
.tagline {
  margin: 0;
  font-size: 16px;
  max-width: 30em;
}
.choices {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.row button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.big {
  min-height: 52px;
  min-width: 200px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 20px;
  letter-spacing: 0.02em;
}
.soon {
  opacity: 0.65;
  cursor: default;
}
.soon small {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

/* The king card, bottom right. */
.king {
  position: absolute;
  right: max(20px, env(safe-area-inset-right));
  bottom: 30px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px 8px 8px;
  max-width: 300px;
}
.portrait {
  font-size: 76px;
  margin-top: -18px;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.3));
}
.who {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.who b.display {
  font-size: 17px;
}
.who small {
  font-size: 12px;
  line-height: 1.3;
  color: var(--muted);
}
.who small b {
  color: var(--ink);
}
.kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--livery);
}
.best {
  color: var(--gold) !important;
  font-weight: 700;
}

/* How to play and settings. */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(16, 22, 38, 0.6);
  display: grid;
  place-items: center;
  z-index: 2;
}
.sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 26px 20px;
  max-width: min(92vw, 640px);
  max-height: 88dvh;
  overflow-y: auto;
  box-sizing: border-box;
  text-align: center;
}
.sheet h2 {
  margin: 0;
  font-size: 24px;
}
.sheet p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
.close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 44px;
  height: 44px;
  padding: 0;
  box-shadow: none;
  background: none;
  font-size: 16px;
  z-index: 1;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  justify-content: center;
  text-align: left;
}
.controls .col {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 240px;
}
.controls h3 {
  margin: 0 0 2px;
  font: 700 15px var(--display);
}
.controls .ctl {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.controls .ctl span:last-child {
  color: var(--muted);
}
.controls kbd {
  margin: 0;
  opacity: 0.85;
}

/* Short landscape phones: everything shrinks to fit one screen. */
@media (max-height: 460px) {
  .tagline {
    font-size: 13px;
    max-width: 26em;
  }
  .big {
    min-height: 48px;
    font-size: 18px;
  }
  .king {
    bottom: 22px;
    max-width: 250px;
  }
  .portrait {
    font-size: 60px;
  }
}
/* Narrow portrait screens: the king card joins the column instead of floating. */
@media (max-width: 600px) {
  .home {
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 20px;
  }
  .painted {
    background:
      linear-gradient(180deg, rgba(16, 22, 38, 0.82), rgba(16, 22, 38, 0.55)),
      var(--backdrop) center / cover no-repeat,
      var(--bg);
  }
  .menu {
    max-width: none;
  }
  .king {
    position: static;
  }
}
</style>
