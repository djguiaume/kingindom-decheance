import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import { audio } from './audio/engine.ts';
import './style.css';

// Hash routing: deep links work on GitHub Pages without server rewrites (ADR-008).
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/play', component: () => import('./views/PlayView.vue') },
  ],
});

// Browsers keep audio locked until the first tap or key press: listen for it from the start.
audio.install();

createApp(App).use(createPinia()).use(router).mount('#app');
