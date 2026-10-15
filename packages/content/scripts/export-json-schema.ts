/** Writes JSON Schemas from the Zod schemas, so content files get autocomplete in VS Code. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  BuildingCatalog,
  CastleCatalog,
  EnemyCatalog,
  GameMap,
  KingSettings,
  MutatorCatalog,
  PerkCatalog,
  UnitCatalog,
  WeaponCatalog,
} from '../src/schemas.ts';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema');
mkdirSync(outDir, { recursive: true });

const files: Record<string, z.ZodType> = {
  'buildings.schema.json': BuildingCatalog,
  'units.schema.json': UnitCatalog,
  'enemies.schema.json': EnemyCatalog,
  'weapons.schema.json': WeaponCatalog,
  'king.schema.json': KingSettings,
  'map.schema.json': GameMap,
  'castle.schema.json': CastleCatalog,
  'mutators.schema.json': MutatorCatalog,
  'perks.schema.json': PerkCatalog,
};
for (const [name, schema] of Object.entries(files)) {
  const json = z.toJSONSchema(schema, { io: 'input' });
  writeFileSync(join(outDir, name), JSON.stringify(json, null, 2) + '\n');
  console.log(`wrote schema/${name}`);
}
