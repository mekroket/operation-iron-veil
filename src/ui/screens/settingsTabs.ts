/** The content of each settings tab. */
import {
  PRESET_VALUES,
  type GameSettings,
  type GraphicsPreset,
  type QualityLevel,
  type SettingsStore,
} from '../../settings/settings';
import { keyList } from '../components';
import { h, type Disposer } from '../dom';
import { fullscreenRow, makeRowContext, segmentRow, sliderRow, toggleRow, type SettingRow } from './settingsWidgets';

export interface SettingsTab {
  readonly element: HTMLElement;
  readonly rows: readonly SettingRow[];
}

type NamedPreset = Exclude<GraphicsPreset, 'custom'>;
const PRESET_ORDER: readonly NamedPreset[] = ['low', 'medium', 'high', 'ultra'];

function matchesPreset(g: GameSettings['graphics'], preset: NamedPreset): boolean {
  const values = PRESET_VALUES[preset];
  return (
    Math.abs(values.resolutionScale - g.resolutionScale) < 0.001 &&
    values.shadowQuality === g.shadowQuality &&
    values.textureQuality === g.textureQuality &&
    values.postQuality === g.postQuality
  );
}

/** HIGH and ULTRA share these four values, so the preset already selected wins any tie. */
export function detectPreset(g: GameSettings['graphics']): GraphicsPreset {
  if (g.preset !== 'custom' && matchesPreset(g, g.preset)) return g.preset;
  return PRESET_ORDER.find((preset) => matchesPreset(g, preset)) ?? 'custom';
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const multiplier = (value: number): string => `${value.toFixed(2)}x`;

const OFF_LOW_MED_HIGH: readonly { value: QualityLevel | 'off'; label: string }[] = [
  { value: 'off', label: 'OFF' },
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
];
const LOW_MED_HIGH: readonly { value: QualityLevel; label: string }[] = [
  { value: 'low', label: 'LOW' },
  { value: 'medium', label: 'MED' },
  { value: 'high', label: 'HIGH' },
];

function tabPanel(rows: readonly SettingRow[], ...extra: HTMLElement[]): SettingsTab {
  const element = h('div', 'iv-tabpanel iv-stagger-rows');
  element.setAttribute('role', 'tabpanel');
  for (const row of rows) element.append(row.element);
  element.append(...extra);
  Array.from(element.children).forEach((child, index) => {
    (child as HTMLElement).style.setProperty('--i', String(Math.min(index, 8)));
  });
  return { element, rows };
}

export function graphicsTab(disposer: Disposer, store: SettingsStore): SettingsTab {
  const context = makeRowContext(disposer, store);

  /** Applies one edit, then works out whether the result still is a named preset. */
  const editGraphics = (draft: GameSettings, edit: (g: GameSettings['graphics']) => void): void => {
    edit(draft.graphics);
    draft.graphics.preset = detectPreset(draft.graphics);
  };

  const preset = segmentRow<NamedPreset>(context, {
    label: 'Quality preset',
    choices: PRESET_ORDER.map((value) => ({ value, label: value.toUpperCase() })),
    read: (s) => s.graphics.preset,
    write: (draft, value) => {
      Object.assign(draft.graphics, PRESET_VALUES[value]);
      draft.graphics.preset = value;
    },
  });
  const customTag = h('span', 'iv-tag iv-tag--accent', 'CUSTOM');
  preset.element.querySelector('.iv-row__text')?.append(customTag);
  const presetRow: SettingRow = {
    element: preset.element,
    sync(settings) {
      preset.sync(settings);
      customTag.hidden = settings.graphics.preset !== 'custom';
    },
  };

  const rows: SettingRow[] = [
    presetRow,
    sliderRow(context, {
      label: 'Resolution scale',
      min: 0.5,
      max: 1,
      step: 0.05,
      format: percent,
      read: (s) => s.graphics.resolutionScale,
      write: (draft, value) => editGraphics(draft, (g) => (g.resolutionScale = value)),
    }),
    segmentRow(context, {
      label: 'Shadow quality',
      choices: OFF_LOW_MED_HIGH,
      read: (s) => s.graphics.shadowQuality,
      write: (draft, value) => editGraphics(draft, (g) => (g.shadowQuality = value)),
    }),
    segmentRow(context, {
      label: 'Texture quality',
      hint: 'Applies on next load.',
      choices: LOW_MED_HIGH,
      read: (s) => s.graphics.textureQuality,
      write: (draft, value) => editGraphics(draft, (g) => (g.textureQuality = value)),
    }),
    segmentRow(context, {
      label: 'Post-processing',
      choices: OFF_LOW_MED_HIGH,
      read: (s) => s.graphics.postQuality,
      write: (draft, value) => editGraphics(draft, (g) => (g.postQuality = value)),
    }),
    toggleRow(context, {
      label: 'Adaptive resolution',
      hint: 'Lowers resolution when the frame rate falls under target.',
      read: (s) => s.graphics.adaptiveResolution,
      write: (draft, value) => {
        draft.graphics.adaptiveResolution = value;
      },
    }),
    toggleRow(context, {
      label: 'FPS counter',
      read: (s) => s.graphics.showFps,
      write: (draft, value) => {
        draft.graphics.showFps = value;
      },
    }),
  ];
  return tabPanel(rows);
}

export function audioTab(disposer: Disposer, store: SettingsStore): SettingsTab {
  const context = makeRowContext(disposer, store);
  const channels: readonly { key: keyof GameSettings['audio']; label: string }[] = [
    { key: 'master', label: 'Master' },
    { key: 'sfx', label: 'Effects' },
    { key: 'ambience', label: 'Ambience' },
    { key: 'voice', label: 'Voice' },
    { key: 'ui', label: 'Interface' },
  ];
  return tabPanel(
    channels.map(({ key, label }) =>
      sliderRow(context, {
        label,
        min: 0,
        max: 1,
        step: 0.01,
        format: percent,
        read: (s) => s.audio[key],
        write: (draft, value) => {
          draft.audio[key] = value;
        },
      }),
    ),
  );
}

export function controlsTab(disposer: Disposer, store: SettingsStore): SettingsTab {
  const context = makeRowContext(disposer, store);
  const rows: SettingRow[] = [
    sliderRow(context, {
      label: 'Mouse sensitivity',
      min: 0.1,
      max: 5,
      step: 0.05,
      format: multiplier,
      read: (s) => s.controls.sensitivity,
      write: (draft, value) => {
        draft.controls.sensitivity = value;
      },
    }),
    sliderRow(context, {
      label: 'ADS sensitivity',
      min: 0.1,
      max: 2,
      step: 0.05,
      format: multiplier,
      read: (s) => s.controls.adsSensitivity,
      write: (draft, value) => {
        draft.controls.adsSensitivity = value;
      },
    }),
    sliderRow(context, {
      label: 'Field of view',
      min: 55,
      max: 100,
      step: 1,
      format: (value) => `${Math.round(value)}°`,
      read: (s) => s.controls.fov,
      write: (draft, value) => {
        draft.controls.fov = value;
      },
    }),
    toggleRow(context, {
      label: 'Invert Y axis',
      read: (s) => s.controls.invertY,
      write: (draft, value) => {
        draft.controls.invertY = value;
      },
    }),
  ];
  const reference = h('div', 'iv-tabpanel__section');
  reference.append(h('h3', 'iv-section-label', 'KEY REFERENCE'), keyList());
  return tabPanel(rows, reference);
}

export function displayTab(disposer: Disposer, store: SettingsStore): SettingsTab {
  const context = makeRowContext(disposer, store);
  const rows: SettingRow[] = [
    toggleRow(context, {
      label: 'Fullscreen on start',
      hint: 'Enters fullscreen when a mission begins.',
      read: (s) => s.display.fullscreenOnStart,
      write: (draft, value) => {
        draft.display.fullscreenOnStart = value;
      },
    }),
    fullscreenRow(disposer),
  ];
  return tabPanel(rows);
}
