/** Player preferences: schema, defaults, sanitising and quality presets. Pure, no Babylon or DOM. */
import { clamp } from '../core/math';

export type GraphicsPreset = 'low' | 'medium' | 'high' | 'ultra' | 'custom';
export type QualityLevel = 'low' | 'medium' | 'high';

export interface GameSettings {
  graphics: {
    preset: GraphicsPreset;
    /** 0.5..1. Fraction of native resolution rendered. */
    resolutionScale: number;
    shadowQuality: QualityLevel | 'off';
    textureQuality: QualityLevel;
    postQuality: QualityLevel | 'off';
    /** Lets the game drop resolution when the frame rate falls under target. */
    adaptiveResolution: boolean;
    showFps: boolean;
  };
  audio: {
    master: number;
    sfx: number;
    ambience: number;
    voice: number;
    ui: number;
  };
  controls: {
    /** Multiplier on the base look speed. */
    sensitivity: number;
    adsSensitivity: number;
    invertY: boolean;
    /** Vertical field of view in degrees. */
    fov: number;
  };
  display: {
    fullscreenOnStart: boolean;
  };
}

export const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    preset: 'high',
    resolutionScale: 1,
    shadowQuality: 'high',
    textureQuality: 'high',
    postQuality: 'high',
    adaptiveResolution: true,
    showFps: false,
  },
  audio: { master: 0.85, sfx: 1, ambience: 0.8, voice: 1, ui: 0.7 },
  controls: { sensitivity: 1, adsSensitivity: 0.7, invertY: false, fov: 70 },
  display: { fullscreenOnStart: true },
};

export const PRESET_VALUES: Record<Exclude<GraphicsPreset, 'custom'>, Pick<GameSettings['graphics'], 'resolutionScale' | 'shadowQuality' | 'textureQuality' | 'postQuality'>> = {
  low: { resolutionScale: 0.75, shadowQuality: 'off', textureQuality: 'low', postQuality: 'off' },
  medium: { resolutionScale: 0.9, shadowQuality: 'medium', textureQuality: 'medium', postQuality: 'medium' },
  high: { resolutionScale: 1, shadowQuality: 'high', textureQuality: 'high', postQuality: 'high' },
  ultra: { resolutionScale: 1, shadowQuality: 'high', textureQuality: 'high', postQuality: 'high' },
};

/** Concrete numbers the renderer consumes. Derived from settings by resolveGraphics. */
export interface ResolvedGraphics {
  resolutionScale: number;
  shadowMapSize: number;
  /** World metres covered by the sun's shadow frustum. */
  shadowDistance: number;
  textureSize: number;
  bloom: boolean;
  ssao: boolean;
  fxaa: boolean;
  grain: boolean;
  /** Maximum simultaneous dynamic lights per material, sun and sky included. */
  maxLights: number;
  /** Multiplier on particle budgets. */
  particleScale: number;
  maxDecals: number;
  /** Anisotropic filtering level. */
  anisotropy: number;
}

export function resolveGraphics(g: GameSettings['graphics']): ResolvedGraphics {
  const shadow = { off: 0, low: 1024, medium: 2048, high: 4096 }[g.shadowQuality];
  const ultra = g.preset === 'ultra';
  return {
    resolutionScale: clamp(g.resolutionScale, 0.5, 1),
    shadowMapSize: shadow,
    shadowDistance: g.shadowQuality === 'high' ? 90 : 60,
    textureSize: { low: 256, medium: 512, high: 1024 }[g.textureQuality],
    bloom: g.postQuality !== 'off',
    // SSAO redraws the whole scene into a geometry buffer, doubling draw calls, so it is reserved for Ultra.
    ssao: ultra && g.postQuality === 'high',
    fxaa: g.postQuality !== 'off',
    grain: g.postQuality === 'high',
    maxLights: { off: 3, low: 3, medium: 4, high: ultra ? 8 : 6 }[g.postQuality],
    particleScale: { off: 0.35, low: 0.5, medium: 0.75, high: ultra ? 1.5 : 1 }[g.postQuality],
    maxDecals: { low: 24, medium: 60, high: ultra ? 200 : 120 }[g.textureQuality],
    anisotropy: { low: 1, medium: 4, high: ultra ? 16 : 8 }[g.textureQuality],
  };
}

const num = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const choice = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Accepts anything (corrupt JSON, older schemas) and always returns a valid settings object. */
export function sanitizeSettings(input: unknown): GameSettings {
  const d = DEFAULT_SETTINGS;
  const root = (typeof input === 'object' && input !== null ? input : {}) as Record<string, Record<string, unknown> | undefined>;
  const g = root.graphics ?? {};
  const a = root.audio ?? {};
  const c = root.controls ?? {};
  const s = root.display ?? {};
  return {
    graphics: {
      preset: choice(g.preset, ['low', 'medium', 'high', 'ultra', 'custom'] as const, d.graphics.preset),
      resolutionScale: num(g.resolutionScale, d.graphics.resolutionScale, 0.5, 1),
      shadowQuality: choice(g.shadowQuality, ['off', 'low', 'medium', 'high'] as const, d.graphics.shadowQuality),
      textureQuality: choice(g.textureQuality, ['low', 'medium', 'high'] as const, d.graphics.textureQuality),
      postQuality: choice(g.postQuality, ['off', 'low', 'medium', 'high'] as const, d.graphics.postQuality),
      adaptiveResolution: bool(g.adaptiveResolution, d.graphics.adaptiveResolution),
      showFps: bool(g.showFps, d.graphics.showFps),
    },
    audio: {
      master: num(a.master, d.audio.master, 0, 1),
      sfx: num(a.sfx, d.audio.sfx, 0, 1),
      ambience: num(a.ambience, d.audio.ambience, 0, 1),
      voice: num(a.voice, d.audio.voice, 0, 1),
      ui: num(a.ui, d.audio.ui, 0, 1),
    },
    controls: {
      sensitivity: num(c.sensitivity, d.controls.sensitivity, 0.1, 5),
      adsSensitivity: num(c.adsSensitivity, d.controls.adsSensitivity, 0.1, 2),
      invertY: bool(c.invertY, d.controls.invertY),
      fov: num(c.fov, d.controls.fov, 55, 100),
    },
    display: { fullscreenOnStart: bool(s.fullscreenOnStart, d.display.fullscreenOnStart) },
  };
}

/** Minimal storage surface so saves and settings can be tested without a browser. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage when usable, otherwise an in-memory fallback (private mode, blocked storage). */
export function getBrowserStorage(): KeyValueStorage {
  try {
    const probe = '__iv_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

const SETTINGS_KEY = 'ironveil.settings.v1';

export class SettingsStore {
  private current: GameSettings;
  private readonly listeners = new Set<(settings: GameSettings) => void>();

  constructor(private readonly storage: KeyValueStorage) {
    this.current = this.load();
  }

  get(): GameSettings {
    return this.current;
  }

  /** Replaces settings, persists them and notifies listeners. */
  set(next: GameSettings): void {
    this.current = sanitizeSettings(next);
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.current));
    } catch {
      // Storage full or blocked: settings still apply for this session.
    }
    for (const listener of this.listeners) listener(this.current);
  }

  /** Immutable-style edit helper: store.update(s => { s.controls.fov = 80; }). */
  update(edit: (draft: GameSettings) => void): void {
    const draft = JSON.parse(JSON.stringify(this.current)) as GameSettings;
    edit(draft);
    this.set(draft);
  }

  subscribe(listener: (settings: GameSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): GameSettings {
    try {
      const raw = this.storage.getItem(SETTINGS_KEY);
      return sanitizeSettings(raw ? JSON.parse(raw) : null);
    } catch {
      return sanitizeSettings(null);
    }
  }
}
