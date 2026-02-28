import { availableMonitors, currentMonitor, primaryMonitor } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitLanguageChanged,
  getMonitors,
  listenForLanguageChanged,
  listMonitors,
  moveMainToMonitor,
  moveOverlayToMonitor,
  moveWindowToMonitor,
  openOverlayWindow,
  snapOverlayToTopCenter,
  showMainWindow
} from './tauri';

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(),
  listen: vi.fn()
}));

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
const availableMonitorsMock = availableMonitors as unknown as ReturnType<typeof vi.fn>;
const currentMonitorMock = currentMonitor as unknown as ReturnType<typeof vi.fn>;
const primaryMonitorMock = primaryMonitor as unknown as ReturnType<typeof vi.fn>;
const emitMock = emit as unknown as ReturnType<typeof vi.fn>;
const listenMock = listen as unknown as ReturnType<typeof vi.fn>;

const overlayMonitorKey = 'glance-overlay-last-monitor-v2';
const overlayLayoutKey = 'glance-overlay-layout-v2';
const mainMonitorKey = 'glance-main-last-monitor-v1';

function runtimeMonitorId(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  scaleFactor = 1
): string {
  return `${name}|${x}:${y}|${width}x${height}|sf:${scaleFactor.toFixed(4)}`;
}

describe('tauri monitor bridge behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    emitMock.mockResolvedValue(undefined);
    listenMock.mockResolvedValue(() => undefined);
  });

  it('listMonitors merges runtime and backend sources without duplicates', async () => {
    const monitorA = {
      name: 'Display A',
      size: { width: 1920, height: 1080 },
      position: { x: 0, y: 0 },
      scaleFactor: 2
    };
    const monitorB = {
      name: 'Display B',
      size: { width: 2560, height: 1440 },
      position: { x: 1920, y: 0 },
      scaleFactor: 1
    };

    availableMonitorsMock.mockResolvedValue([monitorA, monitorB]);
    currentMonitorMock.mockResolvedValue(monitorB);
    primaryMonitorMock.mockResolvedValue(monitorA);

    const duplicatedA = {
      id: runtimeMonitorId('Display A', 0, 0, 1920, 1080, 2),
      name: 'Display A',
      size: '1920x1080',
      origin: '0,0',
      primary: false
    };
    const backendC = {
      id: 'Display C|4480:0|1920x1080|sf:1.0000',
      name: 'Display C',
      size: '1920x1080',
      origin: '4480,0',
      primary: false
    };

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'list_monitors') {
        return [duplicatedA, backendC];
      }
      return undefined;
    });

    const merged = await listMonitors();

    expect(merged).toHaveLength(3);
    expect(merged[0]?.name).toBe('Display A');
    expect(merged[0]?.primary).toBe(true);
    expect(merged.map((item) => item.name)).toEqual(['Display A', 'Display B', 'Display C']);
  });

  it('listMonitors falls back to backend data when runtime APIs fail', async () => {
    availableMonitorsMock.mockRejectedValue(new Error('runtime unavailable'));
    currentMonitorMock.mockResolvedValue(null);
    primaryMonitorMock.mockResolvedValue(null);

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'list_monitors') {
        return [
          { id: 'm1', name: 'Backend 1', size: '1920x1080', origin: '0,0', primary: true },
          { id: 'm2', name: 'Backend 2', size: '1920x1080', origin: '1920,0', primary: false }
        ];
      }
      return undefined;
    });

    const monitors = await listMonitors();

    expect(monitors.map((monitor) => monitor.name)).toEqual(['Backend 1', 'Backend 2']);
  });

  it('moveOverlayToMonitor persists the selected overlay monitor id', async () => {
    invokeMock.mockResolvedValue(undefined);

    await moveOverlayToMonitor('monitor-overlay');

    expect(window.localStorage.getItem(overlayMonitorKey)).toBe('monitor-overlay');
    expect(invokeMock).toHaveBeenCalledWith('move_overlay_to_monitor', { monitorName: 'monitor-overlay' });
  });

  it('moveMainToMonitor persists the selected main monitor id', async () => {
    invokeMock.mockResolvedValue(undefined);

    await moveMainToMonitor('monitor-main');

    expect(window.localStorage.getItem(mainMonitorKey)).toBe('monitor-main');
    expect(invokeMock).toHaveBeenCalledWith('move_main_to_monitor', { monitorName: 'monitor-main' });
  });

  it('showMainWindow forwards saved main monitor id to backend', async () => {
    window.localStorage.setItem(mainMonitorKey, 'saved-main-monitor');
    invokeMock.mockResolvedValue(undefined);

    await showMainWindow();

    expect(invokeMock).toHaveBeenCalledWith('show_main_window', {
      savedMonitorKey: 'saved-main-monitor'
    });
  });

  it('getMonitors returns backend monitor metadata sorted primary-first', async () => {
    invokeMock.mockResolvedValue([
      {
        name: '\\\\.\\DISPLAY2',
        displayName: 'Display 2',
        width: 1920,
        height: 1080,
        compositeKey: '\\\\.\\DISPLAY2|1920x1080|1920,0',
        scaleFactor: 1,
        isPrimary: false,
        positionX: 1920,
        positionY: 0,
        logicalWidth: 1920,
        logicalHeight: 1080
      },
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

    const monitors = await getMonitors();

    expect(invokeMock).toHaveBeenCalledWith('get_monitors');
    expect(monitors[0]?.isPrimary).toBe(true);
    expect(monitors[1]?.positionX).toBe(1920);
  });

  it('moveWindowToMonitor calls new command and persists composite key', async () => {
    invokeMock.mockResolvedValue(undefined);

    await moveWindowToMonitor('Built-in Retina Display|3024x1964|0,0');

    expect(invokeMock).toHaveBeenCalledWith('move_window_to_monitor', {
      monitorKey: 'Built-in Retina Display|3024x1964|0,0'
    });
    expect(window.localStorage.getItem(mainMonitorKey)).toBe('Built-in Retina Display|3024x1964|0,0');
  });

  it('snapOverlayToTopCenter invokes backend snap command without arguments', async () => {
    invokeMock.mockResolvedValue({ x: 100, y: 80, monitorName: 'Display A|0:0|1920x1080|sf:1.0000' });

    await snapOverlayToTopCenter();

    expect(invokeMock).toHaveBeenCalledWith('snap_overlay_to_center');
  });

  it('openOverlayWindow lets backend decide monitor and persists returned monitor id', async () => {
    window.localStorage.setItem(overlayMonitorKey, 'saved-overlay-monitor');
    window.localStorage.setItem(
      overlayLayoutKey,
      JSON.stringify({
        'saved-overlay-monitor': {
          x: 100,
          y: 120,
          width: 1100,
          height: 420,
          updatedAt: '2025-01-01T00:00:00Z'
        }
      })
    );

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'show_overlay_window') {
        return {
          monitorName: 'resolved-overlay-monitor',
          usedSavedBounds: true
        };
      }
      return undefined;
    });

    await openOverlayWindow();

    expect(invokeMock).toHaveBeenCalledWith('show_overlay_window');
    expect(invokeMock).toHaveBeenCalledWith('set_overlay_always_on_top', { enabled: true });
    expect(window.localStorage.getItem(overlayMonitorKey)).toBe('resolved-overlay-monitor');
  });

  it('emits and listens for language-changed events', async () => {
    const detach = vi.fn();
    listenMock.mockResolvedValue(detach);
    const callback = vi.fn();

    await emitLanguageChanged('fr');
    expect(emitMock).toHaveBeenCalledWith('glance-language-changed', { language: 'fr' });

    const unlisten = await listenForLanguageChanged(callback);
    expect(listenMock).toHaveBeenCalledWith('glance-language-changed', expect.any(Function));

    const listener = listenMock.mock.calls[0]?.[1] as ((event: { payload: { language: 'en' | 'fr' | 'es' } }) => void);
    listener({ payload: { language: 'en' } });
    expect(callback).toHaveBeenCalledWith({ language: 'en' });

    unlisten();
    expect(detach).toHaveBeenCalled();
  });
});
