import { describe, expect, it } from 'vitest';
import { WEAPON_SLOTS } from '../src/core/types';
import { buildGunGeometry } from '../src/weapons/gunModels';
import type { GeometryBatch } from '../src/weapons/gunGeometry';
import { computeSpread, RecoilModel } from '../src/weapons/RecoilModel';
import { WEAPON_CONFIGS } from '../src/weapons/weaponConfigs';
import { WeaponInventory } from '../src/weapons/WeaponInventory';
import { WeaponState } from '../src/weapons/WeaponState';

const rifle = WEAPON_CONFIGS.assaultRifle;
const pistol = WEAPON_CONFIGS.handgun;

function emptyMag(weapon: WeaponState): void {
  while (weapon.mag > 0) {
    expect(weapon.tryFire()).toBe('fired');
    weapon.update(weapon.shotInterval + 0.001);
  }
}

describe('WeaponState ammunition', () => {
  it('starts full and spends one round per shot', () => {
    const weapon = new WeaponState(rifle);
    expect(weapon.mag).toBe(rifle.magSize);
    expect(weapon.reserve).toBe(rifle.startReserve);
    expect(weapon.tryFire()).toBe('fired');
    expect(weapon.mag).toBe(rifle.magSize - 1);
    expect(weapon.reserve).toBe(rifle.startReserve);
  });

  it('keeps the total through a tactical reload', () => {
    const weapon = new WeaponState(rifle);
    for (let i = 0; i < 7; i++) {
      weapon.tryFire();
      weapon.update(weapon.shotInterval + 0.001);
    }
    const total = weapon.mag + weapon.reserve;
    expect(weapon.startReload()).toBe(true);
    expect(weapon.reloadIsEmpty).toBe(false);
    expect(weapon.reloadDuration).toBe(rifle.reloadTacticalSeconds);
    // Nothing moves until the reload completes.
    expect(weapon.mag).toBe(rifle.magSize - 7);
    expect(weapon.update(rifle.reloadTacticalSeconds + 0.01)).toBe('reloadComplete');
    expect(weapon.mag).toBe(rifle.magSize);
    expect(weapon.reserve).toBe(rifle.startReserve - 7);
    expect(weapon.mag + weapon.reserve).toBe(total);
  });

  it('uses the longer time when reloading from empty', () => {
    const weapon = new WeaponState(pistol);
    emptyMag(weapon);
    expect(weapon.startReload()).toBe(true);
    expect(weapon.reloadIsEmpty).toBe(true);
    expect(weapon.reloadDuration).toBe(pistol.reloadEmptySeconds);
    expect(pistol.reloadEmptySeconds).toBeGreaterThan(pistol.reloadTacticalSeconds);
  });

  it('loads only what the reserve holds', () => {
    const weapon = new WeaponState(pistol);
    emptyMag(weapon);
    weapon.restoreAmmo(0, 5);
    weapon.startReload();
    weapon.update(pistol.reloadEmptySeconds + 0.01);
    expect(weapon.mag).toBe(5);
    expect(weapon.reserve).toBe(0);
  });

  it('refuses a reload when full or with no reserve', () => {
    const weapon = new WeaponState(rifle);
    expect(weapon.startReload()).toBe(false);
    weapon.restoreAmmo(3, 0);
    expect(weapon.startReload()).toBe(false);
  });

  it('cannot fire when empty', () => {
    const weapon = new WeaponState(pistol);
    emptyMag(weapon);
    expect(weapon.tryFire()).toBe('empty');
    expect(weapon.mag).toBe(0);
  });

  it('cannot fire while reloading, and fires again afterwards', () => {
    const weapon = new WeaponState(rifle);
    weapon.tryFire();
    weapon.update(1);
    weapon.startReload();
    expect(weapon.phase).toBe('reloading');
    expect(weapon.tryFire()).toBe('reloading');
    expect(weapon.mag).toBe(rifle.magSize - 1);
    weapon.update(rifle.reloadTacticalSeconds + 0.01);
    expect(weapon.tryFire()).toBe('fired');
  });

  it('cannot fire or reload while equipping', () => {
    const weapon = new WeaponState(rifle);
    weapon.tryFire();
    weapon.update(1);
    weapon.beginEquip();
    expect(weapon.phase).toBe('equipping');
    expect(weapon.tryFire()).toBe('equipping');
    expect(weapon.startReload()).toBe(false);
    expect(weapon.update(rifle.equipSeconds + 0.01)).toBe('equipComplete');
    expect(weapon.phase).toBe('idle');
  });

  it('caps reserve at its maximum', () => {
    const weapon = new WeaponState(rifle);
    const room = rifle.maxReserve - weapon.reserve;
    expect(weapon.addReserve(room + 500)).toBe(room);
    expect(weapon.reserve).toBe(rifle.maxReserve);
    expect(weapon.addReserve(1)).toBe(0);
  });
});

describe('WeaponState fire rate', () => {
  it('blocks a second shot until the interval has passed', () => {
    const weapon = new WeaponState(rifle);
    expect(weapon.tryFire()).toBe('fired');
    expect(weapon.tryFire()).toBe('cooldown');
    weapon.update(weapon.shotInterval * 0.5);
    expect(weapon.tryFire()).toBe('cooldown');
    weapon.update(weapon.shotInterval * 0.6);
    expect(weapon.tryFire()).toBe('fired');
  });

  /** Shots fired in `seconds` when the trigger is held, at this frame time. */
  function shotsOver(seconds: number, dt: number): number {
    const weapon = new WeaponState({ ...rifle, magSize: 100000 });
    let shots = 0;
    for (let time = 0; time < seconds; time += dt) {
      weapon.update(dt);
      while (weapon.tryFire() === 'fired') shots++;
    }
    return shots;
  }

  it('holds the configured rate at 60 fps', () => {
    const expected = rifle.rpm / 60;
    expect(Math.abs(shotsOver(1, 1 / 60) - expected)).toBeLessThanOrEqual(1.5);
  });

  it('holds the configured rate at a frame rate slower than the gun', () => {
    const expected = (rifle.rpm / 60) * 3;
    expect(Math.abs(shotsOver(3, 1 / 8) - expected)).toBeLessThanOrEqual(2);
  });

  it('does not bank fire rate while idle', () => {
    const weapon = new WeaponState(rifle);
    weapon.update(10);
    expect(weapon.tryFire()).toBe('fired');
    expect(weapon.tryFire()).toBe('cooldown');
  });
});

describe('WeaponInventory', () => {
  function finishSwitch(inventory: WeaponInventory): void {
    let guard = 0;
    while (inventory.switching && guard++ < 1000) inventory.update(0.01);
  }

  it('holds three weapons, starting on the first', () => {
    const inventory = new WeaponInventory();
    expect(inventory.slots.map((weapon) => weapon.config.id)).toEqual([...WEAPON_SLOTS]);
    expect(inventory.active.config.id).toBe('assaultRifle');
  });

  it('lowers the old weapon before the new one becomes active', () => {
    const inventory = new WeaponInventory();
    expect(inventory.switchToSlot(1)).toBe(true);
    expect(inventory.switching).toBe(true);
    expect(inventory.active.config.id).toBe('assaultRifle');
    expect(inventory.active.tryFire()).toBe('equipping');

    const tick = inventory.update(rifle.holsterSeconds + 0.01);
    expect(tick.swapped).toBe(true);
    expect(inventory.active.config.id).toBe('smg');
    expect(inventory.active.phase).toBe('equipping');

    inventory.update(WEAPON_CONFIGS.smg.equipSeconds + 0.01);
    expect(inventory.active.phase).toBe('idle');
  });

  it('ignores the current slot and invalid slots', () => {
    const inventory = new WeaponInventory();
    expect(inventory.switchToSlot(0)).toBe(false);
    expect(inventory.switchToSlot(3)).toBe(false);
    expect(inventory.switchToSlot(-1)).toBe(false);
    expect(inventory.switching).toBe(false);
  });

  it('cycles in both directions and wraps', () => {
    const inventory = new WeaponInventory();
    inventory.cycle(-1);
    finishSwitch(inventory);
    expect(inventory.active.config.id).toBe('handgun');
    inventory.cycle(1);
    finishSwitch(inventory);
    expect(inventory.active.config.id).toBe('assaultRifle');
    expect(inventory.cycle(0)).toBe(false);
  });

  it('can change its mind while lowering', () => {
    const inventory = new WeaponInventory();
    inventory.switchToSlot(1);
    inventory.update(0.01);
    expect(inventory.switchToSlot(0)).toBe(true);
    expect(inventory.switching).toBe(false);
    expect(inventory.active.config.id).toBe('assaultRifle');
  });

  it('cancels a reload on switch without losing ammunition', () => {
    const inventory = new WeaponInventory();
    const first = inventory.active;
    first.tryFire();
    first.update(1);
    const total = first.mag + first.reserve;
    first.startReload();
    expect(first.reloading).toBe(true);

    inventory.switchToSlot(2);
    expect(first.reloading).toBe(false);
    expect(first.mag + first.reserve).toBe(total);
    expect(first.mag).toBe(rifle.magSize - 1);

    // The abandoned reload must not complete later.
    finishSwitch(inventory);
    inventory.switchToSlot(0);
    finishSwitch(inventory);
    inventory.update(10);
    expect(inventory.active).toBe(first);
    expect(first.mag).toBe(rifle.magSize - 1);
  });

  it('reports a finished reload exactly once', () => {
    const inventory = new WeaponInventory();
    inventory.active.tryFire();
    inventory.update(1);
    inventory.active.startReload();
    expect(inventory.update(rifle.reloadTacticalSeconds + 0.01).reloadCompleted).toBe(true);
    expect(inventory.update(0.01).reloadCompleted).toBe(false);
  });

  it('adds a fraction of maximum reserve, up to the cap', () => {
    const inventory = new WeaponInventory();
    expect(inventory.canTakeAmmo()).toBe(true);
    const before = inventory.slots[0].reserve;
    expect(inventory.addReserveFraction(0.1)).toBe(true);
    expect(inventory.slots[0].reserve).toBe(before + Math.ceil(rifle.maxReserve * 0.1));
    inventory.addReserveFraction(10);
    for (const weapon of inventory.slots) expect(weapon.reserve).toBe(weapon.config.maxReserve);
    expect(inventory.canTakeAmmo()).toBe(false);
    expect(inventory.addReserveFraction(1)).toBe(false);
  });

  it('round-trips a save', () => {
    const inventory = new WeaponInventory();
    inventory.active.tryFire();
    inventory.update(1);
    inventory.switchToSlot(2);
    finishSwitch(inventory);
    inventory.update(1);
    inventory.active.tryFire();
    const saved = inventory.getSaveState();
    expect(saved.activeWeapon).toBe('handgun');
    expect(saved.ammo.assaultRifle.mag).toBe(rifle.magSize - 1);
    expect(saved.ammo.handgun.mag).toBe(pistol.magSize - 1);

    const other = new WeaponInventory();
    other.restore(JSON.parse(JSON.stringify(saved)));
    expect(other.getSaveState()).toEqual(saved);
    expect(other.active.config.id).toBe('handgun');
    expect(other.active.phase).toBe('idle');
  });

  it('restore clears a reload and a pending switch', () => {
    const inventory = new WeaponInventory();
    const saved = inventory.getSaveState();
    inventory.active.tryFire();
    inventory.update(1);
    inventory.active.startReload();
    inventory.switchToSlot(1);
    inventory.restore(saved);
    expect(inventory.switching).toBe(false);
    expect(inventory.active.config.id).toBe('assaultRifle');
    expect(inventory.active.reloading).toBe(false);
    expect(inventory.active.mag).toBe(rifle.magSize);
  });

  it('clamps corrupt save values', () => {
    const inventory = new WeaponInventory();
    const saved = inventory.getSaveState();
    saved.ammo.assaultRifle = { mag: 9999, reserve: -5 };
    saved.ammo.smg = { mag: Number.NaN, reserve: 1.9 };
    inventory.restore(saved);
    expect(inventory.slots[0].mag).toBe(rifle.magSize);
    expect(inventory.slots[0].reserve).toBe(0);
    expect(inventory.slots[1].mag).toBe(0);
    expect(inventory.slots[1].reserve).toBe(1);
  });
});

describe('RecoilModel', () => {
  const centred = (): number => 0.5;

  it('kicks upwards and walks the pattern as shots accumulate', () => {
    const recoil = new RecoilModel(rifle.recoil);
    const first = recoil.shoot(0, centred);
    expect(first.pitch).toBeCloseTo(rifle.recoil.pitchPerShot * rifle.recoil.pattern[0].pitch, 8);
    // The kick object is reused, so read the first yaw before the next shot.
    const firstYaw = first.yaw;
    const second = recoil.shoot(0, centred);
    expect(second.yaw).toBeGreaterThan(firstYaw);
    expect(recoil.patternPosition).toBe(2);
  });

  it('kicks less when aimed', () => {
    const recoil = new RecoilModel(rifle.recoil);
    const hip = recoil.shoot(0, centred).pitch;
    recoil.reset();
    expect(recoil.shoot(1, centred).pitch).toBeLessThan(hip);
  });

  it('winds the pattern back only after the recovery delay', () => {
    const recoil = new RecoilModel(rifle.recoil);
    for (let i = 0; i < 10; i++) recoil.shoot(0, centred);
    recoil.update(rifle.recoil.recoveryDelay * 0.5);
    expect(recoil.patternPosition).toBe(10);
    recoil.update(5);
    expect(recoil.patternPosition).toBe(0);
  });

  it('blooms up to a cap and recovers', () => {
    const recoil = new RecoilModel(rifle.recoil);
    recoil.shoot(0, centred);
    const one = recoil.bloom;
    expect(one).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) recoil.shoot(0, centred);
    expect(recoil.bloom).toBe(rifle.recoil.bloomMax);
    recoil.update(5);
    expect(recoil.bloom).toBe(0);
  });

  it('computes wider spread when moving or airborne, and narrower aimed or crouched', () => {
    const still = computeSpread(rifle, 0, 0, false, false, 0);
    expect(still).toBeCloseTo(rifle.hipSpread, 8);
    expect(computeSpread(rifle, 0, 1, false, false, 0)).toBeGreaterThan(still);
    expect(computeSpread(rifle, 0, 0, true, false, 0)).toBeGreaterThan(still);
    expect(computeSpread(rifle, 1, 0, false, false, 0)).toBeCloseTo(rifle.adsSpread, 8);
    expect(computeSpread(rifle, 0, 0, false, true, 0)).toBeLessThan(still);
    expect(computeSpread(rifle, 0, 0, false, false, 0.01)).toBeGreaterThan(still);
  });
});

describe('weapon configs', () => {
  it('gives every weapon a distinct role', () => {
    const { assaultRifle, smg, handgun } = WEAPON_CONFIGS;
    expect(smg.rpm).toBeGreaterThan(assaultRifle.rpm);
    expect(smg.falloffEnd).toBeLessThan(assaultRifle.falloffEnd);
    expect(handgun.fireMode).toBe('semi');
    expect(handgun.adsSpread).toBeLessThan(assaultRifle.adsSpread);
    expect(smg.adsSpread).toBeGreaterThan(assaultRifle.adsSpread);
  });

  it('aims each sight line through screen centre', () => {
    for (const id of WEAPON_SLOTS) {
      const view = WEAPON_CONFIGS[id].view;
      expect(view.adsOffset.x).toBe(0);
      expect(view.adsOffset.y).toBeCloseTo(-view.sightHeight);
    }
  });
});

describe('gun geometry', () => {
  function expectWellFormed(batch: GeometryBatch): void {
    expect(batch.positions.length % 3).toBe(0);
    expect(batch.normals.length).toBe(batch.positions.length);
    expect(batch.colors.length / 4).toBe(batch.positions.length / 3);
    expect(batch.indices.length % 3).toBe(0);
    const count = batch.positions.length / 3;
    for (const index of batch.indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(count);
    }
    expect(batch.positions.every((value) => Number.isFinite(value))).toBe(true);
    expect(batch.normals.every((value) => Number.isFinite(value))).toBe(true);
  }

  /** Babylon's left-handed front face: the outward normal is -cross(b - a, c - a). */
  function expectOutwardWinding(batch: GeometryBatch): void {
    const p = batch.positions;
    const n = batch.normals;
    for (let i = 0; i < batch.indices.length; i += 3) {
      const [a, b, c] = [batch.indices[i] * 3, batch.indices[i + 1] * 3, batch.indices[i + 2] * 3];
      const ux = p[b] - p[a];
      const uy = p[b + 1] - p[a + 1];
      const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a];
      const vy = p[c + 1] - p[a + 1];
      const vz = p[c + 2] - p[a + 2];
      const fx = -(uy * vz - uz * vy);
      const fy = -(uz * vx - ux * vz);
      const fz = -(ux * vy - uy * vx);
      expect(fx * n[a] + fy * n[a + 1] + fz * n[a + 2]).toBeGreaterThanOrEqual(-1e-12);
    }
  }

  for (const id of WEAPON_SLOTS) {
    it(`builds a complete ${id}`, () => {
      const gun = buildGunGeometry(id);
      for (const part of [gun.steel, gun.polymer, gun.magazine, gun.bolt, gun.rightArm, gun.leftArm]) {
        expect(part.isEmpty).toBe(false);
        expectWellFormed(part);
        expectOutwardWinding(part);
      }
      expect(gun.muzzle.z).toBeGreaterThan(0.1);
      expect(gun.magOut.y).toBeLessThan(0);
    });
  }

  it('places the rifle and SMG aiming dots on the sight line', () => {
    for (const id of ['assaultRifle', 'smg'] as const) {
      const glow = buildGunGeometry(id).glow;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (let i = 1; i < glow.positions.length; i += 3) {
        minY = Math.min(minY, glow.positions[i]);
        maxY = Math.max(maxY, glow.positions[i]);
      }
      expect((minY + maxY) / 2).toBeCloseTo(WEAPON_CONFIGS[id].view.sightHeight, 4);
    }
  });
});
