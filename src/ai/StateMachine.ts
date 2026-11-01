/** Small generic finite state machine. Pure: no Babylon, no DOM. */

export interface FsmState<S extends string, C> {
  enter?(ctx: C, from: S | null): void;
  /** Return the next state, or null to stay. */
  update?(ctx: C, dt: number, timeInState: number): S | null;
  exit?(ctx: C, to: S): void;
  /** A terminal state can never be left. */
  terminal?: boolean;
}

export class StateMachine<S extends string, C> {
  /** Called after every completed transition, including the first one. */
  onChange: ((from: S | null, to: S) => void) | null = null;

  private readonly states: Readonly<Record<S, FsmState<S, C>>>;
  private readonly ctx: C;
  private state: S | null = null;
  private prev: S | null = null;
  private time = 0;
  private changing = false;
  private queued: S | null = null;

  constructor(states: Readonly<Record<S, FsmState<S, C>>>, ctx: C) {
    this.states = states;
    this.ctx = ctx;
  }

  /** The current state, or null before the first transition. */
  get current(): S | null {
    return this.state;
  }

  get previous(): S | null {
    return this.prev;
  }

  /** Seconds spent in the current state. */
  get timeInState(): number {
    return this.time;
  }

  /**
   * Moves to a state. Returns false when already there or leaving a terminal state.
   * A transition requested from inside enter or exit runs right after the current one finishes.
   */
  transition(to: S): boolean {
    if (this.changing) {
      this.queued = to;
      return true;
    }
    const from = this.state;
    if (from === to) return false;
    if (from !== null && this.states[from].terminal === true) return false;

    this.changing = true;
    if (from !== null) this.states[from].exit?.(this.ctx, to);
    this.prev = from;
    this.state = to;
    this.time = 0;
    this.states[to].enter?.(this.ctx, from);
    this.onChange?.(from, to);
    this.changing = false;

    const next = this.queued;
    this.queued = null;
    if (next !== null) this.transition(next);
    return true;
  }

  update(dt: number): void {
    const current = this.state;
    if (current === null) return;
    this.time += dt;
    const next = this.states[current].update?.(this.ctx, dt, this.time) ?? null;
    if (next !== null) this.transition(next);
  }
}
