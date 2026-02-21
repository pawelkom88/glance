import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
  clearLastOverlayMonitorName,
  getLastOverlayMonitorName,
  listMonitors,
  moveOverlayToMonitor,
  registerShortcuts,
  setOverlayAlwaysOnTop
} from '../lib/tauri';
import {
  defaultShortcutConfig,
  loadShortcutConfig,
  saveShortcutConfig,
  type ShortcutActionId,
  shortcutDefinitions,
  toShortcutBindings,
  type ShortcutConfig,
  validateShortcutConfig
} from '../lib/shortcuts';
import { useAppStore } from '../store/use-app-store';
import type { MonitorInfo } from '../types';

const playbackActions: readonly ShortcutActionId[] = ['toggle-play', 'start-over', 'speed-up', 'speed-down'];
const jumpActions: readonly ShortcutActionId[] = [
  'jump-1',
  'jump-2',
  'jump-3',
  'jump-4',
  'jump-5',
  'jump-6',
  'jump-7',
  'jump-8',
  'jump-9'
];

function isMacPlatform(): boolean {
  return navigator.platform.includes('Mac');
}

function normalizeShortcutKey(key: string, code: string): string | null {
  if (code === 'Space' || key === ' ' || key === 'Spacebar') {
    return 'Space';
  }

  if (key === 'ArrowUp') {
    return 'Up';
  }
  if (key === 'ArrowDown') {
    return 'Down';
  }
  if (key === 'ArrowLeft') {
    return 'Left';
  }
  if (key === 'ArrowRight') {
    return 'Right';
  }

  if (key === 'Meta' || key === 'Control' || key === 'Alt' || key === 'Shift') {
    return null;
  }

  if (key === 'Esc') {
    return 'Escape';
  }

  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key;
}

function captureShortcutFromKeyboardEvent(event: ReactKeyboardEvent<HTMLInputElement>): string | null {
  const normalizedKey = normalizeShortcutKey(event.key, event.code);
  if (!normalizedKey) {
    return null;
  }

  const parts: string[] = [];
  if (isMacPlatform()) {
    if (event.metaKey) {
      parts.push('Cmd');
    }
    if (event.ctrlKey) {
      parts.push('Ctrl');
    }
  } else {
    if (event.ctrlKey) {
      parts.push('Ctrl');
    }
    if (event.metaKey) {
      parts.push('Meta');
    }
  }

  if (event.altKey) {
    parts.push('Alt');
  }

  if (event.shiftKey && normalizedKey !== 'Shift') {
    parts.push('Shift');
  }

  parts.push(normalizedKey);
  return parts.join('+');
}

export function SettingsView() {
  const [monitors, setMonitors] = useState<readonly MonitorInfo[]>([]);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(true);
  const [selectedMonitor, setSelectedMonitor] = useState('');
  const [shortcutConfig, setShortcutConfig] = useState<ShortcutConfig>(loadShortcutConfig);
  const [savedShortcutConfig, setSavedShortcutConfig] = useState<ShortcutConfig>(loadShortcutConfig);
  const [isDisplayMenuOpen, setIsDisplayMenuOpen] = useState(false);
  const [showAdvancedJumpMappings, setShowAdvancedJumpMappings] = useState(false);
  const displayMenuRef = useRef<HTMLDivElement | null>(null);
  const displayMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const showToast = useAppStore((state) => state.showToast);
  const setShortcutWarning = useAppStore((state) => state.setShortcutWarning);
  const shortcutUnavailable = useMemo(() => !isTauri(), []);
  const shortcutDefinitionMap = useMemo(
    () => new Map(shortcutDefinitions.map((definition) => [definition.action, definition])),
    []
  );
  const jumpPattern = useMemo(
    () => (navigator.platform.includes('Mac') ? '⌘ + 1…9' : 'Ctrl + 1…9'),
    []
  );
  const selectedMonitorLabel = useMemo(() => {
    if (!selectedMonitor) {
      return 'Auto (Current Display)';
    }

    const found = monitors.find((monitor) => monitor.name === selectedMonitor);
    if (!found) {
      return selectedMonitor;
    }

    return `${found.name}${found.primary ? ' • Primary' : ''}`;
  }, [monitors, selectedMonitor]);
  const hasUnsavedShortcutChanges = useMemo(
    () => shortcutDefinitions.some((definition) => {
      return shortcutConfig[definition.action] !== savedShortcutConfig[definition.action];
    }),
    [savedShortcutConfig, shortcutConfig]
  );

  useEffect(() => {
    void listMonitors().then((items) => {
      setMonitors(items);
      const saved = getLastOverlayMonitorName();
      if (saved && items.some((item) => item.name === saved)) {
        setSelectedMonitor(saved);
      }
    });
  }, []);

  useEffect(() => {
    if (!isDisplayMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideMenu = displayMenuRef.current?.contains(target);
      const clickedButton = displayMenuButtonRef.current?.contains(target);
      if (!clickedInsideMenu && !clickedButton) {
        setIsDisplayMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsDisplayMenuOpen(false);
        displayMenuButtonRef.current?.focus();
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isDisplayMenuOpen]);

  const applyShortcutConfig = async (nextConfig: ShortcutConfig) => {
    const validationError = validateShortcutConfig(nextConfig);
    if (validationError) {
      setShortcutWarning(validationError);
      showToast(validationError, 'warning');
      return;
    }

    if (shortcutUnavailable) {
      const message = 'Global shortcuts are unavailable in browser preview.';
      setShortcutWarning(message);
      showToast(message, 'warning');
      return;
    }

    try {
      await registerShortcuts(toShortcutBindings(nextConfig));
      saveShortcutConfig(nextConfig);
      setSavedShortcutConfig(nextConfig);
      setShortcutWarning(null);
      showToast('Shortcuts updated', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shortcut registration failed';
      setShortcutWarning(message);
      showToast(message, 'error');
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withModifier = event.metaKey || event.ctrlKey;
      if (!withModifier || event.key !== 'Enter' || !hasUnsavedShortcutChanges) {
        return;
      }

      event.preventDefault();
      void applyShortcutConfig(shortcutConfig);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [hasUnsavedShortcutChanges, shortcutConfig]);

  const updateDisplay = async (monitorName: string | null) => {
    setIsDisplayMenuOpen(false);

    if (!monitorName) {
      setSelectedMonitor('');
      clearLastOverlayMonitorName();
      return;
    }

    setSelectedMonitor(monitorName);
    await moveOverlayToMonitor(monitorName);
  };

  const renderShortcutInput = (action: ShortcutActionId, idPrefix: string = 'shortcut') => {
    const definition = shortcutDefinitionMap.get(action);
    if (!definition) {
      return null;
    }

    return (
      <label key={definition.action} className="shortcut-row" htmlFor={`${idPrefix}-${definition.action}`}>
        <span>{definition.label}</span>
        <input
          id={`${idPrefix}-${definition.action}`}
          type="text"
          readOnly
          value={shortcutConfig[definition.action]}
          placeholder="Press shortcut"
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              return;
            }

            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              return;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.blur();
              return;
            }

            const isClearKey = (event.key === 'Backspace' || event.key === 'Delete')
              && !event.metaKey
              && !event.ctrlKey
              && !event.altKey
              && !event.shiftKey;

            event.preventDefault();

            if (isClearKey) {
              setShortcutConfig((previous) => ({
                ...previous,
                [definition.action]: ''
              }));
              return;
            }

            const captured = captureShortcutFromKeyboardEvent(event);
            if (!captured) {
              return;
            }

            setShortcutConfig((previous) => ({
              ...previous,
              [definition.action]: captured
            }));
          }}
          aria-label={`${definition.label} shortcut`}
        />
        <small className="shortcut-capture-hint">Focus and press keys to record</small>
      </label>
    );
  };

  return (
    <section className="panel settings-panel">
      <header className="panel-header">
        <div>
          <h2>Settings</h2>
        </div>
      </header>

      <div className="settings-list">
        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-title">Always on Top</span>
          </div>
          <button
            type="button"
            className={`setting-switch ${alwaysOnTop ? 'is-on' : ''}`}
            role="switch"
            aria-checked={alwaysOnTop}
            aria-label="Always on top"
            onClick={async () => {
              const value = !alwaysOnTop;
              setAlwaysOnTopState(value);
              await setOverlayAlwaysOnTop(value);
            }}
          >
            <span className="setting-switch-thumb" />
          </button>
        </div>

        <div className="setting-row setting-row-display">
          <div className="setting-copy">
            <span className="setting-title">Display</span>
            <span className="setting-subtitle">Choose where overlay opens by default.</span>
          </div>
          <div className="display-picker" ref={displayMenuRef}>
            <button
              ref={displayMenuButtonRef}
              type="button"
              className="display-picker-button"
              aria-haspopup="menu"
              aria-expanded={isDisplayMenuOpen}
              onClick={() => setIsDisplayMenuOpen((previous) => !previous)}
            >
              <span>{selectedMonitorLabel}</span>
              <span className="display-picker-chevron" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d={isDisplayMenuOpen ? "M9 6L15 12L9 18" : "M15 6L9 12L15 18"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg></span>
            </button>

            {isDisplayMenuOpen ? (
              <div className="display-picker-menu" role="menu" aria-label="Display options">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={selectedMonitor === ''}
                  className="display-picker-option"
                  onClick={() => {
                    void updateDisplay(null);
                  }}
                >
                  <span>Auto (Current Display)</span>
                  <span className="display-picker-check" aria-hidden="true">{selectedMonitor === '' ? '✓' : ''}</span>
                </button>

                {monitors.map((monitor) => {
                  const isSelected = selectedMonitor === monitor.name;
                  return (
                    <button
                      key={monitor.name}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      className="display-picker-option"
                      onClick={() => {
                        void updateDisplay(monitor.name);
                      }}
                    >
                      <span>{monitor.name} ({monitor.size}){monitor.primary ? ' • Primary' : ''}</span>
                      <span className="display-picker-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

      </div>

      <section className="shortcut-settings" aria-labelledby="shortcut-settings-title">
        <div className="shortcut-settings-head">
          <div>
            <h3 id="shortcut-settings-title">Shortcuts</h3>
            <p className="shortcut-settings-subtitle">Assign keys without overloading the interface.</p>
          </div>
        </div>

        <div className="shortcut-groups">
          <section className="shortcut-group" aria-labelledby="shortcuts-playback">
            <h4 id="shortcuts-playback">Playback</h4>
            <div className="shortcut-grid">
              {playbackActions.map((action) => renderShortcutInput(action))}
            </div>
          </section>

          <section className="shortcut-group" aria-labelledby="shortcuts-navigation">
            <h4 id="shortcuts-navigation">Section Navigation</h4>
            <div className="shortcut-static-row">
              <span>Jump to Section</span>
              <code>{jumpPattern}</code>
            </div>
            <p className="shortcut-helper">Hotkeys cover first 9 sections.</p>
            <button
              type="button"
              className="ghost-button shortcut-disclosure-button"
              aria-expanded={showAdvancedJumpMappings}
              onClick={() => setShowAdvancedJumpMappings((previous) => !previous)}
            >
              {showAdvancedJumpMappings ? 'Hide Advanced Jump Keys' : 'Customize Jump Keys'}
            </button>

            <div
              className="shortcut-advanced-wrapper"
            >
              {showAdvancedJumpMappings ? (
                <div className="shortcut-grid shortcut-grid-advanced">
                  {jumpActions.map((action) => renderShortcutInput(action, 'shortcut-advanced'))}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="shortcut-action-bar" role="region" aria-label="Shortcut actions">
          <p className={`shortcut-change-indicator ${hasUnsavedShortcutChanges ? 'is-dirty' : ''}`}>
            {hasUnsavedShortcutChanges ? 'Unsaved shortcut changes' : 'All shortcut changes applied'}
          </p>
          <div className="shortcut-settings-actions">
            <button
              type="button"
              className="cancel-button"
              onClick={() => {
                const defaults = defaultShortcutConfig();
                setShortcutConfig(defaults);
                void applyShortcutConfig(defaults);
              }}
            >
              Restore defaults
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!hasUnsavedShortcutChanges}
              onClick={() => {
                void applyShortcutConfig(shortcutConfig);
              }}
            >
              Apply shortcuts
            </button>
          </div>
        </div>
      </section>
    </section>
  );
}
