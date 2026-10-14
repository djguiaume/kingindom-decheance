<template>
  <section class="home">
    <div class="logo" aria-label="Throne falling">
      <span class="t1 display">Throne</span>
      <span class="t2">falling</span>
      <GameIcon name="crown" class="tipped" />
    </div>
    <p>Build by day, defend by night. Greyhollow: six nights, three roads and an open sky.</p>
    <RouterLink class="primary big" to="/play" data-testid="play">Play</RouterLink>
    <p class="hint">
      Computer: WASD or arrows to ride, Space to charge, hold E to build, hold Enter to call the
      night. Phone: turn it sideways, drag on the left to ride, buttons on the right. The game art
      is a stand-in until the final art pass.
    </p>
  </section>
</template>

<script setup lang="ts">
import GameIcon from '../components/GameIcon.vue';
</script>

<style scoped>
/* The title screen in the game's identity (corpus 14 §2.1): linen, ink, a crown tipping off. */
.home {
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
  justify-content: center;
  padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) 24px
    max(24px, env(safe-area-inset-left));
  background: var(--linen);
  color: var(--ink);
}
.home > * {
  max-width: 640px;
}
.logo {
  position: relative;
  display: flex;
  flex-direction: column;
  line-height: 0.95;
}
.t1 {
  font-size: clamp(48px, 11vmin, 88px);
  font-weight: 900;
  letter-spacing: -0.01em;
}
.t2 {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-size: clamp(40px, 9vmin, 72px);
  padding-left: 0.9em;
}
.tipped {
  position: absolute;
  left: 4.1em;
  top: 0.05em;
  font-size: clamp(28px, 6vmin, 52px);
  color: var(--gold);
  transform: rotate(24deg);
}
p {
  margin: 0;
  font-size: 16px;
}
.big {
  min-height: 48px;
  min-width: 160px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
.hint {
  color: var(--muted);
  font-size: 14px;
}
</style>
