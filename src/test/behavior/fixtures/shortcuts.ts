import { defaultShortcutConfig, type ShortcutConfig } from '../../../lib/shortcuts';

export function buildCustomShortcutConfig(): ShortcutConfig {
  const config = defaultShortcutConfig();
  return {
    ...config,
    'toggle-play': 'Shift+P',
    'speed-up': 'Alt+Up',
    'speed-down': 'Alt+Down'
  };
}

export function buildConflictingShortcutConfig(): ShortcutConfig {
  const config = defaultShortcutConfig();
  return {
    ...config,
    'toggle-play': 'Space',
    'start-over': 'Space'
  };
}
