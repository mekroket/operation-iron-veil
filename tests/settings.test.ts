import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore, resolveGraphics, sanitizeSettings } from '../src/settings/settings';
import type { GameSettings, KeyValueStorage } from '../src/settings/settings';

/** The store keeps this private, but a corrupt-data test has to write to it. */
const SETTINGS_KEY = 'ironveil.settings.v1';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const clone = (settings: GameSettings): GameSettings => JSON.parse(JSON.stringify(settings)) as GameSettings;

describe('sanitizeSettings', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'settings'],
    ['an array', []],
    ['an empty object', {}],
    ['sections of the wrong type', { graphics: 'nope', audio: 7, controls: null, display: [] }],
  ])('turns %s into the defaults', (_name, input) => {
    expect(sanitizeSettings(input)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numbers into range', () => {
    const result = sanitizeSettings({
      graphics: { resolutionScale: 9 },
      audio: { master: -1, sfx: 5 },
      controls: { sensitivity: 100, adsSensitivity: 0, fov: 10 },
    });
    expect(result.graphics.resolutionScale).toBe(1);
    expect(result.audio.master).toBe(0);
    expect(result.audio.sfx).toBe(1);
    expect(result.controls.sensitivity).toBe(5);
    expect(result.controls.adsSensitivity).toBe(0.1);
    expect(result.controls.fov).toBe(55);
  });

  it('replaces bad values of the wrong type or outside the choices', () => {
    const result = sanitizeSettings({
      graphics: { preset: 'mega', shadowQuality: 'huge', showFps: 'yes', resolutionScale: Number.NaN },
      audio: { voice: Number.POSITIVE_INFINITY },
      controls: { invertY: 1 },
      display: { fullscreenOnStart: 'no' },
    });
    expect(result.graphics.preset).toBe(DEFAULT_SETTINGS.graphics.preset);
    expect(result.graphics.shadowQuality).toBe(DEFAULT_SETTINGS.graphics.shadowQuality);
    expect(result.graphics.showFps).toBe(false);
    expect(result.graphics.resolutionScale).toBe(DEFAULT_SETTINGS.graphics.resolutionScale);
    expect(result.audio.voice).toBe(DEFAULT_SETTINGS.audio.voice);
    expect(result.controls.invertY).toBe(false);
    expect(result.display.fullscreenOnStart).toBe(true);
  });

  it('keeps valid values', () => {
    const custom = clone(DEFAULT_SETTINGS);
    custom.graphics.preset = 'custom';
    custom.graphics.shadowQuality = 'off';
    custom.audio.master = 0.25;
    custom.controls.fov = 90;
    custom.controls.invertY = true;
    expect(sanitizeSettings(custom)).toEqual(custom);
  });
});

describe('SettingsStore', () => {
  it('starts from the defaults', () => {
    expect(new SettingsStore(memoryStorage()).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('persists to storage', () => {
    const storage = memoryStorage();
    new SettingsStore(storage).update((draft) => {
      draft.controls.fov = 85;
    });
    expect(new SettingsStore(storage).get().controls.fov).toBe(85);
  });

  it('falls back to the defaults on corrupt data', () => {
    const storage = memoryStorage();
    storage.setItem(SETTINGS_KEY, '{not json');
    expect(new SettingsStore(storage).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('sanitises what it is given', () => {
    const store = new SettingsStore(memoryStorage());
    const next = clone(DEFAULT_SETTINGS);
    next.controls.fov = 1000;
    store.set(next);
    expect(store.get().controls.fov).toBe(100);
  });

  it('still applies a change when storage refuses it', () => {
    const storage = memoryStorage();
    const store = new SettingsStore({
      ...storage,
      setItem: () => {
        throw new Error('full');
      },
    });
    store.update((draft) => {
      draft.audio.master = 0.5;
    });
    expect(store.get().audio.master).toBe(0.5);
  });

  it('does not change the old object in an update', () => {
    const store = new SettingsStore(memoryStorage());
    const before = store.get();
    store.update((draft) => {
      draft.controls.fov = 66;
    });
    expect(before.controls.fov).toBe(DEFAULT_SETTINGS.controls.fov);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const store = new SettingsStore(memoryStorage());
    const seen: number[] = [];
    const unsubscribe = store.subscribe((settings) => seen.push(settings.controls.fov));
    store.update((draft) => {
      draft.controls.fov = 80;
    });
    unsubscribe();
    store.update((draft) => {
      draft.controls.fov = 90;
    });
    expect(seen).toEqual([80]);
  });
});

describe('resolveGraphics', () => {
  const graphics = (overrides: Partial<GameSettings['graphics']>): GameSettings['graphics'] => ({
    ...DEFAULT_SETTINGS.graphics,
    ...overrides,
  });

  it('turns shadow quality into a map size', () => {
    expect(resolveGraphics(graphics({ shadowQuality: 'off' })).shadowMapSize).toBe(0);
    expect(resolveGraphics(graphics({ shadowQuality: 'medium' })).shadowMapSize).toBe(2048);
    expect(resolveGraphics(graphics({ shadowQuality: 'high' })).shadowMapSize).toBe(4096);
  });

  it('clamps the resolution scale', () => {
    expect(resolveGraphics(graphics({ resolutionScale: 0.1 })).resolutionScale).toBe(0.5);
    expect(resolveGraphics(graphics({ resolutionScale: 3 })).resolutionScale).toBe(1);
  });

  it('switches post effects off together', () => {
    const off = resolveGraphics(graphics({ postQuality: 'off' }));
    expect(off.bloom).toBe(false);
    expect(off.ssao).toBe(false);
    expect(off.fxaa).toBe(false);
    expect(off.grain).toBe(false);
    expect(off.maxLights).toBe(3);
  });

  it('gives the ultra preset larger budgets than high', () => {
    const high = resolveGraphics(graphics({ preset: 'high' }));
    const ultra = resolveGraphics(graphics({ preset: 'ultra' }));
    expect(ultra.maxLights).toBeGreaterThan(high.maxLights);
    expect(ultra.particleScale).toBeGreaterThan(high.particleScale);
    expect(ultra.maxDecals).toBeGreaterThan(high.maxDecals);
    expect(ultra.anisotropy).toBeGreaterThan(high.anisotropy);
  });

  it('maps texture quality to a size', () => {
    expect(resolveGraphics(graphics({ textureQuality: 'low' })).textureSize).toBe(256);
    expect(resolveGraphics(graphics({ textureQuality: 'high' })).textureSize).toBe(1024);
  });
});
