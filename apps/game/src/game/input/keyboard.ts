/**
 * Keyboard adapter (design 11 §10.2). WASD/arrows move in 8 directions, Space uses the ability,
 * hold E / R buys (0.4 s), hold Enter starts the night (1 s), Tab toggles the wave preview,
 * Z zooms, Esc pauses. At the castle, hold E opens the perk picker; there 1-3 or the arrows
 * select a perk, hold E confirms and Esc backs out.
 */
import { useHudStore } from '../../stores/hud.ts';
import { HOLD_BUY_MS, HOLD_NIGHT_MS, type InputHub } from './hub.ts';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function attachKeyboard(hub: InputHub): () => void {
  const store = useHudStore();
  const down = new Set<string>();
  let holdTimer: number | undefined;
  /** The hold in progress: when its key went down, how long it needs and what it does. */
  let hold: { start: number; ms: number; action: () => void } | null = null;
  /** When the last key went down (the event's own time, not when it was handled). */
  let downAt = 0;

  const updateMove = () => {
    let x = 0;
    let y = 0;
    for (const code of down) {
      const d = MOVE_KEYS[code];
      if (d) {
        x += d[0];
        y += d[1];
      }
    }
    hub.move(x, y, 'keyboard');
  };

  const startHold = (id: string, ms: number, action: () => void) => {
    clearTimeout(holdTimer);
    store.keyHold = id;
    hold = { start: downAt, ms, action };
    holdTimer = window.setTimeout(() => {
      store.keyHold = null;
      hold = null;
      action();
    }, ms);
  };
  const cancelHold = (id: string, upAt: number) => {
    if (store.keyHold !== id) return;
    clearTimeout(holdTimer);
    store.keyHold = null;
    // On a busy page the key can come up before the timer gets to run although it was held long
    // enough (the browser handles input before timers): the hold still counts. Event times, not
    // handling times, so a quick tap handled late never counts as a hold.
    const done = hold && upAt - hold.start >= hold.ms ? hold.action : null;
    hold = null;
    done?.();
  };

  const onDown = (e: KeyboardEvent) => {
    downAt = e.timeStamp;
    if (e.repeat) {
      if (MOVE_KEYS[e.code] || ['Space', 'Tab'].includes(e.code)) e.preventDefault();
      return;
    }
    // The castle's perk picker: 1-3 or the arrow keys select, hold E confirms, Esc backs out.
    if (store.pickerOpen) {
      const digit = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (digit >= 0) return hub.selectPerk(digit);
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault();
        return hub.selectPerk(null, -1);
      }
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault();
        return hub.selectPerk(null, 1);
      }
      if (e.code === 'Escape') return hub.closePicker();
    }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      down.add(e.code);
      updateMove();
      return;
    }
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        hub.ability('keyboard');
        break;
      case 'KeyE':
        hub.used('keyboard');
        startHold('buy-0', HOLD_BUY_MS, () => hub.mainAction());
        break;
      case 'KeyR':
        hub.used('keyboard');
        startHold('buy-1', HOLD_BUY_MS, () => hub.secondAction());
        break;
      case 'Enter':
        hub.used('keyboard');
        startHold('night', HOLD_NIGHT_MS, () => hub.startNight());
        break;
      case 'KeyF':
        hub.rally('keyboard');
        break;
      case 'Tab':
        e.preventDefault();
        store.waveOpen = !store.waveOpen;
        break;
      case 'KeyZ':
        store.zoomClose = !store.zoomClose;
        break;
      case 'Escape':
        hub.togglePause();
        break;
    }
  };

  const onUp = (e: KeyboardEvent) => {
    if (MOVE_KEYS[e.code]) {
      down.delete(e.code);
      updateMove();
    }
    if (e.code === 'KeyE') cancelHold('buy-0', e.timeStamp);
    if (e.code === 'KeyR') cancelHold('buy-1', e.timeStamp);
    if (e.code === 'Enter') cancelHold('night', e.timeStamp);
  };

  // Losing focus must not leave the king walking with a key "stuck" down.
  const onBlur = () => {
    down.clear();
    updateMove();
  };

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
    clearTimeout(holdTimer);
  };
}
