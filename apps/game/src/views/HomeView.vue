<template>
  <section class="home">
    <h1>Throne falling</h1>
    <p>
      Build by day, defend by night. This is the engineering skeleton: placeholder map, numbers and
      art.
    </p>
    <RouterLink class="primary" to="/play" data-testid="play">Play the placeholder map</RouterLink>
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}
</style>
