import { describe, expect, it } from 'vitest';
import { CameraView, SCALE, SQUASH } from '../src/game/camera.ts';
import { emptyPlotIds, gateIsOpen, projectileFrame } from '../src/game/presentation.ts';

describe('plot presentation', () => {
  it('removes an empty foundation while occupied, including ruins and repaired buildings', () => {
    const slots = ['house', 'tower'];
    expect([...emptyPlotIds(slots, [])]).toEqual(slots);
    for (const destroyed of [false, true]) {
      const buildings = [{ slot: 'house', destroyed }];
      expect([...emptyPlotIds(slots, buildings)]).toEqual(['tower']);
    }
    expect([...emptyPlotIds(slots, [])]).toEqual(slots); // restart
  });
});

describe('shot presentation', () => {
  it('uses each weapon family’s art, with arrows for both factions and ordinary towers', () => {
    for (const id of ['archer', 'skirmisher', 'tower', 'watchtower', 'volley_tower', 'castle'])
      expect(projectileFrame(id)).toBe('arrow');
    expect(projectileFrame('crossbowman')).toBe('bolt');
    expect(projectileFrame('ballista_tower')).toBe('ballista_bolt');
    expect(projectileFrame('catapult')).toBe('boulder');
  });
});

it('projects indicators into page coordinates when the night canvas starts below the HUD', () => {
  const camera = new CameraView();
  camera.offsetTop = 64;
  camera.zoom = 0.5;
  expect(camera.toScreen({ x: 2, y: 3 })).toEqual({ x: SCALE, y: 64 + 3 * SCALE * SQUASH * 0.5 });
});

it('opens a standing gate for friendly approach from either side at arbitrary map orientations', () => {
  const at = { x: 12, y: 18 };
  for (let degrees = 0; degrees < 360; degrees++) {
    const angle = (degrees * Math.PI) / 180;
    for (const side of [-1, 1]) {
      const pos = {
        x: at.x + Math.cos(angle) * side * 1.5,
        y: at.y + Math.sin(angle) * side * 1.5,
      };
      expect(gateIsOpen(at, false, { alive: true, pos }, [])).toBe(true);
      expect(gateIsOpen(at, false, { alive: false, pos }, [{ pos }])).toBe(true);
      expect(gateIsOpen(at, false, { alive: false, pos }, [])).toBe(false);
      expect(gateIsOpen(at, true, { alive: true, pos }, [{ pos }])).toBe(false);
    }
  }
});
