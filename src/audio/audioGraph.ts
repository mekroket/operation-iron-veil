/** Builds the live routing: buses into a limiter, the shared reverb and the listener. */
import type { Vec3 } from '../core/types';
import { buildExteriorImpulse, buildInteriorImpulse } from './impulse';
import { VoicePool, type BusName } from './voices';

export type PausableBus = Exclude<BusName, 'ui'>;

export interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  buses: Record<BusName, GainNode>;
  pause: Record<PausableBus, GainNode>;
  duck: GainNode;
  exteriorWet: GainNode;
  interiorWet: GainNode;
  pool: VoicePool;
}

function resolveContextConstructor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  return (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function createReverb(ctx: AudioContext, exteriorWet: GainNode, interiorWet: GainNode): AudioNode | null {
  try {
    const input = ctx.createBiquadFilter();
    input.type = 'highpass';
    input.frequency.value = 160;
    const exterior = ctx.createConvolver();
    exterior.buffer = buildExteriorImpulse(ctx);
    const interior = ctx.createConvolver();
    interior.buffer = buildInteriorImpulse(ctx);
    input.connect(exterior);
    input.connect(interior);
    exterior.connect(exteriorWet);
    interior.connect(interiorWet);
    return input;
  } catch {
    return null;
  }
}

/** Returns null where Web Audio doesn't exist. Must run inside a user gesture to start unlocked. */
export function createAudioGraph(): AudioGraph | null {
  const Context = resolveContextConstructor();
  if (!Context) return null;
  const ctx = new Context({ latencyHint: 'interactive' });

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 2;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.14;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.connect(limiter);

  const makeGain = (to: AudioNode, value = 1): GainNode => {
    const gain = ctx.createGain();
    gain.gain.value = value;
    gain.connect(to);
    return gain;
  };

  const duck = makeGain(master);
  const pause: Record<PausableBus, GainNode> = {
    sfx: makeGain(master),
    ambience: makeGain(duck),
    voice: makeGain(master),
  };
  const buses: Record<BusName, GainNode> = {
    sfx: makeGain(pause.sfx),
    ambience: makeGain(pause.ambience),
    voice: makeGain(pause.voice),
    ui: makeGain(master),
  };

  const exteriorWet = makeGain(buses.sfx, 0);
  const interiorWet = makeGain(buses.sfx, 0);
  const reverbInput = createReverb(ctx, exteriorWet, interiorWet);

  // iOS only fully unlocks once something has started inside the gesture.
  const silence = ctx.createBufferSource();
  silence.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  silence.connect(ctx.destination);
  silence.start();

  return { ctx, master, buses, pause, duck, exteriorWet, interiorWet, pool: new VoicePool(ctx, buses, reverbInput) };
}

/** The game is left-handed and Web Audio right-handed: Z flips here exactly as it does for panners. */
export function applyListenerPose(listener: AudioListener, position: Vec3, forward: Vec3): void {
  const px = position.x;
  const py = position.y;
  const pz = -position.z;
  const length = Math.hypot(forward.x, forward.y, forward.z);
  if (![px, py, pz, length].every(Number.isFinite) || length < 1e-6) return;
  const fx = forward.x / length;
  const fy = forward.y / length;
  const fz = -forward.z / length;
  // right = forward x worldUp, up = right x forward.
  const rx = -fz;
  const rz = fx;
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const upLength = Math.hypot(ux, uy, uz);

  if (listener.positionX) {
    listener.positionX.value = px;
    listener.positionY.value = py;
    listener.positionZ.value = pz;
  } else {
    listener.setPosition(px, py, pz);
  }
  // Looking straight up or down has no defined roll: keep the previous orientation.
  if (upLength < 1e-4) return;
  if (listener.forwardX) {
    listener.forwardX.value = fx;
    listener.forwardY.value = fy;
    listener.forwardZ.value = fz;
    listener.upX.value = ux / upLength;
    listener.upY.value = uy / upLength;
    listener.upZ.value = uz / upLength;
  } else {
    listener.setOrientation(fx, fy, fz, ux / upLength, uy / upLength, uz / upLength);
  }
}
