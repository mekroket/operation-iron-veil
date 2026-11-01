import { DynamicTexture } from '../engine/bjs';
import type { Scene } from '../engine/bjs';

type Ctx = ReturnType<DynamicTexture['getContext']>;

function paint(scene: Scene, name: string, size: number, draw: (ctx: Ctx, size: number) => void): DynamicTexture {
  const texture = new DynamicTexture(`iv.fx.${name}`, size, scene, true);
  texture.hasAlpha = true;
  draw(texture.getContext(), size);
  texture.update();
  return texture;
}

/** Repeatable noise, so the textures look the same on every load. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return ((state >>> 8) & 0xffff) / 65535;
  };
}

function radial(ctx: Ctx, x: number, y: number, radius: number, stops: readonly (readonly [number, string])[]): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

const drawSoft = (ctx: Ctx, s: number): void =>
  radial(ctx, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);

const drawSpark = (ctx: Ctx, s: number): void =>
  radial(ctx, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);

function drawSmoke(ctx: Ctx, s: number): void {
  const random = makeRandom(5150);
  for (let i = 0; i < 26; i++) {
    const angle = random() * Math.PI * 2;
    const reach = random() * s * 0.27;
    const radius = s * (0.1 + random() * 0.14);
    radial(ctx, s / 2 + Math.cos(angle) * reach, s / 2 + Math.sin(angle) * reach, radius, [[0, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);
  }
}

function drawShard(ctx: Ctx, s: number): void {
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.05);
  ctx.lineTo(s * 0.72, s * 0.62);
  ctx.lineTo(s * 0.48, s * 0.95);
  ctx.lineTo(s * 0.3, s * 0.45);
  ctx.closePath();
  ctx.fill();
}

const drawRing = (ctx: Ctx, s: number): void =>
  radial(ctx, s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0)'], [0.9, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);

function drawFlash(ctx: Ctx, s: number): void {
  const random = makeRandom(1911);
  ctx.save();
  ctx.translate(s / 2, s / 2);
  for (let i = 0; i < 7; i++) {
    ctx.rotate((Math.PI * 2) / 7 + (random() - 0.5) * 0.3);
    const length = s * (0.3 + random() * 0.2);
    const gradient = ctx.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.04);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, s * 0.04);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  radial(ctx, s / 2, s / 2, s * 0.22, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
}

/** Soft across its width, brightest at the top of the canvas (the head, V = 1), fading to the tail, which reads as speed. */
function drawTracer(ctx: Ctx, s: number): void {
  for (let y = 0; y < s; y++) {
    const along = 1 - y / s;
    const gradient = ctx.createLinearGradient(0, 0, s, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.5, `rgba(255,255,255,${along.toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, s, 1);
  }
}

function drawHoleMetal(ctx: Ctx, s: number): void {
  radial(ctx, s / 2, s / 2, s * 0.48, [[0, 'rgba(40,36,32,0.75)'], [0.55, 'rgba(70,64,58,0.4)'], [1, 'rgba(70,64,58,0)']]);
  radial(ctx, s / 2, s / 2, s * 0.2, [[0, 'rgba(4,4,5,1)'], [0.72, 'rgba(6,6,7,1)'], [0.85, 'rgba(150,146,140,0.85)'], [1, 'rgba(150,146,140,0)']]);
}

function drawHoleConcrete(ctx: Ctx, s: number): void {
  const random = makeRandom(8088);
  radial(ctx, s / 2, s / 2, s * 0.48, [[0, 'rgba(46,44,42,0.7)'], [1, 'rgba(70,68,64,0)']]);
  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2;
    const reach = s * (0.12 + random() * 0.28);
    const radius = s * (0.015 + random() * 0.04);
    ctx.fillStyle = `rgba(26,25,24,${(0.45 + random() * 0.45).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(s / 2 + Math.cos(angle) * reach, s / 2 + Math.sin(angle) * reach, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  radial(ctx, s / 2, s / 2, s * 0.16, [[0, 'rgba(6,6,6,1)'], [0.8, 'rgba(10,10,10,0.95)'], [1, 'rgba(10,10,10,0)']]);
}

function drawHoleWood(ctx: Ctx, s: number): void {
  const random = makeRandom(6502);
  radial(ctx, s / 2, s / 2, s * 0.42, [[0, 'rgba(40,26,14,0.65)'], [1, 'rgba(60,40,20,0)']]);
  // Pale torn fibres along the grain.
  for (let i = 0; i < 12; i++) {
    const y = s * (0.3 + random() * 0.4);
    const half = s * (0.1 + random() * 0.3);
    ctx.strokeStyle = `rgba(190,156,108,${(0.5 + random() * 0.4).toFixed(3)})`;
    ctx.lineWidth = s * (0.008 + random() * 0.018);
    ctx.beginPath();
    ctx.moveTo(s / 2 - half, y);
    ctx.lineTo(s / 2 + half, y + (random() - 0.5) * s * 0.06);
    ctx.stroke();
  }
  radial(ctx, s / 2, s / 2, s * 0.13, [[0, 'rgba(8,5,3,1)'], [0.8, 'rgba(12,8,4,0.95)'], [1, 'rgba(12,8,4,0)']]);
}

/** Every effect texture, generated once on canvas and shared. */
export class FxTextures {
  readonly soft: DynamicTexture;
  readonly spark: DynamicTexture;
  readonly smoke: DynamicTexture;
  readonly shard: DynamicTexture;
  readonly ring: DynamicTexture;
  readonly flash: DynamicTexture;
  readonly tracer: DynamicTexture;
  readonly holeMetal: DynamicTexture;
  readonly holeConcrete: DynamicTexture;
  readonly holeWood: DynamicTexture;

  constructor(scene: Scene) {
    this.soft = paint(scene, 'soft', 64, drawSoft);
    this.spark = paint(scene, 'spark', 32, drawSpark);
    this.smoke = paint(scene, 'smoke', 128, drawSmoke);
    this.shard = paint(scene, 'shard', 32, drawShard);
    this.ring = paint(scene, 'ring', 256, drawRing);
    this.flash = paint(scene, 'flash', 128, drawFlash);
    this.tracer = paint(scene, 'tracer', 32, drawTracer);
    this.holeMetal = paint(scene, 'holeMetal', 64, drawHoleMetal);
    this.holeConcrete = paint(scene, 'holeConcrete', 64, drawHoleConcrete);
    this.holeWood = paint(scene, 'holeWood', 64, drawHoleWood);
  }

  dispose(): void {
    for (const texture of [this.soft, this.spark, this.smoke, this.shard, this.ring, this.flash, this.tracer, this.holeMetal, this.holeConcrete, this.holeWood]) {
      texture.dispose();
    }
  }
}
