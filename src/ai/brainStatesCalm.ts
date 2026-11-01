/** IDLE, PATROL, SUSPICIOUS, ALERT, SEARCH and DEFEATED. COMBAT lives in brainStateCombat.ts. Pure. */
import type { EnemyStateName, Vec3 } from '../core/types';
import type { FsmState } from './StateMachine';
import type { BrainCore } from './BrainCore';

type BrainState = FsmState<EnemyStateName, BrainCore>;

/** Shared escalation rule of the calm states. */
function escalation(core: BrainCore): EnemyStateName | null {
  const p = core.perception;
  if (p.awareness >= 1) return 'ALERT';
  if (p.consumeNoise() !== null || p.awareness >= core.cfg.suspicious.threshold) return 'SUSPICIOUS';
  return null;
}

export const idleState: BrainState = {
  enter(core) {
    core.stopMoving();
    core.follower.stop();
    core.out.weaponRaised = false;
    core.lookTimer = core.random(0, core.cfg.idle.lookMax);
    core.perception.setMode('calm');
  },
  update(core, dt, timeInState) {
    const next = escalation(core);
    if (next !== null) return next;
    core.stopMoving();
    core.lookAround(core.homeYaw, dt);
    return core.patrol.length > 0 && timeInState >= core.cfg.idle.beforePatrol ? 'PATROL' : null;
  },
};

function headToPatrolNode(core: BrainCore): void {
  const position = core.deps.position();
  if (core.patrol.length === 0) core.follower.goToPoint(core.home, position);
  else core.follower.goToNode(core.patrol[core.patrolIndex], position);
}

export const patrolState: BrainState = {
  enter(core) {
    core.out.weaponRaised = false;
    core.stateTimer = 0;
    core.perception.setMode('calm');
    headToPatrolNode(core);
  },
  update(core, dt) {
    const next = escalation(core);
    if (next !== null) return next;

    if (core.stateTimer > 0) {
      core.stateTimer -= dt;
      core.stopMoving();
      core.lookAround(core.baseYaw, dt);
      if (core.stateTimer <= 0) headToPatrolNode(core);
      return null;
    }
    if (!core.steer(dt, core.cfg.speed.patrol, true)) return null;

    // A guard with no loop has walked back to its post.
    if (core.patrol.length === 0) return 'IDLE';
    core.patrolIndex = (core.patrolIndex + 1) % core.patrol.length;
    core.stateTimer = core.random(core.cfg.patrol.pauseMin, core.cfg.patrol.pauseMax);
    core.baseYaw = core.out.yaw;
    core.lookTimer = core.random(0.4, 1.2);
    return null;
  },
};

function copyInto(out: Vec3, source: Vec3): void {
  out.x = source.x;
  out.y = source.y;
  out.z = source.z;
}

export const suspiciousState: BrainState = {
  enter(core) {
    const memory = core.investigate;
    core.stopMoving();
    core.follower.stop();
    core.out.weaponRaised = true;
    core.perception.setMode('calm');
    core.deps.callout('search');
    memory.phase = 'stop';
    memory.timer = core.cfg.suspicious.stopTime;
    copyInto(memory.point, core.perception.lastKnownPosition ?? core.deps.position());
  },
  update(core, dt) {
    const memory = core.investigate;
    const p = core.perception;
    if (p.awareness >= 1) return 'ALERT';

    // A new noise or a fresh sighting moves the point being investigated.
    const noise = p.consumeNoise();
    if (noise !== null || p.visible) {
      if (p.lastKnownPosition) copyInto(memory.point, p.lastKnownPosition);
      if (memory.phase === 'linger' || noise !== null) {
        memory.phase = 'stop';
        memory.timer = core.cfg.suspicious.stopTime * 0.5;
      }
    }

    switch (memory.phase) {
      case 'stop':
        core.stopMoving();
        core.lookAt(memory.point, core.cfg.speed.turn, dt);
        memory.timer -= dt;
        if (memory.timer <= 0) {
          const moving = core.follower.goToPoint(memory.point, core.deps.position());
          memory.phase = moving ? 'walk' : 'linger';
          memory.timer = core.random(core.cfg.suspicious.lingerMin, core.cfg.suspicious.lingerMax);
          core.baseYaw = core.out.yaw;
        }
        return null;
      case 'walk':
        if (core.steer(dt, core.cfg.speed.investigate, true)) {
          memory.phase = 'linger';
          memory.timer = core.random(core.cfg.suspicious.lingerMin, core.cfg.suspicious.lingerMax);
          core.baseYaw = core.out.yaw;
          core.lookTimer = 0;
        }
        return null;
      case 'linger':
        core.stopMoving();
        core.lookAround(core.baseYaw, dt);
        memory.timer -= dt;
        if (memory.timer > 0 || p.awareness >= core.cfg.suspicious.threshold) return null;
        p.calm();
        return 'PATROL';
    }
  },
};

export const alertState: BrainState = {
  enter(core) {
    const alert = core.cfg.alert;
    core.stopMoving();
    core.follower.stop();
    core.out.weaponRaised = true;
    core.perception.setMode('engaged');
    core.stateTimer = core.quickReaction ? alert.damagedReaction : core.random(alert.reactionMin, alert.reactionMax);
    core.quickReaction = false;
    const silent = core.silentAlert;
    core.silentAlert = false;
    if (silent) return;
    core.deps.callout('contact');
    core.deps.alertAllies(core.perception.lastKnownPosition ?? core.target.position);
  },
  update(core, dt) {
    core.stopMoving();
    const focus = core.perception.lastKnownPosition;
    if (focus) core.lookAt(focus, core.cfg.speed.combatTurn, dt);
    core.stateTimer -= dt;
    return core.stateTimer <= 0 ? 'COMBAT' : null;
  },
};

function pickSearchNodes(core: BrainCore, around: Vec3): string[] {
  const search = core.cfg.search;
  const nearby = core.nav.nodesWithin(around, search.nodeRadius).map((n) => n.id);
  const count = Math.round(core.random(search.nodesMin, search.nodesMax));
  const picked: string[] = [];
  while (picked.length < count && nearby.length > 0) {
    const index = Math.min(nearby.length - 1, Math.floor(core.deps.random() * nearby.length));
    picked.push(nearby[index]);
    nearby.splice(index, 1);
  }
  return picked;
}

export const searchState: BrainState = {
  enter(core) {
    const memory = core.search;
    const position = core.deps.position();
    const point = core.perception.lastKnownPosition ?? position;
    core.out.weaponRaised = true;
    core.out.crouching = false;
    core.perception.setMode('searching');
    core.perception.setAwareness(Math.min(core.perception.awareness, core.cfg.search.startAwareness));
    core.perception.consumeNoise();
    core.deps.callout('search');
    memory.nodes = pickSearchNodes(core, point);
    memory.phase = 'walk';
    memory.timer = 0;
    core.follower.goToPoint(point, position);
  },
  update(core, dt, timeInState) {
    const memory = core.search;
    const p = core.perception;
    if (p.awareness >= 1) return 'ALERT';

    const noise = p.consumeNoise();
    if (noise !== null) {
      memory.phase = 'walk';
      core.follower.goToPoint(noise, core.deps.position());
    }
    if (timeInState > core.cfg.search.maxDuration) {
      p.calm();
      return 'PATROL';
    }

    if (memory.phase === 'walk') {
      if (core.steer(dt, core.cfg.speed.search, true)) {
        memory.phase = 'linger';
        memory.timer = core.random(core.cfg.search.lingerMin, core.cfg.search.lingerMax);
        core.baseYaw = core.out.yaw;
        core.lookTimer = 0;
      }
      return null;
    }

    core.stopMoving();
    core.lookAround(core.baseYaw, dt);
    memory.timer -= dt;
    if (memory.timer > 0) return null;
    const nextNode = memory.nodes.shift();
    if (nextNode === undefined) {
      p.calm();
      return 'PATROL';
    }
    memory.phase = 'walk';
    core.follower.goToNode(nextNode, core.deps.position());
    return null;
  },
};

export const defeatedState: BrainState = {
  terminal: true,
  enter(core) {
    const out = core.out;
    core.stopMoving();
    core.follower.stop();
    core.deps.releaseNode();
    out.weaponRaised = false;
    out.crouching = false;
    out.reloading = false;
    out.bursting = false;
    out.lean = 0;
    core.perception.setMode('calm');
  },
};
