import type { ShortcutEventPayload } from '../../../types';

export interface MonitorDescriptor {
  readonly key: string;
  readonly displayName: string;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly isPrimary: boolean;
}

export interface LaunchOverlayResult {
  readonly success: boolean;
  readonly reason?: string;
}

export interface AppRuntimePort {
  readonly getMonitors: () => Promise<readonly MonitorDescriptor[]>;
  readonly moveMainWindowToMonitor: (monitorKey: string) => Promise<void>;
  readonly openOverlayWindow: () => Promise<LaunchOverlayResult>;
  readonly hideOverlayWindow: () => Promise<void>;
  readonly hideMainWindow: () => Promise<void>;
  readonly showMainWindow: () => Promise<void>;
  readonly emitShortcutEvent: (payload: ShortcutEventPayload) => Promise<void>;
}
