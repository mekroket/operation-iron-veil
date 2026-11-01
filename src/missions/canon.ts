/** Story canon shared by the UI, mission script and documentation. Entirely fictional. */

export const GAME_TITLE = 'OPERATION: IRON VEIL';
export const STUDIO_LINE = 'A browser-native campaign';

export const MISSION_01 = {
  id: 'silent-breakwater',
  number: '01',
  title: 'SILENT BREAKWATER',
  location: 'Port Kessary, Sundrik Coast',
  time: '04:42 local, overcast',
  operator: 'Sgt. Mara "Wren" Calloway, Task Unit Halcyon',
  handler: 'Overwatch (Lt. Cmdr. Idris Vane)',
  enemy: 'Black Meridian, a private military contractor holding the port',
  summary:
    'Black Meridian seized Port Kessary nine days ago. Every ship that docks leaves lighter and nobody on the coast will say why. ' +
    'A source inside the harbour authority died getting one word out: VEIL.',
  tasking: [
    'Land on the south breakwater and enter the port on foot.',
    'Pass the security checkpoint and cross the container yard.',
    'Enter the main warehouse and reach the harbour office annex.',
    'Copy the Veil manifest from the data terminal.',
    'Reach the east quay for extraction.',
  ],
  rules: 'Stay quiet for as long as you can. Once they know you are there, the whole port will come looking.',
} as const;

export const CREDITS: readonly { role: string; name: string }[] = [
  { role: 'Created for', name: 'mekroket' },
  { role: 'Direction, code and procedural art', name: 'Claude Code specialist agents' },
  { role: 'Rendering', name: 'Babylon.js' },
  { role: 'Physics', name: 'Havok (WebAssembly)' },
  { role: 'Audio', name: 'Synthesised live with the Web Audio API' },
  { role: 'Typefaces', name: 'Barlow Condensed, Share Tech Mono (SIL OFL)' },
];
