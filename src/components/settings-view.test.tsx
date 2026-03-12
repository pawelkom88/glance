import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tauriRuntime = true;
let monitorChangedCallback: ((payload: {
  name: string;
  displayName: string;
  width: number;
  height: number;
  compositeKey: string;
}) => void) | null = null;
let licenseHookState = {
  status: {
    state: 'licensed' as const,
    licenseId: '3C49'
  },
  actionPending: false,
  error: null as string | null,
  onActivate: vi.fn(async () => true),
};

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

vi.mock('../hooks/useAppLicense', () => ({
  useAppLicense: () => licenseHookState
}));

vi.mock('../lib/tauri', () => ({
  emitLanguageChanged: vi.fn().mockResolvedValue(undefined),
  exportDiagnostics: vi.fn().mockResolvedValue('/tmp/logs.zip'),
  getLastMainMonitorName: vi.fn().mockReturnValue(null),
  getMonitors: vi.fn().mockResolvedValue([]),
  getRuntimeMonitorCount: vi.fn().mockResolvedValue(null),
  getOverlayAlwaysOnTopPreference: vi.fn().mockReturnValue(true),
  listenForMonitorChanged: vi.fn().mockImplementation(async (
    callback: (payload: {
      name: string;
      displayName: string;
      width: number;
      height: number;
      compositeKey: string;
    }) => void
  ) => {
    monitorChangedCallback = callback;
    return () => {
      monitorChangedCallback = null;
    };
  }),
  moveWindowToMonitor: vi.fn().mockResolvedValue(undefined),
  registerShortcuts: vi.fn().mockResolvedValue(undefined),
  setLastMainMonitorName: vi.fn(),
  setOverlayAlwaysOnTop: vi.fn().mockResolvedValue(undefined),
  toMonitorPreferenceKey: (name: string, width: number, height: number) => `${name}|${width}x${height}`
}));

import * as tauriBridge from '../lib/tauri';
import { useAppStore } from '../store/use-app-store';
import { SettingsView } from './settings-view';

const tauriMock = tauriBridge as unknown as {
  getLastMainMonitorName: ReturnType<typeof vi.fn>;
  getMonitors: ReturnType<typeof vi.fn>;
  getRuntimeMonitorCount: ReturnType<typeof vi.fn>;
  listenForMonitorChanged: ReturnType<typeof vi.fn>;
  moveWindowToMonitor: ReturnType<typeof vi.fn>;
  registerShortcuts: ReturnType<typeof vi.fn>;
  setLastMainMonitorName: ReturnType<typeof vi.fn>;
};
const originalAudioContext = globalThis.AudioContext;
const originalMediaDevices = navigator.mediaDevices;

function resetStore() {
  useAppStore.setState({
    themeMode: 'system',
    resolvedTheme: 'light',
    language: 'en',
    resolvedLanguage: 'en',
    showReadingRuler: true,
    vadEnabled: true,
    voicePauseDelayMs: 1500,
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
  monitorChangedCallback = null;
  tauriRuntime = true;
  licenseHookState = {
    status: {
      state: 'licensed',
      licenseId: '3C49'
    },
    actionPending: false,
    error: null,
    onActivate: vi.fn(async () => true),
  };
  setPlatform('MacIntel');
  resetStore();
  tauriMock.getLastMainMonitorName.mockReturnValue(null);
  tauriMock.getMonitors.mockResolvedValue([]);
  tauriMock.getRuntimeMonitorCount.mockResolvedValue(null);
  tauriMock.moveWindowToMonitor.mockResolvedValue(undefined);
  tauriMock.registerShortcuts.mockResolvedValue(undefined);
  tauriMock.setLastMainMonitorName.mockImplementation(() => undefined);
});

afterEach(() => {
  Object.defineProperty(globalThis, 'AudioContext', {
    value: originalAudioContext,
    configurable: true
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: originalMediaDevices,
    configurable: true
  });
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

  it('renders interface language dropdown and persists selected language', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    const languageSelect = screen.getByRole('combobox', { name: 'Interface Language' });
    expect((languageSelect as HTMLSelectElement).value).toBe('en');

    await user.selectOptions(languageSelect, 'es');

    expect(useAppStore.getState().language).toBe('es');
    expect(useAppStore.getState().resolvedLanguage).toBe('es');
    expect(window.localStorage.getItem('glance-language-v1')).toBe('es');
    expect(screen.getByText('Idioma de la interfaz')).toBeTruthy();
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Se guardó la preferencia del idioma de la interfaz.',
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

  it('requests microphone access before enabling voice auto-pause', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    } as unknown as MediaStream);

    useAppStore.setState({ vadEnabled: false });
    Object.defineProperty(globalThis, 'AudioContext', {
      value: vi.fn(),
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true
    });

    render(<SettingsView />);

    await user.click(screen.getByRole('switch', { name: 'Enable voice activity detection' }));

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    });
    expect(useAppStore.getState().vadEnabled).toBe(true);
  });

  it('keeps voice auto-pause off and shows an error when microphone permission is denied', async () => {
    const user = userEvent.setup();

    useAppStore.setState({ vadEnabled: false });
    Object.defineProperty(globalThis, 'AudioContext', {
      value: vi.fn(),
      configurable: true
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
      },
      configurable: true
    });

    render(<SettingsView />);

    await user.click(screen.getByRole('switch', { name: 'Enable voice activity detection' }));

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'Microphone access denied.',
        variant: 'error'
      });
    });
    expect(useAppStore.getState().vadEnabled).toBe(false);
  });

  it('shows a pause-delay slider with a visible value and updates the store', async () => {
    render(<SettingsView />);

    expect(screen.getByText('Pause After Silence')).toBeTruthy();
    expect(screen.getByText('How long Glance waits before pausing after you stop speaking.')).toBeTruthy();
    expect(screen.queryByText('VAD Sensitivity')).toBeNull();
    expect(screen.getByText('1.5s')).toBeTruthy();

    act(() => {
      fireEvent.change(screen.getByRole('slider', { name: 'Pause delay after silence' }), {
        target: { value: '2500' }
      });
    });

    expect(useAppStore.getState().voicePauseDelayMs).toBe(2500);
    expect(screen.getByText('2.5s')).toBeTruthy();
  });

  it('renders the support license card with active-state copy and no replacement warning before input', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Support' }));

    expect(await screen.findByRole('heading', { name: 'License', level: 3 })).toBeTruthy();
    expect(screen.getByText('License active')).toBeTruthy();
    expect(screen.getByText('This device is unlocked with a key ending in 3C49.')).toBeTruthy();
    expect(screen.getByPlaceholderText('XXXX-XXXX-XXXX-XXXX')).toBeTruthy();
    expect(screen.queryByText('This will replace your current license key ending in 3C49.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activate License' })).toBeTruthy();
  });

  it('clears typed input on cancel and activates a replacement license key from the support card', async () => {
    const user = userEvent.setup();
    licenseHookState.onActivate = vi.fn(async () => true);

    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Support' }));

    const licenseInput = await screen.findByLabelText('License Key');
    await user.type(licenseInput, 'ABCD-EFGH-IJKL-MNOP');
    expect((licenseInput as HTMLInputElement).value).toBe('ABCD-EFGH-IJKL-MNOP');
    expect(screen.getByText('This will replace your current license key ending in 3C49.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((licenseInput as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('This will replace your current license key ending in 3C49.')).toBeNull();

    await user.type(licenseInput, 'WXYZ-1234-ABCD-5678');
    expect(screen.getByText('This will replace your current license key ending in 3C49.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Activate License' }));

    await waitFor(() => {
      expect(licenseHookState.onActivate).toHaveBeenCalledWith('WXYZ-1234-ABCD-5678');
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'License activated on this device.',
        variant: 'success'
      });
    });
    expect((licenseInput as HTMLInputElement).value).toBe('');
  });

  it('moves window when display is selected', async () => {
    const user = userEvent.setup();
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        displayName: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        compositeKey: 'Built-in Retina Display|3024x1964|0,0',
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        displayName: 'DELL U2722D',
        width: 1920,
        height: 1080,
        compositeKey: 'DELL U2722D|1920x1080|1512,0',
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
      expect(tauriMock.moveWindowToMonitor).toHaveBeenCalledWith('DELL U2722D|1920x1080|1512,0');
    });
  });

  it('hydrates selected display from saved composite key', async () => {
    tauriMock.getLastMainMonitorName.mockReturnValue('DELL U2722D|1920x1080|1512,0');
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        displayName: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        compositeKey: 'Built-in Retina Display|3024x1964|0,0',
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        displayName: 'DELL U2722D',
        width: 1920,
        height: 1080,
        compositeKey: 'DELL U2722D|1920x1080|1512,0',
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

  it('shows a single-display message on macOS when only one monitor is detected', async () => {
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        displayName: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        compositeKey: 'Built-in Retina Display|3024x1964|0,0',
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      }
    ]);
    tauriMock.getRuntimeMonitorCount.mockResolvedValue(1);

    render(<SettingsView />);

    expect(await screen.findByText('Opening on your primary display.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Built-in Retina Display/i })).toBeNull();
  });

  it('shows a single-display message with Windows copy', async () => {
    setPlatform('Win32');
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Laptop Display',
        displayName: 'Laptop Display',
        width: 1920,
        height: 1080,
        compositeKey: 'Laptop Display|1920x1080|0,0',
        scaleFactor: 1,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1920,
        logicalHeight: 1080
      }
    ]);
    tauriMock.getRuntimeMonitorCount.mockResolvedValue(1);

    render(<SettingsView />);

    expect(await screen.findByText('Your primary display will be used.')).toBeTruthy();
  });

  it('keeps the dropdown as fallback when runtime monitor count is unavailable', async () => {
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        displayName: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        compositeKey: 'Built-in Retina Display|3024x1964|0,0',
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      }
    ]);
    tauriMock.getRuntimeMonitorCount.mockResolvedValue(null);

    render(<SettingsView />);

    const pickerButton = await screen.findByRole('button', {
      name: /Built-in Retina Display \(1512 x 982\)/i
    });
    expect((pickerButton as HTMLButtonElement).disabled).toBe(true);
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
        displayName: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        compositeKey: 'Built-in Retina Display|3024x1964|0,0',
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        displayName: 'DELL U2722D',
        width: 1920,
        height: 1080,
        compositeKey: 'DELL U2722D|1920x1080|1512,0',
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
        displayName: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        compositeKey: 'Built-in Retina Display|3024x1964|0,0',
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        displayName: 'DELL U2722D',
        width: 1920,
        height: 1080,
        compositeKey: 'DELL U2722D|1920x1080|1512,0',
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

  it('updates picker selection and persists preference on monitor_changed event', async () => {
    tauriMock.getMonitors.mockResolvedValue([
      {
        name: 'Built-in Retina Display',
        displayName: 'Built-in Retina Display',
        width: 3024,
        height: 1964,
        compositeKey: 'Built-in Retina Display|3024x1964|0,0',
        scaleFactor: 2,
        isPrimary: true,
        positionX: 0,
        positionY: 0,
        logicalWidth: 1512,
        logicalHeight: 982
      },
      {
        name: 'DELL U2722D',
        displayName: 'DELL U2722D',
        width: 1920,
        height: 1080,
        compositeKey: 'DELL U2722D|1920x1080|1512,0',
        scaleFactor: 1,
        isPrimary: false,
        positionX: 1512,
        positionY: 0,
        logicalWidth: 1920,
        logicalHeight: 1080
      }
    ]);

    render(<SettingsView />);
    await screen.findByRole('button', { name: /Built-in Retina Display \(1512 x 982\)/i });

    await waitFor(() => {
      expect(monitorChangedCallback).not.toBeNull();
    });

    act(() => {
      monitorChangedCallback?.({
        name: 'DELL U2722D',
        displayName: 'DELL U2722D',
        width: 1920,
        height: 1080,
        compositeKey: 'DELL U2722D|1920x1080|1512,0'
      });
    });

    await waitFor(() => {
      expect(tauriMock.setLastMainMonitorName).toHaveBeenCalledWith('DELL U2722D|1920x1080|1512,0');
      expect(screen.getByRole('button', { name: /DELL U2722D \(1920 x 1080\)/i })).toBeTruthy();
    });
  });

  it('shows validation warning and does not register shortcuts when config is invalid', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('tab', { name: 'Shortcuts' }));

    const playPauseInput = await screen.findByLabelText('Play / Pause shortcut');
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

    const playPauseInput = await screen.findByLabelText('Play / Pause shortcut');
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
