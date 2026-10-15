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
        <p v-if="setupLine" class="setup-line" data-testid="setup-line">{{ setupLine }}</p>
        <div class="row">
          <button data-testid="customise" @click="openSetup()">
            <GameIcon name="gear" /> Customise run
          </button>
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

    <button
      class="king panel"
      data-testid="king-card"
      aria-haspopup="dialog"
      @click="sheet = 'king'"
    >
      <ArtSprite :name="selectedKing.art.idle" icon="crown" class="portrait" />
      <span class="who">
        <span class="kicker">Your king</span>
        <b class="display">{{ selectedKing.name }}</b>
        <small>{{ selectedKing.description }}</small>
        <small class="ability">{{ selectedKing.ability.name }}</small>
        <small v-if="best !== null" class="best" data-testid="home-best"
          >Best on Greyhollow: {{ best }}</small
        >
      </span>
      <span class="change">Change</span>
    </button>

    <div v-if="sheet" class="modal" @click.self="sheet = null">
      <div
        class="sheet panel capped"
        :class="{ wide: sheet === 'setup', 'king-sheet': sheet === 'king' }"
        role="dialog"
        :aria-label="SHEET_TITLES[sheet]"
      >
        <button class="close" aria-label="Close" @click="sheet = null">
          <GameIcon name="close" />
        </button>
        <template v-if="sheet === 'king'">
          <KingPicker
            :kings="prototypeContent.kings"
            :model-value="kingId"
            :is-unlocked="(king) => isUnlocked(profile, king)"
            @update:model-value="selectKing"
          />
        </template>
        <template v-else-if="sheet === 'how'">
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
        <template v-else-if="sheet === 'setup'">
          <h2 class="display">Greyhollow</h2>
          <p v-if="best !== null" class="setup-best">Best: {{ best }}</p>
          <div class="tabs" role="tablist">
            <button
              role="tab"
              :aria-selected="tab === 'perks'"
              data-testid="tab-perks"
              @click="tab = 'perks'"
            >
              Perks {{ draftPerks.length }}/{{ STARTING_PERK_SLOTS }}
            </button>
            <button
              role="tab"
              :aria-selected="tab === 'mutators'"
              data-testid="tab-mutators"
              @click="tab = 'mutators'"
            >
              Mutators {{ draftMutators.length ? `×${draftMultiplier.toFixed(2)}` : '' }}
            </button>
          </div>
          <template v-if="tab === 'perks'">
            <p class="setup-intro">
              Pick up to {{ STARTING_PERK_SLOTS }}. A perk that helps everywhere has a cost.
            </p>
            <div class="picks" data-testid="perks">
              <button
                v-for="p in perks"
                :key="p.id"
                class="pick"
                :class="{ on: draftPerks.includes(p.id) }"
                :aria-pressed="draftPerks.includes(p.id)"
                :disabled="
                  !isUnlocked(profile, p) ||
                  (!draftPerks.includes(p.id) && draftPerks.length >= STARTING_PERK_SLOTS)
                "
                :data-testid="`perk-${p.id}`"
                @click="draftPerks = toggled(draftPerks, p.id)"
              >
                <span class="head">
                  <b>{{ p.name }}</b>
                  <span class="family">{{ p.family }}</span>
                </span>
                <small>{{ p.description }}</small>
              </button>
            </div>
          </template>
          <template v-else>
            <p class="setup-intro">
              Each makes the run harder and raises the score of a win. Bonuses add up.
            </p>
            <div class="picks" data-testid="mutators">
              <button
                v-for="m in mutators"
                :key="m.id"
                class="pick"
                :class="{ on: draftMutators.includes(m.id), easier: m.scoreBonus < 0 }"
                :aria-pressed="draftMutators.includes(m.id)"
                :disabled="!isUnlocked(profile, m)"
                :data-testid="`mutator-${m.id}`"
                @click="draftMutators = toggled(draftMutators, m.id)"
              >
                <span class="head">
                  <b>{{ m.name }}</b>
                  <span class="bonus">{{ bonusText(m.scoreBonus) }}</span>
                </span>
                <small>{{ m.description }}</small>
              </button>
            </div>
          </template>
          <div class="start">
            <span class="mult" data-testid="setup-multiplier"
              >Score ×{{ draftMultiplier.toFixed(2) }}</span
            >
            <button class="primary big" data-testid="start-run" @click="startRun()">
              Start run
            </button>
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
import { prototypeContent, prototypeRun } from '@kd/content/prototype';
import { SCORE, STARTING_PERK_SLOTS } from '@kd/core';
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { audio } from '../audio/engine.ts';
import ArtSprite from '../components/ArtSprite.vue';
import GameIcon from '../components/GameIcon.vue';
import KingPicker from '../components/KingPicker.vue';
import { fullscreen } from '../fullscreen.ts';
import { saveSelectedKingId, selectedKingId } from '../king-selection.ts';
import {
  isUnlocked,
  loadProfile,
  mutatorMultiplier,
  runSetup,
  saveProfile,
} from '../progression.ts';
import { backdropUrl } from '../ui-art.ts';

type Sheet = 'how' | 'king' | 'settings' | 'setup';
const SHEET_TITLES: Record<Sheet, string> = {
  how: 'How to play',
  king: 'Choose your king',
  settings: 'Settings',
  setup: 'Customise run',
};
const sheet = ref<Sheet | null>(null);
const router = useRouter();
const muted = ref(audio.muted);
onBeforeUnmount(audio.onMuted((m) => (muted.value = m)));
const profile = ref(loadProfile());
const best = profile.value.records[prototypeRun.mapId]?.score ?? null;
const kingId = ref(selectedKingId(prototypeContent));
const selectedKing = computed(
  () =>
    prototypeContent.kings.find((king) => king.id === kingId.value) ??
    prototypeContent.kings.find((king) => king.id === prototypeContent.defaultKing)!,
);

function selectKing(id: string): void {
  kingId.value = id;
  saveSelectedKingId(id);
  sheet.value = null;
}

// The run setup (13 §6.1). Play starts with the remembered setup; a first launch has none.
const { mutators, perks } = prototypeContent;
const named = <T extends { id: string }>(list: readonly T[], ids: readonly string[]) =>
  list.filter((x) => ids.includes(x.id));
const setup = computed(() => runSetup(profile.value, prototypeContent));
/** What Play will start with, in one line under the button. */
const setupLine = computed(() => {
  const parts = [...named(perks, setup.value.perkIds), ...named(mutators, setup.value.mutatorIds)];
  if (parts.length === 0) return '';
  const chosen = named(mutators, setup.value.mutatorIds);
  const mult = mutatorMultiplier(chosen, SCORE.multiplierFloor);
  const names = parts.map((x) => x.name).join(', ');
  return chosen.length ? `${names} · score ×${mult.toFixed(2)}` : names;
});
const tab = ref<'perks' | 'mutators'>('perks');
const draftPerks = ref<string[]>([]);
const draftMutators = ref<string[]>([]);
const draftMultiplier = computed(() =>
  mutatorMultiplier(named(mutators, draftMutators.value), SCORE.multiplierFloor),
);
const bonusText = (bonus: number) =>
  `${bonus < 0 ? '−' : '+'}${Math.round(Math.abs(bonus) * 100)}%`;
const toggled = (list: readonly string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

function openSetup(): void {
  draftPerks.value = [...setup.value.perkIds];
  draftMutators.value = [...setup.value.mutatorIds];
  sheet.value = 'setup';
}
function startRun(): void {
  const lastSetup = { perkIds: [...draftPerks.value], mutatorIds: [...draftMutators.value] };
  profile.value = { ...loadProfile(), lastSetup };
  saveProfile(profile.value);
  void router.push('/play');
}
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
  max-width: 340px;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.king:hover,
.king:focus-visible {
  border-color: var(--gold);
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
.change {
  align-self: flex-start;
  color: var(--livery);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
.who .ability {
  color: var(--gold-dark);
  font-weight: 800;
  text-transform: uppercase;
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
.king-sheet {
  width: min(94vw, 1080px);
  max-width: min(94vw, 1080px);
  height: min(88dvh, 760px);
  align-items: stretch;
  padding: 24px 28px 28px;
  text-align: left;
}
.king-sheet :deep(.heading) {
  padding-right: 36px;
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

.setup-line {
  margin: -4px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--trim);
}
.home:not(.painted) .setup-line {
  color: var(--livery);
}

/* The run setup sheet: one card per perk or mutator, its effect always visible (no hover on touch). */
.section {
  margin: 4px 0 0;
  font: 700 15px var(--display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--livery);
}
.picks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  width: 100%;
}
.pick {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-height: 56px;
  padding: 8px 10px;
  text-align: left;
  border: 2px solid var(--line);
}
.pick .head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  width: 100%;
  gap: 8px;
}
.pick .family {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--livery);
}
.tabs {
  display: flex;
  gap: 6px;
}
.tabs button {
  min-height: 44px;
  padding: 6px 16px;
  box-shadow: none;
  border: 2px solid var(--line);
}
.tabs button[aria-selected='true'] {
  border-color: var(--livery);
  box-shadow: inset 0 0 0 2px var(--trim);
}
/* The setup sheet keeps its width whatever the tab, so the cards sit in columns. */
.sheet.wide {
  width: min(92vw, 820px);
  max-width: none;
}
.setup-best {
  margin-top: -6px !important;
}
.pick .bonus {
  font-weight: 800;
  color: var(--enemy);
}
.pick.easier .bonus {
  color: var(--muted);
}
.pick small {
  font-size: 12px;
  line-height: 1.3;
  color: var(--muted);
}
.pick.on {
  border-color: var(--livery);
  box-shadow: inset 0 0 0 2px var(--trim);
}
.start {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  width: 100%;
  margin-top: 6px;
}
.mult {
  font: 800 18px var(--display);
  color: var(--gold);
}

/* Short landscape phones: everything shrinks to fit one screen. */
@media (max-height: 460px) {
  /* The setup sheet fits one screen: no scrolling past the cards on a phone. */
  .sheet {
    gap: 6px;
    padding: 10px 18px 12px;
    max-width: 96vw;
  }
  .sheet h2 {
    font-size: 20px;
  }
  .king-sheet {
    padding: 12px 18px;
  }
  .setup-intro {
    display: none;
  }
  .picks {
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
  }
  .pick {
    min-height: 48px;
    padding: 6px 8px;
  }
  .pick small {
    font-size: 11px;
  }
  /* Start run joins the title line, so the cards keep the whole height. */
  .sheet.wide {
    width: 96vw;
  }
  .start {
    position: absolute;
    top: 8px;
    right: 56px;
    width: auto;
    margin: 0;
    gap: 10px;
  }
  .start .big {
    min-width: 150px;
    min-height: 44px;
    font-size: 17px;
  }
  .mult {
    font-size: 15px;
  }
  .pick .family {
    display: none;
  }
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
