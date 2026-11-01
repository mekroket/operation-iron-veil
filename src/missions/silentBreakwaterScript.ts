/** Mission 01 as pure data: objectives, radio, and which enemy groups each moment wakes up. */
import type { Vec3 } from '../core/types';
import type { LevelDefinition } from '../levels/types';
import type { MissionSignal, StageId } from './MissionStateMachine';
import type { RadioLine } from './RadioQueue';

export const OVERWATCH = 'Overwatch';
export const WREN = 'Wren';

export const TERMINAL_HOLD_SECONDS = 3;
export const TRANSFER_SECONDS = 45;
export const EXTRACTION_HOLD_SECONDS = 1.5;
export const BLAST_RADIUS = 9;
export const TERMINAL_PROMPT = 'Copy manifest';
export const BOARD_PROMPT = 'Board boat';
export const TRANSFER_OBJECTIVE = 'Hold out until the transfer completes';
export const FAILURE_REASON = 'Sgt. Calloway is down. Overwatch has lost contact.';

/**
 * The door the scripted blast opens, which stays locked until then. Looks at ids before labels and takes the
 * strictest match. A level with no such door simply has nothing locked.
 */
export function findEastExitDoor(doors: readonly { id: string; label: string }[]): string | null {
  for (const pattern of [/east[\s_-]*exit/i, /quay/i]) {
    const door = doors.find((d) => pattern.test(d.id)) ?? doors.find((d) => pattern.test(d.label));
    if (door) return door.id;
  }
  return null;
}

const triggerCenter = (level: LevelDefinition, id: string): Vec3 | null =>
  level.triggers.find((zone) => zone.id === id)?.center ?? null;

export interface StageScript {
  id: StageId;
  objective: string;
  target: (level: LevelDefinition) => Vec3 | null;
  /** Moves on by itself after this long, unless a trigger got there first. */
  autoAdvance?: { after: number; signal: MissionSignal };
}

export const STAGE_SCRIPT: readonly StageScript[] = [
  {
    id: 'briefing',
    objective: 'Stand by for insertion',
    target: () => null,
    autoAdvance: { after: 3, signal: 'briefing_done' },
  },
  {
    id: 'insertion',
    objective: 'Move along the south breakwater',
    target: (level) => triggerCenter(level, 'enter_port'),
    autoAdvance: { after: 12, signal: 'insertion_done' },
  },
  { id: 'infiltrate', objective: 'Reach the port', target: (level) => triggerCenter(level, 'enter_port') },
  { id: 'checkpoint', objective: 'Get past the security checkpoint', target: (level) => triggerCenter(level, 'checkpoint_passed') },
  { id: 'yard', objective: 'Cross the container yard', target: (level) => triggerCenter(level, 'warehouse_entry') },
  { id: 'warehouse', objective: 'Fight through the main warehouse', target: (level) => triggerCenter(level, 'annex_entry') },
  { id: 'annex', objective: 'Find the harbour office', target: (level) => triggerCenter(level, 'server_room') },
  { id: 'objective', objective: 'Copy the Veil manifest', target: (level) => level.objective.position },
  { id: 'exfil', objective: 'Fight along the east quay', target: (level) => level.extraction.position },
  { id: 'extract', objective: 'Board the boat', target: (level) => level.extraction.position },
  { id: 'complete', objective: 'Mission complete', target: () => null },
];

/** Natural order of the trigger zones. Touching one implies the player got past all those before it. */
export const TRIGGER_ORDER: readonly string[] = [
  'enter_port',
  'checkpoint_near',
  'checkpoint_passed',
  'yard_entry',
  'yard_mid',
  'warehouse_entry',
  'warehouse_mid',
  'annex_entry',
  'server_room',
  'quay_entry',
  'quay_mid',
  'extraction_near',
];

export interface GroupAction {
  activate: readonly string[];
  /** Groups sent straight into combat, aware of the player. */
  alert?: readonly string[];
}

export const TRANSFER_STARTED = 'transfer_started';
export const TRANSFER_COMPLETE = 'transfer_complete';

/**
 * Enemy groups woken by each trigger or mission event. Groups are woken one zone early and stand out of
 * sight, so the player never watches them appear. activateGroup is idempotent, so overlap is harmless.
 */
export const GROUP_ACTIONS: Readonly<Record<string, GroupAction>> = {
  enter_port: { activate: ['checkpoint'] },
  checkpoint_near: { activate: ['checkpoint', 'yard_a'] },
  checkpoint_passed: { activate: ['yard_a', 'yard_b'] },
  yard_entry: { activate: ['yard_b'] },
  yard_mid: { activate: ['yard_b', 'warehouse'] },
  warehouse_entry: { activate: ['warehouse', 'warehouse_reinforce'] },
  warehouse_mid: { activate: ['warehouse_reinforce', 'annex'], alert: ['warehouse_reinforce'] },
  annex_entry: { activate: ['annex'] },
  [TRANSFER_STARTED]: { activate: ['warehouse_reinforce', 'quay'], alert: ['warehouse_reinforce', 'warehouse', 'annex'] },
  [TRANSFER_COMPLETE]: { activate: ['quay'] },
  quay_entry: { activate: ['quay', 'quay_reinforce'] },
  quay_mid: { activate: ['quay_reinforce'], alert: ['quay_reinforce'] },
};

/** Groups told again where the player is, so the fight keeps coming while the transfer runs. */
export const TRANSFER_HUNTERS: readonly string[] = ['warehouse_reinforce', 'warehouse', 'annex'];
export const TRANSFER_REALERT_SECONDS = 12;

export type RadioEvent = 'terminal_started' | 'transfer_complete' | 'boarded';

export type RadioCue =
  | { kind: 'stage'; stage: StageId }
  | { kind: 'trigger'; id: string }
  | { kind: 'cleared'; group: string }
  /** Seconds after entering a stage. */
  | { kind: 'stageTimer'; stage: StageId; after: number }
  /** Seconds after the transfer started. */
  | { kind: 'transfer'; after: number }
  | { kind: 'event'; event: RadioEvent };

export interface RadioBeat {
  id: string;
  cue: RadioCue;
  lines: readonly RadioLine[];
  /** Plot beats survive when the queue falls behind. */
  critical?: boolean;
  /** Dropped when it comes up after this stage has passed, so a late cue cannot sound stale. */
  until?: StageId;
}

const vane = (text: string, pauseBefore?: number): RadioLine => ({ speaker: OVERWATCH, text, pauseBefore });
const wren = (text: string, pauseBefore?: number): RadioLine => ({ speaker: WREN, text, pauseBefore });

export const RADIO_BEATS: readonly RadioBeat[] = [
  {
    id: 'radio_check',
    cue: { kind: 'stage', stage: 'briefing' },
    lines: [vane('Wren, Overwatch. Radio check.'), wren('Loud and clear.')],
  },
  {
    id: 'breakwater',
    cue: { kind: 'stage', stage: 'insertion' },
    lines: [vane('South breakwater reads clear on thermal. Follow it north to the port fence.')],
  },
  {
    id: 'inside_fence',
    cue: { kind: 'trigger', id: 'enter_port' },
    critical: true,
    lines: [
      vane('You are through the fence. From here the port belongs to them.'),
      wren('Nine days they have had it.'),
      vane('Ships come in heavy and leave light. Working theory is arms. Bring me proof.'),
    ],
  },
  {
    id: 'checkpoint_ahead',
    cue: { kind: 'trigger', id: 'checkpoint_near' },
    until: 'checkpoint',
    lines: [vane('Security checkpoint ahead. Get past it quietly if you can. Quickly if you cannot.')],
  },
  {
    id: 'yard_next',
    cue: { kind: 'trigger', id: 'checkpoint_passed' },
    until: 'yard',
    lines: [vane('Container yard next. Watch the long lanes between the stacks.')],
  },
  {
    id: 'vents',
    cue: { kind: 'trigger', id: 'yard_entry' },
    critical: true,
    lines: [wren('These containers have vents cut in the roofs. Fresh welds.'), vane('Could be for munitions. Note it and move on.')],
  },
  {
    id: 'yard_patrol',
    cue: { kind: 'trigger', id: 'yard_mid' },
    until: 'yard',
    lines: [vane('Patrol is turning back through the stacks. Movement on both sides of you.')],
  },
  {
    id: 'yard_quiet',
    cue: { kind: 'cleared', group: 'yard_b' },
    until: 'yard',
    lines: [vane('Yard is thinning out on thermal. The main warehouse is ahead of you.')],
  },
  {
    id: 'cots',
    cue: { kind: 'trigger', id: 'warehouse_entry' },
    critical: true,
    lines: [
      wren('Inside the warehouse. Cots on pallets in here. Water drums.'),
      vane('How many cots?'),
      wren('More than forty guards need.'),
      vane('Office annex is past the loading floor. Keep going.'),
    ],
  },
  {
    id: 'net_lit',
    cue: { kind: 'trigger', id: 'warehouse_mid' },
    until: 'warehouse',
    lines: [vane('Their net just lit up. Someone missed a check-in, and they are coming to you.'), wren('Contact.')],
  },
  {
    id: 'response_spent',
    cue: { kind: 'cleared', group: 'warehouse_reinforce' },
    until: 'warehouse',
    lines: [vane('That was their response team. The way to the annex should be open.')],
  },
  {
    id: 'annex',
    cue: { kind: 'trigger', id: 'annex_entry' },
    critical: true,
    lines: [
      vane('You are in the annex. Our source worked on this floor.'),
      wren('Someone left a coat on the chair.'),
      vane('Data terminal is in the server room, east end of the corridor.'),
    ],
  },
  {
    id: 'terminal_found',
    cue: { kind: 'trigger', id: 'server_room' },
    critical: true,
    lines: [wren('Found the terminal.'), vane('Copy everything tagged Veil. They will see it the moment you start.')],
  },
  {
    id: 'terminal_nudge',
    cue: { kind: 'stageTimer', stage: 'objective', after: 40 },
    lines: [vane('The terminal, Wren. We are losing the dark.')],
  },
  {
    id: 'copying',
    cue: { kind: 'event', event: 'terminal_started' },
    critical: true,
    lines: [wren('Copying.'), vane('Forty-five seconds. They have seen it. Stay alive until it finishes.')],
  },
  {
    id: 'manifest_arriving',
    cue: { kind: 'transfer', after: 5 },
    critical: true,
    lines: [vane('Manifest is coming through. Stand by.')],
  },
  {
    id: 'people',
    cue: { kind: 'transfer', after: 9 },
    critical: true,
    lines: [
      vane('These are not cargo lines, Wren. Names. Ages. Home districts.'),
      wren('How many?'),
      vane('Six thousand and change, across eleven ships. No customs record for any of them.'),
      wren('The vents. The cots.'),
      vane('It was never arms.'),
    ],
  },
  {
    id: 'ledger',
    cue: { kind: 'transfer', after: 26 },
    critical: true,
    lines: [vane('Payment ledger is next. Black Meridian bills one client for all of it.'), wren('Who?')],
  },
  {
    id: 'client',
    cue: { kind: 'transfer', after: 32 },
    critical: true,
    lines: [
      vane('Sundrik Interior Ministry. Signed and countersigned.', 1.5),
      wren('The government that asked for us.'),
      vane('The same one.'),
    ],
  },
  {
    id: 'blast',
    cue: { kind: 'event', event: 'transfer_complete' },
    critical: true,
    lines: [
      wren('Copy complete. I have it.'),
      vane('Detonation at the warehouse wall. Wren, status.'),
      wren('They cut off the way back. The blast killed the door locks. Quay door is open.'),
      vane('Then that is your way out. East quay. The boat is inbound.'),
    ],
  },
  {
    id: 'quay',
    cue: { kind: 'trigger', id: 'quay_entry' },
    until: 'exfil',
    lines: [vane('You are on the quay. Stay in cover and keep heading for the boat.')],
  },
  {
    id: 'last_push',
    cue: { kind: 'trigger', id: 'quay_mid' },
    until: 'exfil',
    lines: [vane('North gate and the apron, both sides of you. That is everything they have left.')],
  },
  {
    id: 'boat_close',
    cue: { kind: 'trigger', id: 'extraction_near' },
    lines: [vane('Boat is at the pier. Get aboard.')],
  },
  {
    id: 'nobody_but_me',
    cue: { kind: 'event', event: 'boarded' },
    critical: true,
    lines: [
      wren('Aboard. Uploading the manifest to Task Unit.'),
      wren('Overwatch, confirm receipt.', 3),
      vane('Cancel that upload. Nothing to Task Unit, no log entry, nothing to the boat crew.', 4),
      wren('Who gets it?'),
      vane('Nobody but me, Wren. You put it in my hand.'),
    ],
  },
];
