/** Door state for the player, the AI and checkpoints. Physics and visuals are injected. */
import type { IDoorBlocker, ILevelVisuals, INavDoors } from '../core/contracts';
import type { EventBus } from '../core/events';
import type { DoorDef } from '../levels/types';
import type { InteractionSystem } from './InteractionSystem';

export interface DoorSystemDeps {
  doors: readonly DoorDef[];
  bus: EventBus;
  visuals: ILevelVisuals;
  interaction: InteractionSystem;
  createBlocker: (door: DoorDef) => IDoorBlocker;
}

interface DoorRuntime {
  def: DoorDef;
  blocker: IDoorBlocker;
  open: boolean;
  locked: boolean;
}

const linkKey = (a: string, b: string): string => `${a}|${b}`;

/** How far past the panel edge the player can reach. */
const DOOR_REACH = 1.8;
/** Wide doors are often viewed off-centre, so they are more forgiving than the default. */
const DOOR_FACING_DEGREES = 65;

export class DoorSystem implements INavDoors {
  private readonly doors = new Map<string, DoorRuntime>();
  private readonly byLink = new Map<string, DoorRuntime>();
  private readonly unregister: (() => void)[] = [];

  constructor(private readonly deps: DoorSystemDeps) {
    for (const def of deps.doors) {
      const door: DoorRuntime = { def, blocker: deps.createBlocker(def), open: false, locked: false };
      this.doors.set(def.id, door);
      for (const [a, b] of def.navLinks) {
        this.byLink.set(linkKey(a, b), door);
        this.byLink.set(linkKey(b, a), door);
      }
      this.unregister.push(deps.interaction.register(this.toInteractable(door)));
    }
    this.reset();
  }

  /** Opens with animation and sound. False when the door is unknown, locked or already open. */
  open(id: string): boolean {
    const door = this.doors.get(id);
    if (!door || door.open || door.locked) return false;
    this.apply(door, true, false);
    this.deps.bus.emit('door:moved', { position: door.def.center, opening: true });
    return true;
  }

  isOpen(id: string): boolean {
    return this.doors.get(id)?.open ?? false;
  }

  getOpenIds(): string[] {
    return [...this.doors.values()].filter((door) => door.open).map((door) => door.def.id);
  }

  /** Sets every door to exactly this state, without animation or sound. Ignores locks. */
  restore(openIds: readonly string[]): void {
    const wanted = new Set(openIds);
    for (const door of this.doors.values()) this.apply(door, wanted.has(door.def.id), true);
  }

  /** Back to the level's starting state, with every lock released. */
  reset(): void {
    for (const door of this.doors.values()) door.locked = false;
    this.restore(this.deps.doors.filter((def) => def.startsOpen).map((def) => def.id));
  }

  /** A locked door stays shut for the player and the AI until the mission script releases it. */
  setLocked(id: string, locked: boolean): void {
    const door = this.doors.get(id);
    if (door) door.locked = locked;
  }

  isLinkBlocked(nodeA: string, nodeB: string): boolean {
    const door = this.byLink.get(linkKey(nodeA, nodeB));
    return door ? !door.open : false;
  }

  openLink(nodeA: string, nodeB: string): void {
    const door = this.byLink.get(linkKey(nodeA, nodeB));
    if (door) this.open(door.def.id);
  }

  dispose(): void {
    for (const remove of this.unregister) remove();
    this.unregister.length = 0;
  }

  private apply(door: DoorRuntime, open: boolean, instant: boolean): void {
    door.open = open;
    door.blocker.setBlocking(!open);
    this.deps.visuals.setDoorOpen(door.def.id, open, instant);
  }

  private toInteractable(door: DoorRuntime) {
    const { def } = door;
    return {
      id: `door:${def.id}`,
      position: def.center,
      radius: Math.max(def.size.x, def.size.z) / 2 + DOOR_REACH,
      facingDegrees: DOOR_FACING_DEGREES,
      // The sight line stops in front of the panel, otherwise a closed door would hide itself.
      losMargin: Math.min(def.size.x, def.size.z) / 2 + 0.15,
      holdSeconds: 0,
      prompt: () => (door.locked ? `${def.label}: locked` : `Open ${def.label}`),
      isEnabled: () => !door.open,
      onComplete: () => void this.open(def.id),
    };
  }
}
