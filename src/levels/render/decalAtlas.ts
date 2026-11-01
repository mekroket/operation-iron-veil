/**
 * Everything printed: container IDs, warning panels, stencils. One canvas atlas, so all markings share a single material.
 * Layout is fixed fractions, which lets props look up UVs without any Babylon state. All names are fictional.
 */
import { DynamicTexture, Texture } from '../../engine/bjs';
import type { Scene } from '../../engine/bjs';
import { seeded } from './noise';

/** Canvas-space rectangle as fractions: x, y (from top), width, height. */
const LAYOUT = {
  containerId0: [0, 0, 0.5, 0.125],
  containerId1: [0, 0.125, 0.5, 0.125],
  containerId2: [0, 0.25, 0.5, 0.125],
  containerId3: [0, 0.375, 0.5, 0.125],
  warning: [0.5, 0, 0.25, 0.2],
  security: [0.75, 0, 0.25, 0.0625],
  hazardDiamond: [0.75, 0.0625, 0.125, 0.125],
  dangerVolts: [0.875, 0.0625, 0.125, 0.0625],
  crateStencil: [0.5, 0.25, 0.25, 0.125],
  truckDoor: [0.75, 0.25, 0.25, 0.0625],
  rhibNumber: [0.75, 0.3125, 0.25, 0.0625],
  craneId: [0.5, 0.375, 0.5, 0.125],
  ammo: [0, 0.5, 0.25, 0.125],
} as const;

export type DecalName = keyof typeof LAYOUT;

/** Returns u0, v0, u1, v1. The canvas uploads with invertY, so its top row sits at v = 1. */
export function decalUV(name: DecalName): readonly [number, number, number, number] {
  const [x, y, w, h] = LAYOUT[name];
  return [x, 1 - (y + h), x + w, 1 - y];
}

const DISPLAY = 'Impact, "Arial Narrow", Arial, sans-serif';
const PLAIN = 'Arial, Helvetica, sans-serif';
const BASE = 1024;

type Ctx = CanvasRenderingContext2D;

function within(ctx: Ctx, name: DecalName, draw: (w: number, h: number) => void): void {
  const [x, y, w, h] = LAYOUT[name];
  ctx.save();
  ctx.translate(x * BASE, y * BASE);
  ctx.beginPath();
  ctx.rect(0, 0, w * BASE, h * BASE);
  ctx.clip();
  draw(w * BASE, h * BASE);
  ctx.restore();
}

function text(ctx: Ctx, value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left'): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x, y);
}

function containerMark(ctx: Ctx, name: DecalName, brand: string, id: string, ink: string): void {
  within(ctx, name, (w, h) => {
    text(ctx, brand, 12, h * 0.46, `56px ${DISPLAY}`, ink);
    text(ctx, id, 12, h * 0.84, `bold 34px ${PLAIN}`, ink);
    text(ctx, '45G1', w - 12, h * 0.84, `bold 30px ${PLAIN}`, ink, 'right');
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(w - 96, 12, 84, 44);
    text(ctx, 'MAX 30480', w - 54, 40, `bold 14px ${PLAIN}`, ink, 'center');
  });
}

function hazardBorder(ctx: Ctx, w: number, h: number, band: number): void {
  ctx.fillStyle = '#d9a514';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(band, band, w - band * 2, h - band * 2);
  ctx.clip('evenodd');
  ctx.fillStyle = '#16140f';
  for (let i = -h; i < w + h; i += band * 2.2) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + band * 1.1, 0);
    ctx.lineTo(i + band * 1.1 - h, h);
    ctx.lineTo(i - h, h);
    ctx.fill();
  }
  ctx.restore();
}

function paint(ctx: Ctx): void {
  containerMark(ctx, 'containerId0', 'HALCYON LINE', 'HCLU 482913 7', '#e6e2d6');
  containerMark(ctx, 'containerId1', 'NORTHMARK', 'NMKU 207745 1', '#dfe3e6');
  containerMark(ctx, 'containerId2', 'TRANSMERE', 'TSMU 660138 4', '#e4e4da');
  containerMark(ctx, 'containerId3', 'CASTELLAN', 'CSTU 915402 9', '#27323c');

  within(ctx, 'warning', (w, h) => {
    hazardBorder(ctx, w, h, 14);
    ctx.fillStyle = '#e4dcc6';
    ctx.fillRect(16, 16, w - 32, h - 32);
    ctx.fillStyle = '#a81d14';
    ctx.fillRect(16, 16, w - 32, 54);
    text(ctx, 'DANGER', w / 2, 62, `46px ${DISPLAY}`, '#f4efe3', 'center');
    text(ctx, 'RESTRICTED', w / 2, 104, `30px ${DISPLAY}`, '#17140f', 'center');
    text(ctx, 'AREA', w / 2, 136, `30px ${DISPLAY}`, '#17140f', 'center');
    text(ctx, 'AUTHORISED PERSONNEL', w / 2, 160, `bold 15px ${PLAIN}`, '#17140f', 'center');
    text(ctx, 'ONLY', w / 2, 178, `bold 15px ${PLAIN}`, '#17140f', 'center');
  });

  within(ctx, 'security', (w, h) => {
    ctx.fillStyle = '#10243c';
    ctx.fillRect(0, 0, w, h);
    text(ctx, 'SECURITY', w / 2, h * 0.8, `48px ${DISPLAY}`, '#e9e6d9', 'center');
  });

  within(ctx, 'hazardDiamond', (w, h) => {
    ctx.fillStyle = '#d68a12';
    ctx.strokeStyle = '#16140f';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w / 2, 6);
    ctx.lineTo(w - 6, h / 2);
    ctx.lineTo(w / 2, h - 6);
    ctx.lineTo(6, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    text(ctx, '!', w / 2, h * 0.68, `64px ${DISPLAY}`, '#16140f', 'center');
  });

  within(ctx, 'dangerVolts', (w, h) => {
    hazardBorder(ctx, w, h, 6);
    ctx.fillStyle = '#e4dcc6';
    ctx.fillRect(7, 7, w - 14, h - 14);
    text(ctx, '400 V', w / 2, h * 0.72, `34px ${DISPLAY}`, '#a81d14', 'center');
  });

  within(ctx, 'crateStencil', (w, h) => {
    const ink = '#1a1712';
    text(ctx, 'IV-2291', 10, 42, `38px ${DISPLAY}`, ink);
    text(ctx, 'NET 640 KG', 10, 74, `bold 20px ${PLAIN}`, ink);
    text(ctx, 'THIS SIDE UP', 10, 100, `bold 18px ${PLAIN}`, ink);
    ctx.fillStyle = ink;
    for (const ax of [w - 88, w - 40]) {
      ctx.beginPath();
      ctx.moveTo(ax, 14);
      ctx.lineTo(ax + 20, 46);
      ctx.lineTo(ax + 7, 46);
      ctx.lineTo(ax + 7, h - 22);
      ctx.lineTo(ax - 7, h - 22);
      ctx.lineTo(ax - 7, 46);
      ctx.lineTo(ax - 20, 46);
      ctx.closePath();
      ctx.fill();
    }
  });

  within(ctx, 'truckDoor', (w, h) => {
    text(ctx, 'HALDEN FREIGHT', w / 2, h * 0.5, `30px ${DISPLAY}`, '#d8d4c4', 'center');
    text(ctx, 'GVW 18 000 KG', w / 2, h * 0.86, `bold 16px ${PLAIN}`, '#d8d4c4', 'center');
  });

  within(ctx, 'rhibNumber', (w, h) => {
    text(ctx, 'RB-07', w / 2, h * 0.84, `52px ${DISPLAY}`, '#e4e2d8', 'center');
  });

  within(ctx, 'craneId', (w, h) => {
    text(ctx, 'BRK-04', w / 2, h * 0.84, `110px ${DISPLAY}`, '#e4e0d0', 'center');
  });

  within(ctx, 'ammo', (w, h) => {
    text(ctx, '7.62 x 51', 8, h * 0.44, `44px ${DISPLAY}`, '#e0c95a');
    text(ctx, '840 ROUNDS', 8, h * 0.74, `bold 22px ${PLAIN}`, '#e0c95a');
    ctx.fillStyle = '#e0c95a';
    ctx.fillRect(8, h * 0.84, w - 16, 8);
  });
}

/** Knocks paint flakes out of the alpha so nothing prints too clean. */
function weather(ctx: Ctx): void {
  const rand = seeded(2207);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 2600; i++) {
    const x = rand() * BASE;
    const y = rand() * BASE;
    const r = 0.4 + rand() * rand() * 3.6;
    ctx.globalAlpha = 0.35 + rand() * 0.65;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function createDecalAtlas(scene: Scene, size: number, anisotropy: number): DynamicTexture {
  const texture = new DynamicTexture('decalAtlas', { width: size, height: size }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  const ctx = texture.getContext() as unknown as Ctx;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.scale(size / BASE, size / BASE);
  paint(ctx);
  weather(ctx);
  ctx.restore();
  texture.hasAlpha = true;
  texture.anisotropicFilteringLevel = anisotropy;
  texture.update(true);
  return texture;
}
