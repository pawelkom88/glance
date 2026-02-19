import { useEffect, useState } from 'react';
import { listMonitors, moveOverlayToMonitor, resetOverlayPosition, setOverlayAlwaysOnTop } from '../lib/tauri';
import type { MonitorInfo } from '../types';

export function SettingsView() {
  const [monitors, setMonitors] = useState<readonly MonitorInfo[]>([]);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(true);
  const [selectedMonitor, setSelectedMonitor] = useState('');

  useEffect(() => {
    void listMonitors().then((items) => {
      setMonitors(items);
      const saved = window.localStorage.getItem('glance-last-monitor');
      if (saved && items.some((item) => item.name === saved)) {
        setSelectedMonitor(saved);
      }
    });
  }, []);

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
                window.localStorage.removeItem('glance-last-monitor');
                return;
              }

              await moveOverlayToMonitor(next);
            }}
          >
            <option value="">Auto (primary)</option>
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
    </section>
  );
}
