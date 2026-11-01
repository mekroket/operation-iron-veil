/** COMBAT: cover, distance band, burst fire, repositioning, reloads. Pure: no Babylon, no DOM. */
import { angleDelta, distance, distanceXZ, saturate, yawToForward } from '../core/math';
import type { EnemyStateName, Vec3 } from '../core/types';
import { computeHitChance } from './accuracy';
import type { BrainCore } from './BrainCore';
import type { FsmState } from './StateMachine';

const aimPoint: Vec3 = { x: 0, y: 0, z: 0 };

function chooseCover(core: BrainCore, focus: Vec3): boolean {
  const combat = core.cfg.combat;
  const memory = core.combat;
  const position = core.deps.position();
  const eyeHeight = core.cfg.body.eyeHeight;
  const node = core.nav.nearestCover(position, {
    maxDistance: combat.coverSearchRadius,
    isOccupied: (id) => !core.deps.isNodeFree(id),
    accept: (n) => {
      const d = distanceXZ(n.position, focus);
      return n.id !== memory.coverNodeId && d >= combat.bandMin && d <= combat.bandMax;
    },
    hasLineOfSight: (n) =>
      core.deps.lineOfSight({ x: n.position.x, y: n.position.y + eyeHeight, z: n.position.z }, focus),
    wantLineOfSight: true,
    maxLosChecks: 6,
  });
  if (!node || !core.follower.goToNode(node.id, position)) return false;
  core.deps.claimNode(node.id);
  memory.coverNodeId = node.id;
  memory.moving = true;
  return true;
}

/** No cover available: close in when too far, back away when too close, otherwise hold. */
function chooseOpenGround(core: BrainCore, focus: Vec3): void {
  const combat = core.cfg.combat;
  const memory = core.combat;
  const position = core.deps.position();
  const d = distanceXZ(position, focus);
  core.deps.releaseNode();
  memory.coverNodeId = null;
  memory.moving = false;
  if (d > combat.bandMax) {
    memory.moving = core.follower.goToPoint(focus, position);
  } else if (d < combat.bandMin) {
    const retreat = core.nav.nearestNode(position, (n) => {
      const away = distanceXZ(n.position, focus);
      return away >= combat.bandMin && away > d;
    });
    if (retreat) memory.moving = core.follower.goToNode(retreat.id, position);
  }
}

function reposition(core: BrainCore, focus: Vec3): void {
  const combat = core.cfg.combat;
  const memory = core.combat;
  if (!chooseCover(core, focus)) chooseOpenGround(core, focus);
  memory.repositionGap = combat.repositionGap;
  memory.repositionTimer = core.random(combat.repositionMin, combat.repositionMax);
}

function needsReposition(core: BrainCore, focus: Vec3, targetDistance: number): boolean {
  const combat = core.cfg.combat;
  const memory = core.combat;
  if (memory.moving || memory.repositionGap > 0) return false;
  if (memory.repositionTimer <= 0 || targetDistance < combat.tooClose) return true;
  const node = memory.coverNodeId === null ? undefined : core.nav.node(memory.coverNodeId);
  if (!node) return targetDistance > combat.bandMax;
  if (node.coverYaw === null) return false;
  const position = core.deps.position();
  const toTarget = Math.atan2(focus.x - position.x, focus.z - position.z);
  return Math.abs(angleDelta(node.coverYaw, toTarget)) > combat.flankAngle;
}

function startReload(core: BrainCore): void {
  core.combat.reloadLeft = core.cfg.burst.reloadTime;
  core.combat.burstLeft = 0;
  core.deps.callout('reloading');
}

/** Picks the visible part of the target. Both the eye and the muzzle must see it. Null means no shot. */
function clearShotPoint(core: BrainCore, muzzle: Vec3): Vec3 | null {
  const { chest, head } = core.target;
  const sees = (point: Vec3): boolean => core.deps.lineOfSight(core.eye, point) && core.deps.lineOfSight(muzzle, point);
  if (sees(chest)) return chest;
  return sees(head) ? head : null;
}

function fireOneShot(core: BrainCore, moving: boolean): boolean {
  const memory = core.combat;
  const target = core.target;
  const muzzle = core.deps.muzzle();
  const point = target.alive ? clearShotPoint(core, muzzle) : null;
  if (!point) return false;

  const d = distance(muzzle, point);
  const chance = computeHitChance(core.cfg.accuracy, {
    distance: d,
    targetSpeed: Math.hypot(target.velocity.x, target.velocity.z),
    targetCrouching: target.crouching,
    timeOnTarget: memory.timeOnTarget,
    shooterMoving: moving,
  });
  const hit = core.deps.random() < chance;
  const shotAt = { x: point.x, y: point.y, z: point.z };
  if (!hit) {
    const angle = core.random(0, Math.PI * 2);
    const miss = core.random(core.cfg.combat.missRadiusMin, core.cfg.combat.missRadiusMax);
    const lead = core.cfg.combat.leadTime;
    shotAt.x += Math.cos(angle) * miss + target.velocity.x * lead;
    shotAt.y += Math.sin(angle) * miss * 0.5;
    shotAt.z += Math.sin(angle) * miss + target.velocity.z * lead;
  }
  core.rounds--;
  core.deps.fire({
    muzzle: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
    target: shotAt,
    hit,
    damage: core.cfg.burst.damage,
  });
  return true;
}

function updateFiring(core: BrainCore, dt: number, targetInSight: boolean, aligned: boolean): void {
  const burst = core.cfg.burst;
  const memory = core.combat;

  if (memory.reloadLeft > 0) {
    memory.reloadLeft -= dt;
    if (memory.reloadLeft <= 0) {
      memory.reloadLeft = 0;
      core.rounds = burst.magSize;
      memory.burstCooldown = core.random(0.2, burst.cooldownMin);
    }
    return;
  }
  if (core.rounds <= 0) {
    startReload(core);
    return;
  }

  if (memory.burstLeft > 0) {
    memory.shotTimer -= dt;
    while (memory.shotTimer <= 0 && memory.burstLeft > 0) {
      // Line of sight is tested for every single shot. A blocked shot ends the burst.
      if (core.rounds <= 0 || !fireOneShot(core, memory.moving)) {
        memory.burstLeft = 0;
        memory.burstCooldown = core.random(burst.cooldownMin * 0.5, burst.cooldownMin);
        break;
      }
      memory.burstLeft--;
      memory.shotTimer += burst.shotInterval;
      if (memory.burstLeft === 0) memory.burstCooldown = core.random(burst.cooldownMin, burst.cooldownMax);
    }
    return;
  }

  memory.burstCooldown -= dt;
  if (memory.burstCooldown > 0) {
    // Between bursts, use a long pause to top up the magazine while hidden.
    if (!memory.moving && core.rounds <= burst.lowMag && memory.coverNodeId !== null) startReload(core);
    return;
  }

  const readyOnMove = !memory.moving || memory.timeOnTarget >= core.cfg.combat.moveFireDelay;
  if (targetInSight && aligned && readyOnMove && core.flinchLeft <= 0 && core.deps.canStartBurst()) {
    memory.burstLeft = Math.round(core.random(burst.shotsMin, burst.shotsMax));
    memory.shotTimer = 0;
  }
}

/** Strafes in the open, keeping the band. Direction flips now and then. */
function updateOpenGroundMove(core: BrainCore, dt: number, targetDistance: number): void {
  const combat = core.cfg.combat;
  const memory = core.combat;
  memory.strafeTimer -= dt;
  if (memory.strafeTimer <= 0) {
    memory.strafeDir = -memory.strafeDir;
    memory.strafeTimer = core.random(combat.strafeFlipMin, combat.strafeFlipMax);
  }
  const f = yawToForward(core.out.yaw);
  const strafe = core.cfg.speed.strafe * memory.strafeDir;
  const back = targetDistance < combat.bandMin ? -core.cfg.speed.strafe : 0;
  core.out.velocity.x = f.z * strafe + f.x * back;
  core.out.velocity.z = -f.x * strafe + f.z * back;
}

export const combatState: FsmState<EnemyStateName, BrainCore> = {
  enter(core) {
    const memory = core.combat;
    core.out.weaponRaised = true;
    core.perception.setMode('engaged');
    core.follower.stop();
    memory.coverNodeId = null;
    memory.moving = false;
    memory.losLost = 0;
    memory.timeOnTarget = 0;
    memory.burstLeft = 0;
    memory.shotTimer = 0;
    memory.burstCooldown = core.random(0.1, 0.5);
    memory.reloadLeft = 0;
    memory.repositionGap = 0;
    memory.repositionTimer = 0;
    memory.strafeTimer = 0;
  },
  update(core, dt) {
    const memory = core.combat;
    const out = core.out;
    const target = core.target;
    const p = core.perception;
    const seen = p.visible && target.alive;

    if (seen) {
      memory.losLost = 0;
      memory.timeOnTarget += dt;
    } else {
      memory.losLost += dt;
      memory.timeOnTarget = Math.max(0, memory.timeOnTarget - dt * 2);
      if (memory.losLost > core.cfg.combat.losLostToSearch) return 'SEARCH';
    }

    const focus = seen ? target.chest : p.lastKnownPosition ?? target.chest;
    const lead = seen ? core.cfg.combat.leadTime : 0;
    aimPoint.x = focus.x + target.velocity.x * lead;
    aimPoint.y = focus.y;
    aimPoint.z = focus.z + target.velocity.z * lead;
    core.lookAt(aimPoint, core.cfg.speed.combatTurn, dt);

    // Lean into the target's sideways motion.
    const f = yawToForward(out.yaw);
    const lateral = seen ? target.velocity.x * f.z - target.velocity.z * f.x : 0;
    out.lean = saturate(Math.abs(lateral) / 5) * Math.sign(lateral);

    const position = core.deps.position();
    const targetDistance = distanceXZ(position, focus);
    memory.repositionTimer -= dt;
    memory.repositionGap -= dt;
    if (needsReposition(core, focus, targetDistance)) reposition(core, focus);

    if (memory.moving) {
      if (core.steer(dt, core.cfg.speed.combatRun, false)) {
        memory.moving = false;
        core.stopMoving();
      }
    } else if (memory.coverNodeId === null) {
      updateOpenGroundMove(core, dt, targetDistance);
    } else {
      core.stopMoving();
    }

    const toTarget = Math.atan2(aimPoint.x - position.x, aimPoint.z - position.z);
    const aligned = Math.abs(angleDelta(out.yaw, toTarget)) < core.cfg.combat.aimTolerance;
    updateFiring(core, dt, seen, aligned);

    out.reloading = memory.reloadLeft > 0;
    out.reloadProgress = out.reloading ? 1 - memory.reloadLeft / core.cfg.burst.reloadTime : 0;
    out.bursting = memory.burstLeft > 0;

    // At cover, duck between bursts and stand a moment before the next one.
    const standing = memory.burstLeft > 0 || (!out.reloading && memory.burstCooldown <= core.cfg.burst.peekLead);
    out.crouching = !memory.moving && memory.coverNodeId !== null && !standing;
    return null;
  },
  exit(core) {
    const memory = core.combat;
    const out = core.out;
    core.deps.releaseNode();
    memory.coverNodeId = null;
    memory.moving = false;
    memory.burstLeft = 0;
    if (memory.reloadLeft > 0) core.rounds = core.cfg.burst.magSize;
    memory.reloadLeft = 0;
    out.crouching = false;
    out.reloading = false;
    out.reloadProgress = 0;
    out.bursting = false;
    out.lean = 0;
  },
};
