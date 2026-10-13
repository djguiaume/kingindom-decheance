/** The placeholder content bundle, imported as JSON so it works in Vite, Node and workers alike. */
import buildings from '../data/buildings.json' with { type: 'json' };
import units from '../data/units.json' with { type: 'json' };
import enemies from '../data/enemies.json' with { type: 'json' };
import weapons from '../data/weapons.json' with { type: 'json' };
import placeholderMap from '../data/maps/placeholder.json' with { type: 'json' };
import type { RawContent } from './schemas.ts';
import { loadContentOrThrow } from './validate.ts';

export const placeholderRaw: RawContent = {
  buildings,
  units,
  enemies,
  weapons,
  maps: [placeholderMap],
};

export const placeholderContent = loadContentOrThrow(placeholderRaw);
