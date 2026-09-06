import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultShortcutConfig,
  loadShortcutConfig,
  shortcutDefinitions,
  toShortcutBindings,
  validateShortcutConfig,
  eventMatchesAccelerator
} from './shortcuts';

const storageKey = `glance-shortcuts-${navigator.platform.toLowerCase()}`;

describe('shortcut config', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('builds defaults with platform primary modifier', () => {
    const config = defaultShortcutConfig();
    const expected = navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl';

    expect(config['hide-overlay']).toBe(`${expected}+Shift+K`);
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
    expect(validation).toContain('settingsView.shortcuts.playPause');
    expect(validation).toContain('settingsView.shortcuts.rewind');
  });

  it('converts config to bindings preserving definition order', () => {
    const config = defaultShortcutConfig();
    const bindings = toShortcutBindings(config);

    expect(bindings.map((binding) => binding.action)).toEqual(
      shortcutDefinitions.map((definition) => definition.action)
    );
    const toggleBinding = bindings.find((binding) => binding.action === 'hide-overlay');
    expect(toggleBinding).toEqual({
      action: 'hide-overlay',
      accelerator: config['hide-overlay']
    });
  });

  describe('eventMatchesAccelerator', () => {
    it('matches bare keys like Space and R without modifiers', () => {
      expect(eventMatchesAccelerator({ key: ' ', code: 'Space' }, 'Space')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'Spacebar', code: 'Space' }, 'Space')).toBe(true);
      expect(eventMatchesAccelerator({ key: ' ', code: 'Space', ctrlKey: true }, 'Space')).toBe(false);

      expect(eventMatchesAccelerator({ key: 'r', code: 'KeyR' }, 'R')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'R', code: 'KeyR' }, 'R')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'r', code: 'KeyR', altKey: true }, 'R')).toBe(false);
    });

    it('matches digit keys with modifiers for section jumps', () => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modProps = isMac ? { metaKey: true } : { ctrlKey: true };

      expect(eventMatchesAccelerator({ key: '1', code: 'Digit1', ...modProps }, 'CmdOrCtrl+1')).toBe(true);
      expect(eventMatchesAccelerator({ key: '9', code: 'Digit9', ...modProps }, 'CmdOrCtrl+9')).toBe(true);
      expect(eventMatchesAccelerator({ key: '1', code: 'Numpad1', ...modProps }, 'CmdOrCtrl+1')).toBe(true);
      expect(eventMatchesAccelerator({ key: '2', code: 'Digit2', ...modProps }, 'CmdOrCtrl+1')).toBe(false);
      expect(eventMatchesAccelerator({ key: '1', code: 'Digit1' }, 'CmdOrCtrl+1')).toBe(false);
    });

    it('matches arrow keys with modifiers for scroll speed', () => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modProps = isMac ? { metaKey: true } : { ctrlKey: true };

      expect(eventMatchesAccelerator({ key: 'ArrowUp', code: 'ArrowUp', ...modProps }, 'CmdOrCtrl+Up')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'ArrowDown', code: 'ArrowDown', ...modProps }, 'CmdOrCtrl+Down')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'ArrowUp', code: 'ArrowUp', shiftKey: true, ...modProps }, 'CmdOrCtrl+Up')).toBe(false);
    });

    it('matches multi-modifier accelerators like Ctrl+Shift+K', () => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modProps = isMac ? { metaKey: true, shiftKey: true } : { ctrlKey: true, shiftKey: true };

      expect(eventMatchesAccelerator({ key: 'k', code: 'KeyK', ...modProps }, 'CmdOrCtrl+Shift+K')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'K', code: 'KeyK', ...modProps }, 'CmdOrCtrl+Shift+K')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'k', code: 'KeyK', ctrlKey: true }, 'CmdOrCtrl+Shift+K')).toBe(false);
    });

    it('matches custom remapped shortcuts', () => {
      expect(eventMatchesAccelerator({ key: 'p', code: 'KeyP', shiftKey: true }, 'Shift+P')).toBe(true);
      expect(eventMatchesAccelerator({ key: 'F5', code: 'F5' }, 'F5')).toBe(true);
    });
  });
});

