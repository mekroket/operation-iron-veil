/**
 * Procedural PBR texture sets: albedo, tangent-space normal and ORM (R occlusion, G roughness, B metal) per surface.
 * Generators live in texMineral / texMetal / texInterior; this file is the table plus the upload.
 */
import { RawTexture, Texture } from '../../engine/bjs';
import type { Scene } from '../../engine/bjs';
import type { ResolvedGraphics } from '../../settings/settings';
import type { MaterialKey } from '../types';
import type { NoiseBank } from './noise';
import { powerOfTwo } from './noise';
import type { MapSet } from './texCore';
import { canvas, chainLink, floorRubber, floorTile, glassDark, metalBare, plasterInterior, rubber, woodPlank } from './texInterior';
import {
  corrugatedGrey,
  corrugatedRust,
  corrugatedWhite,
  hazardStripe,
  paintWorn,
  steelDark,
  steelRust,
  steelYellow,
} from './texMetal';
import { asphalt, concrete, concreteDark, concretePainted, gravel, quayStone } from './texMineral';

/** Surfaces used only by props, on top of the level's own MaterialKey set. */
export type PropTexturedKey = 'paintWorn' | 'metalBare' | 'rubber' | 'canvas' | 'chainLink';
export type TexturedKey = MaterialKey | PropTexturedKey;

const GENERATORS: Record<TexturedKey, (bank: NoiseBank) => MapSet> = {
  asphalt,
  concrete,
  concreteDark,
  concretePainted,
  quayStone,
  gravel,
  steelDark,
  steelRust,
  steelYellow,
  corrugatedGrey,
  corrugatedRust,
  corrugatedWhite,
  plasterInterior,
  floorTile,
  floorRubber,
  woodPlank,
  glassDark,
  hazardStripe,
  paintWorn,
  metalBare,
  rubber,
  canvas,
  chainLink,
};

export const TEXTURED_KEYS = Object.keys(GENERATORS) as TexturedKey[];

export interface TextureSet {
  albedo: Texture;
  normal: Texture;
  orm: Texture;
}

/** Texture size the generators run at. Always a power of two. */
export const proceduralSize = (gfx: ResolvedGraphics): number => powerOfTwo(gfx.textureSize);

const UNSIGNED_BYTE = 0;

/** Uploads RGBA8 data as a wrapping, mip-mapped texture. Colour data is sRGB, the other maps are linear. */
export function uploadTexture(scene: Scene, name: string, data: Uint8Array, size: number, gfx: ResolvedGraphics, srgb: boolean): Texture {
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, UNSIGNED_BYTE);
  texture.name = name;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = gfx.anisotropy;
  texture.gammaSpace = srgb;
  return texture;
}

export function createTextureSet(scene: Scene, key: TexturedKey, bank: NoiseBank, gfx: ResolvedGraphics): TextureSet {
  const maps = GENERATORS[key](bank);
  const texture = {
    albedo: uploadTexture(scene, `${key}.albedo`, maps.albedo, maps.size, gfx, true),
    normal: uploadTexture(scene, `${key}.normal`, maps.normal, maps.size, gfx, false),
    orm: uploadTexture(scene, `${key}.orm`, maps.orm, maps.size, gfx, false),
  };
  if (key === 'chainLink') texture.albedo.hasAlpha = true;
  return texture;
}
