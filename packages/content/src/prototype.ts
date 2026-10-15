/** The prototype content bundle (design 11), imported as JSON so it works in Vite, Node and workers alike. */
import buildings from '../data/buildings.json' with { type: 'json' };
import units from '../data/units.json' with { type: 'json' };
import enemies from '../data/enemies.json' with { type: 'json' };
import weapons from '../data/weapons.json' with { type: 'json' };
import king from '../data/king.json' with { type: 'json' };
import castle from '../data/castle.json' with { type: 'json' };
import mutators from '../data/mutators.json' with { type: 'json' };
import perks from '../data/perks.json' with { type: 'json' };
import greyhollow from '../data/maps/greyhollow.json' with { type: 'json' };
import type { RawContent } from './schemas.ts';
import { loadContentOrThrow } from './validate.ts';

export const prototypeRaw: RawContent = {
  buildings,
  units,
  enemies,
  weapons,
  king,
  castle,
  mutators,
  perks,
  maps: [greyhollow],
};

export const prototypeContent = loadContentOrThrow(prototypeRaw);

/** The run the prototype plays: Greyhollow with the spear. */
export const prototypeRun = { mapId: 'greyhollow', kingId: 'roll' } as const;
