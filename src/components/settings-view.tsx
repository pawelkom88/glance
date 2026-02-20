import { useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
  clearLastOverlayMonitorName,
  getLastOverlayMonitorName,
  listMonitors,
  moveOverlayToMonitor,
  registerShortcuts,
  resetOverlayPosition,
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

export function SettingsView() {
  const [monitors, setMonitors] = useState<readonly MonitorInfo[]>([]);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(true);
  const [selectedMonitor, setSelectedMonitor] = useState('');
  const [shortcutConfig, setShortcutConfig] = useState<ShortcutConfig>(loadShortcutConfig);
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
      setShortcutWarning(null);
      showToast('Shortcuts updated', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shortcut registration failed';
      setShortcutWarning(message);
      showToast(message, 'error');
    }
  };

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
          value={shortcutConfig[definition.action]}
          onChange={(event) => {
            const value = event.target.value;
            setShortcutConfig((previous) => ({
              ...previous,
              [definition.action]: value
            }));
          }}
          aria-label={`${definition.label} shortcut`}
        />
      </label>
    );
  };

  return (
    <section className="panel settings-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Overlay Controls</h2>
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
              <span className="display-picker-chevron" aria-hidden="true">▾</span>
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

        <div className="setting-row">
          <div className="setting-copy">
            <span className="setting-title">Recenter Overlay</span>
          </div>
          <button
            type="button"
            className="cancel-button"
            onClick={async () => {
              try {
                await resetOverlayPosition();
                showToast('Overlay recentered', 'success');
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to recenter overlay';
                showToast(message, 'error');
              }
            }}
          >
            Recenter
          </button>
        </div>
      </div>

      <section className="shortcut-settings" aria-labelledby="shortcut-settings-title">
        <div className="shortcut-settings-head">
          <div>
            <h3 id="shortcut-settings-title">Shortcuts</h3>
            <p className="shortcut-settings-subtitle">Assign keys without overloading the interface.</p>
          </div>
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
              onClick={() => {
                void applyShortcutConfig(shortcutConfig);
              }}
            >
              Apply shortcuts
            </button>
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

            {showAdvancedJumpMappings ? (
              <div className="shortcut-grid shortcut-grid-advanced">
                {jumpActions.map((action) => renderShortcutInput(action, 'shortcut-advanced'))}
              </div>
            ) : null}
          </section>
        </div>

        
      </section>
    </section>
  );
}
