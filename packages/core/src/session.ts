/**
 * A Session couples a state with the log of accepted commands, stamped with the tick they
 * were applied at. That log plus (content hash, run config) replays the run exactly.
 * The live game, bots and tests all drive the core through a Session.
 */
import { applyCommand, type Command, type CommandResult } from './commands.ts';
import { createContext, type GameContext, type RunConfig } from './context.ts';
import type { ContentBundle } from '@kd/content';
import type { GameEvent } from './events.ts';
import { createGame, step } from './game.ts';
import { clone } from './hash.ts';
import type { GameState } from './state.ts';

export interface LoggedCommand {
  tick: number;
  command: Command;
}

export interface Replay {
  contentHash: string;
  config: RunConfig;
  commands: LoggedCommand[];
}

export class Session {
  readonly ctx: GameContext;
  readonly config: RunConfig;
  state: GameState;
  readonly log: LoggedCommand[] = [];

  constructor(content: ContentBundle, config: RunConfig) {
    this.ctx = createContext(content, config);
    // Normalize defaults into the recorded config so a replay never depends on future defaults.
    this.config = { ...config, kingId: this.ctx.kingId };
    this.state = createGame(this.ctx, config);
  }

  /** Applies a command now; accepted commands are logged, refused ones are not. */
  submit(command: Command): CommandResult {
    const result = applyCommand(this.state, this.ctx, command);
    if (result.ok) this.log.push({ tick: this.state.tick, command: clone(command) });
    return result;
  }

  step(): GameEvent[] {
    return step(this.state, this.ctx);
  }

  get over(): boolean {
    return this.state.phase === 'won' || this.state.phase === 'lost';
  }

  toReplay(): Replay {
    return {
      contentHash: this.ctx.contentHash,
      config: { ...this.config },
      commands: clone(this.log),
    };
  }
}

/**
 * Re-runs a replay: commands are applied at their logged tick, then the run is stepped until
 * it ends or `maxTicks` is reached (a guard for replays of unfinished runs).
 */
export function playReplay(
  content: ContentBundle,
  replay: Replay,
  maxTicks = 30 * 60 * 30,
): Session {
  if (content.hash !== replay.contentHash) {
    throw new Error(`Replay was recorded with content ${replay.contentHash}, not ${content.hash}`);
  }
  const session = new Session(content, replay.config);
  for (const { tick, command } of replay.commands) {
    while (session.state.tick < tick) session.step();
    const result = session.submit(command);
    if (!result.ok) throw new Error(`Replay command refused at tick ${tick}: ${result.reason}`);
  }
  while (!session.over && session.state.tick < maxTicks) session.step();
  return session;
}
