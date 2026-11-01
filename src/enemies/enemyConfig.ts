/** Every tuning number for Black Meridian contractors, as data. Pure: no Babylon, no DOM. */

export interface PerceptionConfig {
  /** Metres at which a standing target can first be noticed. */
  visionRange: number;
  /** Full cone angle in degrees. */
  fovDegrees: number;
  crouchRangeMult: number;
  sprintRangeMult: number;
  /** Exponent of the falloff from the eye to the edge of range. Larger = harder to notice from far. */
  distanceFalloff: number;
  /** Lowest distance factor while still inside range. */
  minDistanceFactor: number;
  /** Visibility multiplier at the very edge of the cone. */
  fovEdgeFactor: number;
  /** A target this close is sensed whichever way the enemy faces. */
  proximityRadius: number;
  proximityVisibility: number;
  /** Awareness gained per second at visibility 1. */
  fillRate: number;
  /** Awareness lost per second when the target is not seen. */
  drainRate: number;
  /** Seconds after losing sight before awareness starts to drain. */
  drainDelay: number;
  /** While searching, awareness fills this much faster. */
  searchFillMult: number;
  /** While engaged, enemies watch a wider arc and further. */
  engagedFovDegrees: number;
  engagedRangeMult: number;
  engagedFillMult: number;
  /** Awareness at which sightings start to update the last known position. */
  trackThreshold: number;
  /** Seconds between line-of-sight rays for one enemy. */
  losInterval: number;
  /** Radii within which noises are heard, in metres. */
  walkHearingRadius: number;
  sprintHearingRadius: number;
  gunfireHearingRadius: number;
  /** Awareness set by hearing footsteps. Gunfire goes straight to 1. */
  footstepAwareness: number;
}

export interface AccuracyConfig {
  nearDistance: number;
  farDistance: number;
  nearChance: number;
  farChance: number;
  /** Hit chance multiplier when the target moves at `referenceSpeed` or faster. */
  movingTargetMult: number;
  referenceSpeed: number;
  crouchMult: number;
  /** Multiplier on the first shot on target, rising to 1 over `settleTime` seconds. */
  firstShotMult: number;
  settleTime: number;
  shooterMovingMult: number;
  minChance: number;
  maxChance: number;
}

export interface EnemyConfig {
  health: number;
  body: { height: number; radius: number; eyeHeight: number; crouchEyeHeight: number };
  hitbox: { headRadius: number; torsoRadius: number; legsRadius: number };
  speed: {
    patrol: number;
    investigate: number;
    search: number;
    combatRun: number;
    strafe: number;
    /** Radians per second. */
    turn: number;
    combatTurn: number;
  };
  perception: PerceptionConfig;
  idle: { lookMin: number; lookMax: number; lookArc: number; beforePatrol: number };
  patrol: { pauseMin: number; pauseMax: number; arriveRadius: number };
  suspicious: { threshold: number; stopTime: number; lingerMin: number; lingerMax: number };
  alert: {
    reactionMin: number;
    reactionMax: number;
    /** Reaction time when the alert came from being shot. */
    damagedReaction: number;
    allyRadius: number;
    allyShortRange: number;
  };
  combat: {
    bandMin: number;
    bandMax: number;
    tooClose: number;
    repositionMin: number;
    repositionMax: number;
    /** Minimum seconds between two repositions, so close pressure does not cause jitter. */
    repositionGap: number;
    /** Radians between the cover direction and the target beyond which the enemy counts as flanked. */
    flankAngle: number;
    losLostToSearch: number;
    coverSearchRadius: number;
    strafeFlipMin: number;
    strafeFlipMax: number;
    /** Seconds of target velocity added to the aim point. */
    leadTime: number;
    /** Radians of yaw error tolerated when firing. */
    aimTolerance: number;
    /** Seconds on target before firing on the move is allowed. */
    moveFireDelay: number;
    missRadiusMin: number;
    missRadiusMax: number;
  };
  burst: {
    shotsMin: number;
    shotsMax: number;
    shotInterval: number;
    cooldownMin: number;
    cooldownMax: number;
    /** Seconds before the next burst at which a crouching enemy stands up. */
    peekLead: number;
    magSize: number;
    reloadTime: number;
    /** While hiding with this few rounds or fewer, reload early. */
    lowMag: number;
    /** 100 / 7: a full-health player goes down on the 15th hit. */
    damage: number;
    /** Most enemies allowed to fire a burst at the same moment. */
    maxSimultaneous: number;
  };
  accuracy: AccuracyConfig;
  search: {
    nodesMin: number;
    nodesMax: number;
    nodeRadius: number;
    lingerMin: number;
    lingerMax: number;
    maxDuration: number;
    /** Awareness kept when combat turns into a search, so a fresh sighting escalates fast. */
    startAwareness: number;
  };
  flinch: { duration: number; aimPenalty: number };
  lod: {
    midDistance: number;
    farDistance: number;
    midThink: number;
    farThink: number;
    midAnim: number;
    farAnim: number;
    midLos: number;
    farLos: number;
  };
  separation: { enemyRadius: number; playerRadius: number; pushSpeed: number };
}

export const ENEMY_CONFIG: EnemyConfig = {
  health: 100,
  body: { height: 1.8, radius: 0.35, eyeHeight: 1.65, crouchEyeHeight: 1.15 },
  hitbox: { headRadius: 0.135, torsoRadius: 0.24, legsRadius: 0.2 },
  speed: { patrol: 1.5, investigate: 1.9, search: 2.6, combatRun: 4.2, strafe: 1.5, turn: 3.5, combatTurn: 6.5 },
  perception: {
    visionRange: 35,
    fovDegrees: 110,
    crouchRangeMult: 0.6,
    sprintRangeMult: 1.1,
    distanceFalloff: 1.3,
    minDistanceFactor: 0.06,
    fovEdgeFactor: 0.35,
    proximityRadius: 1.8,
    proximityVisibility: 0.6,
    fillRate: 2.2,
    drainRate: 0.3,
    drainDelay: 0.8,
    searchFillMult: 2.5,
    engagedFovDegrees: 220,
    engagedRangeMult: 1.4,
    engagedFillMult: 4,
    trackThreshold: 0.15,
    losInterval: 0.2,
    walkHearingRadius: 4,
    sprintHearingRadius: 14,
    gunfireHearingRadius: 45,
    footstepAwareness: 0.45,
  },
  idle: { lookMin: 2, lookMax: 5, lookArc: 0.9, beforePatrol: 1.5 },
  patrol: { pauseMin: 1.5, pauseMax: 4, arriveRadius: 0.6 },
  suspicious: { threshold: 0.35, stopTime: 0.8, lingerMin: 2, lingerMax: 3.5 },
  alert: { reactionMin: 0.35, reactionMax: 0.6, damagedReaction: 0.12, allyRadius: 22, allyShortRange: 8 },
  combat: {
    bandMin: 8,
    bandMax: 28,
    tooClose: 5,
    repositionMin: 5,
    repositionMax: 9,
    repositionGap: 1.5,
    flankAngle: 1.75,
    losLostToSearch: 6,
    coverSearchRadius: 30,
    strafeFlipMin: 1.5,
    strafeFlipMax: 3,
    leadTime: 0.15,
    aimTolerance: 0.25,
    moveFireDelay: 0.6,
    missRadiusMin: 0.5,
    missRadiusMax: 1.3,
  },
  burst: {
    shotsMin: 3,
    shotsMax: 5,
    shotInterval: 0.1,
    cooldownMin: 1.2,
    cooldownMax: 2.4,
    peekLead: 0.35,
    magSize: 30,
    reloadTime: 2.6,
    lowMag: 8,
    damage: 7,
    maxSimultaneous: 4,
  },
  accuracy: {
    nearDistance: 5,
    farDistance: 35,
    nearChance: 0.45,
    farChance: 0.1,
    movingTargetMult: 0.5,
    referenceSpeed: 6,
    crouchMult: 0.8,
    firstShotMult: 0.3,
    settleTime: 1.6,
    shooterMovingMult: 0.55,
    minChance: 0.03,
    maxChance: 0.6,
  },
  search: {
    nodesMin: 1,
    nodesMax: 2,
    nodeRadius: 14,
    lingerMin: 1.2,
    lingerMax: 2.4,
    maxDuration: 35,
    startAwareness: 0.6,
  },
  flinch: { duration: 0.35, aimPenalty: 0.4 },
  lod: { midDistance: 30, farDistance: 70, midThink: 0.1, farThink: 0.3, midAnim: 0.05, farAnim: 0.1, midLos: 0.3, farLos: 0.6 },
  separation: { enemyRadius: 0.9, playerRadius: 0.9, pushSpeed: 2.5 },
};
