import { Engine } from '../engine/bjs';

export type RendererBackend = 'webgl2' | 'webgpu';

/**
 * Creates the render engine. WebGL2 is the baseline. WebGPU is opt in through ?webgpu=1 and falls back to WebGL2 on any failure.
 * @throws Error with a player-facing message when WebGL2 is unavailable.
 */
export async function createEngine(canvas: HTMLCanvasElement): Promise<{ engine: Engine; backend: RendererBackend }> {
  if (wantsWebGpu()) {
    try {
      const engine = await createWebGpu(canvas);
      watchContext(engine);
      return { engine, backend: 'webgpu' };
    } catch (error) {
      console.warn('[renderer] WebGPU failed, falling back to WebGL2.', error);
    }
  }
  const engine = createWebGl2(canvas);
  watchContext(engine);
  return { engine, backend: 'webgl2' };
}

function wantsWebGpu(): boolean {
  return new URLSearchParams(window.location.search).get('webgpu') === '1' && 'gpu' in navigator;
}

/**
 * Canvas MSAA stays off because the scene always renders through post processing, where the pipeline's own MSAA applies.
 * Without post processing the canvas would alias, but this game always has at least the tone mapping pass.
 */
function createWebGl2(canvas: HTMLCanvasElement): Engine {
  const failure = 'This game needs WebGL2, which is unavailable. Please update your browser or graphics drivers, or enable hardware acceleration.';
  let engine: Engine;
  try {
    engine = new Engine(canvas, false, { stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }, false);
  } catch (error) {
    throw new Error(failure, { cause: error });
  }
  if (engine.webGLVersion < 2) {
    engine.dispose();
    throw new Error(failure);
  }
  return engine;
}

/**
 * Loaded dynamically to keep WebGPU code out of the main chunk, which is the one Babylon import that bypasses engine/bjs.ts.
 * A canvas cannot change context type once it has one, so a throwaway canvas proves WebGPU works before the real one commits.
 */
async function createWebGpu(canvas: HTMLCanvasElement): Promise<Engine> {
  const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine');
  if (!(await WebGPUEngine.IsSupportedAsync)) throw new Error('No WebGPU adapter.');

  const options = { antialias: false, stencil: true };
  const probe = new WebGPUEngine(document.createElement('canvas'), options);
  await probe.initAsync();
  probe.dispose();

  const engine = new WebGPUEngine(canvas, options);
  await engine.initAsync();
  // The rest of the game uses the API the two engines share through the Engine type.
  return engine as unknown as Engine;
}

/** Babylon restores GPU resources itself after a context loss. These logs make the event visible in bug reports. */
function watchContext(engine: Engine): void {
  engine.onContextLostObservable.add(() => console.warn('[renderer] Graphics context lost.'));
  engine.onContextRestoredObservable.add(() => console.warn('[renderer] Graphics context restored.'));
}
