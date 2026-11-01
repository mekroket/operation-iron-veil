/**
 * One cached PBRMaterial per surface. Lit materials stay unfrozen: batched meshes receive different light sets through
 * includedOnlyMeshes, and a frozen material can skip the per-mesh light bind. Self-lit materials never need that.
 */
import { Color3, PBRMaterial, RawTexture, Texture } from '../../engine/bjs';
import type { BaseTexture, Scene } from '../../engine/bjs';
import type { ResolvedGraphics } from '../../settings/settings';
import { createDecalAtlas } from './decalAtlas';
import { NoiseBank, hash2, seeded } from './noise';
import { TEXTURED_KEYS, createTextureSet, proceduralSize, uploadTexture } from './proceduralTextures';
import type { TexturedKey } from './proceduralTextures';

export type GlowKey = 'glowSodium' | 'glowWhite' | 'glowRed' | 'glowAmber';
export type SurfaceKey = TexturedKey | GlowKey | 'decals' | 'led' | 'screen';

/** Surfaces that never go in a shadow caster list: self-lit, printed or see-through. */
export const NON_CASTING: ReadonlySet<SurfaceKey> = new Set<SurfaceKey>([
  'glowSodium',
  'glowWhite',
  'glowRed',
  'glowAmber',
  'decals',
  'led',
  'screen',
  'glassDark',
  'chainLink',
]);

const GLOWS: Record<GlowKey, { color: Color3; intensity: number }> = {
  glowSodium: { color: new Color3(1, 0.5, 0.13), intensity: 7 },
  glowWhite: { color: new Color3(0.82, 0.92, 1), intensity: 5 },
  glowRed: { color: new Color3(1, 0.07, 0.04), intensity: 5 },
  glowAmber: { color: new Color3(1, 0.58, 0.08), intensity: 4 },
};

const BUMP_LEVEL: Partial<Record<TexturedKey, number>> = {
  asphalt: 0.9,
  gravel: 1.1,
  glassDark: 0.35,
};

const LED_CELLS = 16;
const LED_STEP_SECONDS = 0.14;

/** A small status-panel texture: rows of blocky readout, scanlines, one header bar. Greyscale, tinted by emissiveColor. */
function screenPixels(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const rows = 14;
  for (let y = 0; y < size; y++) {
    const fromTop = 1 - (y + 0.5) / size;
    const row = Math.floor(fromTop * rows);
    const inRow = fromTop * rows - row;
    const scan = 0.82 + 0.18 * (y % 2);
    for (let x = 0; x < size; x++) {
      const fx = x / size;
      const word = Math.floor(fx * 26);
      let t = 0.09;
      if (fx > 0.04 && fx < 0.96 && fromTop > 0.04 && fromTop < 0.96) {
        if (row === 1) t = 0.75;
        else if (row > 2 && inRow > 0.25 && inRow < 0.72) {
          const lineLength = 0.3 + hash2(row, 8) * 0.62;
          if (fx < lineLength && hash2(word, row) > 0.2) t = 0.35 + hash2(word, row, 3) * 0.6;
        }
      }
      const value = t * scan * 255;
      const i = (y * size + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** LED_CELLS square LEDs per repeat, with dark gaps, most of them off or green. */
function ledPixels(): { data: Uint8Array; size: number } {
  const cell = 4;
  const size = LED_CELLS * cell;
  const data = new Uint8Array(size * size * 4);
  const rand = seeded(417);
  for (let cy = 0; cy < LED_CELLS; cy++) {
    for (let cx = 0; cx < LED_CELLS; cx++) {
      const roll = rand();
      const color = roll < 0.42 ? [8, 10, 8] : roll < 0.82 ? [40, 255, 110] : roll < 0.93 ? [255, 175, 30] : [90, 180, 255];
      for (let py = 0; py < cell; py++) {
        for (let px = 0; px < cell; px++) {
          const gap = px === 0 || py === 0;
          const i = ((cy * cell + py) * size + cx * cell + px) * 4;
          data[i] = gap ? 0 : color[0];
          data[i + 1] = gap ? 0 : color[1];
          data[i + 2] = gap ? 0 : color[2];
          data[i + 3] = 255;
        }
      }
    }
  }
  return { data, size };
}

export class MaterialLibrary {
  private readonly materials = new Map<SurfaceKey, PBRMaterial>();
  private readonly textures: BaseTexture[] = [];
  private bank: NoiseBank | null = null;
  private screen: Texture | null = null;
  private led: Texture | null = null;
  private ledClock = 0;

  constructor(
    private readonly scene: Scene,
    private readonly gfx: ResolvedGraphics,
  ) {}

  /** Generates everything up front, yielding between materials so the loading bar can advance. */
  async buildAll(onProgress: (fraction: number, label: string) => void): Promise<void> {
    const keys = TEXTURED_KEYS;
    onProgress(0, 'Preparing surface noise');
    await new Promise((r) => setTimeout(r));
    this.bank = new NoiseBank(proceduralSize(this.gfx));
    for (let i = 0; i < keys.length; i++) {
      onProgress(i / keys.length, `Generating ${keys[i]}`);
      await new Promise((r) => setTimeout(r));
      this.get(keys[i]);
    }
    this.bank = null; // Holds tens of megabytes of float fields that nothing needs after this.
    for (const key of ['decals', 'led', 'screen', 'glowSodium', 'glowWhite', 'glowRed', 'glowAmber'] as const) this.get(key);
    onProgress(1, 'Surfaces ready');
  }

  get(key: SurfaceKey): PBRMaterial {
    const cached = this.materials.get(key);
    if (cached) return cached;
    const material = this.create(key);
    this.materials.set(key, material);
    return material;
  }

  /** Advances the server LED blink. */
  update(dt: number): void {
    if (!this.led) return;
    this.ledClock += dt;
    if (this.ledClock < LED_STEP_SECONDS) return;
    this.ledClock = 0;
    this.led.uOffset = Math.floor(Math.random() * LED_CELLS) / LED_CELLS;
    this.led.vOffset = Math.floor(Math.random() * LED_CELLS) / LED_CELLS;
  }

  /** A private emissive material showing the status screen, for visuals that recolour it at runtime. */
  createScreenMaterial(name: string): PBRMaterial {
    const material = this.emissiveBase(name);
    material.emissiveTexture = this.screenTexture();
    return material;
  }

  /** An unshared emissive-only material whose colour a visual can animate. */
  createGlowMaterial(name: string, color: Color3, intensity: number): PBRMaterial {
    const material = this.emissiveBase(name);
    material.emissiveColor = color;
    material.emissiveIntensity = intensity;
    return material;
  }

  dispose(): void {
    for (const material of this.materials.values()) material.dispose(false, false);
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.textures.length = 0;
    this.screen = null;
    this.led = null;
    this.bank = null;
  }

  private create(key: SurfaceKey): PBRMaterial {
    switch (key) {
      case 'decals':
        return this.createDecals();
      case 'led':
        return this.createLed();
      case 'screen':
        return this.createIdleScreen();
      case 'glowSodium':
      case 'glowWhite':
      case 'glowRed':
      case 'glowAmber': {
        const material = this.createGlowMaterial(key, GLOWS[key].color, GLOWS[key].intensity);
        material.freeze();
        return material;
      }
      default:
        return this.createTextured(key);
    }
  }

  private createTextured(key: TexturedKey): PBRMaterial {
    this.bank ??= new NoiseBank(proceduralSize(this.gfx));
    const set = createTextureSet(this.scene, key, this.bank, this.gfx);
    this.textures.push(set.albedo, set.normal, set.orm);

    const material = new PBRMaterial(`surface.${key}`, this.scene);
    material.albedoTexture = set.albedo;
    material.bumpTexture = set.normal;
    set.normal.level = BUMP_LEVEL[key] ?? 1;
    material.metallicTexture = set.orm;
    material.metallic = 1;
    material.roughness = 1;
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useMetallnessFromMetallicTextureBlue = true;
    material.useAmbientOcclusionFromMetallicTextureRed = true;
    material.maxSimultaneousLights = this.gfx.maxLights;
    material.enableSpecularAntiAliasing = true;

    if (key === 'glassDark') {
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.alpha = 0.62;
    } else if (key === 'chainLink') {
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      material.useAlphaFromAlbedoTexture = true;
      material.alphaCutOff = 0.3;
      material.backFaceCulling = false;
      material.twoSidedLighting = true;
    }
    return material;
  }

  private createDecals(): PBRMaterial {
    const size = Math.max(512, Math.min(1024, proceduralSize(this.gfx)));
    const atlas = createDecalAtlas(this.scene, size, this.gfx.anisotropy);
    this.textures.push(atlas);
    const material = new PBRMaterial('surface.decals', this.scene);
    material.albedoTexture = atlas;
    material.useAlphaFromAlbedoTexture = true;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    material.alphaCutOff = 0.45;
    material.metallic = 0;
    material.roughness = 0.68;
    material.maxSimultaneousLights = this.gfx.maxLights;
    material.zOffset = -1;
    return material;
  }

  private createLed(): PBRMaterial {
    const { data, size } = ledPixels();
    const texture = RawTexture.CreateRGBATexture(data, size, size, this.scene, false, false, Texture.NEAREST_SAMPLINGMODE, 0);
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    this.textures.push(texture);
    this.led = texture;
    const material = this.emissiveBase('surface.led');
    material.emissiveTexture = texture;
    material.emissiveColor = Color3.White();
    material.emissiveIntensity = 2.6;
    return material; // Not frozen: the blink moves the texture offset every few frames.
  }

  private createIdleScreen(): PBRMaterial {
    const material = this.createScreenMaterial('surface.screen');
    material.emissiveColor = new Color3(0.28, 0.66, 0.95);
    material.emissiveIntensity = 1.5;
    material.freeze();
    return material;
  }

  private screenTexture(): Texture {
    if (!this.screen) {
      const size = 256;
      this.screen = uploadTexture(this.scene, 'screen.status', screenPixels(size), size, this.gfx, true);
      this.textures.push(this.screen);
    }
    return this.screen;
  }

  private emissiveBase(name: string): PBRMaterial {
    const material = new PBRMaterial(name, this.scene);
    material.albedoColor = Color3.Black();
    material.metallic = 0;
    material.roughness = 1;
    material.disableLighting = true;
    material.maxSimultaneousLights = 1;
    return material;
  }
}
