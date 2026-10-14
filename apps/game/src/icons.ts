/**
 * The game's own icon set (corpus 14 §5.2): filled shapes on a 24 × 24 grid, drawn in
 * `currentColor`. No emoji anywhere in the UI; every glyph comes from here.
 */
export const icons = {
  coin: '<path d="M5 9l3.5 3L12 6l3.5 6L19 9l-1.5 8h-11z"/>',
  keep: '<path d="M3 21V9h2v2h2V9h2v2h2V6h2v5h2V9h2v2h2V9h2v12h-7v-4a2 2 0 0 0-4 0v4z"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  moon: '<path d="M15.5 3.5A9 9 0 1 0 20.5 17 7.5 7.5 0 0 1 15.5 3.5z"/>',
  skull:
    '<path d="M12 3C7 3 4 6.4 4 10.5c0 2.6 1.2 4.4 3 5.4V19h2v-2h2v2h2v-2h2v2h2v-3.1c1.8-1 3-2.8 3-5.4C20 6.4 17 3 12 3zM8.5 9.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>',
  helm: '<path d="M5 15a7 7 0 0 1 14 0v2H5zM9 18h6v3H9zM2.5 5c0 4.5 1.5 7 4.5 8l1.2-2.6C5.8 9.6 3.8 8 2.5 5zm19 0c0 4.5-1.5 7-4.5 8l-1.2-2.6c2.4-.8 4.4-2.4 5.7-5.4z"/>',
  axe: '<path d="M13.5 3.5c3.5 0 6.5 2.6 7 6-2.4-.6-4.6-.2-6 1.2L6 19.2 4.8 18l8.5-8.5c-1.4-1.4-1.2-4 .2-6z"/>',
  bow: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 3c8 2 12 7 15 15M6 3l15 15M4 20l11-11M15 6h3v3"/>',
  club: '<path d="M15 2.5c2.5 0 5.5 3 5.5 5.5 0 1.5-1 2.8-2.4 3.3L8 21.5 5.5 19l10.2-10C14.9 6.8 13.5 5.6 13 4c.5-1 1.2-1.5 2-1.5z"/>',
  wing: '<path d="M2 7c4 0 7 1.5 10 5 3-3.5 6-5 10-5-1 5-4 9-8 10l-2 3-2-3c-4-1-7-5-8-10z"/>',
  boulder: '<path d="M6 9l5-4 7 2 3 6-3 6-8 1-5-4z"/>',
  house: '<path d="M3 11l9-7 9 7v10h-6v-6H9v6H3z"/>',
  tower: '<path d="M6 3h2v2h2V3h4v2h2V3h2v6l-2 1v11H8V10L6 9zm5 9v4h2v-4z"/>',
  wall: '<path d="M3 20V8l2-3 2 3v12zm7 0V6l2-3 2 3v14zm7 0V8l2-3 2 3v12z"/>',
  spear:
    '<path d="M21 3l-2 6-1.6-1.6L5 19.8 4.2 19 16.6 6.6 15 5z"/><path opacity=".5" d="M2 14h4v2H2zm1 4h3v2H3zm-1-8h5v2H2z"/>',
  flag: '<path d="M5 2h2v20H5zm3 1h11l-3 4 3 4H8z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  pause: '<path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z"/>',
  sound:
    '<path d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 9l5 6M21 9l-5 6"/>',
  up: '<path d="M12 4l7 8h-4.5v8h-5v-8H5z"/>',
  alert: '<path d="M12 2l10 18H2zm-1 7v6h2V9zm0 8v2h2v-2z"/>',
  turn: '<path d="M12 4a8 8 0 1 1-7.4 5H2l3.5-4.5L9 9H6.8A6 6 0 1 0 12 6z"/>',
} as const;

export type IconId = keyof typeof icons;
