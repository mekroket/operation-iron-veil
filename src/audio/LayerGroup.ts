/** A set of continuously running sources behind one gain, faded in on creation and torn down after its fade out. */

export interface NoiseLayer {
  filter: BiquadFilterNode;
  gain: GainNode;
}

export class LayerGroup {
  readonly root: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private stopped = false;

  constructor(
    private readonly ctx: AudioContext,
    output: AudioNode,
    level: number,
    fade: number,
  ) {
    this.root = ctx.createGain();
    this.root.gain.value = 0;
    this.root.gain.setTargetAtTime(level, ctx.currentTime, fade / 3);
    this.root.connect(output);
    this.nodes.push(this.root);
  }

  /** Adds a node the group doesn't create itself to the teardown list. */
  track(node: AudioNode): void {
    this.nodes.push(node);
  }

  noise(buffer: AudioBuffer, level: number, type: BiquadFilterType, frequency: number, q: number): NoiseLayer {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.root);
    source.start(this.ctx.currentTime, Math.random() * buffer.duration);
    this.sources.push(source);
    this.nodes.push(source, filter, gain);
    return { filter, gain };
  }

  tone(type: OscillatorType, frequency: number, level: number, to: AudioNode, detune = 0): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain);
    gain.connect(to);
    osc.start();
    this.sources.push(osc);
    this.nodes.push(osc, gain);
  }

  /** A slow oscillator driving a parameter. */
  lfo(frequency: number, depth: number, param: AudioParam): void {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.value = depth;
    osc.connect(gain);
    gain.connect(param);
    osc.start();
    this.sources.push(osc);
    this.nodes.push(osc, gain);
  }

  setLevel(level: number, smoothing: number): void {
    const now = this.ctx.currentTime;
    this.root.gain.cancelScheduledValues(now);
    this.root.gain.setTargetAtTime(level, now, smoothing);
  }

  stop(fade: number): void {
    if (this.stopped) return;
    this.stopped = true;
    this.setLevel(0, fade / 3);
    const end = this.ctx.currentTime + fade * 1.4;
    const nodes = this.nodes;
    if (this.sources.length > 0) {
      this.sources[0].onended = () => {
        for (const node of nodes) node.disconnect();
      };
    }
    for (const source of this.sources) source.stop(end);
  }
}
