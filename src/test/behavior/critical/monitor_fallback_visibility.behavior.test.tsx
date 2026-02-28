import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { SettingsView } from '../../../components/settings-view';
import { useAppStore } from '../../../store/use-app-store';
import { dualMonitors } from '../fixtures/monitors';
import { validSessionSummary, validMarkdown } from '../fixtures/sessions';
import { resetAppState } from '../harness/reset-app-state';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true
}));

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
  emitLanguageChanged: vi.fn(),
  emitThemeChanged: vi.fn(),
  exportDiagnostics: vi.fn(),
  getLastMainMonitorName: vi.fn(),
  getMonitors: vi.fn(),
  getRuntimeMonitorCount: vi.fn(),
  hideMainWindow: vi.fn(),
  listenForLanguageChanged: vi.fn(),
  listenForMainWindowShown: vi.fn(),
  listenForMonitorChanged: vi.fn(),
  listenForThemeChanged: vi.fn(),
  moveWindowToMonitor: vi.fn(),
  openOverlayWindow: vi.fn(),
  parseMonitorPreferenceKey: vi.fn(),
  registerShortcuts: vi.fn(),
  setLastMainMonitorName: vi.fn(),
  setOverlayAlwaysOnTop: vi.fn(),
  getOverlayAlwaysOnTopPreference: vi.fn()
}));

vi.mock('../../../lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tauri')>();
  return {
    ...actual,
    closeOverlayWindow: tauriMocks.closeOverlayWindow,
    emitLanguageChanged: tauriMocks.emitLanguageChanged,
    emitThemeChanged: tauriMocks.emitThemeChanged,
    exportDiagnostics: tauriMocks.exportDiagnostics,
    getLastMainMonitorName: tauriMocks.getLastMainMonitorName,
    getMonitors: tauriMocks.getMonitors,
    getRuntimeMonitorCount: tauriMocks.getRuntimeMonitorCount,
    getOverlayAlwaysOnTopPreference: tauriMocks.getOverlayAlwaysOnTopPreference,
    hideMainWindow: tauriMocks.hideMainWindow,
    listenForLanguageChanged: tauriMocks.listenForLanguageChanged,
    listenForMainWindowShown: tauriMocks.listenForMainWindowShown,
    listenForMonitorChanged: tauriMocks.listenForMonitorChanged,
    listenForThemeChanged: tauriMocks.listenForThemeChanged,
    moveWindowToMonitor: tauriMocks.moveWindowToMonitor,
    openOverlayWindow: tauriMocks.openOverlayWindow,
    parseMonitorPreferenceKey: tauriMocks.parseMonitorPreferenceKey,
    registerShortcuts: tauriMocks.registerShortcuts,
    setLastMainMonitorName: tauriMocks.setLastMainMonitorName,
    setOverlayAlwaysOnTop: tauriMocks.setOverlayAlwaysOnTop
  };
});

describe('Critical behavior: monitor fallback visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: validMarkdown
    });
    useAppStore.setState({
      loadInitialState: vi.fn().mockResolvedValue(undefined),
      persistActiveSession: vi.fn().mockResolvedValue(true)
    });

    tauriMocks.listenForLanguageChanged.mockResolvedValue(() => undefined);
    tauriMocks.listenForThemeChanged.mockResolvedValue(() => undefined);
    tauriMocks.listenForMainWindowShown.mockResolvedValue(() => undefined);
    tauriMocks.listenForMonitorChanged.mockResolvedValue(() => undefined);
    tauriMocks.getOverlayAlwaysOnTopPreference.mockReturnValue(true);
  });

  it('keeps app visible when saved monitor move fails at startup', async () => {
    tauriMocks.getLastMainMonitorName.mockReturnValue('Built-in Retina Display|3024x1964|0,0');
    tauriMocks.parseMonitorPreferenceKey.mockReturnValue({
      name: 'Built-in Retina Display',
      width: 3024,
      height: 1964,
      positionX: 0,
      positionY: 0
    });
    tauriMocks.moveWindowToMonitor.mockRejectedValue(new Error('monitor missing'));

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Session Library' })).toBeTruthy();
  });

  it('skips monitor move when saved key cannot be parsed', async () => {
    tauriMocks.getLastMainMonitorName.mockReturnValue('bad-key');
    tauriMocks.parseMonitorPreferenceKey.mockReturnValue(null);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Session Library' })).toBeTruthy();

    expect(tauriMocks.moveWindowToMonitor).not.toHaveBeenCalled();
  });

  it('keeps monitor picker usable when monitor metadata updates at runtime', async () => {
    tauriMocks.getMonitors.mockResolvedValue(dualMonitors);
    tauriMocks.getRuntimeMonitorCount.mockResolvedValue(2);
    tauriMocks.getLastMainMonitorName.mockReturnValue(dualMonitors[0]?.compositeKey ?? null);

    render(<SettingsView />);

    expect(await screen.findByRole('button', {
      name: /Built-in Retina Display \(1512 x 982\)/i
    })).toBeTruthy();
  });
});
