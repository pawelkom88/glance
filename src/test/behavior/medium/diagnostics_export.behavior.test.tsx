import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { save } from '@tauri-apps/plugin-dialog';
import { SettingsView } from '../../../components/settings-view';
import { resetAppState } from '../harness/reset-app-state';
import { useAppStore } from '../../../store/use-app-store';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn()
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn()
}));

const tauriMocks = vi.hoisted(() => ({
  exportDiagnostics: vi.fn(),
  getMonitors: vi.fn(),
  getRuntimeMonitorCount: vi.fn(),
  getLastMainMonitorName: vi.fn(),
  listenForMonitorChanged: vi.fn(),
  moveWindowToMonitor: vi.fn(),
  registerShortcuts: vi.fn(),
  setLastMainMonitorName: vi.fn(),
  getOverlayAlwaysOnTopPreference: vi.fn(),
  setOverlayAlwaysOnTop: vi.fn()
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
    setOverlayAlwaysOnTop: tauriMocks.setOverlayAlwaysOnTop
  };
});

const saveMock = save as unknown as ReturnType<typeof vi.fn>;

describe('Medium behavior: diagnostics export UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('shows success feedback after exporting diagnostics bundle', async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue('/tmp/glance-logs.zip');
    tauriMocks.exportDiagnostics.mockResolvedValue('/tmp/glance-logs.zip');

    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Support' }));
    await user.click(await screen.findByRole('button', { name: 'Export Logs' }));

    await waitFor(() => {
      expect(tauriMocks.exportDiagnostics).toHaveBeenCalledWith('/tmp/glance-logs.zip');
    });

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Logs exported successfully',
      variant: 'success'
    });
  });

  it('shows actionable error when diagnostics export fails', async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue('/tmp/glance-logs.zip');
    tauriMocks.exportDiagnostics.mockRejectedValue(new Error('disk is read-only'));

    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Support' }));
    await user.click(await screen.findByRole('button', { name: 'Export Logs' }));

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'disk is read-only',
        variant: 'error'
      });
    });
  });
});
