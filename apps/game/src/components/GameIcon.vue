<script setup lang="ts">
/** One glyph from the game's icon set, sized by the surrounding font size (1em). */
import { icons, type IconId } from '../icons.ts';

defineProps<{ name: IconId }>();
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- static markup from icons.ts, never user input -->
  <svg class="gi" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" v-html="icons[name]" />
</template>

<style scoped>
.gi {
  width: 1em;
  height: 1em;
  display: inline-block;
  flex: none;
  vertical-align: -0.15em;
}
</style>
