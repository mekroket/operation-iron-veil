import { describe, expect, it } from 'vitest';
import { computeHitChance } from '../src/ai/accuracy';
import { EnemyBrain } from '../src/ai/EnemyBrain';
import type { BrainCallout, BrainDeps, BrainTarget, ShotRequest } from '../src/ai/EnemyBrain';
import { NavFollower } from '../src/ai/NavFollower';
import { NavGraph } from '../src/ai/NavGraph';
import { Perception, visibilityOf } from '../src/ai/Perception';
import type { PerceivedTarget } from '../src/ai/Perception';
import { StateMachine } from '../src/ai/StateMachine';
import type { FsmState } from '../src/ai/StateMachine';
import type { EnemyStateName, Vec3 } from '../src/core/types';
import { ENEMY_CONFIG } from '../src/enemies/enemyConfig';
import { quatFromDown, solveArm, solveLeg } from '../src/enemies/rigMath';
import type { Quat } from '../src/enemies/rigMath';
import type { NavNode } from '../src/levels/types';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const node = (id: string, x: number, z: number, links: string[], cover = false): NavNode => ({
  id,
  position: v(x, 0, z),
  links,
  cover,
});

describe('StateMachine', () => {
  type S = 'A' | 'B' | 'END';
  const build = (log: string[]): StateMachine<S, string[]> => {
    const states: Record<S, FsmState<S, string[]>> = {
      A: {
        enter: (ctx) => void ctx.push('enter A'),
        update: (_ctx, _dt, t) => (t >= 1 ? 'B' : null),
        exit: (ctx, to) => void ctx.push(`exit A to ${to}`),
      },
      B: { enter: (ctx, from) => void ctx.push(`enter B from ${from}`) },
      END: { terminal: true },
    };
    return new StateMachine<S, string[]>(states, log);
  };

  it('runs enter, update and exit in order and tracks time in state', () => {
    const log: string[] = [];
    const fsm = build(log);
    fsm.transition('A');
    fsm.update(0.4);
    expect(fsm.current).toBe('A');
    expect(fsm.timeInState).toBeCloseTo(0.4);
    fsm.update(0.7);
    expect(fsm.current).toBe('B');
    expect(fsm.timeInState).toBe(0);
    expect(fsm.previous).toBe('A');
    expect(log).toEqual(['enter A', 'exit A to B', 'enter B from A']);
  });

  it('never leaves a terminal state', () => {
    const fsm = build([]);
    fsm.transition('END');
    expect(fsm.transition('A')).toBe(false);
    expect(fsm.current).toBe('END');
  });
});

describe('NavGraph', () => {
  // a-b-c is the short way, a-d-e-c the long way. Only a lists b, so mirroring is required.
  const graph = new NavGraph([
    node('a', 0, 0, ['b', 'd']),
    node('b', 5, 0, ['c']),
    node('c', 10, 0, []),
    node('d', 0, 8, ['e']),
    node('e', 10, 8, ['c']),
    node('island', 50, 50, []),
    node('coverNear', 2, 2, [], true),
    node('coverFar', 20, 20, [], true),
  ]);

  it('mirrors links', () => {
    expect(graph.node('b')?.links).toContain('a');
    expect(graph.node('c')?.links).toContain('b');
  });

  it('finds the shortest path', () => {
    expect(graph.findPath('a', 'c')).toEqual(['a', 'b', 'c']);
    expect(graph.pathLength(['a', 'b', 'c'])).toBeCloseTo(10);
  });

  it('routes around blocked links, in both directions', () => {
    const blocked = (x: string, y: string): boolean => (x === 'a' && y === 'b') || (x === 'b' && y === 'a');
    expect(graph.findPath('a', 'c', blocked)).toEqual(['a', 'd', 'e', 'c']);
    expect(graph.findPath('c', 'a', blocked)).toEqual(['c', 'e', 'd', 'a']);
  });

  it('returns null when unreachable', () => {
    expect(graph.findPath('a', 'island')).toBeNull();
    expect(graph.findPath('a', 'nope')).toBeNull();
  });

  it('finds the nearest node', () => {
    expect(graph.nearestNode(v(4.6, 0, 0.5))?.id).toBe('b');
  });

  it('queries cover by sight and occupancy', () => {
    const origin = v(0, 0, 0);
    expect(graph.nearestCover(origin)?.id).toBe('coverNear');
    expect(graph.nearestCover(origin, { isOccupied: (id) => id === 'coverNear' })?.id).toBe('coverFar');
    const onlyFarSees = (n: { id: string }): boolean => n.id === 'coverFar';
    expect(graph.nearestCover(origin, { hasLineOfSight: onlyFarSees, wantLineOfSight: true })?.id).toBe('coverFar');
    expect(graph.nearestCover(origin, { hasLineOfSight: onlyFarSees, wantLineOfSight: false })?.id).toBe('coverNear');
    expect(graph.nearestCover(origin, { maxDistance: 1 })).toBeNull();
  });
});

describe('NavFollower', () => {
  it('opens a door on its path, waits, then walks on', () => {
    const graph = new NavGraph([node('a', 0, 0, ['b']), node('b', 10, 0, [])]);
    let blocked = true;
    const opened: string[] = [];
    const follower = new NavFollower(graph, {
      isLinkBlocked: () => blocked,
      openLink: (x, y) => void opened.push(`${x}-${y}`),
    });
    expect(follower.goToNode('b', v(0, 0, 0))).toBe(true);
    expect(follower.update(0.1, v(0, 0, 0), 0.5)).toBe('waiting');
    expect(opened).toEqual(['a-b']);
    blocked = false;
    expect(follower.update(0.1, v(0, 0, 0), 0.5)).toBe('moving');
    expect(follower.dirX).toBeCloseTo(1);
    expect(follower.update(0.1, v(9.8, 0, 0), 0.5)).toBe('arrived');
  });
});

describe('Perception', () => {
  const cfg = ENEMY_CONFIG.perception;
  const eye = v(0, 1.65, 0);
  const forward = v(0, 0, 1);
  const targetAt = (z: number, crouching = false): PerceivedTarget => ({
    chest: v(0, 1.3, z),
    head: v(0, 1.7, z),
    crouching,
    sprinting: false,
    alive: true,
  });
  const run = (p: Perception, target: PerceivedTarget, seconds: number): void => {
    for (let t = 0; t < seconds; t += 1 / 30) p.update(1 / 30, eye, forward, target);
  };

  it('fills in view and remembers where', () => {
    const p = new Perception(cfg, () => true);
    run(p, targetAt(10), 3);
    expect(p.awareness).toBe(1);
    expect(p.visible).toBe(true);
    expect(p.lastKnownPosition?.z).toBeCloseTo(10);
  });

  it('does not fill behind a wall', () => {
    const p = new Perception(cfg, () => false);
    run(p, targetAt(10), 3);
    expect(p.awareness).toBe(0);
    expect(p.visible).toBe(false);
  });

  it('does not fill outside the field of view, and spends no ray on it', () => {
    let rays = 0;
    const p = new Perception(cfg, () => {
      rays++;
      return true;
    });
    run(p, targetAt(-10), 3);
    expect(p.awareness).toBe(0);
    expect(rays).toBe(0);
  });

  it('falls off with distance', () => {
    const near = visibilityOf(cfg, eye, forward, targetAt(5), 'calm');
    const far = visibilityOf(cfg, eye, forward, targetAt(30), 'calm');
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(visibilityOf(cfg, eye, forward, targetAt(40), 'calm')).toBe(0);
  });

  it('crouching lowers the detection range', () => {
    expect(visibilityOf(cfg, eye, forward, targetAt(30), 'calm')).toBeGreaterThan(0);
    expect(visibilityOf(cfg, eye, forward, targetAt(30, true), 'calm')).toBe(0);
    expect(visibilityOf(cfg, eye, forward, targetAt(15, true), 'calm')).toBeGreaterThan(0);
  });

  it('drains once the target is gone', () => {
    let clear = true;
    const p = new Perception(cfg, () => clear);
    run(p, targetAt(10), 3);
    clear = false;
    run(p, targetAt(10), 10);
    expect(p.awareness).toBe(0);
  });

  it('throttles line-of-sight rays', () => {
    let rays = 0;
    const p = new Perception(cfg, () => {
      rays++;
      return true;
    });
    run(p, targetAt(10), 1);
    expect(rays).toBeGreaterThan(2);
    expect(rays).toBeLessThanOrEqual(Math.ceil(1 / cfg.losInterval) + 1);
  });

  it('hears sprinting and gunfire within their radii only', () => {
    const p = new Perception(cfg, () => false);
    const here = v(0, 0, 0);
    expect(p.hear('sprint', here, v(0, 0, cfg.sprintHearingRadius + 1))).toBe(false);
    expect(p.awareness).toBe(0);
    expect(p.hear('sprint', here, v(0, 0, cfg.sprintHearingRadius - 1))).toBe(true);
    expect(p.awareness).toBeCloseTo(cfg.footstepAwareness);
    expect(p.consumeNoise()?.z).toBeCloseTo(cfg.sprintHearingRadius - 1);
    expect(p.consumeNoise()).toBeNull();
    expect(p.hear('gunfire', here, v(0, 0, cfg.gunfireHearingRadius + 1))).toBe(false);
    expect(p.hear('gunfire', here, v(0, 0, cfg.gunfireHearingRadius - 1))).toBe(true);
    expect(p.awareness).toBe(1);
  });
});

describe('accuracy', () => {
  const cfg = ENEMY_CONFIG.accuracy;
  const base = { distance: 15, targetSpeed: 0, targetCrouching: false, timeOnTarget: 5, shooterMoving: false };

  it('gets worse with distance, target speed, crouching and first shots', () => {
    const settled = computeHitChance(cfg, base);
    expect(computeHitChance(cfg, { ...base, distance: 30 })).toBeLessThan(settled);
    expect(computeHitChance(cfg, { ...base, targetSpeed: 6 })).toBeLessThan(settled);
    expect(computeHitChance(cfg, { ...base, targetCrouching: true })).toBeLessThan(settled);
    expect(computeHitChance(cfg, { ...base, timeOnTarget: 0 })).toBeLessThan(settled);
  });

  it('lets a full-health player survive 12 to 18 hits', () => {
    const hitsSurvived = Math.ceil(100 / ENEMY_CONFIG.burst.damage) - 1;
    expect(hitsSurvived).toBeGreaterThanOrEqual(12);
    expect(hitsSurvived).toBeLessThanOrEqual(18);
  });
});

/** A brain in an empty world with a moveable target and a switchable line of sight. */
class Harness {
  readonly position = v(0, 0, 0);
  readonly target: BrainTarget = {
    position: v(0, 0, 15),
    chest: v(0, 1.3, 15),
    head: v(0, 1.7, 15),
    velocity: v(0, 0, 0),
    crouching: false,
    sprinting: false,
    alive: true,
  };
  readonly shots: ShotRequest[] = [];
  readonly callouts: BrainCallout[] = [];
  readonly states: EnemyStateName[] = [];
  losClear = false;
  allyAlerts = 0;
  shotsDuringReload = 0;
  readonly brain: EnemyBrain;
  private seed = 12345;

  constructor(patrol: string[] = ['a', 'b']) {
    const deps: BrainDeps = {
      position: () => this.position,
      muzzle: () => v(this.position.x, this.position.y + 1.4, this.position.z + 0.6),
      target: () => this.target,
      lineOfSight: () => this.losClear,
      isLinkBlocked: () => false,
      openLink: () => undefined,
      isNodeFree: () => true,
      claimNode: () => undefined,
      releaseNode: () => undefined,
      canStartBurst: () => true,
      alertAllies: () => {
        this.allyAlerts++;
      },
      fire: (shot) => {
        this.shots.push(shot);
        if (this.brain.output.reloading) this.shotsDuringReload++;
      },
      callout: (kind) => {
        this.callouts.push(kind);
      },
      stateChanged: (_from, to) => {
        this.states.push(to);
      },
      random: () => {
        this.seed = (this.seed * 16807) % 2147483647;
        return this.seed / 2147483647;
      },
    };
    const nav = new NavGraph([
      node('a', 0, 0, ['b', 'cover', 'near']),
      node('b', 0, 5, ['cover']),
      node('cover', 3, 3, [], true),
      node('near', 2, -3, []),
    ]);
    this.brain = new EnemyBrain(deps, { cfg: ENEMY_CONFIG, nav, patrol, home: v(0, 0, 0), homeYaw: 0, losPhase: 0 });
  }

  run(seconds: number, until?: () => boolean): void {
    const dt = 0.05;
    for (let t = 0; t < seconds; t += dt) {
      this.brain.update(dt);
      const velocity = this.brain.output.velocity;
      this.position.x += velocity.x * dt;
      this.position.z += velocity.z * dt;
      if (until?.()) return;
    }
  }
}

describe('EnemyBrain', () => {
  it('stands guard without a patrol, patrols with one', () => {
    const guard = new Harness([]);
    guard.run(10);
    expect(guard.brain.state).toBe('IDLE');

    const walker = new Harness();
    expect(walker.brain.state).toBe('PATROL');
    let furthest = 0;
    walker.run(15, () => {
      furthest = Math.max(furthest, walker.position.z);
      return false;
    });
    expect(walker.brain.state).toBe('PATROL');
    expect(furthest).toBeGreaterThan(4);
  });

  it('goes PATROL to SUSPICIOUS to ALERT to COMBAT when the player stays in view', () => {
    const h = new Harness();
    h.run(1);
    expect(h.brain.state).toBe('PATROL');
    h.losClear = true;
    h.run(8, () => h.brain.state === 'COMBAT');
    expect(h.states).toEqual(['SUSPICIOUS', 'ALERT', 'COMBAT']);
    expect(h.callouts).toEqual(['search', 'contact']);
    expect(h.allyAlerts).toBe(1);
  });

  it('turns SUSPICIOUS on a noise, investigates, and goes back to patrol', () => {
    const h = new Harness();
    expect(h.brain.hear('sprint', v(100, 0, 100))).toBe(false);
    expect(h.brain.hear('sprint', v(3, 0, 3))).toBe(true);
    h.run(0.1);
    expect(h.brain.state).toBe('SUSPICIOUS');
    h.run(30, () => h.brain.state === 'PATROL');
    expect(h.brain.state).toBe('PATROL');
  });

  it('being shot alerts at once, with the source known', () => {
    const h = new Harness();
    h.brain.onDamaged(v(7, 0, 7));
    expect(h.brain.state).toBe('ALERT');
    expect(h.brain.perception.lastKnownPosition).toEqual(v(7, 0, 7));
    expect(h.callouts).toContain('contact');
  });

  it('a teammate alert needs no callout of its own', () => {
    const h = new Harness();
    h.brain.notifyAllyAlert(v(1, 0, 9));
    expect(h.brain.state).toBe('ALERT');
    expect(h.callouts).not.toContain('contact');
    expect(h.allyAlerts).toBe(0);
  });

  it('fires bursts with line of sight', () => {
    const h = new Harness();
    h.losClear = true;
    h.brain.forceCombat(h.target.chest);
    h.run(8);
    expect(h.shots.length).toBeGreaterThan(0);
    expect(h.shots.every((shot) => shot.damage === ENEMY_CONFIG.burst.damage)).toBe(true);
  });

  it('never fires without line of sight', () => {
    const h = new Harness();
    h.brain.forceCombat(h.target.chest);
    h.run(5);
    expect(h.brain.state).toBe('COMBAT');
    expect(h.shots.length).toBe(0);
  });

  it('stops firing the moment line of sight is lost', () => {
    const h = new Harness();
    h.losClear = true;
    h.brain.forceCombat(h.target.chest);
    h.run(10, () => h.shots.length > 0);
    expect(h.shots.length).toBeGreaterThan(0);
    h.losClear = false;
    const fired = h.shots.length;
    h.run(4);
    expect(h.shots.length).toBe(fired);
  });

  it('reloads, calls it out, and does not fire meanwhile', () => {
    const h = new Harness();
    h.losClear = true;
    h.brain.forceCombat(h.target.chest);
    h.run(60, () => h.callouts.includes('reloading'));
    expect(h.callouts).toContain('reloading');
    h.run(40);
    expect(h.shotsDuringReload).toBe(0);
  });

  it('goes COMBAT to SEARCH when sight is lost, then back to PATROL', () => {
    const h = new Harness();
    h.losClear = true;
    h.brain.forceCombat(h.target.chest);
    h.run(2);
    h.losClear = false;
    h.run(ENEMY_CONFIG.combat.losLostToSearch - 1);
    expect(h.brain.state).toBe('COMBAT');
    h.run(3);
    expect(h.brain.state).toBe('SEARCH');
    expect(h.callouts).toContain('search');
    h.run(ENEMY_CONFIG.search.maxDuration + 2, () => h.brain.state === 'PATROL');
    expect(h.brain.state).toBe('PATROL');
    expect(h.brain.perception.awareness).toBe(0);
  });

  it('a fresh sighting during a search brings back the alert', () => {
    const h = new Harness();
    h.brain.forceCombat(h.target.chest);
    h.run(ENEMY_CONFIG.combat.losLostToSearch + 1);
    expect(h.brain.state).toBe('SEARCH');
    h.losClear = true;
    h.run(10, () => h.brain.state === 'ALERT');
    expect(h.brain.state).toBe('ALERT');
  });

  it('death is terminal', () => {
    const h = new Harness();
    h.losClear = true;
    h.brain.forceCombat(h.target.chest);
    h.run(2);
    h.brain.kill();
    const fired = h.shots.length;
    h.brain.onDamaged(v(1, 0, 1));
    h.brain.notifyAllyAlert(v(1, 0, 1));
    h.brain.forceCombat(v(1, 0, 1));
    expect(h.brain.hear('gunfire', v(1, 0, 1))).toBe(false);
    h.run(5);
    expect(h.brain.state).toBe('DEFEATED');
    expect(h.shots.length).toBe(fired);
    expect(h.brain.output.velocity).toEqual(v(0, 0, 0));
  });
});

describe('rigMath', () => {
  /** Applies a quaternion to the local -Y axis of a limb. */
  const rotateDown = (q: Quat): Vec3 => {
    const vx = 0;
    const vy = -1;
    const vz = 0;
    const cx = q.y * vz - q.z * vy;
    const cy = q.z * vx - q.x * vz;
    const cz = q.x * vy - q.y * vx;
    return {
      x: vx + 2 * q.w * cx + 2 * (q.y * cz - q.z * cy),
      y: vy + 2 * q.w * cy + 2 * (q.z * cx - q.x * cz),
      z: vz + 2 * q.w * cz + 2 * (q.x * cy - q.y * cx),
    };
  };

  it('bends the knee forward and backward-swings the shin', () => {
    const pose = { thighX: 0, kneeX: 0 };
    solveLeg(0.56, 0, 0.08, 0.1, 0.44, 0.43, pose);
    expect(pose.thighX).toBeLessThan(0);
    expect(pose.kneeX).toBeGreaterThan(0);
  });

  it('rotates the limb axis onto the requested direction', () => {
    const q: Quat = { x: 0, y: 0, z: 0, w: 1 };
    const dir = { x: 0.6, y: 0, z: 0.8 };
    quatFromDown(dir, q);
    const r = rotateDown(q);
    expect(r.x).toBeCloseTo(dir.x);
    expect(r.y).toBeCloseTo(dir.y);
    expect(r.z).toBeCloseTo(dir.z);
  });

  it('points the upper arm towards a straight-line reach', () => {
    const upper: Quat = { x: 0, y: 0, z: 0, w: 1 };
    const lower: Quat = { x: 0, y: 0, z: 0, w: 1 };
    solveArm(v(0, 0, 0), v(0, 0, 5), v(0, -1, 0), 0.3, 0.3, upper, lower);
    const r = rotateDown(upper);
    expect(r.z).toBeGreaterThan(0.99);
    expect(lower.w).toBeCloseTo(1, 1);
  });
});
