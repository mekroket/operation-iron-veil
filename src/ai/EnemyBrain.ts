/** Decision making of one contractor. Pure: every outside effect goes through BrainDeps. */
import type { EnemyStateName, Vec3 } from '../core/types';
import { BrainCore } from './BrainCore';
import type { BrainDeps, BrainOutput, BrainSetup } from './BrainCore';
import { combatState } from './brainStateCombat';
import {
  alertState,
  defeatedState,
  idleState,
  patrolState,
  searchState,
  suspiciousState,
} from './brainStatesCalm';
import type { NoiseKind, Perception } from './Perception';
import { StateMachine } from './StateMachine';

export type { BrainCallout, BrainDeps, BrainOutput, BrainSetup, BrainTarget, ShotRequest } from './BrainCore';

export class EnemyBrain {
  private readonly core: BrainCore;
  private readonly fsm: StateMachine<EnemyStateName, BrainCore>;

  constructor(deps: BrainDeps, setup: BrainSetup) {
    this.core = new BrainCore(deps, setup);
    this.fsm = new StateMachine<EnemyStateName, BrainCore>(
      {
        IDLE: idleState,
        PATROL: patrolState,
        SUSPICIOUS: suspiciousState,
        ALERT: alertState,
        COMBAT: combatState,
        SEARCH: searchState,
        DEFEATED: defeatedState,
      },
      this.core,
    );
    this.fsm.onChange = (from, to) => {
      if (from !== null) deps.stateChanged(from, to);
    };
    this.fsm.transition(this.core.patrol.length > 0 ? 'PATROL' : 'IDLE');
  }

  get state(): EnemyStateName {
    return this.fsm.current ?? 'IDLE';
  }

  get timeInState(): number {
    return this.fsm.timeInState;
  }

  get output(): Readonly<BrainOutput> {
    return this.core.out;
  }

  get perception(): Perception {
    return this.core.perception;
  }

  get rounds(): number {
    return this.core.rounds;
  }

  update(dt: number): void {
    if (this.state === 'DEFEATED') return;
    this.core.sense(dt);
    this.core.flinchLeft = Math.max(0, this.core.flinchLeft - dt);
    this.fsm.update(dt);
  }

  /** A noise reached this enemy. Returns true when it is within hearing range. */
  hear(kind: NoiseKind, source: Vec3): boolean {
    if (this.state === 'DEFEATED') return false;
    return this.core.perception.hear(kind, this.core.deps.position(), source);
  }

  /** A teammate called out contact. */
  notifyAllyAlert(lastKnown: Vec3): void {
    const state = this.state;
    if (state === 'DEFEATED') return;
    this.core.perception.forceAware(lastKnown);
    if (state === 'ALERT' || state === 'COMBAT') return;
    this.core.silentAlert = true;
    this.fsm.transition('ALERT');
  }

  /** Mission script: straight into combat, aware of this position. */
  forceCombat(lastKnown: Vec3): void {
    if (this.state === 'DEFEATED') return;
    this.core.perception.forceAware(lastKnown);
    this.fsm.transition('COMBAT');
  }

  /** Took a bullet: flinch and know where it came from. */
  onDamaged(source: Vec3): void {
    const state = this.state;
    if (state === 'DEFEATED') return;
    const core = this.core;
    core.flinchLeft = core.cfg.flinch.duration;
    core.perception.forceAware(source);
    if (state === 'COMBAT') {
      core.combat.timeOnTarget *= 1 - core.cfg.flinch.aimPenalty;
      core.combat.burstLeft = 0;
      core.combat.losLost = 0;
      return;
    }
    if (state === 'ALERT') return;
    core.quickReaction = true;
    this.fsm.transition('ALERT');
  }

  kill(): void {
    this.fsm.transition('DEFEATED');
  }
}
