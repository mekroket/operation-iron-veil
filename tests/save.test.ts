import { describe, expect, it } from 'vitest';
import { CAMPAIGN_KEY, CHECKPOINT_KEY, SAVE_VERSION, SaveStore } from '../src/save/SaveStore';
import type { MissionCheckpoint } from '../src/save/SaveStore';
import type { KeyValueStorage } from '../src/settings/settings';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const throwingStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

const sample = (): MissionCheckpoint => ({
  missionId: 'silent-breakwater',
  checkpointId: 'cp_warehouse',
  stageId: 'warehouse',
  playerPosition: { x: 1, y: 0, z: -3.5 },
  playerYaw: 1.25,
  health: 72,
  weapons: {
    activeWeapon: 'smg',
    ammo: {
      assaultRifle: { mag: 30, reserve: 90 },
      smg: { mag: 12, reserve: 60 },
      handgun: { mag: 15, reserve: 45 },
    },
  },
  defeatedEnemyIds: ['e1', 'e2'],
  collectedPickupIds: ['ammo_1'],
  openDoorIds: ['door_a'],
  firedTriggerIds: ['enter_port', 'beat:vents'],
  stats: { elapsedSeconds: 210.5, shotsFired: 80, shotsHit: 33, headshots: 4, deaths: 1, checkpointsReached: 2 },
});

describe('SaveStore checkpoints', () => {
  it('round trips a checkpoint', () => {
    const store = new SaveStore(memoryStorage());
    expect(store.saveCheckpoint(sample())).toBe(true);
    expect(store.loadCheckpoint()).toEqual(sample());
  });

  it('returns null when there is nothing saved', () => {
    expect(new SaveStore(memoryStorage()).loadCheckpoint()).toBeNull();
  });

  it('clears a checkpoint', () => {
    const store = new SaveStore(memoryStorage());
    store.saveCheckpoint(sample());
    store.clearCheckpoint();
    expect(store.loadCheckpoint()).toBeNull();
  });

  it('discards corrupted JSON', () => {
    const storage = memoryStorage();
    storage.setItem(CHECKPOINT_KEY, '{"version":1,"data":{oops');
    expect(new SaveStore(storage).loadCheckpoint()).toBeNull();
    expect(storage.getItem(CHECKPOINT_KEY)).toBeNull();
  });

  it('discards another version', () => {
    const storage = memoryStorage();
    storage.setItem(CHECKPOINT_KEY, JSON.stringify({ version: SAVE_VERSION + 1, data: sample() }));
    expect(new SaveStore(storage).loadCheckpoint()).toBeNull();
    expect(storage.getItem(CHECKPOINT_KEY)).toBeNull();
  });

  it.each<[string, (value: Record<string, unknown>) => void]>([
    ['a missing field', (value) => delete value.stageId],
    ['a position with no number', (value) => (value.playerPosition = { x: 'one', y: 0, z: 0 })],
    ['non-finite health', (value) => (value.health = null)],
    ['zero health', (value) => (value.health = 0)],
    ['an unknown weapon', (value) => (value.weapons = { ...sample().weapons, activeWeapon: 'railgun' })],
    ['missing ammunition', (value) => (value.weapons = { activeWeapon: 'smg', ammo: { smg: { mag: 1, reserve: 1 } } })],
    ['a list that is not strings', (value) => (value.openDoorIds = [1, 2])],
    ['negative stats', (value) => (value.stats = { ...sample().stats, deaths: -1 })],
  ])('discards valid JSON with %s', (_name, damage) => {
    const storage = memoryStorage();
    const data = { ...sample() } as unknown as Record<string, unknown>;
    damage(data);
    storage.setItem(CHECKPOINT_KEY, JSON.stringify({ version: SAVE_VERSION, data }));
    expect(new SaveStore(storage).loadCheckpoint()).toBeNull();
  });

  it('survives storage that throws', () => {
    const store = new SaveStore(throwingStorage);
    expect(store.saveCheckpoint(sample())).toBe(false);
    expect(store.loadCheckpoint()).toBeNull();
    expect(() => store.clearCheckpoint()).not.toThrow();
    expect(store.getCampaign()).toEqual({ completed: false, bestGrade: null });
  });

  it('survives having no storage at all', () => {
    const store = new SaveStore(null);
    expect(store.saveCheckpoint(sample())).toBe(false);
    expect(store.loadCheckpoint()).toBeNull();
    expect(store.recordCompletion('A')).toEqual({ completed: true, bestGrade: 'A' });
  });
});

describe('SaveStore campaign', () => {
  it('starts not completed', () => {
    expect(new SaveStore(memoryStorage()).getCampaign()).toEqual({ completed: false, bestGrade: null });
  });

  it('keeps only the best grade', () => {
    const store = new SaveStore(memoryStorage());
    store.recordCompletion('B');
    expect(store.getCampaign()).toEqual({ completed: true, bestGrade: 'B' });
    store.recordCompletion('C');
    expect(store.getCampaign().bestGrade).toBe('B');
    store.recordCompletion('S');
    expect(store.getCampaign().bestGrade).toBe('S');
  });

  it('discards a corrupt campaign record', () => {
    const storage = memoryStorage();
    storage.setItem(CAMPAIGN_KEY, JSON.stringify({ version: SAVE_VERSION, data: { completed: 'yes', bestGrade: 3 } }));
    expect(new SaveStore(storage).getCampaign()).toEqual({ completed: false, bestGrade: null });
    expect(storage.getItem(CAMPAIGN_KEY)).toBeNull();
  });

  it('does not touch the campaign when the checkpoint is cleared', () => {
    const store = new SaveStore(memoryStorage());
    store.recordCompletion('A');
    store.saveCheckpoint(sample());
    store.clearCheckpoint();
    expect(store.getCampaign().completed).toBe(true);
  });
});
