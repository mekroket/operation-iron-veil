/** Applies one fired ray: damage to whatever it hit, then the combat events. Pure: no Babylon, no DOM. */
import type { IHitTargetProvider } from '../core/contracts';
import type { EventBus } from '../core/events';
import type { Vec3 } from '../core/types';
import { computeDamage, resolveHitscan } from './hitscan';
import type { DamageProfile, WorldRaycast } from './hitscan';

export interface ShotProfile extends DamageProfile {
  range: number;
}

export function resolveShot(
  bus: EventBus,
  profile: ShotProfile,
  origin: Vec3,
  direction: Vec3,
  worldRaycast: WorldRaycast,
  targets: IHitTargetProvider,
): void {
  const hit = resolveHitscan(origin, direction, profile.range, worldRaycast, targets.getHitTargets());
  if (!hit) return;

  if (hit.kind === 'world') {
    bus.emit('combat:impact', { point: hit.point, normal: hit.normal, surface: hit.surface });
    return;
  }
  const damage = computeDamage(profile, hit.zone, hit.distance);
  const dealt = hit.target.applyDamage(damage, hit.zone, hit.point, direction);
  bus.emit('combat:enemyHit', {
    enemyId: hit.target.id,
    zone: hit.zone,
    damage: dealt,
    killed: !hit.target.alive,
    point: hit.point,
    direction,
  });
  bus.emit('combat:impact', { point: hit.point, normal: hit.normal, surface: 'flesh' });
}
