<script setup lang="ts">
import { placeholderContent } from '@kd/content/placeholder';

const commit = __COMMIT__;
const contentHash = placeholderContent.hash;
</script>

<template>
  <main>
    <RouterView />
  </main>
  <footer>build {{ commit }} · content {{ contentHash }}</footer>
</template>
