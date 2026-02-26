import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let tauriRuntime = true;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => tauriRuntime
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn()
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn()
}));

vi.mock('../lib/tauri', () => ({
  clearLastMainMonitorName: vi.fn(),
  clearLastOverlayMonitorName: vi.fn(),
  exportDiagnostics: vi.fn().mockResolvedValue('/tmp/logs.zip'),
  getLastMainMonitorName: vi.fn().mockReturnValue(null),
  getLastOverlayMonitorName: vi.fn().mockReturnValue(null),
  getOverlayAlwaysOnTopPreference: vi.fn().mockReturnValue(true),
  listMonitors: vi.fn().mockResolvedValue([]),
  moveMainToMonitor: vi.fn().mockResolvedValue(undefined),
  moveOverlayToMonitor: vi.fn().mockResolvedValue(undefined),
  registerShortcuts: vi.fn().mockResolvedValue(undefined),
  setOverlayAlwaysOnTop: vi.fn().mockResolvedValue(undefined)
}));

import * as tauriBridge from '../lib/tauri';
import { useAppStore } from '../store/use-app-store';
import { SettingsView } from './settings-view';

const tauriMock = tauriBridge as unknown as {
  clearLastMainMonitorName: ReturnType<typeof vi.fn>;
  clearLastOverlayMonitorName: ReturnType<typeof vi.fn>;
  getLastMainMonitorName: ReturnType<typeof vi.fn>;
  getLastOverlayMonitorName: ReturnType<typeof vi.fn>;
  listMonitors: ReturnType<typeof vi.fn>;
  moveMainToMonitor: ReturnType<typeof vi.fn>;
  moveOverlayToMonitor: ReturnType<typeof vi.fn>;
  registerShortcuts: ReturnType<typeof vi.fn>;
};

function resetStore() {
  useAppStore.setState({
    themeMode: 'system',
    resolvedTheme: 'light',
    showReadingRuler: true,
    toastMessage: null,
    shortcutWarning: null
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  tauriRuntime = true;
  resetStore();
  tauriMock.getLastMainMonitorName.mockReturnValue(null);
  tauriMock.getLastOverlayMonitorName.mockReturnValue(null);
  tauriMock.listMonitors.mockResolvedValue([]);
  tauriMock.moveMainToMonitor.mockResolvedValue(undefined);
  tauriMock.moveOverlayToMonitor.mockResolvedValue(undefined);
  tauriMock.registerShortcuts.mockResolvedValue(undefined);
});

describe('SettingsView behavior', () => {
  it('updates theme and shows feedback toast', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('radio', { name: 'Light' }));

    expect(useAppStore.getState().themeMode).toBe('light');
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Appearance set to Light',
      variant: 'success'
    });
  });

  it('toggles reading ruler and shows toast', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('switch', { name: 'Show reading ruler' }));

    expect(useAppStore.getState().showReadingRuler).toBe(false);
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Reading ruler disabled',
      variant: 'success'
    });
  });

  it('shows validation warning and does not register shortcuts when config is invalid', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    const playPauseInput = await screen.findByLabelText('Play/Pause shortcut');
    await user.click(playPauseInput);
    await user.keyboard('{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Apply shortcuts' }));

    expect(tauriMock.registerShortcuts).not.toHaveBeenCalled();
    expect(useAppStore.getState().toastMessage?.variant).toBe('warning');
    expect(useAppStore.getState().toastMessage?.message).toContain('cannot be empty');
  });

  it('applies valid shortcuts and shows success toast', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    const playPauseInput = await screen.findByLabelText('Play/Pause shortcut');
    await user.click(playPauseInput);
    await user.keyboard('p');

    await user.click(screen.getByRole('button', { name: 'Apply shortcuts' }));

    await waitFor(() => {
      expect(tauriMock.registerShortcuts).toHaveBeenCalledTimes(1);
    });

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Shortcuts updated',
      variant: 'success'
    });
  });

  it('prevents shortcut registration in browser preview mode', async () => {
    tauriRuntime = false;

    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    const playPauseInput = await screen.findByLabelText('Play/Pause shortcut');
    await user.click(playPauseInput);
    await user.keyboard('p');

    await user.click(screen.getByRole('button', { name: 'Apply shortcuts' }));

    expect(tauriMock.registerShortcuts).not.toHaveBeenCalled();
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Global shortcuts are unavailable in browser preview.',
      variant: 'warning'
    });
  });

  it('moves app and prompter windows together when display is selected', async () => {
    const user = userEvent.setup();
    tauriMock.listMonitors.mockResolvedValue([
      { id: 'monitor-a', name: 'Display A', size: '2940x1912', origin: '0,0', primary: true },
      { id: 'monitor-b', name: 'Display B', size: '1920x1080', origin: '1470,0', primary: false }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', { name: /Auto \(Current Display\)/i });
    await user.click(pickerButton);
    await user.click(screen.getByRole('menuitemradio', { name: /Display B \(1920x1080, @ 1470,0\)/i }));

    await waitFor(() => {
      expect(tauriMock.moveOverlayToMonitor).toHaveBeenCalledWith('monitor-b');
      expect(tauriMock.moveMainToMonitor).toHaveBeenCalledWith('monitor-b');
    });
  });

  it('hydrates selected display from saved main monitor id', async () => {
    tauriMock.getLastMainMonitorName.mockReturnValue('monitor-b');
    tauriMock.listMonitors.mockResolvedValue([
      { id: 'monitor-a', name: 'Display A', size: '2940x1912', origin: '0,0', primary: true },
      { id: 'monitor-b', name: 'Display B', size: '1920x1080', origin: '1470,0', primary: false }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', { name: /Display B \(1920x1080, @ 1470,0\)/i });
    expect(pickerButton).toBeTruthy();
  });

  it('falls back to saved overlay monitor id when main monitor id is missing', async () => {
    tauriMock.getLastMainMonitorName.mockReturnValue(null);
    tauriMock.getLastOverlayMonitorName.mockReturnValue('monitor-a');
    tauriMock.listMonitors.mockResolvedValue([
      { id: 'monitor-a', name: 'Display A', size: '2940x1912', origin: '0,0', primary: true },
      { id: 'monitor-b', name: 'Display B', size: '1920x1080', origin: '1470,0', primary: false }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', { name: /Display A \(2940x1912, @ 0,0\)/i });
    expect(pickerButton).toBeTruthy();
  });

  it('auto display option clears saved monitor preferences', async () => {
    const user = userEvent.setup();
    tauriMock.getLastMainMonitorName.mockReturnValue('monitor-a');
    tauriMock.listMonitors.mockResolvedValue([
      { id: 'monitor-a', name: 'Display A', size: '2940x1912', origin: '0,0', primary: true },
      { id: 'monitor-b', name: 'Display B', size: '1920x1080', origin: '1470,0', primary: false }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', { name: /Display A \(2940x1912, @ 0,0\)/i });
    await user.click(pickerButton);
    await user.click(screen.getByRole('menuitemradio', { name: /Auto \(Current Display\)/i }));

    expect(tauriMock.clearLastMainMonitorName).toHaveBeenCalledTimes(1);
    expect(tauriMock.clearLastOverlayMonitorName).toHaveBeenCalledTimes(1);
    expect(tauriMock.moveMainToMonitor).not.toHaveBeenCalled();
    expect(tauriMock.moveOverlayToMonitor).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Auto \(Current Display\)/i })).toBeTruthy();
  });

  it('closes display menu on outside click and Escape', async () => {
    const user = userEvent.setup();
    tauriMock.listMonitors.mockResolvedValue([
      { id: 'monitor-a', name: 'Display A', size: '2940x1912', origin: '0,0', primary: true },
      { id: 'monitor-b', name: 'Display B', size: '1920x1080', origin: '1470,0', primary: false }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', { name: /Auto \(Current Display\)/i });
    await user.click(pickerButton);
    expect(screen.getByRole('menu', { name: /App display options/i })).toBeTruthy();

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: /App display options/i })).toBeNull();
    });

    await user.click(pickerButton);
    expect(screen.getByRole('menu', { name: /App display options/i })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: /App display options/i })).toBeNull();
    });
  });

  it('rolls back display selection and shows error when monitor move fails', async () => {
    const user = userEvent.setup();
    tauriMock.getLastMainMonitorName.mockReturnValue('monitor-a');
    tauriMock.listMonitors.mockResolvedValue([
      { id: 'monitor-a', name: 'Display A', size: '2940x1912', origin: '0,0', primary: true },
      { id: 'monitor-b', name: 'Display B', size: '1920x1080', origin: '1470,0', primary: false }
    ]);
    tauriMock.moveMainToMonitor.mockRejectedValue(new Error('Unable to move monitor'));

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', { name: /Display A \(2940x1912, @ 0,0\)/i });
    await user.click(pickerButton);
    await user.click(screen.getByRole('menuitemradio', { name: /Display B \(1920x1080, @ 1470,0\)/i }));

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'Unable to move monitor',
        variant: 'error'
      });
    });
    expect(screen.getByRole('button', { name: /Display A \(2940x1912, @ 0,0\)/i })).toBeTruthy();
  });
});
