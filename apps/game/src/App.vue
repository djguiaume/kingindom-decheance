<script setup lang="ts">
import { prototypeContent } from '@kd/content/prototype';
import { useRoute } from 'vue-router';

const route = useRoute();
const commit = __COMMIT__;
const contentHash = prototypeContent.hash;
</script>

<template>
  <RouterView />
  <footer v-if="route.path === '/'">build {{ commit }} · content {{ contentHash }}</footer>
</template>
