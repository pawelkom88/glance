import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from '../../../components/settings-view';
import { HelpView } from '../../../components/help-view';
import { defaultShortcutConfig } from '../../../lib/shortcuts';
import { resetAppState } from '../harness/reset-app-state';
import { useAppStore } from '../../../store/use-app-store';

let tauriRuntime = true;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => tauriRuntime
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn()
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  open: vi.fn(),
  ask: vi.fn()
}));

const tauriMocks = vi.hoisted(() => ({
  getMonitors: vi.fn(),
  getRuntimeMonitorCount: vi.fn(),
  getLastMainMonitorName: vi.fn(),
  listenForMonitorChanged: vi.fn(),
  moveWindowToMonitor: vi.fn(),
  registerShortcuts: vi.fn(),
  setLastMainMonitorName: vi.fn(),
  getOverlayAlwaysOnTopPreference: vi.fn(),
  setOverlayAlwaysOnTop: vi.fn(),
  exportDiagnostics: vi.fn(),
  openSessionsFolder: vi.fn(),
  readTextFile: vi.fn()
}));

vi.mock('../../../lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tauri')>();

  return {
    ...actual,
    exportDiagnostics: tauriMocks.exportDiagnostics,
    getMonitors: tauriMocks.getMonitors,
    getRuntimeMonitorCount: tauriMocks.getRuntimeMonitorCount,
    getLastMainMonitorName: tauriMocks.getLastMainMonitorName,
    listenForMonitorChanged: tauriMocks.listenForMonitorChanged,
    moveWindowToMonitor: tauriMocks.moveWindowToMonitor,
    registerShortcuts: tauriMocks.registerShortcuts,
    setLastMainMonitorName: tauriMocks.setLastMainMonitorName,
    getOverlayAlwaysOnTopPreference: tauriMocks.getOverlayAlwaysOnTopPreference,
    setOverlayAlwaysOnTop: tauriMocks.setOverlayAlwaysOnTop,
    openSessionsFolder: tauriMocks.openSessionsFolder,
    readTextFile: tauriMocks.readTextFile
  };
});

describe('High behavior: shortcut remap propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    tauriRuntime = true;

    resetAppState();

    tauriMocks.getMonitors.mockResolvedValue([]);
    tauriMocks.getRuntimeMonitorCount.mockResolvedValue(null);
    tauriMocks.getLastMainMonitorName.mockReturnValue(null);
    tauriMocks.listenForMonitorChanged.mockResolvedValue(() => undefined);
    tauriMocks.moveWindowToMonitor.mockResolvedValue(undefined);
    tauriMocks.registerShortcuts.mockResolvedValue(undefined);
    tauriMocks.getOverlayAlwaysOnTopPreference.mockReturnValue(true);
    tauriMocks.setOverlayAlwaysOnTop.mockResolvedValue(undefined);
  });

  it('applies remapped shortcut bindings and stores only new accelerator for the action', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    const playPauseInput = await screen.findByLabelText('settingsView.shortcuts.playPause shortcut');

    await user.click(playPauseInput);
    await user.keyboard('{Shift>}p{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Apply shortcuts' }));

    await waitFor(() => {
      expect(tauriMocks.registerShortcuts).toHaveBeenCalledTimes(1);
    });

    const payload = tauriMocks.registerShortcuts.mock.calls[0]?.[0] as readonly {
      action: string;
      accelerator: string;
    }[];

    const playPause = payload.find((item) => item.action === 'toggle-play');
    expect(playPause?.accelerator).toBe('Shift+P');

    const defaults = defaultShortcutConfig();
    expect(payload.some((item) => item.action === 'toggle-play' && item.accelerator === defaults['toggle-play'])).toBe(false);
  });

  it('rejects conflicting shortcut configs and keeps registration untouched', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    const rewindInput = await screen.findByLabelText('settingsView.shortcuts.rewind shortcut');

    await user.click(rewindInput);
    await user.keyboard('{Space}');

    await user.click(screen.getByRole('button', { name: 'Apply shortcuts' }));

    expect(tauriMocks.registerShortcuts).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(useAppStore.getState().toastMessage?.message).toMatch(/Duplicate shortcut/i);
    });
  });

  it('shows updated keycaps in Help after shortcut customization', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));
    const playPauseInput = await screen.findByLabelText('settingsView.shortcuts.playPause shortcut');

    await user.click(playPauseInput);
    await user.keyboard('{Shift>}p{/Shift}');
    await user.click(screen.getByRole('button', { name: 'Apply shortcuts' }));

    await waitFor(() => {
      expect(tauriMocks.registerShortcuts).toHaveBeenCalledTimes(1);
    });

    unmount();
    render(<HelpView />);
    const playPauseRow = screen.getByText('Play / Pause').closest('.help-shortcut-row');

    expect(playPauseRow).toBeTruthy();
    expect(playPauseRow?.textContent).toContain('Shift');
    expect(playPauseRow?.textContent).toContain('P');
    expect(playPauseRow?.textContent).not.toContain('Space');
  });
});
