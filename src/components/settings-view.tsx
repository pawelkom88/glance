import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { save } from '@tauri-apps/plugin-dialog';
import {
  exportDiagnostics,
  getMonitors,
  getRuntimeMonitorCount,
  getLastMainMonitorName,
  getOverlayAlwaysOnTopPreference,
  listenForMonitorChanged,
  moveWindowToMonitor,
  setLastMainMonitorName,
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
import type { DetectedMonitor, MonitorChangedPayload, ThemeMode } from '../types';
import { ShortcutKeycaps } from './shortcut-keycaps';

const playbackActions: readonly ShortcutActionId[] = ['toggle-play', 'start-over', 'speed-up', 'speed-down'];
const globalActions: readonly ShortcutActionId[] = ['toggle-overlay', 'snap-to-center'];
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
type SettingsTab = 'general' | 'shortcuts' | 'support';

interface DisplayOption extends DetectedMonitor {
  readonly key: string;
  readonly displayName: string;
  readonly logicalResolutionLabel: string;
}

function isMacPlatform(): boolean {
  return navigator.platform.includes('Mac');
}

function isWindowsPlatform(): boolean {
  return navigator.platform.toLowerCase().includes('win');
}

function singleMonitorDisplayMessage(): string {
  if (isWindowsPlatform()) {
    return 'Your primary display will be used.';
  }
  return 'Opening on your primary display.';
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

function toDisplayOptions(monitors: readonly DetectedMonitor[]): DisplayOption[] {
  return monitors.map((monitor, index) => ({
    ...monitor,
    key: monitor.compositeKey,
    displayName: monitor.displayName || monitor.name || `Display ${index + 1}`,
    logicalResolutionLabel: `${Math.round(monitor.logicalWidth)} x ${Math.round(monitor.logicalHeight)}`
  }));
}

function toFallbackDisplayOption(payload: MonitorChangedPayload): DisplayOption {
  return {
    name: payload.name,
    displayName: payload.displayName,
    width: payload.width,
    height: payload.height,
    compositeKey: payload.compositeKey,
    scaleFactor: 1,
    isPrimary: false,
    positionX: 0,
    positionY: 0,
    logicalWidth: payload.width,
    logicalHeight: payload.height,
    key: payload.compositeKey,
    logicalResolutionLabel: `${payload.width} x ${payload.height}`
  };
}

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [monitors, setMonitors] = useState<readonly DisplayOption[]>([]);
  const [runtimeMonitorCount, setRuntimeMonitorCount] = useState<number | null>(null);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(() => getOverlayAlwaysOnTopPreference());
  const [selectedMonitor, setSelectedMonitor] = useState('');
  const [displayLoadError, setDisplayLoadError] = useState(false);
  const [shortcutConfig, setShortcutConfig] = useState<ShortcutConfig>(loadShortcutConfig);
  const [savedShortcutConfig, setSavedShortcutConfig] = useState<ShortcutConfig>(loadShortcutConfig);
  const [shortcutErrors, setShortcutErrors] = useState<Record<string, string>>({});
  const [isDisplayMenuOpen, setIsDisplayMenuOpen] = useState(false);
  const [showAdvancedJumpMappings, setShowAdvancedJumpMappings] = useState(false);
  const displayMenuRef = useRef<HTMLDivElement | null>(null);
  const displayMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const showToast = useAppStore((state) => state.showToast);
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const showReadingRuler = useAppStore((state) => state.showReadingRuler);
  const setShowReadingRuler = useAppStore((state) => state.setShowReadingRuler);
  const setShortcutWarning = useAppStore((state) => state.setShortcutWarning);
  const shortcutUnavailable = useMemo(() => !isTauri(), []);
  const shortcutDefinitionMap = useMemo(
    () => new Map(shortcutDefinitions.map((definition) => [definition.action, definition])),
    []
  );
  const activeMonitor = useMemo(
    () => monitors.find((monitor) => monitor.key === selectedMonitor) ?? monitors[0] ?? null,
    [monitors, selectedMonitor]
  );
  const activeMonitorId = activeMonitor?.key ?? '';
  const swapTargets = useMemo(
    () => monitors.filter((monitor) => monitor.key !== activeMonitorId),
    [activeMonitorId, monitors]
  );
  const canSwapDisplay = swapTargets.length > 0 && !displayLoadError;
  const shouldShowSingleDisplayMessage = !displayLoadError && runtimeMonitorCount === 1 && monitors.length === 1;
  const singleDisplayMessage = useMemo(() => singleMonitorDisplayMessage(), []);
  const selectedMonitorLabel = useMemo(() => {
    if (displayLoadError || monitors.length === 0) {
      return 'Unable to detect displays. Please restart the app.';
    }

    if (!activeMonitor) {
      return 'Display unavailable';
    }

    return `${activeMonitor.displayName} (${activeMonitor.logicalResolutionLabel})${activeMonitor.isPrimary ? ' • Primary' : ''}`;
  }, [activeMonitor, displayLoadError, monitors.length]);
  const hasUnsavedShortcutChanges = useMemo(
    () => shortcutDefinitions.some((definition) => {
      return shortcutConfig[definition.action] !== savedShortcutConfig[definition.action];
    }),
    [savedShortcutConfig, shortcutConfig]
  );
  const shouldShowDisplaySetting = true;

  useEffect(() => {
    let isDisposed = false;

    void Promise.all([getMonitors(), getRuntimeMonitorCount()])
      .then(([items, runtimeCount]) => {
        if (isDisposed) {
          return;
        }

        setRuntimeMonitorCount(runtimeCount);
        const options = toDisplayOptions(items);
        setMonitors(options);
        setDisplayLoadError(options.length === 0);

        if (options.length === 0) {
          setSelectedMonitor('');
          return;
        }

        const savedMonitorKey = getLastMainMonitorName();
        if (savedMonitorKey && options.some((monitor) => monitor.key === savedMonitorKey)) {
          setSelectedMonitor(savedMonitorKey);
          return;
        }

        const primaryMonitorKey = options.find((monitor) => monitor.isPrimary)?.key;
        setSelectedMonitor(primaryMonitorKey ?? options[0].key);
      })
      .catch(() => {
        if (isDisposed) {
          return;
        }

        setMonitors([]);
        setRuntimeMonitorCount(null);
        setDisplayLoadError(true);
        setSelectedMonitor('');
      });

    return () => {
      isDisposed = true;
    };
  }, []);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void listenForMonitorChanged((payload) => {
      if (isDisposed) {
        return;
      }

      // Option A: keep monitor preference synced with the window's actual monitor.
      setLastMainMonitorName(payload.compositeKey);
      setSelectedMonitor(payload.compositeKey);

      void Promise.all([getMonitors(), getRuntimeMonitorCount()])
        .then(([items, runtimeCount]) => {
          if (isDisposed) {
            return;
          }

          setRuntimeMonitorCount(runtimeCount);
          const options = toDisplayOptions(items);
          if (options.length > 0) {
            setMonitors(options);
            setDisplayLoadError(false);
            if (options.some((option) => option.key === payload.compositeKey)) {
              return;
            }
          }

          const fallback = toFallbackDisplayOption(payload);
          setMonitors((previous) => {
            const withoutDuplicate = previous.filter((option) => option.key !== fallback.key);
            return [...withoutDuplicate, fallback];
          });
          setDisplayLoadError(false);
        })
        .catch(() => {
          if (isDisposed) {
            return;
          }

          setRuntimeMonitorCount(null);
          const fallback = toFallbackDisplayOption(payload);
          setMonitors((previous) => {
            const withoutDuplicate = previous.filter((option) => option.key !== fallback.key);
            return [...withoutDuplicate, fallback];
          });
          setDisplayLoadError(false);
        });
    }).then((detach) => {
      if (isDisposed) {
        detach();
        return;
      }
      unlisten = detach;
    });

    return () => {
      isDisposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldShowSingleDisplayMessage) {
      return;
    }
    setIsDisplayMenuOpen(false);
  }, [shouldShowSingleDisplayMessage]);

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
      setShortcutErrors({});
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
      setShortcutErrors({});
      showToast('Shortcuts updated', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shortcut registration failed';
      setShortcutWarning(message);

      // Attempt to map the error to a specific action
      const matchedAction = shortcutDefinitions.find((def) => message.includes(`for '${def.action}'`) || message.includes(`for ${def.action}`));
      if (matchedAction) {
        setShortcutErrors({ [matchedAction.action]: message });
      } else {
        setShortcutErrors({});
        showToast(message, 'error');
      }
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

  const updateDisplay = async (monitorKey: string) => {
    setIsDisplayMenuOpen(false);

    if (monitorKey === activeMonitorId) {
      return;
    }

    const targetMonitor = monitors.find((monitor) => monitor.key === monitorKey);
    if (!targetMonitor) {
      showToast('Selected display is no longer available', 'error');
      return;
    }

    const previousMonitor = activeMonitorId;
    setSelectedMonitor(monitorKey);
    try {
      await moveWindowToMonitor(targetMonitor.key);
      setSelectedMonitor(targetMonitor.key);
    } catch (error) {
      setSelectedMonitor(previousMonitor);
      const message = error instanceof Error ? error.message : 'Unable to move window to selected display';
      showToast(message, 'error');
    }
  };
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setIsDisplayMenuOpen(false);
  };

  const renderShortcutInput = (action: ShortcutActionId, idPrefix: string = 'shortcut') => {
    const definition = shortcutDefinitionMap.get(action);
    if (!definition) {
      return null;
    }
    const shortcutError = shortcutErrors[definition.action];
    const captureHint = 'Focus and press keys to record';

    return (
      <div key={definition.action} className={`shortcut-row ${shortcutError ? 'has-error' : ''}`}>
        <span className="shortcut-action-label">{definition.label}</span>
        <input
          id={`${idPrefix}-${definition.action}`}
          type="text"
          readOnly
          value={shortcutConfig[definition.action]}
          placeholder="Press shortcut"
          title={captureHint}
          className={shortcutError ? 'has-error' : ''}
          aria-invalid={Boolean(shortcutError)}
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
            setShortcutErrors((prev) => ({ ...prev, [definition.action]: '' }));
          }}
          aria-label={`${definition.label} shortcut`}
        />
        {shortcutError ? <small className="shortcut-row-error">{shortcutError}</small> : null}
      </div>
    );
  };

  return (
    <section className="panel settings-panel">
      <header className="panel-header settings-header">
        <h2>Settings</h2>
        <div className="tab-strip" role="tablist" aria-label="Settings tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'general'}
            className={`tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => handleTabChange('general')}
          >
            General
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'shortcuts'}
            className={`tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => handleTabChange('shortcuts')}
          >
            Shortcuts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'support'}
            className={`tab ${activeTab === 'support' ? 'active' : ''}`}
            onClick={() => handleTabChange('support')}
          >
            Support
          </button>
        </div>
      </header>

      <div className={`tab-content ${activeTab === 'general' ? 'visible' : ''}`}>
        <section className="settings-group" aria-labelledby="settings-appearance-label">
          <h3 id="settings-appearance-label" className="settings-group-label">Appearance</h3>
          <div className="settings-card">
            <div className="setting-row setting-row-appearance">
              <div className="setting-copy">
                <span className="setting-title">Theme</span>
                <span className="setting-subtitle">Follow system, or set manually.</span>
              </div>
              <div className="theme-segmented" role="radiogroup" aria-label="Appearance">
                {(['system', 'light', 'dark'] as const).map((mode) => {
                  const labels: Record<ThemeMode, string> = {
                    system: 'System',
                    light: 'Light',
                    dark: 'Dark'
                  };
                  const isSelected = themeMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`theme-segmented-option ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        if (mode === themeMode) {
                          return;
                        }
                        setThemeMode(mode);
                        showToast(`Appearance set to ${labels[mode]}`, 'success');
                      }}
                      onKeyDown={(event) => {
                        if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                          return;
                        }

                        event.preventDefault();
                        const themeModes: ThemeMode[] = ['system', 'light', 'dark'];
                        const currentIndex = themeModes.indexOf(themeMode);
                        const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
                        const nextIndex = (currentIndex + step + themeModes.length) % themeModes.length;
                        const nextMode = themeModes[nextIndex];
                        setThemeMode(nextMode);
                        showToast(`Appearance set to ${labels[nextMode]}`, 'success');
                      }}
                    >
                      {labels[mode]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-copy">
                <span className="setting-title">Reading Ruler</span>
                <span className="setting-subtitle">Show a focus band in the prompter overlay.</span>
              </div>
              <button
                type="button"
                className={`setting-switch ${showReadingRuler ? 'is-on' : ''}`}
                role="switch"
                aria-checked={showReadingRuler}
                aria-label="Show reading ruler"
                onClick={() => {
                  const next = !showReadingRuler;
                  setShowReadingRuler(next);
                  showToast(next ? 'Reading ruler enabled' : 'Reading ruler disabled', 'success');
                }}
              >
                <span className="setting-switch-thumb" />
              </button>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="settings-overlay-label">
          <h3 id="settings-overlay-label" className="settings-group-label">Overlay</h3>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-copy">
                <span className="setting-title">Always on Top</span>
                <span className="setting-subtitle">Keeps prompter on the top layer of your screen.</span>
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

            {shouldShowDisplaySetting ? (
              <div className="setting-row setting-row-display">
                <div className="setting-copy">
                  <span className="setting-title">App Display</span>
                  <span className="setting-subtitle">Where Glance opens.</span>
                </div>
                {shouldShowSingleDisplayMessage ? (
                  <span className="display-static-message" role="status">{singleDisplayMessage}</span>
                ) : (
                  <div className="display-picker" ref={displayMenuRef}>
                    <button
                      ref={displayMenuButtonRef}
                      type="button"
                      className="display-picker-button"
                      aria-haspopup="menu"
                      aria-expanded={canSwapDisplay ? isDisplayMenuOpen : false}
                      disabled={!canSwapDisplay}
                      onClick={() => {
                        if (!canSwapDisplay) {
                          return;
                        }
                        setIsDisplayMenuOpen((previous) => !previous);
                      }}
                    >
                      <span>{selectedMonitorLabel}</span>
                      <span className="display-picker-chevron" aria-hidden="true">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d={isDisplayMenuOpen ? "M9 6L15 12L9 18" : "M15 6L9 12L15 18"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>

                    {isDisplayMenuOpen && canSwapDisplay ? (
                      <div className="display-picker-menu" role="menu" aria-label="App display options">
                        {swapTargets.map((monitor) => {
                          const isSelected = activeMonitorId === monitor.key;
                          return (
                            <button
                              key={monitor.key}
                              type="button"
                              role="menuitemradio"
                              aria-checked={isSelected}
                              className="display-picker-option"
                              onClick={() => {
                                void updateDisplay(monitor.key);
                              }}
                            >
                              <span>{monitor.displayName} ({monitor.logicalResolutionLabel}){monitor.isPrimary ? ' • Primary' : ''}</span>
                              <span className="display-picker-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className={`tab-content ${activeTab === 'shortcuts' ? 'visible' : ''}`}>
        <section className="shortcut-settings">
          <div className="settings-group" aria-labelledby="shortcuts-playback">
            <h3 id="shortcuts-playback" className="settings-group-label">Playback Shortcuts</h3>
            <p className="shortcut-edit-hint">Click a shortcut field, then press keys to record. Press Delete to clear.</p>
            <div className="settings-card shortcut-group">
              {playbackActions.map((action) => renderShortcutInput(action))}
              <div className="shortcut-static-row">
                <span className="shortcut-action-label">Jump to Section</span>
                <ShortcutKeycaps shortcuts={['CmdOrCtrl+1', 'CmdOrCtrl+9']} alternativeSeparator="…" />
              </div>
              <div className="shortcut-navigation-actions">
                <button
                  type="button"
                  className="cancel-button shortcut-disclosure-button"
                  aria-expanded={showAdvancedJumpMappings}
                  onClick={() => setShowAdvancedJumpMappings((previous) => !previous)}
                >
                  {showAdvancedJumpMappings ? 'Hide Advanced Jump Keys' : 'Customize Jump Keys'}
                </button>
              </div>

              {showAdvancedJumpMappings ? (
                <div className="shortcut-advanced-wrapper">
                  <p className="shortcut-edit-hint shortcut-edit-hint-advanced">Advanced jump keys can also be edited the same way.</p>
                  {jumpActions.map((action) => renderShortcutInput(action, 'shortcut-advanced'))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="settings-group" aria-labelledby="shortcuts-builtin">
            <h3 id="shortcuts-builtin" className="settings-group-label">Built-In Controls</h3>
            <div className="settings-card shortcut-group shortcut-group-builtins">
              {globalActions.map((action) => renderShortcutInput(action))}
              <div className="shortcut-static-row">
                <span className="shortcut-action-label">Close Prompter</span>
                <ShortcutKeycaps shortcuts={['Esc', 'CmdOrCtrl+W']} />
              </div>
              <div className="shortcut-static-row">
                <span className="shortcut-action-label">Play / Pause</span>
                <ShortcutKeycaps shortcuts="Space" />
              </div>
              <div className="shortcut-static-row">
                <span className="shortcut-action-label">Restart Script</span>
                <ShortcutKeycaps shortcuts="R" />
              </div>
              <div className="shortcut-static-row">
                <span className="shortcut-action-label">Font Size</span>
                <ShortcutKeycaps shortcuts={['CmdOrCtrl+Plus', 'CmdOrCtrl+Minus', 'CmdOrCtrl+0']} />
              </div>
              <div className="shortcut-static-row">
                <span className="shortcut-action-label">Change Speed</span>
                <ShortcutKeycaps shortcuts={['Up', 'Down']} />
              </div>
            </div>
          </div>
        </section>

        <div className="shortcut-action-bar" role="region" aria-label="Shortcut actions">
          <div className="shortcut-settings-actions">
            <button
              type="button"
              className="cancel-button shortcut-restore-button"
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
              className="primary-button shortcut-apply-button"
              disabled={!hasUnsavedShortcutChanges}
              onClick={() => {
                void applyShortcutConfig(shortcutConfig);
              }}
            >
              Apply shortcuts
            </button>
          </div>
        </div>
      </div>

      <div className={`tab-content support-settings ${activeTab === 'support' ? 'visible' : ''}`}>
        <section className="settings-group" aria-labelledby="support-diagnostics">
          <h3 id="support-diagnostics" className="settings-group-label">Diagnostics</h3>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-copy">
                <span className="setting-title">Diagnostic Bundle</span>
                <span className="setting-subtitle">Zips local logs to your Desktop. Nothing sent automatically.</span>
              </div>
              <button
                type="button"
                className="cancel-button support-action-button"
                onClick={async () => {
                  if (!isTauri()) {
                    showToast('Diagnostics export is only available in the desktop app.', 'info');
                    return;
                  }
                  try {
                    const selectedPath = await save({
                      title: 'Export Diagnostic Logs',
                      defaultPath: 'Glance_Diagnostics.zip',
                      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
                    });

                    if (!selectedPath || Array.isArray(selectedPath)) {
                      return;
                    }

                    await exportDiagnostics(selectedPath);
                    showToast('Logs exported successfully', 'success');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Export failed';
                    showToast(message, 'error');
                  }
                }}
              >
                Export Logs
              </button>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="support-feedback">
          <h3 id="support-feedback" className="settings-group-label">Feedback</h3>
          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-copy">
                <span className="setting-title">Known Issues & Feedback</span>
                <span className="setting-subtitle">Browse issues or request features on GitHub.</span>
              </div>
              <button
                type="button"
                className="cancel-button support-action-button"
                onClick={() => {
                  void openUrl('https://github.com/pawelkom88/glance/issues');
                }}
              >
                Open GitHub
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
