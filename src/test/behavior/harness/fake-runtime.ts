import type { ShortcutEventPayload } from '../../../types';
import type { AppRuntimePort, LaunchOverlayResult, MonitorDescriptor } from './app-runtime-port';

interface FakeRuntimeOptions {
  readonly monitors?: readonly MonitorDescriptor[];
  readonly launchResult?: LaunchOverlayResult;
}

export interface FakeRuntimeState {
  readonly overlayVisible: boolean;
  readonly mainVisible: boolean;
  readonly activeMonitorKey: string | null;
  readonly emittedShortcuts: readonly ShortcutEventPayload[];
}

const defaultMonitors: readonly MonitorDescriptor[] = [
  {
    key: 'Built-in|1512x982|0,0',
    displayName: 'Built-in',
    logicalWidth: 1512,
    logicalHeight: 982,
    isPrimary: true
  }
];

export function createFakeRuntime(options: FakeRuntimeOptions = {}): {
  readonly port: AppRuntimePort;
  readonly state: () => FakeRuntimeState;
} {
  const monitors = options.monitors ?? defaultMonitors;
  let overlayVisible = false;
  let mainVisible = true;
  let activeMonitorKey: string | null = monitors[0]?.key ?? null;
  const emittedShortcuts: ShortcutEventPayload[] = [];

  const port: AppRuntimePort = {
    getMonitors: async () => monitors,
    moveMainWindowToMonitor: async (monitorKey: string) => {
      activeMonitorKey = monitorKey;
    },
    openOverlayWindow: async () => {
      if (options.launchResult) {
        if (options.launchResult.success) {
          overlayVisible = true;
          mainVisible = false;
        }
        return options.launchResult;
      }

      overlayVisible = true;
      mainVisible = false;
      return { success: true };
    },
    hideOverlayWindow: async () => {
      overlayVisible = false;
    },
    hideMainWindow: async () => {
      mainVisible = false;
    },
    showMainWindow: async () => {
      mainVisible = true;
    },
    emitShortcutEvent: async (payload: ShortcutEventPayload) => {
      emittedShortcuts.push(payload);
    }
  };

  return {
    port,
    state: () => ({
      overlayVisible,
      mainVisible,
      activeMonitorKey,
      emittedShortcuts
    })
  };
}
