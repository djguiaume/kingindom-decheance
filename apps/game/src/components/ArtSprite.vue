<script setup lang="ts">
/**
 * One painted frame from the runtime atlases (ui-art.ts), fitted inside its box like
 * `object-fit: contain`. Size it with CSS (1em square by default). Without the art it draws the
 * `icon` glyph instead, or nothing. Decorative: the text beside it carries the meaning.
 */
import { computed } from 'vue';
import type { IconId } from '../icons.ts';
import { uiFrame } from '../ui-art.ts';
import GameIcon from './GameIcon.vue';

const props = defineProps<{ name: string; icon?: IconId }>();
const frame = computed(() => uiFrame(props.name));
</script>

<template>
  <svg
    v-if="frame"
    class="art"
    :viewBox="`0 0 ${frame.w} ${frame.h}`"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    :data-art="name"
  >
    <!-- The inner viewport clips the page to this one frame. -->
    <svg :width="frame.w" :height="frame.h">
      <image
        :href="frame.url"
        :x="-frame.x"
        :y="-frame.y"
        :width="frame.pageW"
        :height="frame.pageH"
      />
    </svg>
  </svg>
  <GameIcon v-else-if="icon" :name="icon" class="art" />
</template>

<style scoped>
.art {
  width: 1em;
  height: 1em;
  display: inline-block;
  flex: none;
  vertical-align: -0.15em;
}
</style>
