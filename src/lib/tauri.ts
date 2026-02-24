import { LogicalSize } from '@tauri-apps/api/dpi';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ShortcutBinding } from './shortcuts';
import type {
  MonitorInfo,
  OverlayBounds,
  ThemeMode,
  SessionData,
  SessionMeta,
  SessionSummary,
  ShortcutEventPayload,
  ShowOverlayRequest,
  ShowOverlayResult
} from '../types';

interface OverlayLayoutEntry extends OverlayBounds {
  readonly updatedAt: string;
}

type OverlayLayoutMap = Record<string, OverlayLayoutEntry>;

const overlayLayoutStorageKey = 'glance-overlay-layout-v2';
const overlayLastMonitorStorageKey = 'glance-overlay-last-monitor-v2';
const lastActiveSessionStorageKey = 'glance-last-active-session-v1';

function inTauri(): boolean {
  return isTauri();
}

function readOverlayLayoutMap(): OverlayLayoutMap {
  if (typeof window === 'undefined') {
    return {};
  }

  const raw = window.localStorage.getItem(overlayLayoutStorageKey);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as OverlayLayoutMap;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function readSavedOverlayBounds(monitorName: string | null): OverlayBounds | null {
  if (!monitorName) {
    return null;
  }

  const layoutMap = readOverlayLayoutMap();
  const entry = layoutMap[monitorName];
  if (!entry) {
    return null;
  }

  return {
    x: entry.x,
    y: entry.y,
    width: entry.width,
    height: entry.height
  };
}

export function saveOverlayBoundsForMonitor(monitorName: string, bounds: OverlayBounds): void {
  if (typeof window === 'undefined') {
    return;
  }

  const layoutMap = readOverlayLayoutMap();
  layoutMap[monitorName] = {
    ...bounds,
    updatedAt: new Date().toISOString()
  };
  window.localStorage.setItem(overlayLayoutStorageKey, JSON.stringify(layoutMap));
}

export function getLastOverlayMonitorName(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(overlayLastMonitorStorageKey);
}

export function setLastOverlayMonitorName(name: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(overlayLastMonitorStorageKey, name);
}

export function clearLastOverlayMonitorName(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(overlayLastMonitorStorageKey);
}

export function getLastActiveSessionId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(lastActiveSessionStorageKey);
}

export function setLastActiveSessionId(id: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(lastActiveSessionStorageKey, id);
}

export function clearLastActiveSessionId(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(lastActiveSessionStorageKey);
}

export async function listSessions(): Promise<readonly SessionSummary[]> {
  if (!inTauri()) {
    return [];
  }

  return invoke<SessionSummary[]>('list_sessions');
}

export async function createSession(name: string): Promise<SessionSummary> {
  return invoke<SessionSummary>('create_session', { name });
}

export async function createSessionFromMarkdown(name: string, markdown: string): Promise<SessionSummary> {
  return invoke<SessionSummary>('create_session_from_markdown', { name, markdown });
}

export async function duplicateSession(id: string): Promise<SessionSummary> {
  return invoke<SessionSummary>('duplicate_session', { id });
}

export async function deleteSession(id: string): Promise<void> {
  await invoke('delete_session', { id });
}

export async function loadSession(id: string): Promise<SessionData> {
  return invoke<SessionData>('load_session', { id });
}

export async function saveSession(id: string, markdown: string, meta: SessionMeta): Promise<void> {
  await invoke('save_session', { id, markdown, meta });
}

export async function exportSessionMarkdown(id: string): Promise<string> {
  return invoke<string>('export_session_markdown', { id });
}

export async function exportSessionToPath(id: string, path: string): Promise<string> {
  return invoke<string>('export_session_to_path', { id, path });
}

export async function exportDiagnostics(path: string): Promise<string> {
  return invoke<string>('export_diagnostics', { path });
}

export async function registerDefaultShortcuts(): Promise<void> {
  await invoke('register_default_shortcuts');
}

export async function registerShortcuts(bindings: readonly ShortcutBinding[]): Promise<void> {
  await invoke('register_shortcuts', { bindings });
}

export async function setOverlayAlwaysOnTop(enabled: boolean): Promise<void> {
  await invoke('set_overlay_always_on_top', { enabled });
}

export async function listMonitors(): Promise<readonly MonitorInfo[]> {
  return invoke<MonitorInfo[]>('list_monitors');
}

export async function moveOverlayToMonitor(monitorName: string): Promise<void> {
  await invoke('move_overlay_to_monitor', { monitorName });
  setLastOverlayMonitorName(monitorName);
}

export async function resetOverlayPosition(): Promise<void> {
  const existing = await WebviewWindow.getByLabel('overlay');
  if (!existing) {
    return;
  }

  await existing.setSize(new LogicalSize(1120, 400));
  await existing.center();
  window.localStorage.removeItem(overlayLayoutStorageKey);
  clearLastOverlayMonitorName();
  window.localStorage.removeItem(`glance-overlay-bounds-${navigator.platform.toLowerCase()}`);
}

export async function openOverlayWindow(): Promise<ShowOverlayResult | null> {
  if (!inTauri()) {
    return null;
  }

  const savedMonitorName = getLastOverlayMonitorName();
  const savedBounds = readSavedOverlayBounds(savedMonitorName);

  const request: ShowOverlayRequest = {
    savedMonitorName,
    savedBounds,
    preferTopCenter: true
  };

  const result = await invoke<ShowOverlayResult>('show_overlay_window', { request });
  if (result.monitorName) {
    setLastOverlayMonitorName(result.monitorName);
  }

  return result;
}

export async function closeOverlayWindow(): Promise<void> {
  if (!inTauri()) {
    return;
  }
  await invoke('hide_overlay_window');
}

export async function hideMainWindow(): Promise<void> {
  if (!inTauri()) {
    return;
  }
  await invoke('hide_main_window');
}

export async function showMainWindow(): Promise<void> {
  if (!inTauri()) {
    return;
  }
  await invoke('show_main_window');
}

export async function startOverlayDrag(): Promise<void> {
  if (!inTauri()) {
    return;
  }
  await invoke('start_overlay_drag');
}

export async function recoverOverlayFocus(): Promise<void> {
  if (!inTauri()) {
    return;
  }
  await invoke('recover_overlay_focus');
}

export async function listenForMainWindowShown(onShown: () => void): Promise<() => void> {
  if (!inTauri()) {
    return () => undefined;
  }

  const unlisten = await listen('main-window-shown', () => {
    onShown();
  });

  return () => {
    unlisten();
  };
}

export async function listenForShortcutEvents(
  onShortcut: (payload: ShortcutEventPayload) => void
): Promise<() => void> {
  if (!inTauri()) {
    return () => undefined;
  }

  const unlisten = await listen<ShortcutEventPayload>('shortcut-event', (event) => {
    onShortcut(event.payload);
  });

  return () => {
    unlisten();
  };
}

interface ThemeChangedPayload {
  readonly mode: ThemeMode;
}

export async function emitThemeChanged(mode: ThemeMode): Promise<void> {
  if (!inTauri()) {
    return;
  }

  await emit<ThemeChangedPayload>('glance-theme-changed', { mode });
}

export async function listenForThemeChanged(
  onThemeChanged: (payload: ThemeChangedPayload) => void
): Promise<() => void> {
  if (!inTauri()) {
    return () => undefined;
  }

  const unlisten = await listen<ThemeChangedPayload>('glance-theme-changed', (event) => {
    onThemeChanged(event.payload);
  });

  return () => {
    unlisten();
  };
}
