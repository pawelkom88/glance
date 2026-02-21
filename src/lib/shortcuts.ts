export type ShortcutActionId =
  | 'toggle-play'
  | 'speed-up'
  | 'speed-down'
  | 'start-over'
  | 'jump-1'
  | 'jump-2'
  | 'jump-3'
  | 'jump-4'
  | 'jump-5'
  | 'jump-6'
  | 'jump-7'
  | 'jump-8'
  | 'jump-9';

export interface ShortcutBinding {
  readonly action: ShortcutActionId;
  readonly accelerator: string;
}

export type ShortcutConfig = Record<ShortcutActionId, string>;

export interface ShortcutDefinition {
  readonly action: ShortcutActionId;
  readonly label: string;
}

export const shortcutDefinitions: readonly ShortcutDefinition[] = [
  { action: 'toggle-play', label: 'Play/Pause' },
  { action: 'start-over', label: 'Rewind' },
  { action: 'speed-up', label: 'Speed Up' },
  { action: 'speed-down', label: 'Speed Down' },
  { action: 'jump-1', label: 'Jump Section 1' },
  { action: 'jump-2', label: 'Jump Section 2' },
  { action: 'jump-3', label: 'Jump Section 3' },
  { action: 'jump-4', label: 'Jump Section 4' },
  { action: 'jump-5', label: 'Jump Section 5' },
  { action: 'jump-6', label: 'Jump Section 6' },
  { action: 'jump-7', label: 'Jump Section 7' },
  { action: 'jump-8', label: 'Jump Section 8' },
  { action: 'jump-9', label: 'Jump Section 9' }
];

const storageKey = `glance-shortcuts-${navigator.platform.toLowerCase()}`;

function platformPrimaryModifier(): 'Cmd' | 'Ctrl' {
  return navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl';
}

function migrateModifier(accelerator: string): string {
  return accelerator.replace(/CmdOrCtrl/gi, platformPrimaryModifier());
}

function migrateLegacyDefaults(config: ShortcutConfig): ShortcutConfig {
  const next = { ...config };
  const primary = platformPrimaryModifier();
  const legacyToggle = `${primary}+Shift+S`.toLowerCase();
  const legacyStartOver = `${primary}+Shift+R`.toLowerCase();

  if ((next['toggle-play'] ?? '').trim().toLowerCase() === legacyToggle) {
    next['toggle-play'] = 'Space';
  }

  if ((next['start-over'] ?? '').trim().toLowerCase() === legacyStartOver) {
    next['start-over'] = 'R';
  }

  return next;
}

export function defaultShortcutConfig(): ShortcutConfig {
  const modifier = platformPrimaryModifier();
  return {
    'toggle-play': 'Space',
    'start-over': 'R',
    'speed-up': `${modifier}+Up`,
    'speed-down': `${modifier}+Down`,
    'jump-1': `${modifier}+1`,
    'jump-2': `${modifier}+2`,
    'jump-3': `${modifier}+3`,
    'jump-4': `${modifier}+4`,
    'jump-5': `${modifier}+5`,
    'jump-6': `${modifier}+6`,
    'jump-7': `${modifier}+7`,
    'jump-8': `${modifier}+8`,
    'jump-9': `${modifier}+9`
  };
}

export function loadShortcutConfig(): ShortcutConfig {
  const defaults = defaultShortcutConfig();
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShortcutConfig>;
    const migrated = Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, typeof value === 'string' ? migrateModifier(value) : value])
    ) as Partial<ShortcutConfig>;
    return migrateLegacyDefaults({ ...defaults, ...migrated });
  } catch {
    return defaults;
  }
}

export function saveShortcutConfig(config: ShortcutConfig): void {
  window.localStorage.setItem(storageKey, JSON.stringify(config));
}

export function toShortcutBindings(config: ShortcutConfig): ShortcutBinding[] {
  return shortcutDefinitions.map((item) => ({
    action: item.action,
    accelerator: config[item.action]
  }));
}

export function validateShortcutConfig(config: ShortcutConfig): string | null {
  const normalized = new Map<string, ShortcutActionId>();

  for (const definition of shortcutDefinitions) {
    const value = config[definition.action]?.trim();
    if (!value) {
      return `Shortcut for "${definition.label}" cannot be empty.`;
    }

    const key = value.toLowerCase();
    const existing = normalized.get(key);
    if (existing) {
      const existingLabel = shortcutDefinitions.find((item) => item.action === existing)?.label ?? existing;
      return `Duplicate shortcut "${value}" is assigned to both "${existingLabel}" and "${definition.label}".`;
    }

    normalized.set(key, definition.action);
  }

  return null;
}
