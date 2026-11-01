/**
 * Versioned save data. Pure: only touches the injected storage.
 * Every read validates the whole shape, and anything unreadable is discarded instead of thrown.
 */
import type { WeaponSaveState } from '../core/contracts';
import { WEAPON_SLOTS } from '../core/types';
import type { Vec3, WeaponId } from '../core/types';
import type { KeyValueStorage } from '../settings/settings';

export const SAVE_VERSION = 1;
export const CHECKPOINT_KEY = 'ironveil.checkpoint';
export const CAMPAIGN_KEY = 'ironveil.campaign';

export interface CheckpointStats {
  elapsedSeconds: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  deaths: number;
  checkpointsReached: number;
}

export interface MissionCheckpoint {
  missionId: string;
  checkpointId: string;
  stageId: string;
  playerPosition: Vec3;
  playerYaw: number;
  health: number;
  weapons: WeaponSaveState;
  defeatedEnemyIds: string[];
  collectedPickupIds: string[];
  openDoorIds: string[];
  firedTriggerIds: string[];
  stats: CheckpointStats;
}

export interface CampaignStatus {
  completed: boolean;
  bestGrade: string | null;
}

/** Best first. An unknown grade ranks below all of these. */
const GRADE_ORDER: readonly string[] = ['S', 'A', 'B', 'C'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isCount = (value: unknown): value is number => isFiniteNumber(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseVec3(value: unknown): Vec3 | null {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null;
  return { x: value.x, y: value.y, z: value.z };
}

function parseWeapons(value: unknown): WeaponSaveState | null {
  if (!isRecord(value) || !isRecord(value.ammo)) return null;
  if (!WEAPON_SLOTS.includes(value.activeWeapon as WeaponId)) return null;
  const ammo = {} as Record<WeaponId, { mag: number; reserve: number }>;
  for (const slot of WEAPON_SLOTS) {
    const entry = value.ammo[slot];
    if (!isRecord(entry) || !isCount(entry.mag) || !isCount(entry.reserve)) return null;
    ammo[slot] = { mag: entry.mag, reserve: entry.reserve };
  }
  return { activeWeapon: value.activeWeapon as WeaponId, ammo };
}

function parseStats(value: unknown): CheckpointStats | null {
  if (!isRecord(value)) return null;
  const { elapsedSeconds, shotsFired, shotsHit, headshots, deaths, checkpointsReached } = value;
  if (
    !isCount(elapsedSeconds) ||
    !isCount(shotsFired) ||
    !isCount(shotsHit) ||
    !isCount(headshots) ||
    !isCount(deaths) ||
    !isCount(checkpointsReached)
  ) {
    return null;
  }
  return { elapsedSeconds, shotsFired, shotsHit, headshots, deaths, checkpointsReached };
}

/** Returns a clean copy, or null when any part of the value is missing or malformed. */
export function parseCheckpoint(value: unknown): MissionCheckpoint | null {
  if (!isRecord(value)) return null;
  const position = parseVec3(value.playerPosition);
  const weapons = parseWeapons(value.weapons);
  const stats = parseStats(value.stats);
  if (!position || !weapons || !stats) return null;
  if (!isText(value.missionId) || !isText(value.checkpointId) || !isText(value.stageId)) return null;
  if (!isFiniteNumber(value.playerYaw) || !isFiniteNumber(value.health) || value.health <= 0) return null;
  if (
    !isTextList(value.defeatedEnemyIds) ||
    !isTextList(value.collectedPickupIds) ||
    !isTextList(value.openDoorIds) ||
    !isTextList(value.firedTriggerIds)
  ) {
    return null;
  }
  return {
    missionId: value.missionId,
    checkpointId: value.checkpointId,
    stageId: value.stageId,
    playerPosition: position,
    playerYaw: value.playerYaw,
    health: value.health,
    weapons,
    defeatedEnemyIds: [...value.defeatedEnemyIds],
    collectedPickupIds: [...value.collectedPickupIds],
    openDoorIds: [...value.openDoorIds],
    firedTriggerIds: [...value.firedTriggerIds],
    stats,
  };
}

function parseCampaign(value: unknown): CampaignStatus | null {
  if (!isRecord(value) || typeof value.completed !== 'boolean') return null;
  const { bestGrade } = value;
  if (bestGrade === null || typeof bestGrade === 'string') return { completed: value.completed, bestGrade };
  return null;
}

/** True when `grade` beats `current`. Anything beats no grade at all. */
function isBetterGrade(grade: string, current: string | null): boolean {
  if (current === null) return true;
  const rank = (g: string): number => {
    const index = GRADE_ORDER.indexOf(g);
    return index < 0 ? GRADE_ORDER.length : index;
  };
  return rank(grade) < rank(current);
}

export class SaveStore {
  /** `null` is allowed: every load then returns nothing and every save reports false. */
  constructor(private readonly storage: KeyValueStorage | null) {}

  /** Returns false when the storage refused the write (full or blocked). */
  saveCheckpoint(checkpoint: MissionCheckpoint): boolean {
    return this.write(CHECKPOINT_KEY, checkpoint);
  }

  /** Null when there is no checkpoint, it is corrupt or it comes from another version. Never throws. */
  loadCheckpoint(): MissionCheckpoint | null {
    return this.read(CHECKPOINT_KEY, parseCheckpoint);
  }

  clearCheckpoint(): void {
    this.remove(CHECKPOINT_KEY);
  }

  /** Marks the campaign completed and keeps the best grade so far. Returns the new status. */
  recordCompletion(grade: string): CampaignStatus {
    const current = this.getCampaign();
    const next: CampaignStatus = {
      completed: true,
      bestGrade: isBetterGrade(grade, current.bestGrade) ? grade : current.bestGrade,
    };
    this.write(CAMPAIGN_KEY, next);
    return next;
  }

  getCampaign(): CampaignStatus {
    return this.read(CAMPAIGN_KEY, parseCampaign) ?? { completed: false, bestGrade: null };
  }

  private write(key: string, data: unknown): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(key, JSON.stringify({ version: SAVE_VERSION, data }));
      return true;
    } catch {
      return false;
    }
  }

  private read<T>(key: string, parse: (value: unknown) => T | null): T | null {
    if (!this.storage) return null;
    let raw: string | null;
    try {
      raw = this.storage.getItem(key);
    } catch {
      return null;
    }
    if (raw === null) return null;
    const parsed = this.decode(raw, parse);
    if (parsed === null) this.remove(key);
    return parsed;
  }

  private decode<T>(raw: string, parse: (value: unknown) => T | null): T | null {
    try {
      const envelope: unknown = JSON.parse(raw);
      if (!isRecord(envelope) || envelope.version !== SAVE_VERSION) return null;
      return parse(envelope.data);
    } catch {
      return null;
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // Blocked storage: there is nothing further to clean up.
    }
  }
}
