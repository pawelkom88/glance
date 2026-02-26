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
  exportDiagnostics: vi.fn().mockResolvedValue('/tmp/logs.zip'),
  getLastMainMonitorName: vi.fn().mockReturnValue(null),
  getMonitors: vi.fn().mockResolvedValue([]),
  getOverlayAlwaysOnTopPreference: vi.fn().mockReturnValue(true),
  moveWindowToMonitor: vi.fn().mockResolvedValue(undefined),
  registerShortcuts: vi.fn().mockResolvedValue(undefined),
  setOverlayAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  toMonitorPreferenceKey: (name: string, width: number, height: number) => `${name}|${width}x${height}`
}));

import * as tauriBridge from '../lib/tauri';
import { useAppStore } from '../store/use-app-store';
import { SettingsView } from './settings-view';

const tauriMock = tauriBridge as unknown as {
  getLastMainMonitorName: ReturnType<typeof vi.fn>;
  getMonitors: ReturnType<typeof vi.fn>;
  moveWindowToMonitor: ReturnType<typeof vi.fn>;
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

function setPlatform(value: string): void {
  Object.defineProperty(window.navigator, 'platform', {
    value,
    configurable: true
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  tauriRuntime = true;
  setPlatform('MacIntel');
  resetStore();
  tauriMock.getLastMainMonitorName.mockReturnValue(null);
  tauriMock.getMonitors.mockResolvedValue([]);
  tauriMock.moveWindowToMonitor.mockResolvedValue(undefined);
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

  it('moves window when display is selected', async () => {
    const user = userEvent.setup();
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: false,
        positionX: 1512,
        positionY: 0,
        logicalWidth: 1920,
        logicalHeight: 1080
      }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', {
      name: /Built-in Retina Display \(1512 x 982\)/i
    });
    await user.click(pickerButton);
    await user.click(screen.getByRole('menuitemradio', { name: /DELL U2722D \(1920 x 1080\)/i }));

    await waitFor(() => {
      expect(tauriMock.moveWindowToMonitor).toHaveBeenCalledWith('DELL U2722D', 1920, 1080);
    });
  });

  it('hydrates selected display from saved composite key', async () => {
    tauriMock.getLastMainMonitorName.mockReturnValue('DELL U2722D|1920x1080');
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: false,
        positionX: 1512,
        positionY: 0,
        logicalWidth: 1920,
        logicalHeight: 1080
      }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', {
      name: /DELL U2722D \(1920 x 1080\)/i
    });
    expect(pickerButton).toBeTruthy();
  });

  it('disables display picker when there is no swap target', async () => {
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', {
      name: /Built-in Retina Display \(1512 x 982\)/i
    });
    expect((pickerButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('menu', { name: /App display options/i })).toBeNull();
  });

  it('shows fallback message when display detection fails', async () => {
    tauriMock.getMonitors.mockResolvedValue([]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', {
      name: /Unable to detect displays\. Please restart the app\./i
    });
    expect((pickerButton as HTMLButtonElement).disabled).toBe(true);
  });

  it('closes display menu on outside click and Escape', async () => {
    const user = userEvent.setup();
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: false,
        positionX: 1512,
        positionY: 0,
        logicalWidth: 1920,
        logicalHeight: 1080
      }
    ]);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', {
      name: /Built-in Retina Display \(1512 x 982\)/i
    });
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

  it('rolls back display selection and shows error when move fails', async () => {
    const user = userEvent.setup();
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        width: 1920,
        height: 1080,
        scaleFactor: 1,
        isPrimary: false,
        positionX: 1512,
        positionY: 0,
        logicalWidth: 1920,
        logicalHeight: 1080
      }
    ]);
    tauriMock.moveWindowToMonitor.mockRejectedValue(new Error('Unable to move monitor'));

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', {
      name: /Built-in Retina Display \(1512 x 982\)/i
    });
    await user.click(pickerButton);
    await user.click(screen.getByRole('menuitemradio', { name: /DELL U2722D \(1920 x 1080\)/i }));

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'Unable to move monitor',
        variant: 'error'
      });
    });
    expect(screen.getByRole('button', { name: /Built-in Retina Display \(1512 x 982\)/i })).toBeTruthy();
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
});
