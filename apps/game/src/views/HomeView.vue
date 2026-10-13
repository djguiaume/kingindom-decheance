<template>
  <section class="home">
    <h1>Throne falling</h1>
    <p>
      Build by day, defend by night. Greyhollow: six nights, three roads and an open sky. Stand-in
      art until the final art pass.
    </p>
    <RouterLink class="primary big" to="/play" data-testid="play">Play</RouterLink>
    <p class="hint">
      Computer: WASD or arrows to ride, Space to charge, hold E to build, hold Enter to start the
      night. Phone: turn it sideways, drag on the left to ride, buttons on the right.
    </p>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  max-width: 640px;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 16px
    max(16px, env(safe-area-inset-left));
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
