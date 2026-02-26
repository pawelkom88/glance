import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultShortcutConfig,
  loadShortcutConfig,
  shortcutDefinitions,
  toShortcutBindings,
  validateShortcutConfig
} from './shortcuts';

const storageKey = `glance-shortcuts-${navigator.platform.toLowerCase()}`;

describe('shortcut config', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('builds defaults with platform primary modifier', () => {
    const config = defaultShortcutConfig();
    const expected = navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl';

    expect(config['toggle-overlay']).toBe(`${expected}+Shift+K`);
    expect(config['speed-up']).toBe(`${expected}+Up`);
    expect(config['speed-down']).toBe(`${expected}+Down`);
    expect(config['jump-1']).toBe(`${expected}+1`);
    expect(config['toggle-play']).toBe('Space');
  });

  it('migrates legacy toggle and restart defaults', () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        'toggle-play': 'CmdOrCtrl+Shift+S',
        'start-over': 'CmdOrCtrl+Shift+R'
      })
    );

    const loaded = loadShortcutConfig();

    expect(loaded['toggle-play']).toBe('Space');
    expect(loaded['start-over']).toBe('R');
  });

  it('rejects empty shortcuts', () => {
    const config = defaultShortcutConfig();
    config['toggle-play'] = '';

    expect(validateShortcutConfig(config)).toContain('cannot be empty');
  });

  it('rejects duplicate shortcuts with descriptive message', () => {
    const config = defaultShortcutConfig();
    config['toggle-play'] = 'Space';
    config['start-over'] = 'Space';

    const validation = validateShortcutConfig(config);
    expect(validation).toContain('Duplicate shortcut');
    expect(validation).toContain('Play/Pause');
    expect(validation).toContain('Rewind');
  });

  it('converts config to bindings preserving definition order', () => {
    const config = defaultShortcutConfig();
    const bindings = toShortcutBindings(config);

    expect(bindings.map((binding) => binding.action)).toEqual(
      shortcutDefinitions.map((definition) => definition.action)
    );
    const toggleBinding = bindings.find((binding) => binding.action === 'toggle-overlay');
    expect(toggleBinding).toEqual({
      action: 'toggle-overlay',
      accelerator: config['toggle-overlay']
    });
  });
});
