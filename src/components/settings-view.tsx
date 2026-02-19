import { useEffect, useMemo, useState } from 'react';
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
  shortcutDefinitions,
  toShortcutBindings,
  type ShortcutConfig,
  validateShortcutConfig
} from '../lib/shortcuts';
import { useAppStore } from '../store/use-app-store';
import type { MonitorInfo } from '../types';

export function SettingsView() {
  const [monitors, setMonitors] = useState<readonly MonitorInfo[]>([]);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(true);
  const [selectedMonitor, setSelectedMonitor] = useState('');
  const [shortcutConfig, setShortcutConfig] = useState<ShortcutConfig>(loadShortcutConfig);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  const showToast = useAppStore((state) => state.showToast);
  const setShortcutWarning = useAppStore((state) => state.setShortcutWarning);

  const shortcutUnavailable = useMemo(() => !isTauri(), []);

  useEffect(() => {
    void listMonitors().then((items) => {
      setMonitors(items);
      const saved = getLastOverlayMonitorName();
      if (saved && items.some((item) => item.name === saved)) {
        setSelectedMonitor(saved);
      }
    });
  }, []);

  const applyShortcutConfig = async (nextConfig: ShortcutConfig) => {
    const validationError = validateShortcutConfig(nextConfig);
    if (validationError) {
      setShortcutError(validationError);
      setShortcutWarning(validationError);
      showToast(validationError);
      return;
    }

    if (shortcutUnavailable) {
      const message = 'Global shortcuts are unavailable in browser preview.';
      setShortcutError(message);
      setShortcutWarning(message);
      showToast(message);
      return;
    }

    try {
      await registerShortcuts(toShortcutBindings(nextConfig));
      saveShortcutConfig(nextConfig);
      setShortcutError(null);
      setShortcutWarning(null);
      showToast('Shortcuts updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Shortcut registration failed';
      setShortcutError(message);
      setShortcutWarning(message);
      showToast(message);
    }
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
        <label className="setting-row" htmlFor="always-on-top">
          <span>Always on top</span>
          <input
            id="always-on-top"
            type="checkbox"
            checked={alwaysOnTop}
            onChange={async (event) => {
              const value = event.target.checked;
              setAlwaysOnTopState(value);
              await setOverlayAlwaysOnTop(value);
            }}
          />
        </label>

        <label className="setting-row" htmlFor="monitor-select">
          <span>Launch overlay on monitor</span>
          <select
            id="monitor-select"
            value={selectedMonitor}
            onChange={async (event) => {
              const next = event.target.value;
              setSelectedMonitor(next);

              if (!next) {
                clearLastOverlayMonitorName();
                return;
              }

              await moveOverlayToMonitor(next);
            }}
          >
            <option value="">Auto (main app display)</option>
            {monitors.map((monitor) => (
              <option key={monitor.name} value={monitor.name}>
                {monitor.name} ({monitor.size}){monitor.primary ? ' • Primary' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="setting-row">
          <span>Reset overlay position</span>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              void resetOverlayPosition();
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <section className="shortcut-settings" aria-labelledby="shortcut-settings-title">
        <div className="shortcut-settings-head">
          <div>
            <h3 id="shortcut-settings-title">Shortcuts</h3>
            <p className="shortcut-settings-subtitle">Assign keys to each action below.</p>
          </div>
          <div className="shortcut-settings-actions">
            <button
              type="button"
              className="ghost-button"
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

        <div className="shortcut-grid">
          {shortcutDefinitions.map((item) => (
            <label key={item.action} className="shortcut-row" htmlFor={`shortcut-${item.action}`}>
              <span>{item.label}</span>
              <input
                id={`shortcut-${item.action}`}
                type="text"
                value={shortcutConfig[item.action]}
                onChange={(event) => {
                  const value = event.target.value;
                  setShortcutConfig((previous) => ({
                    ...previous,
                    [item.action]: value
                  }));
                }}
                onBlur={() => {
                  void applyShortcutConfig(shortcutConfig);
                }}
                aria-label={`${item.label} shortcut`}
              />
            </label>
          ))}
        </div>

        {shortcutError ? <p className="warning-text shortcut-error">{shortcutError}</p> : null}
        {shortcutUnavailable ? (
          <p className="warning-text shortcut-error">Global shortcut registration works only in desktop runtime.</p>
        ) : null}
      </section>
    </section>
  );
}
