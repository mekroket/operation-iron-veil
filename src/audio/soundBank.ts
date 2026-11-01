/** Renders every sound definition through OfflineAudioContext, sequentially and with yields, into shared AudioBuffers. */
import { FOLEY_SOUNDS } from './bankFoley';
import { VOICE_SOUNDS } from './bankVoice';
import { WEAPON_SOUNDS } from './bankWeapons';
import { WORLD_SOUNDS } from './bankWorld';
import { finishBuffer, hashKey, Kit, RENDER_RATE, Rng, type NoiseSet, type SoundDef } from './synth';

const ALL_SOUNDS: readonly SoundDef[] = [...WORLD_SOUNDS, ...WEAPON_SOUNDS, ...FOLEY_SOUNDS, ...VOICE_SOUNDS];

/** Longest stretch of main-thread work before handing control back to the browser, in ms. */
const SLICE_MS = 6;
/** A browser that stops resolving offline renders must not hang the loading screen. */
const RENDER_TIMEOUT_MS = 4000;
const MAX_CONSECUTIVE_FAILURES = 3;

const nextTask = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

function withTimeout<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function renderVariant(def: SoundDef, variant: number, noise: NoiseSet): Promise<AudioBuffer | null> {
  try {
    const length = Math.max(1, Math.ceil(def.seconds * RENDER_RATE));
    const ctx = new OfflineAudioContext(def.channels ?? 1, length, RENDER_RATE);
    const seed = (hashKey(def.key) + Math.imul(variant + 1, 7919)) >>> 0;
    def.build(new Kit(ctx, new Rng(seed), noise), variant);
    const rendered = await withTimeout(ctx.startRendering(), RENDER_TIMEOUT_MS);
    if (rendered) finishBuffer(rendered, def.peak ?? 0.9, def.seamless === true);
    return rendered;
  } catch {
    return null;
  }
}

/**
 * Fills `store` as it goes, so finished sounds are usable while the rest render. Rendering itself runs off the main
 * thread in current browsers; only graph construction and normalisation cost main-thread time, in small slices.
 * Resolves rather than rejects: a sound that fails to render just stays silent.
 */
export async function renderSoundBank(
  noise: NoiseSet,
  store: Map<string, AudioBuffer[]>,
  onProgress: (fraction: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const total = ALL_SOUNDS.reduce((sum, def) => sum + def.variants, 0);
  let finished = 0;
  let failures = 0;
  let sliceStart = performance.now();

  for (const def of ALL_SOUNDS) {
    const variants: AudioBuffer[] = [];
    for (let variant = 0; variant < def.variants; variant++) {
      if (isCancelled() || failures >= MAX_CONSECUTIVE_FAILURES) return;
      const buffer = await renderVariant(def, variant, noise);
      if (buffer) {
        variants.push(buffer);
        store.set(def.key, variants);
        failures = 0;
      } else {
        failures++;
      }
      finished++;
      onProgress(finished / total);
      if (performance.now() - sliceStart > SLICE_MS) {
        await nextTask();
        sliceStart = performance.now();
      }
    }
  }
}
