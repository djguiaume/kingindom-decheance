/**
 * Presentation events (ADR-004): what happened during a command or a tick, for the view to
 * turn into effects and sounds. Events are returned, never stored in GameState, so they do
 * not affect state hashes.
 */
import type { Ref } from './state.ts';
import type { Vec } from './vec.ts';

export type GameEvent =
  | { type: 'built'; slot: string; building: string; id: number }
  | { type: 'upgraded'; slot: string; from: string; to: string; id: number }
  | { type: 'castleUpgraded'; level: number; perk: string }
  | { type: 'nightStarted'; night: number }
  | { type: 'enemySpawned'; id: number; enemy: string; lane: string }
  | { type: 'unitSpawned'; id: number; unit: string }
  /** `projectile`: the hit came from a shot in flight (the view already drew it flying). */
  | { type: 'hit'; attacker: Ref; target: Ref; damage: number; projectile?: true }
  | { type: 'fired'; id: number; attacker: Ref }
  | { type: 'missed'; id: number; at: Vec }
  | { type: 'killed'; target: Ref }
  | { type: 'buildingDestroyed'; id: number; slot: string }
  | { type: 'kingRespawned' }
  | { type: 'stomp'; enemy: number; hits: number }
  /** The king's volley: arrows fanning out over `cone` degrees; its hits follow as `hit`s. */
  | { type: 'volley'; from: Vec; dir: Vec; cone: number; range: number; arrows: number }
  | { type: 'rallied'; units: number }
  | { type: 'unitsDropped'; units: number }
  | { type: 'flagTaken'; building: number }
  | { type: 'flagPlanted'; buildings: number }
  | { type: 'dawn'; night: number; income: number }
  | { type: 'won' }
  | { type: 'lost' };
