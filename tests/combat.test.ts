import { describe, expect, it } from 'vitest';
import {
  computeDamage,
  falloffMultiplier,
  intersectRayCapsule,
  resolveHitscan,
  spreadDirection,
} from '../src/combat/hitscan';
import type { DamageProfile, WorldRaycast } from '../src/combat/hitscan';
import type { HitCapsule, HitTarget, WorldHit } from '../src/core/contracts';
import { dot, lengthOf, normalize, v3 } from '../src/core/math';
import type { HitZone, Vec3 } from '../src/core/types';

const FORWARD = v3(0, 0, 1);
const ORIGIN = v3();

/** A wall across the ray at this distance, assuming the ray runs along +Z from the origin. */
function wallAt(distance: number): WorldRaycast {
  return (from: Vec3, to: Vec3): WorldHit | null => {
    if (to.z - from.z < distance) return null;
    return { point: v3(from.x, from.y, from.z + distance), normal: v3(0, 0, -1), distance, surface: 'concrete' };
  };
}
const noWorld: WorldRaycast = () => null;

function makeTarget(id: string, capsules: HitCapsule[], alive = true): HitTarget {
  return {
    id,
    alive,
    capsules: () => capsules,
    applyDamage: (damage: number) => damage,
  };
}

/** A capsule standing upright across the ray, centred at this distance along +Z. */
function upright(z: number, zone: HitZone = 'torso', radius = 0.3, halfHeight = 0.5, y = 0): HitCapsule {
  return { a: v3(0, y - halfHeight, z), b: v3(0, y + halfHeight, z), radius, zone };
}

describe('intersectRayCapsule', () => {
  const a = v3(0, -1, 10);
  const b = v3(0, 1, 10);

  it('hits the cylinder wall', () => {
    const hit = intersectRayCapsule(ORIGIN, FORWARD, 100, a, b, 0.5);
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(9.5);
    expect(hit?.point.z).toBeCloseTo(9.5);
    expect(hit?.normal.z).toBeCloseTo(-1);
  });

  it('hits the rounded cap past the end of the segment', () => {
    const hit = intersectRayCapsule(v3(0, 1.3, 0), FORWARD, 100, a, b, 0.5);
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(10 - Math.sqrt(0.25 - 0.09));
  });

  it('misses to the side and above', () => {
    expect(intersectRayCapsule(v3(0.6, 0, 0), FORWARD, 100, a, b, 0.5)).toBeNull();
    expect(intersectRayCapsule(v3(0, 1.6, 0), FORWARD, 100, a, b, 0.5)).toBeNull();
  });

  it('misses when the capsule is behind the ray', () => {
    expect(intersectRayCapsule(ORIGIN, v3(0, 0, -1), 100, a, b, 0.5)).toBeNull();
  });

  it('misses beyond the maximum distance', () => {
    expect(intersectRayCapsule(ORIGIN, FORWARD, 5, a, b, 0.5)).toBeNull();
  });

  it('handles a ray running along the capsule axis', () => {
    const hit = intersectRayCapsule(v3(0, -10, 10), v3(0, 1, 0), 100, a, b, 0.5);
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(8.5);
  });

  it('handles a capsule with zero length as a sphere', () => {
    const hit = intersectRayCapsule(ORIGIN, FORWARD, 100, v3(0, 0, 10), v3(0, 0, 10), 0.5);
    expect(hit?.t).toBeCloseTo(9.5);
  });

  it('reports distance zero when starting inside', () => {
    const hit = intersectRayCapsule(v3(0, 0, 10), FORWARD, 100, a, b, 0.5);
    expect(hit?.t).toBe(0);
  });

  it('hits at an oblique angle', () => {
    const direction = normalize(v3(1, 0, 1));
    const hit = intersectRayCapsule(ORIGIN, direction, 100, v3(5, -1, 5), v3(5, 1, 5), 0.5);
    expect(hit?.t).toBeCloseTo(Math.hypot(5, 5) - 0.5);
  });
});

describe('resolveHitscan', () => {
  it('returns null when nothing is hit', () => {
    expect(resolveHitscan(ORIGIN, FORWARD, 100, noWorld, [])).toBeNull();
  });

  it('returns a world hit with its surface', () => {
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, wallAt(20), []);
    expect(hit?.kind).toBe('world');
    if (hit?.kind === 'world') {
      expect(hit.surface).toBe('concrete');
      expect(hit.distance).toBe(20);
    }
  });

  it('returns a target hit with its zone', () => {
    const target = makeTarget('a', [upright(10, 'limb')]);
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, noWorld, [target]);
    expect(hit?.kind).toBe('target');
    if (hit?.kind === 'target') {
      expect(hit.target).toBe(target);
      expect(hit.zone).toBe('limb');
      expect(hit.distance).toBeCloseTo(9.7);
    }
  });

  it('lets a wall block a target behind it', () => {
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, wallAt(5), [makeTarget('a', [upright(10)])]);
    expect(hit?.kind).toBe('world');
  });

  it('hits a target in front of a wall', () => {
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, wallAt(20), [makeTarget('a', [upright(10)])]);
    expect(hit?.kind).toBe('target');
  });

  it('respects range', () => {
    expect(resolveHitscan(ORIGIN, FORWARD, 5, noWorld, [makeTarget('a', [upright(10)])])).toBeNull();
  });

  it('skips dead targets', () => {
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, noWorld, [makeTarget('a', [upright(10)], false)]);
    expect(hit).toBeNull();
  });

  it('picks the nearest of several targets, whatever their order', () => {
    const near = makeTarget('near', [upright(8)]);
    const far = makeTarget('far', [upright(15)]);
    for (const targets of [[near, far], [far, near]]) {
      const hit = resolveHitscan(ORIGIN, FORWARD, 100, noWorld, targets);
      expect(hit?.kind === 'target' && hit.target.id).toBe('near');
    }
  });

  it('gives the head when the head surface is nearer than an overlapping torso', () => {
    const head = upright(10, 'head', 0.3);
    const torso = upright(10.2, 'torso', 0.3);
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, noWorld, [makeTarget('a', [torso, head])]);
    expect(hit?.kind === 'target' && hit.zone).toBe('head');
  });

  it('gives the torso when the torso surface is nearer than an overlapping head', () => {
    const head = upright(10.2, 'head', 0.3);
    const torso = upright(10, 'torso', 0.3);
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, noWorld, [makeTarget('a', [head, torso])]);
    expect(hit?.kind === 'target' && hit.zone).toBe('torso');
  });

  it('prefers the head on an exact tie on one target', () => {
    const head = upright(10, 'head');
    const torso = upright(10, 'torso');
    for (const capsules of [[head, torso], [torso, head]]) {
      const hit = resolveHitscan(ORIGIN, FORWARD, 100, noWorld, [makeTarget('a', capsules)]);
      expect(hit?.kind === 'target' && hit.zone).toBe('head');
    }
  });

  it('does not let a tied head on another target take the hit', () => {
    const first = makeTarget('first', [upright(10, 'torso')]);
    const second = makeTarget('second', [upright(10, 'head')]);
    const hit = resolveHitscan(ORIGIN, FORWARD, 100, noWorld, [first, second]);
    expect(hit?.kind === 'target' && hit.target.id).toBe('first');
  });

  it('normalises the direction it is given', () => {
    const hit = resolveHitscan(ORIGIN, v3(0, 0, 5), 100, noWorld, [makeTarget('a', [upright(10)])]);
    expect(hit?.distance).toBeCloseTo(9.7);
  });
});

describe('damage', () => {
  const profile: DamageProfile = {
    damage: 100,
    headMultiplier: 2,
    limbMultiplier: 0.5,
    falloffStart: 10,
    falloffEnd: 30,
    falloffMinMultiplier: 0.4,
  };

  it('is full up to the falloff start', () => {
    expect(falloffMultiplier(0, 10, 30, 0.4)).toBe(1);
    expect(falloffMultiplier(10, 10, 30, 0.4)).toBe(1);
  });

  it('falls linearly between start and end', () => {
    expect(falloffMultiplier(20, 10, 30, 0.4)).toBeCloseTo(0.7);
  });

  it('stays at the minimum beyond the end', () => {
    expect(falloffMultiplier(30, 10, 30, 0.4)).toBe(0.4);
    expect(falloffMultiplier(1000, 10, 30, 0.4)).toBe(0.4);
  });

  it('applies zone multipliers', () => {
    expect(computeDamage(profile, 'torso', 0)).toBe(100);
    expect(computeDamage(profile, 'head', 0)).toBe(200);
    expect(computeDamage(profile, 'limb', 0)).toBe(50);
  });

  it('combines zone and falloff', () => {
    expect(computeDamage(profile, 'head', 30)).toBeCloseTo(80);
  });
});

describe('spreadDirection', () => {
  it('returns the forward direction for zero spread', () => {
    expect(spreadDirection(FORWARD, 0, 0.5, 0.5)).toEqual(FORWARD);
  });

  it('stays unit length and inside the cone', () => {
    const forward = normalize(v3(1, 0.3, -0.4));
    const spread = 0.05;
    for (let i = 0; i <= 20; i++) {
      for (let j = 0; j <= 20; j++) {
        const direction = spreadDirection(forward, spread, i / 20, j / 20);
        expect(lengthOf(direction)).toBeCloseTo(1);
        expect(Math.acos(Math.min(1, dot(direction, forward)))).toBeLessThanOrEqual(spread + 1e-6);
      }
    }
  });

  it('reaches the edge of the cone at the largest random value', () => {
    const direction = spreadDirection(FORWARD, 0.05, 1, 0.25);
    expect(Math.acos(dot(direction, FORWARD))).toBeCloseTo(0.05);
  });

  it('works when looking straight up', () => {
    const direction = spreadDirection(v3(0, 1, 0), 0.05, 1, 0);
    expect(lengthOf(direction)).toBeCloseTo(1);
    expect(direction.y).toBeCloseTo(Math.cos(0.05));
  });
});
