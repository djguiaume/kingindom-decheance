/**
 * Presentation events (ADR-004): what happened during a command or a tick, for the view to
 * turn into effects and sounds. Events are returned, never stored in GameState, so they do
 * not affect state hashes.
 */
import type { Ref } from './state.ts';

export type GameEvent =
  | { type: 'built'; slot: string; building: string; id: number }
  | { type: 'upgraded'; slot: string; from: string; to: string; id: number }
  | { type: 'nightStarted'; night: number }
  | { type: 'enemySpawned'; id: number; enemy: string; lane: string }
  | { type: 'unitSpawned'; id: number; unit: string }
  | { type: 'hit'; attacker: Ref; target: Ref; damage: number }
  | { type: 'killed'; target: Ref }
  | { type: 'buildingDestroyed'; id: number; slot: string }
  | { type: 'kingRespawned' }
  | { type: 'stomp'; enemy: number; hits: number }
  | { type: 'rallied'; units: number }
  | { type: 'unitsDropped'; units: number }
  | { type: 'dawn'; night: number; income: number }
  | { type: 'won' }
  | { type: 'lost' };
