import {
  Color4,
  ColorCurves,
  DefaultRenderingPipeline,
  Engine,
  ImageProcessingConfiguration,
  SSAO2RenderingPipeline,
} from '../engine/bjs';
import type { FreeCamera, Scene } from '../engine/bjs';
import { resolveGraphics } from '../settings/settings';
import type { GameSettings, ResolvedGraphics, SettingsStore } from '../settings/settings';
import { AdaptiveResolution } from './adaptiveResolution';

/** Above this device pixel ratio extra pixels cost far more than they show on a dark, grainy image. */
const MAX_DEVICE_RATIO = 1.5;
const MSAA_HIGH = 4;

/** Applies graphics settings live: resolution, post processing and adaptive resolution. */
export class GraphicsManager {
  private currentResolved: ResolvedGraphics;
  private pipeline: DefaultRenderingPipeline | null = null;
  private ssao: SSAO2RenderingPipeline | null = null;
  private lastGraphicsJson = '';
  private readonly adaptive: AdaptiveResolution;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    private readonly camera: FreeCamera,
    settings: SettingsStore,
  ) {
    const graphics = settings.get().graphics;
    this.currentResolved = resolveGraphics(graphics);
    this.adaptive = new AdaptiveResolution(this.currentResolved.resolutionScale, graphics.adaptiveResolution);
    this.configureImageProcessing();
    this.applySettings(settings.get());
    this.unsubscribe = settings.subscribe((next) => this.applySettings(next));
  }

  /** Rolling average over the last two seconds. */
  get fps(): number {
    return this.adaptive.fps;
  }

  get resolved(): ResolvedGraphics {
    return this.currentResolved;
  }

  /** Scale in use now, which adaptive resolution may have lowered. */
  get currentScale(): number {
    return this.adaptive.current;
  }

  update(dt: number): void {
    // dt may be clamped or paused by the game loop, so measure with the engine's real frame time and fall back to dt.
    const frame = this.engine.getDeltaTime() / 1000 || dt;
    const next = this.adaptive.update(frame, document.hidden);
    if (next !== null) this.applyScale(next);
  }

  dispose(): void {
    this.unsubscribe();
    this.disposePipelines();
    this.scene.imageProcessingConfiguration.applyByPostProcess = false;
  }

  private applySettings(settings: GameSettings): void {
    const graphics = settings.graphics;
    // The store notifies on every change, audio included. A rebuild would hitch, so react only to graphics changes.
    const json = JSON.stringify(graphics);
    if (json === this.lastGraphicsJson) return;
    this.lastGraphicsJson = json;

    const gfx = resolveGraphics(graphics);
    this.currentResolved = gfx;
    this.adaptive.configure(gfx.resolutionScale, graphics.adaptiveResolution);
    this.applyScale(this.adaptive.current);

    const wantsSsao = gfx.ssao && SSAO2RenderingPipeline.IsSupported;
    if (!this.pipeline || wantsSsao !== (this.ssao !== null)) {
      // SSAO has to stay ahead of tone mapping in the camera's chain, and chain order is attach order, so toggling it rebuilds both.
      this.disposePipelines();
      if (wantsSsao) this.createSsao();
      this.pipeline = new DefaultRenderingPipeline('iv.post', true, this.scene, [this.camera], false);
    }
    this.configurePost(graphics.postQuality);
  }

  private applyScale(scale: number): void {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_RATIO);
    this.engine.setHardwareScalingLevel(1 / (scale * ratio));
  }

  /** Scene wide look. The post process reads this object, so it survives pipeline rebuilds. */
  private configureImageProcessing(): void {
    const config = this.scene.imageProcessingConfiguration;
    config.toneMappingEnabled = true;
    config.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    config.exposure = 1.25;
    config.contrast = 1.12;

    const curves = new ColorCurves();
    curves.shadowsHue = 195;
    curves.shadowsDensity = 34;
    curves.shadowsSaturation = 12;
    curves.highlightsHue = 34;
    curves.highlightsDensity = 26;
    curves.highlightsSaturation = 8;
    config.colorCurves = curves;
    config.colorCurvesEnabled = true;

    config.vignetteEnabled = true;
    config.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
    config.vignetteWeight = 1.3;
    config.vignetteStretch = 0.35;
    config.vignetteColor = new Color4(0.02, 0.025, 0.04, 0);
    config.vignetteCameraFov = 0.7;

    // Blue-hour gradients are dark, and banding in them is the first thing to show on an 8-bit display.
    config.ditheringEnabled = true;
    config.ditheringIntensity = 1 / 255;
  }

  private configurePost(postQuality: GameSettings['graphics']['postQuality']): void {
    const pipeline = this.pipeline;
    if (!pipeline) return;
    const gfx = this.currentResolved;
    const samples = postQuality === 'high' ? MSAA_HIGH : 1;

    // Batch the property changes into a single rebuild.
    pipeline.automaticBuild = false;
    pipeline.sharpenEnabled = false;
    pipeline.chromaticAberrationEnabled = false;
    pipeline.depthOfFieldEnabled = false;
    pipeline.fxaaEnabled = gfx.fxaa;
    pipeline.bloomEnabled = gfx.bloom;
    // Bloom runs in HDR before tone mapping: lit surfaces stay under the threshold, while emissives, lamps and flashes exceed it.
    pipeline.bloomThreshold = 0.95;
    pipeline.bloomWeight = 0.32;
    pipeline.bloomKernel = 64;
    pipeline.bloomScale = 0.5;
    pipeline.grainEnabled = gfx.grain;
    pipeline.grain.intensity = 5;
    pipeline.grain.animated = true;
    // MSAA belongs on whichever pass receives the scene: SSAO's first pass when it is present, otherwise this pipeline's.
    if (this.ssao) this.ssao.textureSamples = samples;
    pipeline.samples = this.ssao ? 1 : samples;
    pipeline.prepare();
    pipeline.automaticBuild = true;
  }

  /**
   * Uses the geometry buffer, not the prepass. The prepass would turn the main render into an MRT, which every material
   * then has to support. The geometry buffer is a separate pass, and it deals with first person weapons correctly:
   * ObjectRenderer draws each rendering group with the scene's auto clear setup, so depth is cleared before group 1 and
   * the weapon overwrites the world's depth and normal texels. AO is then computed on the weapon's own surface, and the
   * range check stops it from casting a halo on the distant world. Transparent decals and quads are left out.
   */
  private createSsao(): void {
    const geometry = this.scene.enableGeometryBufferRenderer();
    if (!geometry) return;
    geometry.renderTransparentMeshes = false;

    const textureType = this.engine.getCaps().textureHalfFloatRender ? Engine.TEXTURETYPE_HALF_FLOAT : 0;
    const ssao = new SSAO2RenderingPipeline('iv.ssao', this.scene, { ssaoRatio: 0.5, blurRatio: 1 }, [this.camera], true, textureType);
    ssao.samples = 8;
    ssao.radius = 1.3;
    ssao.totalStrength = 0.95;
    ssao.base = 0.08;
    // Past this distance fog has taken over. Skipping it also leaves the sky and the horizon silhouettes out.
    ssao.maxZ = 130;
    ssao.minZAspect = 0.5;
    ssao.expensiveBlur = true;
    ssao.bilateralSamples = 8;
    this.ssao = ssao;
  }

  /** Both dispose() methods detach from the camera and remove the pipeline from the scene's manager themselves. */
  private disposePipelines(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    // true also drops the geometry buffer, so nothing keeps rendering the scene a second time.
    this.ssao?.dispose(true);
    this.ssao = null;
  }
}
