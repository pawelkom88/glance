export type ShortcutActionId =
  | 'hide-overlay'
  | 'snap-to-center'
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
  | 'jump-9'
  | 'toggle-controls';

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
  { action: 'hide-overlay', label: 'settingsView.shortcuts.hidePrompter' },
  { action: 'snap-to-center', label: 'settingsView.shortcuts.snapToCenter' },
  { action: 'toggle-play', label: 'settingsView.shortcuts.playPause' },
  { action: 'start-over', label: 'settingsView.shortcuts.rewind' },
  { action: 'speed-up', label: 'settingsView.shortcuts.speedUp' },
  { action: 'speed-down', label: 'settingsView.shortcuts.speedDown' },
  { action: 'jump-1', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-2', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-3', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-4', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-5', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-6', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-7', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-8', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'jump-9', label: 'settingsView.shortcuts.jumpSection' },
  { action: 'toggle-controls', label: 'settingsView.shortcuts.toggleControls' }
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
    'hide-overlay': `${modifier}+Shift+K`,
    'snap-to-center': `${modifier}+Shift+L`,
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
    'jump-9': `${modifier}+9`,
    'toggle-controls': `${modifier}+J`
  };
}

export function loadShortcutConfig(): ShortcutConfig {
  const defaults = defaultShortcutConfig();
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ShortcutConfig> & { 'toggle-overlay'?: string };
    if (typeof parsed['toggle-overlay'] === 'string' && typeof parsed['hide-overlay'] !== 'string') {
      parsed['hide-overlay'] = parsed['toggle-overlay'];
    }
    delete parsed['toggle-overlay'];
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

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
}

export interface ShortcutKeyboardEvent {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function eventMatchesAccelerator(
  event: ShortcutKeyboardEvent,
  accelerator: string
): boolean {
  if (!accelerator || !accelerator.trim()) {
    return false;
  }

  const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return false;
  }

  const isMac = isMacPlatform();
  let expectedCtrl = false;
  let expectedMeta = false;
  let expectedAlt = false;
  let expectedShift = false;
  let keyToken: string | null = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'cmdorctrl' || lower === 'commandorcontrol') {
      if (isMac) {
        expectedMeta = true;
      } else {
        expectedCtrl = true;
      }
    } else if (lower === 'cmd' || lower === 'command') {
      expectedMeta = true;
    } else if (lower === 'ctrl' || lower === 'control') {
      expectedCtrl = true;
    } else if (lower === 'alt' || lower === 'option') {
      expectedAlt = true;
    } else if (lower === 'shift') {
      expectedShift = true;
    } else {
      keyToken = lower;
    }
  }

  if (!keyToken) {
    return false;
  }

  const actualCtrl = Boolean(event.ctrlKey);
  const actualMeta = Boolean(event.metaKey);
  const actualAlt = Boolean(event.altKey);
  const actualShift = Boolean(event.shiftKey);

  if (
    actualCtrl !== expectedCtrl ||
    actualMeta !== expectedMeta ||
    actualAlt !== expectedAlt ||
    actualShift !== expectedShift
  ) {
    return false;
  }

  const eventKey = (event.key || '').toLowerCase();
  const eventCode = (event.code || '').toLowerCase();

  // Space
  if (keyToken === 'space' || keyToken === 'spacebar') {
    return eventCode === 'space' || eventKey === ' ' || eventKey === 'space' || eventKey === 'spacebar';
  }

  // Arrow keys
  if (keyToken === 'up' || keyToken === 'arrowup') {
    return eventKey === 'arrowup' || eventCode === 'arrowup';
  }
  if (keyToken === 'down' || keyToken === 'arrowdown') {
    return eventKey === 'arrowdown' || eventCode === 'arrowdown';
  }
  if (keyToken === 'left' || keyToken === 'arrowleft') {
    return eventKey === 'arrowleft' || eventCode === 'arrowleft';
  }
  if (keyToken === 'right' || keyToken === 'arrowright') {
    return eventKey === 'arrowright' || eventCode === 'arrowright';
  }

  // Escape
  if (keyToken === 'escape' || keyToken === 'esc') {
    return eventKey === 'escape' || eventCode === 'escape';
  }

  // Return / Enter
  if (keyToken === 'enter' || keyToken === 'return') {
    return eventKey === 'enter' || eventCode === 'enter' || eventCode === 'numpadenter';
  }

  // Digits 0-9
  if (/^[0-9]$/.test(keyToken)) {
    return (
      eventKey === keyToken ||
      eventCode === `digit${keyToken}` ||
      eventCode === `numpad${keyToken}`
    );
  }

  // Plus / Equal
  if (keyToken === '+' || keyToken === 'plus' || keyToken === '=') {
    return eventKey === '+' || eventKey === '=' || eventCode === 'equal' || eventCode === 'numpadadd';
  }

  // Minus / Underscore
  if (keyToken === '-' || keyToken === 'minus' || keyToken === '_') {
    return eventKey === '-' || eventKey === '_' || eventCode === 'minus' || eventCode === 'numpadsubtract';
  }

  // Standard characters (letters, symbols)
  if (eventKey === keyToken) {
    return true;
  }

  // Check code format for keys: KeyA -> keytoken 'a'
  if (eventCode === `key${keyToken}`) {
    return true;
  }

  return false;
}

