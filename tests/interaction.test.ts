import { describe, expect, it } from 'vitest';
import type { ILevelVisuals, IPlayerControl, IWeaponDirector } from '../src/core/contracts';
import { EventBus } from '../src/core/events';
import type { Vec3 } from '../src/core/types';
import { DoorSystem } from '../src/interaction/DoorSystem';
import { InteractionSystem } from '../src/interaction/InteractionSystem';
import type { CanSee, Interactable } from '../src/interaction/InteractionSystem';
import { PickupSystem } from '../src/interaction/PickupSystem';
import type { DoorDef, PickupDef } from '../src/levels/types';

const EYE: Vec3 = { x: 0, y: 1.6, z: 0 };
const AHEAD: Vec3 = { x: 0, y: 0, z: 1 };
const BEHIND: Vec3 = { x: 0, y: 0, z: -1 };

function setup(canSee: CanSee = () => true) {
  const bus = new EventBus();
  const prompts: { text: string | null; holdProgress: number }[] = [];
  bus.on('interaction:prompt', (prompt) => prompts.push(prompt));
  return { bus, prompts, system: new InteractionSystem(bus, canSee) };
}

function makeItem(id: string, position: Vec3, overrides: Partial<Interactable> = {}) {
  const item = {
    done: 0,
    id,
    position,
    radius: 5,
    prompt: `Use ${id}` as Interactable['prompt'],
    holdSeconds: 0,
    isEnabled: () => true,
    onComplete: () => {
      item.done += 1;
    },
    ...overrides,
  };
  return item;
}

const ahead = (z: number): Vec3 => ({ x: 0, y: 1.6, z });

describe('InteractionSystem choosing', () => {
  it('picks the nearest of two faced items', () => {
    const { system } = setup();
    system.register(makeItem('far', ahead(3)));
    system.register(makeItem('near', ahead(1)));
    system.update(0.016, EYE, AHEAD, false, false);
    expect(system.currentId).toBe('near');
  });

  it('skips a closer item the player is not facing', () => {
    const { system } = setup();
    system.register(makeItem('behind', ahead(-1)));
    system.register(makeItem('front', ahead(3)));
    system.update(0.016, EYE, AHEAD, false, false);
    expect(system.currentId).toBe('front');
  });

  it('prefers the item faced squarely over one barely in view', () => {
    const { system } = setup();
    system.register(makeItem('edge', { x: 1.2, y: 1.6, z: 1.5 }));
    system.register(makeItem('centre', ahead(2.5)));
    system.update(0.016, EYE, AHEAD, false, false);
    expect(system.currentId).toBe('centre');
  });

  it('ignores items out of reach', () => {
    const { system } = setup();
    system.register(makeItem('far', ahead(6)));
    system.update(0.016, EYE, AHEAD, false, false);
    expect(system.currentId).toBeNull();
  });

  it('ignores disabled items and never completes them', () => {
    const { system } = setup();
    const off = makeItem('off', ahead(1), { isEnabled: () => false });
    const on = makeItem('on', ahead(3));
    system.register(off);
    system.register(on);
    system.update(0.016, EYE, AHEAD, true, true);
    expect(off.done).toBe(0);
    expect(on.done).toBe(1);
  });

  it('does not see through walls, and falls back to what it can see', () => {
    const { system } = setup((_from, to) => to.z > 2);
    system.register(makeItem('hidden', ahead(1)));
    system.register(makeItem('visible', ahead(4)));
    system.update(0.016, EYE, AHEAD, false, false);
    expect(system.currentId).toBe('visible');
  });

  it('stops the sight line short so a solid target does not hide itself', () => {
    const seen: Vec3[] = [];
    const { system } = setup((_from, to) => {
      seen.push(to);
      return true;
    });
    system.register(makeItem('door', ahead(3), { losMargin: 0.5 }));
    system.update(0.016, EYE, AHEAD, false, false);
    expect(seen[0].z).toBeCloseTo(2.5);
  });

  it('skips the sight check when told to', () => {
    const { system } = setup(() => false);
    system.register(makeItem('zone', ahead(3), { requiresLineOfSight: false }));
    system.update(0.016, EYE, AHEAD, false, false);
    expect(system.currentId).toBe('zone');
  });

  it('forgets an unregistered item', () => {
    const { system } = setup();
    const remove = system.register(makeItem('a', ahead(1)));
    system.update(0.016, EYE, AHEAD, false, false);
    remove();
    system.update(0.016, EYE, AHEAD, false, false);
    expect(system.currentId).toBeNull();
  });
});

describe('InteractionSystem holding', () => {
  it('fires an instant item on the press only', () => {
    const { system } = setup();
    const item = makeItem('a', ahead(1));
    system.register(item);
    system.update(0.016, EYE, AHEAD, true, false);
    expect(item.done).toBe(0);
    system.update(0.016, EYE, AHEAD, true, true);
    expect(item.done).toBe(1);
  });

  it('builds progress and completes at the hold time', () => {
    const { system, prompts } = setup();
    const item = makeItem('a', ahead(1), { holdSeconds: 1 });
    system.register(item);
    system.update(0.4, EYE, AHEAD, true, false);
    system.update(0.4, EYE, AHEAD, true, false);
    expect(item.done).toBe(0);
    expect(prompts.at(-1)?.holdProgress).toBeCloseTo(0.8);
    system.update(0.4, EYE, AHEAD, true, false);
    expect(item.done).toBe(1);
    expect(prompts.at(-1)?.holdProgress).toBe(0);
  });

  it('resets on release', () => {
    const { system, prompts } = setup();
    const item = makeItem('a', ahead(1), { holdSeconds: 1 });
    system.register(item);
    system.update(0.6, EYE, AHEAD, true, false);
    system.update(0.016, EYE, AHEAD, false, false);
    expect(prompts.at(-1)?.holdProgress).toBe(0);
    system.update(0.6, EYE, AHEAD, true, false);
    expect(item.done).toBe(0);
  });

  it('resets on looking away', () => {
    const { system, prompts } = setup();
    const item = makeItem('a', ahead(1), { holdSeconds: 1 });
    system.register(item);
    system.update(0.6, EYE, AHEAD, true, false);
    system.update(0.016, EYE, BEHIND, true, false);
    expect(prompts.at(-1)?.text).toBeNull();
    system.update(0.6, EYE, AHEAD, true, false);
    expect(item.done).toBe(0);
  });

  it('needs a fresh press after completing', () => {
    const { system } = setup();
    const item = makeItem('a', ahead(1), { holdSeconds: 0.5 });
    system.register(item);
    system.update(0.6, EYE, AHEAD, true, false);
    system.update(0.6, EYE, AHEAD, true, false);
    expect(item.done).toBe(1);
    system.update(0.016, EYE, AHEAD, false, false);
    system.update(0.6, EYE, AHEAD, true, false);
    expect(item.done).toBe(2);
  });
});

describe('InteractionSystem prompts', () => {
  it('emits only when the prompt changes', () => {
    const { system, prompts } = setup();
    system.update(0.016, EYE, AHEAD, false, false);
    expect(prompts).toHaveLength(0);
    system.register(makeItem('a', ahead(1)));
    system.update(0.016, EYE, AHEAD, false, false);
    system.update(0.016, EYE, AHEAD, false, false);
    system.update(0.016, EYE, AHEAD, false, false);
    expect(prompts).toEqual([{ text: 'Use a', holdProgress: 0 }]);
    system.update(0.016, EYE, BEHIND, false, false);
    system.update(0.016, EYE, BEHIND, false, false);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toEqual({ text: null, holdProgress: 0 });
  });

  it('re-evaluates function prompts', () => {
    const { system, prompts } = setup();
    let label = 'first';
    system.register(makeItem('a', ahead(1), { prompt: () => label }));
    system.update(0.016, EYE, AHEAD, false, false);
    label = 'second';
    system.update(0.016, EYE, AHEAD, false, false);
    expect(prompts.map((prompt) => prompt.text)).toEqual(['first', 'second']);
  });
});

const makeVisuals = () => {
  const doorState = new Map<string, boolean>();
  const pickupState = new Map<string, boolean>();
  const visuals: ILevelVisuals = {
    setPickupVisible: (id, visible) => void pickupState.set(id, visible),
    setDoorOpen: (id, open) => void doorState.set(id, open),
    setObjectiveState: () => undefined,
    setBlastDamage: () => undefined,
  };
  return { visuals, doorState, pickupState };
};

describe('DoorSystem', () => {
  const door = (id: string, startsOpen = false): DoorDef => ({
    id,
    center: { x: 0, y: 1.2, z: 2 },
    size: { x: 1.6, y: 2.4, z: 0.1 },
    openOffset: { x: 1.6, y: 0, z: 0 },
    material: 'steelDark',
    label: 'Office door',
    navLinks: [['a', 'b']],
    startsOpen,
  });

  function setupDoors(defs: DoorDef[]) {
    const base = setup();
    const { visuals, doorState } = makeVisuals();
    const blocking = new Map<string, boolean>();
    const moved: boolean[] = [];
    base.bus.on('door:moved', (event) => moved.push(event.opening));
    const doors = new DoorSystem({
      doors: defs,
      bus: base.bus,
      visuals,
      interaction: base.system,
      createBlocker: (def) => ({ setBlocking: (value) => void blocking.set(def.id, value) }),
    });
    return { ...base, doors, doorState, blocking, moved };
  }

  it('offers to open a closed door, opens on press and then stops offering', () => {
    const { system, prompts, doors, blocking, doorState, moved } = setupDoors([door('d1')]);
    system.update(0.016, EYE, AHEAD, false, false);
    expect(prompts.at(-1)?.text).toBe('Open Office door');
    system.update(0.016, EYE, AHEAD, true, true);
    expect(doors.isOpen('d1')).toBe(true);
    expect(blocking.get('d1')).toBe(false);
    expect(doorState.get('d1')).toBe(true);
    expect(moved).toEqual([true]);
    expect(prompts.at(-1)?.text).toBeNull();
  });

  it('answers nav queries and lets the AI open a link', () => {
    const { doors } = setupDoors([door('d1')]);
    expect(doors.isLinkBlocked('a', 'b')).toBe(true);
    expect(doors.isLinkBlocked('b', 'a')).toBe(true);
    expect(doors.isLinkBlocked('a', 'z')).toBe(false);
    doors.openLink('b', 'a');
    expect(doors.isOpen('d1')).toBe(true);
    expect(doors.isLinkBlocked('a', 'b')).toBe(false);
  });

  it('keeps a locked door shut for player and AI until released', () => {
    const { doors, moved } = setupDoors([door('d1')]);
    doors.setLocked('d1', true);
    expect(doors.open('d1')).toBe(false);
    doors.openLink('a', 'b');
    expect(doors.isOpen('d1')).toBe(false);
    doors.setLocked('d1', false);
    expect(doors.open('d1')).toBe(true);
    expect(moved).toEqual([true]);
  });

  it('restores exactly, without noise', () => {
    const { doors, moved, blocking } = setupDoors([door('d1'), door('d2', true)]);
    expect(doors.getOpenIds()).toEqual(['d2']);
    doors.restore(['d1']);
    expect(doors.getOpenIds()).toEqual(['d1']);
    expect(blocking.get('d2')).toBe(true);
    expect(moved).toEqual([]);
  });
});

describe('PickupSystem', () => {
  const ammo: PickupDef = { id: 'a1', kind: 'ammo', position: ahead(1) };
  const medkit: PickupDef = { id: 'm1', kind: 'medkit', position: ahead(1) };

  function setupPickups(def: PickupDef, canTake = true, health = 100) {
    const base = setup();
    const { visuals, pickupState } = makeVisuals();
    const tracked = { ammoAdded: 0, healed: 0 };
    const weapons = {
      canTakeAmmo: () => canTake,
      addReserveAmmo: () => {
        tracked.ammoAdded += 1;
        return true;
      },
    } as unknown as IWeaponDirector;
    const player = {
      health,
      maxHealth: 100,
      heal: (amount: number) => {
        tracked.healed += amount;
      },
    } as unknown as IPlayerControl;
    const collected: string[] = [];
    base.bus.on('pickup:collected', (event) => collected.push(event.kind));
    const pickups = new PickupSystem({ pickups: [def], bus: base.bus, visuals, interaction: base.system, weapons, player });
    return { ...base, pickups, pickupState, tracked, collected };
  }

  it('takes ammunition and hides it', () => {
    const { system, pickups, pickupState, tracked, collected, prompts } = setupPickups(ammo);
    system.update(0.016, EYE, AHEAD, false, false);
    expect(prompts.at(-1)?.text).toBe('Take ammunition');
    system.update(0.016, EYE, AHEAD, true, true);
    expect(tracked.ammoAdded).toBe(1);
    expect(pickups.getCollectedIds()).toEqual(['a1']);
    expect(pickupState.get('a1')).toBe(false);
    expect(collected).toEqual(['ammo']);
  });

  it('explains full ammo and does not consume', () => {
    const { system, pickups, tracked, prompts } = setupPickups(ammo, false);
    system.update(0.016, EYE, AHEAD, true, true);
    expect(prompts.at(-1)?.text).toBe('Ammo full');
    expect(tracked.ammoAdded).toBe(0);
    expect(pickups.getCollectedIds()).toEqual([]);
  });

  it('explains full health and does not consume', () => {
    const { system, pickups, tracked, prompts } = setupPickups(medkit);
    system.update(0.016, EYE, AHEAD, true, true);
    expect(prompts.at(-1)?.text).toBe('Health full');
    expect(tracked.healed).toBe(0);
    expect(pickups.getCollectedIds()).toEqual([]);
  });

  it('heals when hurt', () => {
    const { system, tracked, collected } = setupPickups(medkit, true, 40);
    system.update(0.016, EYE, AHEAD, true, true);
    expect(tracked.healed).toBeGreaterThan(0);
    expect(collected).toEqual(['medkit']);
  });

  it('restores collected state', () => {
    const { pickups, pickupState, system, prompts } = setupPickups(ammo);
    pickups.restore(['a1']);
    expect(pickupState.get('a1')).toBe(false);
    system.update(0.016, EYE, AHEAD, true, true);
    expect(prompts).toHaveLength(0);
    pickups.restore([]);
    expect(pickupState.get('a1')).toBe(true);
    expect(pickups.getCollectedIds()).toEqual([]);
  });
});
