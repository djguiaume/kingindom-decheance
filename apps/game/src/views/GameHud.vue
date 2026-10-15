<script setup lang="ts">
/**
 * The HUD and on-screen controls, laid out for a landscape phone first (design 11 §10.3) and
 * equally usable with a mouse. Zones and look follow corpus 14 (direction A, "Linen and ink"):
 * what you read sits on top, what you press sits in the bottom third. It reads HUD snapshots and sends intents through the InputHub;
 * it never touches the live game state.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import HoldButton from '../components/HoldButton.vue';
import NightTrack from '../components/NightTrack.vue';
import VirtualJoystick from '../components/VirtualJoystick.vue';
import WavesPanel from '../components/WavesPanel.vue';
import GameIcon from '../components/GameIcon.vue';
import ArtSprite from '../components/ArtSprite.vue';
import { HOLD_BUY_MS, HOLD_NIGHT_MS, type InputHub } from '../game/input/hub.ts';
import type { GameRuntime } from '../game/runtime.ts';
import { scoreOf, type ScoreBreakdown } from '@kd/core';
import { loadProfile, recordRun, saveProfile } from '../progression.ts';
import { nightPlans, snapshot, useHudStore } from '../stores/hud.ts';
import { enemyIcon, perkIcon } from '../theme.ts';
import { castleArt, uiFrame } from '../ui-art.ts';

const props = defineProps<{ runtime: GameRuntime; hub: InputHub }>();
const emit = defineEmits<{ restart: []; fullscreen: [] }>();
const store = useHudStore();
const touch = computed(() => store.device === 'touch');
const router = useRouter();
/** Back to the title screen; the run is abandoned (PlayView tears it down). */
function home(): void {
  store.paused = false;
  store.pickerOpen = false;
  store.waveOpen = false;
  store.message = '';
  void router.push('/');
}
const keyHint = (key: string) => (touch.value ? '' : key);

let stick = { x: 0, y: 0 };
function onStick(x: number, y: number) {
  stick = { x, y };
  props.hub.move(x, y, 'touch');
}
function charge(e: PointerEvent) {
  props.hub.ability(e.pointerType === 'mouse' ? 'keyboard' : 'touch', stick);
}

const plans = nightPlans(props.runtime.ctx);
const bosses = Object.fromEntries(
  plans.filter((p) => p.boss).map((p) => [p.night, enemyIcon(p.boss!)]),
);
/** The last night's boss, painted on the boss bar. */
const bossId = [...plans].reverse().find((p) => p.boss)?.boss ?? 'warlord';
/** Without the art the coin is drawn in CSS (`.coin.plain`). */
const paintedCoin = !!uiFrame('coin');
function rally(e: PointerEvent) {
  props.hub.rally(e.pointerType === 'mouse' ? 'keyboard' : 'touch');
}

/** The finished run's score, its line in the profile and the record it had to beat. */
const result = ref<{ score: ScoreBreakdown; newBest: boolean; best: number | null } | null>(null);
/** Scores the run once it ends and keeps it in the browser's profile (13 §2.3). */
function finish(): void {
  const { state, ctx } = props.runtime;
  const score = scoreOf(state, ctx);
  const run = {
    mapId: state.mapId,
    score: score.total,
    won: score.won,
    nights: score.nightsHeld,
    weaponId: state.weaponId,
    kingId: state.kingId,
    perks: [...state.perks],
    mutators: ctx.mutators.map((m) => m.id),
    seed: state.seed,
    date: new Date().toISOString(),
  };
  const recorded = recordRun(loadProfile(), run);
  saveProfile(recorded.profile);
  result.value = { score, newBest: recorded.newBest, best: recorded.previousBest?.score ?? null };
}

const refresh = () => {
  store.hud = snapshot(props.runtime.state, props.runtime.ctx);
  // A restart starts a new run: forget the last one's result.
  if (result.value && store.hud.phase !== 'won' && store.hud.phase !== 'lost') result.value = null;
  // The picker belongs to the castle by day: walking away or nightfall closes it.
  if (store.pickerOpen && !store.hud.castle?.next) props.hub.closePicker();
};

/** A short card at dawn: the night just held, what it paid, what it cost (playtest 2). */
const DAWN_CARD_MS = 3000;
const dawnCard = ref<{ night: number; income: number; killed: number; lost: number } | null>(null);
let dawnTimer: number | undefined;
let timer: number | undefined;
let unsubscribe = () => {};
onMounted(() => {
  refresh();
  timer = window.setInterval(refresh, 100);
  unsubscribe = props.runtime.onEvents((events) => {
    // The last dawn ends the run: the outcome screen says it instead.
    if (events.some((e) => e.type === 'won' || e.type === 'lost')) {
      finish();
      return;
    }
    const dawn = events.find((e) => e.type === 'dawn');
    const night = dawn && props.runtime.state.history.at(-1);
    if (!night) return;
    dawnCard.value = {
      night: night.night,
      income: night.income,
      killed: night.enemiesKilled,
      lost: night.buildingsLost,
    };
    window.clearTimeout(dawnTimer);
    dawnTimer = window.setTimeout(() => (dawnCard.value = null), DAWN_CARD_MS);
  });
});
onBeforeUnmount(() => {
  window.clearInterval(timer);
  window.clearTimeout(dawnTimer);
  unsubscribe();
});

const rallyLabel = computed(() => {
  const h = store.hud;
  if (!h) return '';
  if (h.phase === 'night') return h.followers > 0 ? `Drop ${h.followers}` : 'Rally';
  return h.flagHere ? 'Take flag' : 'Plant flag';
});
const showRally = computed(() => {
  const h = store.hud;
  if (!h) return false;
  if (h.phase === 'night') return h.hasBarracks;
  return h.phase === 'day' && (h.flagHere || h.flagsCarried > 0);
});
/** Gold ring around Charge: full when ready, emptying after use. */
const cooldownStyle = computed(() => ({
  background: `conic-gradient(var(--gold) ${(1 - (store.hud?.abilityCooldown ?? 0)) * 360}deg, rgba(36,39,44,0.18) 0)`,
}));
const pct = (v: number, max: number) =>
  `${Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)))}%`;
</script>

<template>
  <div v-if="store.hud" class="hud" :class="{ touch, combat: store.hud.phase === 'night' }">
    <VirtualJoystick @move="onStick" />

    <!-- Zone 1, top left: the treasury. Gold, then castle and king health as bars. -->
    <div class="treasury panel zone" data-battlefield-obstacle>
      <span class="coin" :class="{ plain: !paintedCoin }"
        ><ArtSprite name="coin" icon="coin"
      /></span>
      <span class="gold display" data-testid="gold">{{ store.hud.gold }}</span>
      <span class="health">
        <span class="row" :title="`Castle ${store.hud.castleHp} / ${store.hud.castleMaxHp}`">
          <GameIcon name="keep" /><small
            v-if="store.hud.castleLevel > 1"
            class="lvl"
            data-testid="castle-level"
            >{{ store.hud.castleLevel }}</small
          >
          <span class="bar" data-testid="castle-hp"
            ><i :style="{ width: pct(store.hud.castleHp, store.hud.castleMaxHp) }"
          /></span>
        </span>
        <span
          class="row"
          :class="{ down: !store.hud.kingAlive }"
          :title="`King ${store.hud.kingHp} / ${store.hud.kingMaxHp}`"
        >
          <ArtSprite name="portrait" icon="crown" class="face-art" />
          <span v-if="store.hud.kingAlive" class="bar king" data-testid="king-hp"
            ><i :style="{ width: pct(store.hud.kingHp, store.hud.kingMaxHp) }"
          /></span>
          <span v-else class="respawn" data-testid="king-hp"
            >back in {{ store.hud.kingRespawnSeconds }}s</span
          >
        </span>
      </span>
    </div>

    <!-- Zones 2 and 4, top centre: the night track, and under it one message at a time. -->
    <div class="centre zone">
      <NightTrack
        :day="store.hud.day"
        :nights="store.hud.nights"
        :phase="store.hud.phase"
        :bosses="bosses"
        :enemies-left="store.hud.enemiesLeft"
        :touch="touch"
        @click="store.waveOpen = !store.waveOpen"
      />
      <section v-if="store.waveOpen" class="wave-panel" @click="store.waveOpen = false">
        <WavesPanel :plans="plans" :tonight="store.hud.day" />
      </section>
      <div
        v-else-if="store.hud.boss"
        class="boss-bar panel"
        data-battlefield-obstacle
        data-testid="boss-bar"
      >
        <ArtSprite :name="bossId" :icon="bosses[store.hud.nights] ?? 'helm'" class="boss-art" />
        <strong class="display">{{ store.hud.boss.name }}</strong>
        <span class="bar"
          ><i :style="{ width: pct(store.hud.boss.hp, store.hud.boss.maxHp) }"
        /></span>
      </div>
      <div v-else-if="dawnCard" class="dawn-card panel" data-testid="dawn-card">
        <span class="kicker">Dawn</span>
        <strong class="display">Night {{ dawnCard.night }} held</strong>
        <span
          ><b>+{{ dawnCard.income }}</b> gold · {{ dawnCard.killed }} fell<template
            v-if="dawnCard.lost > 0"
          >
            · <b class="lost">{{ dawnCard.lost }}</b> building{{
              dawnCard.lost > 1 ? 's' : ''
            }}
            burned, rebuilt</template
          ></span
        >
      </div>
      <p v-if="store.message && store.hud.phase !== 'night'" class="toast panel">
        {{ store.message }}
      </p>
    </div>

    <p v-if="store.message && store.hud.phase === 'night'" class="toast panel">
      {{ store.message }}
    </p>

    <!-- Zone 3, top right: pause (sound sits just left of it, see SoundToggle). -->
    <button
      class="pause panel round zone"
      data-battlefield-obstacle
      aria-label="Pause"
      data-testid="pause"
      @click="hub.togglePause()"
    >
      <GameIcon name="pause" />
    </button>

    <!-- Zone 7, bottom centre: by day, the plot you stand on and what it can become. -->
    <div v-if="store.hud.phase === 'day' && store.hud.nearby" class="band zone">
      <div class="slot-title" data-testid="slot-title">
        <strong class="display">{{ store.hud.nearby.current ?? 'Empty plot' }}</strong>
        <small v-if="store.hud.nearby.currentStats">{{ store.hud.nearby.currentStats }}</small>
      </div>
      <div class="cards">
        <HoldButton
          v-if="store.hud.nearby.rally"
          class="card panel"
          :duration="HOLD_BUY_MS"
          :external-holding="store.keyHold === 'buy-0'"
          data-testid="rally"
          @confirm="hub.mainAction()"
        >
          <span class="offer">
            <span class="offer-head"
              ><GameIcon name="flag" /><b class="display">Guard</b><kbd v-if="!touch">E</kbd></span
            >
            <small class="offer-desc"
              >{{ store.hud.nearby.rally.replace('gate_', '') }} gate · tap to change</small
            >
          </span>
        </HoldButton>
        <HoldButton
          v-for="o in store.hud.nearby.offers"
          :key="o.option"
          class="card panel"
          :duration="HOLD_BUY_MS"
          :disabled="!o.affordable || o.needsCastle !== null"
          :external-holding="
            store.keyHold === (store.hud.nearby.rally || o.option === 1 ? 'buy-1' : 'buy-0')
          "
          :data-testid="`buy-${o.option}`"
          @confirm="hub.buy(o.option)"
        >
          <span class="offer">
            <span class="offer-head">
              <span class="thumb"
                ><ArtSprite :name="o.building" /><GameIcon
                  v-if="o.kind === 'upgrade'"
                  name="up"
                  class="up"
              /></span>
              <b class="display">{{ o.name }}</b>
              <span class="cost"><i />{{ o.cost }}</span>
              <kbd v-if="!touch">{{ store.hud.nearby.rally || o.option === 1 ? 'R' : 'E' }}</kbd>
            </span>
            <small v-if="o.needsCastle" class="offer-lock" data-testid="offer-lock"
              ><GameIcon name="keep" /> Needs castle level {{ o.needsCastle }}</small
            >
            <small v-if="o.stats" class="offer-stats" data-testid="offer-stats">{{
              o.stats
            }}</small>
            <small class="offer-desc">{{ o.description }}</small>
          </span>
        </HoldButton>
      </div>
    </div>

    <!-- Zone 7 at the castle: its level, and the next one (13 §1). -->
    <div v-if="store.hud.phase === 'day' && store.hud.castle" class="band zone">
      <div class="slot-title" data-testid="slot-title">
        <strong class="display">Castle · level {{ store.hud.castle.level }}</strong>
        <small v-if="!store.hud.castle.next">Highest level</small>
      </div>
      <div v-if="store.hud.castle.next" class="cards">
        <HoldButton
          class="card panel castle-card"
          :duration="HOLD_BUY_MS"
          :disabled="!store.hud.castle.next.affordable"
          :external-holding="store.keyHold === 'buy-0' && !store.pickerOpen"
          data-testid="castle-up"
          @confirm="hub.openCastle()"
        >
          <span class="offer">
            <span class="offer-head">
              <span class="thumb castle-thumb"
                ><ArtSprite :name="castleArt(store.hud.castle.next.level)" icon="keep" /><GameIcon
                  name="up"
                  class="up"
              /></span>
              <b class="display">Level {{ store.hud.castle.next.level }}</b>
              <span class="cost"><i />{{ store.hud.castle.next.cost }}</span>
              <kbd v-if="!touch">E</kbd>
            </span>
            <small class="offer-stats">{{ store.hud.castle.next.stats }}</small>
            <small class="offer-desc"
              >{{ store.hud.castle.next.unlocks }} Then pick one perk of three.</small
            >
          </span>
        </HoldButton>
      </div>
    </div>

    <!-- Zone 8, bottom right: the right thumb's buttons. -->
    <div class="actions zone">
      <button
        v-if="showRally"
        class="rally-btn panel round"
        :data-testid="store.hud.phase === 'night' ? 'rally-night' : 'rally-day'"
        @pointerdown.prevent="rally"
      >
        <GameIcon name="flag" />
        <span>{{ rallyLabel }}</span>
        <span v-if="store.hud.phase === 'night' && store.hud.followers > 0" class="badge">{{
          store.hud.followers
        }}</span>
        <kbd v-if="!touch">F</kbd>
      </button>

      <button
        v-if="store.hud.phase === 'night' && store.hud.abilityName"
        class="charge"
        data-testid="charge"
        :disabled="store.hud.abilityCooldown > 0"
        @pointerdown.prevent="charge"
      >
        <span class="ring" :style="cooldownStyle" />
        <span class="face panel round">
          <ArtSprite :name="`${store.hud.abilityArt}.f1`" icon="spear" class="charge-art" />
          <span>{{ store.hud.abilityName }}</span>
          <kbd v-if="!touch">Space</kbd>
        </span>
      </button>

      <HoldButton
        v-if="store.hud.phase === 'day'"
        class="call panel"
        :duration="HOLD_NIGHT_MS"
        :external-holding="store.keyHold === 'night'"
        data-testid="start-night"
        @confirm="hub.startNight()"
      >
        <span class="call-in">
          <span class="moon"><GameIcon name="moon" /></span>
          <span class="call-text"
            ><b class="display">Call the night</b
            ><small>Hold <kbd v-if="!touch">Enter</kbd></small></span
          >
        </span>
      </HoldButton>
    </div>

    <!-- The castle's perk picker: three cards, tap one, then hold Choose (13 §1.1). -->
    <div
      v-if="store.pickerOpen && store.hud.castle?.next"
      class="modal picker"
      data-testid="perk-picker"
      @click.self="hub.closePicker()"
    >
      <div class="sheet panel capped">
        <span class="kicker">Castle level {{ store.hud.castle.next.level }}</span>
        <h2 class="display">Choose a perk</h2>
        <p>It lasts for the whole run.</p>
        <div class="perks">
          <button
            v-for="(p, i) in store.hud.castle.next.perks"
            :key="p.id"
            class="perk panel"
            :class="{ picked: store.pick === i }"
            :aria-pressed="store.pick === i"
            :data-testid="`perk-${i}`"
            @click="hub.selectPerk(i)"
          >
            <span class="perk-icon"><GameIcon :name="perkIcon(p.id)" /></span>
            <b class="display">{{ p.name }}</b>
            <small>{{ p.description }}</small>
            <kbd v-if="!touch">{{ i + 1 }}</kbd>
          </button>
        </div>
        <div class="picker-actions">
          <button data-testid="perk-back" @click="hub.closePicker()">
            Back<kbd v-if="!touch">Esc</kbd>
          </button>
          <HoldButton
            class="primary choose"
            :duration="HOLD_BUY_MS"
            :disabled="store.pick === null"
            :external-holding="store.keyHold === 'buy-0'"
            data-testid="perk-choose"
            @confirm="hub.choosePerk()"
          >
            Choose<span class="cost"><i />{{ store.hud.castle.next.cost }}</span
            ><kbd v-if="!touch">hold E</kbd>
          </HoldButton>
        </div>
      </div>
    </div>

    <div
      v-if="store.hud.phase === 'won' || store.hud.phase === 'lost'"
      class="modal"
      data-testid="outcome"
    >
      <div class="sheet panel capped outcome" :class="store.hud.phase">
        <ArtSprite name="portrait" icon="crown" class="outcome-art" />
        <h2 class="display">
          {{ store.hud.phase === 'won' ? 'Greyhollow stands' : 'Greyhollow has fallen' }}
        </h2>
        <p>
          {{
            store.hud.phase === 'won'
              ? `You held all ${store.hud.nights} nights.`
              : `You held ${Math.max(0, store.hud.day - 1)} night${store.hud.day === 2 ? '' : 's'}.`
          }}
        </p>
        <dl v-if="result" class="score" data-testid="score">
          <div>
            <dt>Nights held</dt>
            <dd>{{ result.score.nightsHeld }} × 150</dd>
            <dd>{{ result.score.nightsHeld * 150 }}</dd>
          </div>
          <div v-if="result.score.buildingsLost > 0">
            <dt>Buildings lost</dt>
            <dd>{{ result.score.buildingsLost }}</dd>
            <dd class="minus">−{{ result.score.lostPoints }}</dd>
          </div>
          <div v-if="result.score.won">
            <dt>Gold left</dt>
            <dd>{{ result.score.goldLeft }} × 5</dd>
            <dd>+{{ result.score.goldPoints }}</dd>
          </div>
          <div v-if="result.score.won && result.score.multiplier !== 1">
            <dt>Score bonus</dt>
            <dd />
            <dd>×{{ result.score.multiplier }}</dd>
          </div>
          <div v-if="!result.score.won" class="note">
            <dt>Gold and score bonuses count only on victory</dt>
          </div>
          <div class="total">
            <dt>Score</dt>
            <dd data-testid="score-total">{{ result.score.total }}</dd>
          </div>
        </dl>
        <p v-if="result?.newBest" class="best" data-testid="new-best">
          {{ result.best === null ? 'First record on this map' : `New best! (was ${result.best})` }}
        </p>
        <p v-else-if="result" class="best">Best on this map: {{ result.best }}</p>
        <button class="primary big" @click="emit('restart')">Play again</button>
        <button class="big" data-testid="home" @click="home">Main menu</button>
      </div>
    </div>

    <div v-else-if="store.paused" class="modal" data-testid="pause-menu">
      <div class="sheet panel capped">
        <h2 class="display">Paused</h2>
        <p v-if="store.hud.perks.length > 0" data-testid="perks-taken">
          Castle perks: {{ store.hud.perks.join(', ') }}
        </p>
        <button class="primary big" @click="hub.togglePause()">Resume</button>
        <button class="big" @click="emit('fullscreen')">Full screen</button>
        <div class="pair">
          <button class="big" @click="emit('restart')">Restart run</button>
          <button class="big" data-testid="home" @click="home">Main menu</button>
        </div>
        <p class="hint">
          {{
            keyHint(
              'WASD/arrows move · Space ability · F rally / flag · hold E/R buy · hold E at the castle to grow it · hold Enter night · Tab waves · Z zoom · M sound',
            )
          }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  --top: max(10px, env(safe-area-inset-top));
  --right: max(12px, env(safe-area-inset-right));
  --bottom: max(12px, env(safe-area-inset-bottom));
  --left: max(12px, env(safe-area-inset-left));
  font-size: 14px;
}
.hud button,
.wave-panel,
.modal {
  pointer-events: auto;
}
/* Phones are the reference size; larger screens scale every zone up (corpus 14 §3.5). */
@media (min-width: 900px) and (min-height: 600px) {
  .zone {
    zoom: 1.3;
  }
}
/* Night combat uses one compact top row. The canvas starts below these measured panels. */
.combat .zone {
  zoom: 1;
}
.combat .treasury {
  padding: 4px 8px;
  gap: 5px;
  min-height: 32px;
}
.combat .coin {
  width: 24px;
  height: 24px;
  font-size: 24px;
}
.combat .coin.plain {
  font-size: 15px;
}
.combat .gold {
  font-size: 20px;
}
.combat .health {
  padding-left: 5px;
}
.combat .health .bar {
  width: 46px;
}
.combat .centre {
  gap: 4px;
}
.combat .boss-bar {
  padding: 3px 10px;
  font-size: 14px;
}
.combat .toast {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: max(82px, env(safe-area-inset-bottom));
  max-width: 45vw;
}
.bar {
  display: block;
  width: 74px;
  height: 6px;
  border-radius: 9px;
  background: var(--line);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 9px;
  background: var(--moss);
  transition: width 0.2s;
}

/* Zone 1 */
.treasury {
  position: absolute;
  top: var(--top);
  left: var(--left);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 6px;
}
.coin {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  font-size: 34px;
  filter: drop-shadow(0 1px 1px rgba(60, 40, 4, 0.35));
}
.coin.plain {
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffe9a0, var(--gold) 60%, #8a6410);
  color: #5a3d06;
  font-size: 18px;
  box-shadow: inset 0 0 0 2px rgba(90, 60, 6, 0.4);
  filter: none;
}
.gold {
  font-size: 26px;
  line-height: 1;
  min-width: 1.6em;
  font-variant-numeric: tabular-nums;
}
.health {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
.health .row {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
}
.bar.king i {
  background: var(--gold);
}
/* The king's painted face beside his health. */
.face-art {
  font-size: 20px;
  margin: -3px -1px -3px -3px;
}
.down .face-art {
  filter: grayscale(1);
  opacity: 0.6;
}
.respawn {
  font-size: 11px;
  font-weight: 700;
  color: var(--enemy);
  white-space: nowrap;
}

/* Zones 2 and 4 */
.centre {
  position: absolute;
  top: var(--top);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.centre > * {
  pointer-events: auto;
}
.boss-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: var(--enemy);
  font-size: 18px;
}
.boss-art {
  font-size: 28px;
  margin: -6px 0;
}
.combat .boss-art {
  font-size: 22px;
}
.boss-bar strong {
  font-size: 14px;
}
.boss-bar .bar {
  width: min(40vw, 220px);
  height: 8px;
}
.boss-bar .bar i {
  background: var(--enemy);
}
.dawn-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 20px;
  min-width: 240px;
  animation: rise 0.3s ease-out;
}
.kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--gold);
}
.dawn-card strong {
  font-size: 20px;
}
.dawn-card span:last-child {
  font-size: 12px;
  color: var(--muted);
}
.dawn-card b {
  color: var(--ink);
}
.dawn-card .lost {
  color: var(--enemy);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.toast {
  margin: 0;
  padding: 6px 14px;
  font-weight: 700;
  color: var(--enemy);
}

/* Zone 3 */
.pause {
  position: absolute;
  top: var(--top);
  right: var(--right);
  width: 40px;
  height: 40px;
  min-height: 40px;
  padding: 0;
  display: grid;
  place-items: center;
  font-size: 18px;
}

/* Zone 7 */
.band {
  position: absolute;
  bottom: var(--bottom);
  /* Left of the action buttons, so the right thumb reaches the cards. */
  right: calc(var(--right) + 220px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  max-width: calc(100vw - 260px - var(--left) - var(--right));
}
.touch .band {
  /* Never under the joystick's thumb zone (left 45%, corpus 14 §3.1, zone 6). */
  max-width: calc(55vw - 230px - var(--right));
}
.slot-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}
.slot-title strong {
  font-size: 14px;
}
.slot-title small {
  font-size: 11px;
  opacity: 0.9;
}
.cards {
  display: flex;
  flex-wrap: wrap-reverse;
  justify-content: flex-start;
  gap: 8px;
}
.card {
  width: 156px;
  padding: 8px 10px 9px;
  text-align: left;
  font-weight: 500;
}
.offer {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.offer-head {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
}
.offer-head b {
  flex: 1;
  /* Long names ("Archery range", "Crossbow range") wrap instead of being cut. */
  line-height: 1.1;
}
/* The building it becomes, painted, with a green arrow when it is an upgrade. */
.thumb {
  position: relative;
  flex: none;
  font-size: 30px;
  margin: -6px 0 -4px -2px;
}
.thumb .up {
  position: absolute;
  right: -5px;
  bottom: -1px;
  font-size: 13px;
  color: var(--moss);
  background: var(--linen);
  border-radius: 50%;
}
.castle-thumb {
  font-size: 36px;
}
.cost {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font: 700 14px var(--display);
}
.cost i {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--gold);
}
.offer-stats {
  font-size: 11px;
  font-weight: 700;
  color: var(--moss);
}
.offer-desc {
  font-size: 11px;
  line-height: 1.25;
  color: var(--muted);
}

/* Zone 8 */
.actions {
  position: absolute;
  right: var(--right);
  bottom: var(--bottom);
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.rally-btn {
  width: 58px;
  height: 58px;
  padding: 0;
  margin-bottom: 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1.1;
  touch-action: none;
}
.rally-btn .gi {
  font-size: 20px;
}
.rally-btn kbd {
  margin: 1px 0 0;
  font-size: 9px;
}
.badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--gold);
  color: #3b2a05;
  border-radius: 9px;
  padding: 0 5px;
  font: 700 11px var(--display);
}
.charge {
  position: relative;
  width: 84px;
  height: 84px;
  padding: 0;
  border-radius: 50%;
  background: none;
  box-shadow: none;
  touch-action: none;
}
.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  -webkit-mask: radial-gradient(circle, transparent 37px, #000 38px);
  mask: radial-gradient(circle, transparent 37px, #000 38px);
}
.face {
  position: absolute;
  inset: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  font-size: 11px;
}
.face .gi,
.charge-art {
  font-size: 28px;
}
.face .charge-art {
  font-size: 36px;
  margin: -4px 0 -2px;
}
.face kbd {
  margin: 1px 0 0;
  font-size: 9px;
}
.charge:disabled .face {
  color: var(--muted);
}
.call {
  --fill: var(--night);
  padding: 8px 18px 8px 8px;
}
.call-in {
  display: flex;
  align-items: center;
  gap: 10px;
}
.moon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--night);
  color: var(--linen);
  font-size: 22px;
}
.call-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.call-text b {
  font-size: 17px;
  white-space: nowrap;
}
.call-text small {
  font-size: 11px;
  color: var(--muted);
}

/* Castle */
.lvl {
  margin-left: -3px;
  font: 700 10px var(--display);
  color: var(--gold);
}
.castle-card {
  width: 220px;
}
.offer-lock {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink);
}
.picker .sheet {
  max-width: min(94vw, 640px);
  gap: 8px;
  padding: 16px 20px;
}
.perks {
  display: flex;
  gap: 10px;
  margin: 4px 0;
}
.perk {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 10px;
  min-width: 0;
  font-weight: 500;
  text-align: center;
}
.perk b {
  font-size: 16px;
}
.perk small {
  font-size: 12px;
  line-height: 1.3;
  color: var(--muted);
}
.perk.picked {
  box-shadow:
    0 0 0 3px var(--gold),
    var(--shadow);
}
.perk-icon {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 20px;
  background: var(--linen-deep);
}
.perk.picked .perk-icon {
  background: var(--gold);
  color: #3b2a05;
}
.picker-actions {
  display: flex;
  gap: 10px;
}
.choose {
  min-width: 170px;
}
.choose .cost {
  margin-left: 8px;
  color: var(--linen);
}

/* Pause and end of run */
.modal {
  position: absolute;
  inset: 0;
  background: rgba(20, 26, 40, 0.55);
  display: grid;
  place-items: center;
}
.sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 22px 28px;
  max-width: min(90vw, 460px);
  text-align: center;
}
.sheet h2 {
  margin: 0;
  font-size: 26px;
}
/* The end of a run: the king's portrait on the roof of the sheet, greyed in defeat. */
.outcome {
  padding-top: 8px;
}
.outcome-art {
  font-size: 84px;
  margin: -58px 0 -6px;
  filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.35));
}
.outcome.lost .outcome-art {
  filter: grayscale(0.85) drop-shadow(0 3px 4px rgba(0, 0, 0, 0.35));
}
.sheet p {
  margin: 0;
  color: var(--muted);
}
.big {
  min-width: 200px;
  min-height: 48px;
}
.pair {
  display: flex;
  gap: 8px;
}
.pair .big {
  min-width: 0;
  flex: 1 1 0;
  white-space: nowrap;
}
/* The score breakdown on the end screen (13 §2.2): label, working, points. */
.score {
  margin: 4px 0 0;
  width: min(100%, 340px);
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 14px;
}
.score div {
  display: grid;
  grid-template-columns: 1fr auto 4.5em;
  gap: 10px;
  text-align: left;
}
.score dt {
  color: var(--ink);
}
.score dd {
  margin: 0;
  color: var(--muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.score dd:last-child {
  color: var(--ink);
  font-weight: 700;
}
.score .minus {
  color: var(--enemy) !important;
}
.score .note dt {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 12px;
}
.score .total {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--line);
  grid-template-columns: 1fr auto;
}
.score .total dt,
.score .total dd {
  font: 600 20px var(--display);
  color: var(--ink) !important;
}
.best {
  color: var(--gold) !important;
  font-weight: 700;
}
.hint {
  font-size: 12px;
}
</style>
