/** Instant-hit bullets: ray against capsules and the world, spread and damage falloff. Pure: no Babylon, no DOM. */
import type { HitTarget, WorldHit } from '../core/contracts';
import { add, dot, lerp, normalize, saturate, scale, sub, v3 } from '../core/math';
import type { HitZone, SurfaceType, Vec3 } from '../core/types';

export interface RayCapsuleHit {
  /** Distance along the ray. 0 when the ray starts inside the capsule. */
  t: number;
  point: Vec3;
  normal: Vec3;
}

function closestOnSegment(point: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const lengthSq = dot(ab, ab);
  if (lengthSq < 1e-12) return a;
  return add(a, scale(ab, saturate(dot(sub(point, a), ab) / lengthSq)));
}

/** Nearest entry of a ray into a sphere at or after t=0, or -1. `dir` must be unit length. */
function raySphere(origin: Vec3, dir: Vec3, centre: Vec3, radius: number): number {
  const oc = sub(origin, centre);
  const b = dot(oc, dir);
  const c = dot(oc, oc) - radius * radius;
  const h = b * b - c;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : -1;
}

/** Nearest entry of a ray into the cylinder part of a capsule, or -1. Parallel rays only ever enter through the end caps. */
function rayCylinder(origin: Vec3, dir: Vec3, a: Vec3, b: Vec3, radius: number): number {
  const ab = sub(b, a);
  const abab = dot(ab, ab);
  if (abab < 1e-12) return -1;
  const ao = sub(origin, a);
  const abDir = dot(ab, dir);
  const abAo = dot(ab, ao);
  const qa = abab - abDir * abDir;
  if (qa < 1e-10) return -1;
  const qb = abab * dot(dir, ao) - abAo * abDir;
  const qc = abab * dot(ao, ao) - abAo * abAo - radius * radius * abab;
  const h = qb * qb - qa * qc;
  if (h < 0) return -1;
  const t = (-qb - Math.sqrt(h)) / qa;
  if (t < 0) return -1;
  const along = abAo + t * abDir;
  return along > 0 && along < abab ? t : -1;
}

/**
 * Ray against a capsule, up to maxDistance.
 * @param dir Must be unit length.
 */
export function intersectRayCapsule(
  origin: Vec3,
  dir: Vec3,
  maxDistance: number,
  a: Vec3,
  b: Vec3,
  radius: number,
): RayCapsuleHit | null {
  const startClosest = closestOnSegment(origin, a, b);
  const startOffset = sub(origin, startClosest);
  if (dot(startOffset, startOffset) <= radius * radius) {
    return { t: 0, point: { ...origin }, normal: scale(dir, -1) };
  }

  let best = -1;
  for (const t of [rayCylinder(origin, dir, a, b, radius), raySphere(origin, dir, a, radius), raySphere(origin, dir, b, radius)]) {
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  if (best < 0 || best > maxDistance) return null;

  const point = add(origin, scale(dir, best));
  return { t: best, point, normal: normalize(sub(point, closestOnSegment(point, a, b))) };
}

export interface WorldHitResult {
  kind: 'world';
  distance: number;
  point: Vec3;
  normal: Vec3;
  surface: SurfaceType;
}

export interface TargetHitResult {
  kind: 'target';
  distance: number;
  point: Vec3;
  normal: Vec3;
  target: HitTarget;
  zone: HitZone;
}

export type HitscanResult = WorldHitResult | TargetHitResult;
export type WorldRaycast = (from: Vec3, to: Vec3) => WorldHit | null;

const TIE_EPSILON = 1e-6;

/**
 * Fires a ray and returns whichever comes first: the world or a capsule of a living target.
 * Across capsules the nearer surface always wins. A head only beats an overlapping torso or limb of the
 * same target when it is nearer, or on an exact tie.
 */
export function resolveHitscan(
  origin: Vec3,
  direction: Vec3,
  range: number,
  worldRaycast: WorldRaycast,
  targets: readonly HitTarget[],
): HitscanResult | null {
  const dir = normalize(direction);
  const world = worldRaycast(origin, add(origin, scale(dir, range)));
  let limit = world ? Math.min(world.distance, range) : range;
  let best: TargetHitResult | null = null;

  for (const target of targets) {
    if (!target.alive) continue;
    for (const capsule of target.capsules()) {
      const hit = intersectRayCapsule(origin, dir, limit + TIE_EPSILON, capsule.a, capsule.b, capsule.radius);
      if (!hit) continue;
      const nearer = best === null ? hit.t <= limit : hit.t < best.distance - TIE_EPSILON;
      const headTie =
        best !== null &&
        best.target === target &&
        capsule.zone === 'head' &&
        best.zone !== 'head' &&
        Math.abs(hit.t - best.distance) <= TIE_EPSILON;
      if (nearer || headTie) {
        best = { kind: 'target', distance: hit.t, point: hit.point, normal: hit.normal, target, zone: capsule.zone };
        limit = Math.min(limit, hit.t);
      }
    }
  }

  // A wall at exactly the same distance stops the bullet.
  if (best && (!world || best.distance < world.distance)) return best;
  if (world) {
    return { kind: 'world', distance: world.distance, point: world.point, normal: world.normal, surface: world.surface };
  }
  return null;
}

/** Linear falloff: 1 up to `start`, `minMultiplier` from `end` onwards. */
export function falloffMultiplier(distance: number, start: number, end: number, minMultiplier: number): number {
  if (distance <= start) return 1;
  if (distance >= end) return minMultiplier;
  return lerp(1, minMultiplier, (distance - start) / (end - start));
}

export interface DamageProfile {
  damage: number;
  headMultiplier: number;
  limbMultiplier: number;
  falloffStart: number;
  falloffEnd: number;
  falloffMinMultiplier: number;
}

export function zoneMultiplier(profile: DamageProfile, zone: HitZone): number {
  if (zone === 'head') return profile.headMultiplier;
  return zone === 'limb' ? profile.limbMultiplier : 1;
}

/** Damage of one shot at this distance on this body zone. */
export function computeDamage(profile: DamageProfile, zone: HitZone, distance: number): number {
  const falloff = falloffMultiplier(distance, profile.falloffStart, profile.falloffEnd, profile.falloffMinMultiplier);
  return profile.damage * zoneMultiplier(profile, zone) * falloff;
}

/**
 * Picks a direction inside a cone, uniformly over the disc the cone projects.
 * @param forward Must be unit length.
 * @param spread Half-angle of the cone, radians.
 * @param r1 Random number 0..1.
 * @param r2 Random number 0..1.
 */
export function spreadDirection(forward: Vec3, spread: number, r1: number, r2: number): Vec3 {
  if (spread <= 0) return { ...forward };
  const reference = Math.abs(forward.y) > 0.99 ? v3(1, 0, 0) : v3(0, 1, 0);
  const right = normalize({
    x: reference.y * forward.z - reference.z * forward.y,
    y: reference.z * forward.x - reference.x * forward.z,
    z: reference.x * forward.y - reference.y * forward.x,
  });
  const up = {
    x: forward.y * right.z - forward.z * right.y,
    y: forward.z * right.x - forward.x * right.z,
    z: forward.x * right.y - forward.y * right.x,
  };
  const angle = spread * Math.sqrt(r1);
  const around = r2 * Math.PI * 2;
  const side = Math.sin(angle);
  return normalize({
    x: forward.x * Math.cos(angle) + (right.x * Math.cos(around) + up.x * Math.sin(around)) * side,
    y: forward.y * Math.cos(angle) + (right.y * Math.cos(around) + up.y * Math.sin(around)) * side,
    z: forward.z * Math.cos(angle) + (right.z * Math.cos(around) + up.z * Math.sin(around)) * side,
  });
}
