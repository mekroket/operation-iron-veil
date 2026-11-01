import { describe, expect, it } from 'vitest';
import { catmullRom, easeShot, pathDuration, sampleCameraPath } from '../src/animations/cameraPath';
import type { GameContext, IEnemyDirector, IPlayerControl } from '../src/core/contracts';
import { EventBus } from '../src/core/events';
import type { Vec3, WeaponId } from '../src/core/types';
import { DoorSystem } from '../src/interaction/DoorSystem';
import { InteractionSystem } from '../src/interaction/InteractionSystem';
import { PickupSystem } from '../src/interaction/PickupSystem';
import type { CameraKey, LevelDefinition } from '../src/levels/types';
import { MissionDirector } from '../src/missions/MissionDirector';
import { MissionStateMachine, STAGE_IDS, computeGrade, computeScore } from '../src/missions/MissionStateMachine';
import type { GradeInput, MissionHooks } from '../src/missions/MissionStateMachine';
import { RadioQueue, radioDuration } from '../src/missions/RadioQueue';
import { RADIO_BEATS, STAGE_SCRIPT, TRANSFER_OBJECTIVE, TRIGGER_ORDER } from '../src/missions/silentBreakwaterScript';
import { SaveStore } from '../src/save/SaveStore';
import type { KeyValueStorage } from '../src/settings/settings';

const makeMachine = (hooks?: MissionHooks) =>
  new MissionStateMachine(STAGE_SCRIPT.map((stage) => ({ id: stage.id, objective: stage.objective })), hooks);

describe('MissionStateMachine', () => {
  it('walks every stage in order', () => {
    const entered: string[] = [];
    const sm = makeMachine({ onEnter: (stage) => entered.push(stage.id) });
    sm.start();
    sm.signal('briefing_done');
    sm.signal('insertion_done');
    for (const id of ['enter_port', 'checkpoint_passed', 'warehouse_entry', 'annex_entry', 'server_room']) sm.applyTrigger(id);
    sm.signal('transfer_complete');
    sm.applyTrigger('extraction_near');
    sm.signal('boarded');
    expect(entered).toEqual([...STAGE_IDS]);
    expect(sm.status).toBe('complete');
    expect(sm.index).toBe(sm.total - 1);
  });

  it('rejects stages out of order', () => {
    const stages = STAGE_SCRIPT.map((stage) => ({ id: stage.id, objective: '' })).reverse();
    expect(() => new MissionStateMachine(stages)).toThrow();
  });

  it('auto-advances past missed triggers without running the skipped stages', () => {
    const entered: { id: string; skipped: string[] }[] = [];
    const sm = makeMachine({ onEnter: (stage, info) => entered.push({ id: stage.id, skipped: info.skipped }) });
    sm.start();
    expect(sm.applyTrigger('warehouse_mid')).toBe(true);
    expect(sm.stageId).toBe('warehouse');
    expect(entered.at(-1)).toEqual({ id: 'warehouse', skipped: ['insertion', 'infiltrate', 'checkpoint', 'yard'] });
    expect(entered).toHaveLength(2);
  });

  it('cannot skip the objective, in any way', () => {
    const sm = makeMachine();
    sm.start();
    expect(sm.signal('transfer_complete')).toBe(false);
    expect(sm.applyTrigger('extraction_near')).toBe(true);
    expect(sm.stageId).toBe('objective');
    expect(sm.applyTrigger('quay_mid')).toBe(false);
    expect(sm.signal('boarded')).toBe(false);
    expect(sm.stageId).toBe('objective');
    expect(sm.signal('transfer_complete')).toBe(true);
    expect(sm.stageId).toBe('exfil');
  });

  it('cannot finish without boarding', () => {
    const sm = makeMachine();
    sm.restore('exfil');
    expect(sm.signal('boarded')).toBe(false);
    sm.applyTrigger('extraction_near');
    expect(sm.stageId).toBe('extract');
    expect(sm.signal('boarded')).toBe(true);
  });

  it('never moves backwards and ignores unknown triggers', () => {
    const sm = makeMachine();
    sm.restore('yard');
    expect(sm.applyTrigger('enter_port')).toBe(false);
    expect(sm.signal('briefing_done')).toBe(false);
    expect(sm.applyTrigger('toString')).toBe(false);
    expect(sm.stageId).toBe('yard');
  });

  it('restores to any stage without running earlier ones', () => {
    for (const id of STAGE_IDS) {
      const entered: string[] = [];
      const exited: string[] = [];
      const sm = makeMachine({ onEnter: (stage) => entered.push(stage.id), onExit: (stage) => exited.push(stage.id) });
      expect(sm.restore(id)).toBe(true);
      expect(sm.stageId).toBe(id);
      expect(entered).toEqual([id]);
      expect(exited).toEqual([]);
    }
  });

  it('fails on request, stops advancing, and recovers through restore', () => {
    const reasons: string[] = [];
    const sm = makeMachine({ onFailed: (reason) => reasons.push(reason) });
    expect(sm.fail('too early')).toBe(false);
    sm.start();
    expect(sm.fail('down')).toBe(true);
    expect(sm.fail('down again')).toBe(false);
    expect(sm.status).toBe('failed');
    expect(sm.applyTrigger('enter_port')).toBe(false);
    expect(reasons).toEqual(['down']);
    sm.restore('yard');
    expect(sm.status).toBe('running');
  });

  it('tracks objective text, and clears an override on the next stage', () => {
    const sm = makeMachine();
    sm.start();
    expect(sm.objective).toBe(STAGE_SCRIPT[0].objective);
    sm.setObjectiveText('Override');
    expect(sm.objective).toBe('Override');
    sm.signal('briefing_done');
    expect(sm.objective).toBe(STAGE_SCRIPT[1].objective);
  });
});

describe('grade', () => {
  const run = (overrides: Partial<GradeInput>): GradeInput => ({
    elapsedSeconds: 720,
    shotsFired: 100,
    shotsHit: 25,
    headshots: 0,
    enemiesDefeated: 10,
    deaths: 0,
    ...overrides,
  });

  it('adds up the four parts', () => {
    expect(computeScore(run({ shotsHit: 50, headshots: 4 }))).toBeCloseTo(100);
    expect(computeScore(run({ elapsedSeconds: 1800, deaths: 1 }))).toBeCloseTo(35);
    expect(computeScore(run({ elapsedSeconds: 1260 }))).toBeCloseTo(57.5);
  });

  it('applies the thresholds', () => {
    expect(computeGrade(run({ shotsHit: 50 }))).toBe('S');
    expect(computeGrade(run({}))).toBe('A');
    expect(computeGrade(run({ deaths: 2 }))).toBe('B');
    expect(computeGrade(run({ deaths: 3 }))).toBe('C');
  });

  it('handles a run with no shots and many deaths', () => {
    const score = computeScore(run({ shotsFired: 0, shotsHit: 0, enemiesDefeated: 0, deaths: 50 }));
    expect(score).toBeCloseTo(25);
  });
});

describe('script and radio', () => {
  const lines = RADIO_BEATS.flatMap((beat) => beat.lines);

  it('stays within the planned length and subtitle limit', () => {
    expect(lines.length).toBeGreaterThanOrEqual(35);
    expect(lines.length).toBeLessThanOrEqual(50);
    for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(110);
  });

  it('ends on the hook, with Vane', () => {
    expect(lines.at(-1)?.speaker).toBe('Overwatch');
    expect(lines.at(-1)?.text).toContain('Nobody but me');
  });

  it('has a stage for every id, in order', () => {
    expect(STAGE_SCRIPT.map((stage) => stage.id)).toEqual([...STAGE_IDS]);
  });

  it('never overlaps lines', () => {
    const starts: { at: number; duration: number }[] = [];
    let clock = 0;
    const radio = new RadioQueue((line) => starts.push({ at: clock, duration: line.duration }));
    radio.enqueue([{ speaker: 'A', text: 'First line here.' }, { speaker: 'B', text: 'Second.', pauseBefore: 2 }, { speaker: 'A', text: 'Third.' }]);
    expect(radio.idle).toBe(false);
    for (let i = 0; i < 300; i += 1) {
      clock += 0.1;
      radio.update(0.1);
    }
    expect(starts).toHaveLength(3);
    expect(starts[1].at).toBeGreaterThanOrEqual(starts[0].at + starts[0].duration + 2);
    expect(starts[2].at).toBeGreaterThanOrEqual(starts[1].at + starts[1].duration);
    expect(radio.idle).toBe(true);
  });

  it('drops only non-critical lines when falling behind', () => {
    const said: string[] = [];
    const radio = new RadioQueue((line) => said.push(line.text));
    radio.enqueue([{ speaker: 'A', text: 'flavour', critical: false }]);
    radio.enqueue(Array.from({ length: 8 }, (_, i) => ({ speaker: 'A', text: `plot ${i}`, critical: true })));
    for (let i = 0; i < 100; i += 1) radio.update(1);
    expect(said).toEqual(Array.from({ length: 8 }, (_, i) => `plot ${i}`));
    expect(radioDuration('x')).toBeGreaterThan(1);
  });
});

const GROUPS = ['checkpoint', 'yard_a', 'yard_b', 'warehouse', 'warehouse_reinforce', 'annex', 'quay', 'quay_reinforce'];
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const TERMINAL_Z = 300;
const BOAT_Z = 500;

const makeLevel = (): LevelDefinition =>
  ({
    triggers: TRIGGER_ORDER.map((id, i) => ({ id, center: { x: 0, y: 1, z: (i + 1) * 20 }, size: { x: 4, y: 4, z: 4 } })),
    enemies: GROUPS.map((group) => ({ id: `e_${group}`, group, position: ORIGIN, yaw: 0, patrol: [] })),
    doors: ['east_exit', 'annex_door'].map((id, i) => ({
      id,
      center: { x: 50 + i * 50, y: 1, z: 0 },
      size: { x: 2, y: 2, z: 0.2 },
      openOffset: ORIGIN,
      material: 'steelDark',
      label: id,
      navLinks: [],
    })),
    pickups: [{ id: 'ammo1', kind: 'ammo', position: { x: 200, y: 1, z: 0 } }],
    checkpoints: [
      { id: 'cp_checkpoint', position: { x: 1, y: 0, z: 1 }, yaw: 1, trigger: 'checkpoint_passed' },
      { id: 'cp_quay', position: { x: 2, y: 0, z: 2 }, yaw: 2, trigger: 'quay_entry' },
    ],
    playerStart: { position: ORIGIN, yaw: 0 },
    objective: { position: { x: 0, y: 1.6, z: TERMINAL_Z }, yaw: 0, label: 'Terminal' },
    extraction: { position: { x: 0, y: 0, z: BOAT_Z }, yaw: 0, zone: { id: 'boat', center: { x: 0, y: 1, z: BOAT_Z }, size: { x: 6, y: 4, z: 6 } } },
    blastPoint: { x: 9, y: 1, z: 9 },
  }) as unknown as LevelDefinition;

class FakeEnemies implements IEnemyDirector {
  readonly active = new Set<string>();
  readonly alerted: string[] = [];
  defeated: string[] = [];
  frozen = false;
  readonly totalEnemies = GROUPS.length;
  activateGroup(group: string): void {
    this.active.add(group);
  }
  alertGroup(group: string): void {
    this.alerted.push(group);
  }
  remainingInGroup(group: string): number {
    return this.defeated.includes(`e_${group}`) ? 0 : 1;
  }
  getDefeatedIds(): string[] {
    return [...this.defeated];
  }
  resetTo(ids: readonly string[]): void {
    this.defeated = [...ids];
    this.active.clear();
  }
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }
  getHitTargets() {
    return [];
  }
}

const WEAPON_STATE = {
  activeWeapon: 'smg' as WeaponId,
  ammo: { assaultRifle: { mag: 1, reserve: 2 }, smg: { mag: 3, reserve: 4 }, handgun: { mag: 5, reserve: 6 } },
};

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function harness(storage: KeyValueStorage = memoryStorage()) {
  const bus = new EventBus();
  const level = makeLevel();
  const player = {
    position: { ...ORIGIN },
    eye: { x: 0, y: 1.6, z: 0 },
    forward: { x: 0, y: 0, z: 1 },
    alive: true,
    health: 100,
    maxHealth: 100,
    placedAt: null as Vec3 | null,
    heal(amount: number) {
      this.health += amount;
    },
    restore(position: Vec3, _yaw: number, health: number) {
      this.placedAt = position;
      this.health = health;
    },
  };
  const moveTo = (x: number, z: number): void => {
    player.position = { x, y: 0, z };
    player.eye = { x, y: 1.6, z };
  };
  const enemies = new FakeEnemies();
  const restoredWeapons: unknown[] = [];
  const weapons = {
    enabled: true,
    setEnabled(enabled: boolean) {
      this.enabled = enabled;
    },
    addReserveAmmo: () => true,
    canTakeAmmo: () => true,
    getSaveState: () => WEAPON_STATE,
    restoreSaveState: (state: unknown) => void restoredWeapons.push(state),
  };
  const visuals = {
    blast: false,
    objective: '',
    setPickupVisible: () => undefined,
    setDoorOpen: () => undefined,
    setObjectiveState(state: string) {
      this.objective = state;
    },
    setBlastDamage(active: boolean) {
      this.blast = active;
    },
  };
  const interaction = new InteractionSystem(bus, () => true);
  const doors = new DoorSystem({ doors: level.doors, bus, visuals, interaction, createBlocker: () => ({ setBlocking: () => undefined }) });
  const pickups = new PickupSystem({
    pickups: level.pickups,
    bus,
    visuals,
    interaction,
    weapons,
    player: player as unknown as IPlayerControl,
  });
  const save = new SaveStore(storage);
  const ctx = { bus, player } as unknown as GameContext;
  const director = new MissionDirector({ ctx, level, enemies, weapons, visuals, doors, pickups, interaction, save });

  const radio: string[] = [];
  const objectives: string[] = [];
  const blasts: Vec3[] = [];
  const completes: unknown[] = [];
  const fails: string[] = [];
  bus.on('mission:radio', (line) => radio.push(line.text));
  bus.on('mission:objective', (objective) => objectives.push(objective.text));
  bus.on('fx:explosion', (blast) => blasts.push(blast.position));
  bus.on('mission:complete', (stats) => completes.push(stats));
  bus.on('mission:failed', (failure) => fails.push(failure.reason));

  /** Stands in a trigger zone for one frame. */
  const goTo = (id: string): void => {
    moveTo(0, (TRIGGER_ORDER.indexOf(id) + 1) * 20);
    director.update(0.016);
  };
  const useTerminal = (): void => {
    moveTo(0, TERMINAL_Z - 2);
    interaction.update(3.1, player.eye, player.forward, true, false);
    interaction.update(0.016, player.eye, player.forward, false, false);
  };
  const tick = (seconds: number, step = 0.1): void => {
    for (let t = 0; t < seconds; t += step) director.update(step);
  };
  return { bus, player, moveTo, enemies, weapons, restoredWeapons, visuals, interaction, doors, pickups, save, director, level, radio, objectives, blasts, completes, fails, goTo, useTerminal, tick };
}

const FIRED = { weaponId: 'smg' as WeaponId, origin: ORIGIN, direction: ORIGIN, muzzle: ORIGIN };
const HIT = { enemyId: 'e', zone: 'head' as const, damage: 1, killed: true, point: ORIGIN, direction: ORIGIN };

describe('MissionDirector', () => {
  it('starts on the briefing and moves on by itself', () => {
    const h = harness();
    h.director.start(null);
    expect(h.director.stageId).toBe('briefing');
    expect(h.objectives).toEqual([STAGE_SCRIPT[0].objective]);
    h.director.update(3.1);
    expect(h.director.stageId).toBe('insertion');
    h.director.update(12.1);
    expect(h.director.stageId).toBe('infiltrate');
  });

  it('wakes groups from triggers, once, and early enough to hide them', () => {
    const h = harness();
    h.director.start(null);
    h.goTo('enter_port');
    expect(h.director.stageId).toBe('checkpoint');
    expect([...h.enemies.active]).toEqual(['checkpoint']);
    h.goTo('checkpoint_near');
    expect(h.enemies.active.has('yard_a')).toBe(true);
    h.goTo('checkpoint_near');
    h.tick(60);
    expect(h.radio.filter((line) => line.includes('Security checkpoint ahead'))).toHaveLength(1);
  });

  it('heals missed triggers: a later zone advances the stage and wakes what was skipped', () => {
    const h = harness();
    h.director.start(null);
    h.goTo('warehouse_mid');
    expect(h.director.stageId).toBe('warehouse');
    for (const group of ['checkpoint', 'yard_a', 'yard_b', 'warehouse', 'warehouse_reinforce', 'annex']) {
      expect(h.enemies.active.has(group)).toBe(true);
    }
    expect(h.enemies.alerted).toEqual(['warehouse_reinforce']);
  });

  it('holds quay zones back until the objective is done', () => {
    const h = harness();
    h.director.start(null);
    h.goTo('quay_mid');
    expect(h.director.stageId).toBe('briefing');
    expect(h.enemies.active.has('quay_reinforce')).toBe(false);
    expect(h.doors.open('east_exit')).toBe(false);
  });

  it('runs the terminal, the timed transfer and the blast, even if every zone was missed', () => {
    const h = harness();
    h.director.start(null);
    h.useTerminal();
    expect(h.director.stageId).toBe('objective');
    expect(h.objectives.at(-1)).toBe(TRANSFER_OBJECTIVE);
    expect(h.visuals.objective).toBe('working');
    expect(h.enemies.alerted).toContain('warehouse_reinforce');
    expect(h.director.objectiveTarget).toEqual(h.level.objective.position);

    h.tick(44);
    expect(h.director.stageId).toBe('objective');
    expect(h.director.transferSecondsLeft).toBeGreaterThan(0);
    h.tick(2);
    expect(h.director.stageId).toBe('exfil');
    expect(h.director.transferSecondsLeft).toBeNull();
    expect(h.visuals.blast).toBe(true);
    expect(h.visuals.objective).toBe('done');
    expect(h.blasts).toEqual([h.level.blastPoint]);
    expect(h.doors.isOpen('east_exit')).toBe(true);
    expect(h.enemies.active.has('quay')).toBe(true);
    expect(h.radio.join(' ')).toContain('Sundrik Interior Ministry');
  });

  it('boards, grades, clears the save, and only then completes', () => {
    const h = harness();
    const boarded: string[] = [];
    h.director.onBoarded = () => boarded.push(h.director.stageId);
    h.director.start(null);
    h.goTo('checkpoint_passed');
    expect(h.save.loadCheckpoint()).not.toBeNull();
    h.useTerminal();
    h.tick(70);

    h.moveTo(0, BOAT_Z);
    h.director.update(0.016);
    expect(h.director.stageId).toBe('extract');
    h.interaction.update(1, h.player.eye, h.player.forward, true, false);
    expect(h.director.stageId).toBe('extract');
    h.interaction.update(0.6, h.player.eye, h.player.forward, true, false);
    expect(h.director.stageId).toBe('complete');
    expect(boarded).toEqual(['complete']);
    expect(h.enemies.frozen).toBe(true);
    expect(h.weapons.enabled).toBe(false);
    expect(h.completes).toHaveLength(0);
    expect(h.save.loadCheckpoint()).toBeNull();
    expect(h.save.getCampaign().completed).toBe(true);

    h.tick(40, 0.5);
    expect(h.completes).toHaveLength(1);
    expect(h.radio.at(-1)).toContain('Nobody but me');
  });

  it('counts stats from the bus', () => {
    const h = harness();
    h.director.start(null);
    h.bus.emit('weapon:fired', FIRED);
    h.bus.emit('weapon:fired', FIRED);
    h.bus.emit('combat:enemyHit', HIT);
    h.bus.emit('enemy:killed', { enemyId: 'e', headshot: true, position: ORIGIN });
    h.enemies.defeated.push('e_checkpoint');
    const stats = h.director.getStats();
    expect(stats.shotsFired).toBe(2);
    expect(stats.shotsHit).toBe(1);
    expect(stats.accuracy).toBeCloseTo(0.5);
    expect(stats.headshots).toBe(1);
    expect(stats.enemiesDefeated).toBe(1);
    expect(stats.enemiesTotal).toBe(GROUPS.length);
  });

  it('fails on death, stops scripting and keeps the death for the retry', () => {
    const h = harness();
    h.director.start(null);
    h.goTo('checkpoint_passed');
    h.bus.emit('player:died', {});
    expect(h.fails).toHaveLength(1);
    expect(h.director.getStats().deaths).toBe(1);
    expect(h.save.loadCheckpoint()?.stats.deaths).toBe(1);
    h.goTo('warehouse_mid');
    expect(h.director.stageId).toBe('yard');
    expect(h.enemies.active.has('annex')).toBe(false);
  });

  it('restores a checkpoint: enemies, doors, pickups, weapons, player and stats, without replaying radio', () => {
    const storage = memoryStorage();
    const first = harness(storage);
    first.director.start(null);
    first.goTo('enter_port');
    first.bus.emit('weapon:fired', FIRED);
    first.enemies.defeated.push('e_checkpoint');
    first.doors.open('annex_door');
    first.pickups.restore(['ammo1']);
    first.goTo('checkpoint_passed');

    const second = harness(storage);
    const checkpoint = second.save.loadCheckpoint();
    expect(checkpoint?.checkpointId).toBe('cp_checkpoint');
    second.director.start(checkpoint);
    expect(second.director.stageId).toBe('yard');
    expect(second.enemies.getDefeatedIds()).toEqual(['e_checkpoint']);
    expect([...second.enemies.active].sort()).toEqual(['checkpoint', 'yard_a', 'yard_b']);
    expect(second.doors.isOpen('annex_door')).toBe(true);
    expect(second.doors.isOpen('east_exit')).toBe(false);
    expect(second.pickups.getCollectedIds()).toEqual(['ammo1']);
    expect(second.restoredWeapons).toEqual([WEAPON_STATE]);
    expect(second.player.placedAt).toEqual({ x: 1, y: 0, z: 1 });
    expect(second.director.getStats().shotsFired).toBe(1);
    expect(second.director.getStats().checkpointsReached).toBe(1);
    second.tick(5);
    expect(second.radio).toEqual([]);
  });

  it('restores past the objective with the blast done and the exit open', () => {
    const storage = memoryStorage();
    const first = harness(storage);
    first.director.start(null);
    first.useTerminal();
    first.tick(46);
    first.goTo('quay_entry');

    const second = harness(storage);
    second.director.start(second.save.loadCheckpoint());
    expect(second.director.stageId).toBe('exfil');
    expect(second.visuals.blast).toBe(true);
    expect(second.doors.isOpen('east_exit')).toBe(true);
    expect(second.enemies.active.has('quay_reinforce')).toBe(true);
    expect(second.blasts).toEqual([]);
  });

  it('ignores a checkpoint from another mission', () => {
    const storage = memoryStorage();
    const first = harness(storage);
    first.director.start(null);
    first.goTo('checkpoint_passed');
    const checkpoint = first.save.loadCheckpoint();
    expect(checkpoint).not.toBeNull();
    const second = harness();
    if (checkpoint) second.director.start({ ...checkpoint, missionId: 'somewhere-else' });
    expect(second.director.stageId).toBe('briefing');
  });

  it('stops listening after dispose', () => {
    const h = harness();
    h.director.start(null);
    h.director.dispose();
    h.bus.emit('weapon:fired', FIRED);
    expect(h.director.getStats().shotsFired).toBe(0);
  });
});

describe('cameraPath', () => {
  const key = (z: number, duration: number, fov?: number): CameraKey => ({
    position: { x: 0, y: 0, z },
    target: { x: 0, y: 0, z: z + 1 },
    duration,
    fov,
  });
  const keys = [key(0, 99, 40), key(10, 2, 60), key(20, 2)];

  it('interpolates through the end points of a segment', () => {
    expect(catmullRom(9, 1, 2, 9, 0)).toBeCloseTo(1);
    expect(catmullRom(9, 1, 2, 9, 1)).toBeCloseTo(2);
  });

  it('ignores the first key duration when open and uses it when looping', () => {
    expect(pathDuration(keys)).toBe(4);
    expect(pathDuration(keys, true)).toBe(103);
  });

  it('passes through the keys and clamps at both ends', () => {
    expect(sampleCameraPath(keys, -5)?.position.z).toBeCloseTo(0);
    expect(sampleCameraPath(keys, 2)?.position.z).toBeCloseTo(10);
    expect(sampleCameraPath(keys, 2)?.target.z).toBeCloseTo(11);
    expect(sampleCameraPath(keys, 100)?.position.z).toBeCloseTo(20);
  });

  it('interpolates FOV and falls back to the default', () => {
    expect(sampleCameraPath(keys, 0)?.fov).toBeCloseTo(40);
    expect(sampleCameraPath(keys, 2)?.fov).toBeCloseTo(60);
    expect(sampleCameraPath(keys, 4)?.fov).toBeCloseTo(55);
  });

  it('eases in and out', () => {
    expect(easeShot(0)).toBe(0);
    expect(easeShot(1)).toBe(1);
    expect(easeShot(0.5)).toBeCloseTo(0.5);
    expect(easeShot(0.1)).toBeLessThan(0.1);
    expect(easeShot(0.9)).toBeGreaterThan(0.9);
  });

  it('wraps when looping', () => {
    const loop = [key(0, 3), key(10, 2)];
    expect(sampleCameraPath(loop, 2, true)?.position.z).toBeCloseTo(10);
    expect(sampleCameraPath(loop, 7, true)?.position.z).toBeCloseTo(10);
    expect(sampleCameraPath(loop, 5, true)?.position.z).toBeCloseTo(0);
  });

  it('handles empty and single-key paths', () => {
    expect(sampleCameraPath([], 1)).toBeNull();
    expect(sampleCameraPath([key(5, 1)], 3)?.position.z).toBeCloseTo(5);
  });
});
