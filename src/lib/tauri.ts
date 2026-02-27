import { LogicalSize } from '@tauri-apps/api/dpi';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  availableMonitors as runtimeAvailableMonitors,
  currentMonitor as runtimeCurrentMonitor,
  primaryMonitor as runtimePrimaryMonitor
} from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ShortcutBinding } from './shortcuts';
import type {
  DetectedMonitor,
  MonitorChangedPayload,
  MonitorInfo,
  OverlayBounds,
  ThemeMode,
  SessionData,
  SessionFolder,
  SessionMeta,
  SessionSummary,
  ShortcutEventPayload,
  ShowOverlayResult
} from '../types';

interface OverlayLayoutEntry extends OverlayBounds {
  readonly updatedAt: string;
}

type OverlayLayoutMap = Record<string, OverlayLayoutEntry>;

const overlayLayoutStorageKey = 'glance-overlay-layout-v2';
const overlayLastMonitorStorageKey = 'glance-overlay-last-monitor-v2';
const mainLastMonitorStorageKey = 'glance-main-last-monitor-v1';
const overlayAlwaysOnTopStorageKey = 'glance-overlay-always-on-top-v1';
const lastActiveSessionStorageKey = 'glance-last-active-session-v1';
const monitorDebugStorageKey = 'glance-monitor-debug-v1';

function inTauri(): boolean {
  return isTauri();
}

function monitorDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(monitorDebugStorageKey) === '1';
}

function logMonitorDebug(message: string, payload: unknown): void {
  if (!monitorDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug(`[monitor-debug] ${message}`, payload);
}

interface RuntimeMonitorSnapshot {
  readonly name: string | null;
  readonly size: { width: number; height: number };
  readonly position: { x: number; y: number };
  readonly scaleFactor?: number;
}

function monitorIdFromRuntime(monitor: RuntimeMonitorSnapshot): string {
  const label = monitor.name ?? 'Unnamed Monitor';
  const scale = typeof monitor.scaleFactor === 'number' && Number.isFinite(monitor.scaleFactor)
    ? monitor.scaleFactor
    : 1;
  return `${label}|${monitor.position.x}:${monitor.position.y}|${monitor.size.width}x${monitor.size.height}|sf:${scale.toFixed(4)}`;
}

function toMonitorInfo(
  monitor: RuntimeMonitorSnapshot,
  primaryId: string | null
): MonitorInfo {
  const id = monitorIdFromRuntime(monitor);
  return {
    id,
    name: monitor.name ?? 'Unnamed Monitor',
    size: `${monitor.size.width}x${monitor.size.height}`,
    origin: `${monitor.position.x},${monitor.position.y}`,
    primary: primaryId === id
  };
}

function mergeMonitorInfos(
  ...lists: ReadonlyArray<readonly MonitorInfo[]>
): MonitorInfo[] {
  const merged = new Map<string, MonitorInfo>();
  for (const list of lists) {
    for (const monitor of list) {
      const existing = merged.get(monitor.id);
      if (!existing) {
        merged.set(monitor.id, monitor);
        continue;
      }

      if (!existing.primary && monitor.primary) {
        merged.set(monitor.id, monitor);
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.primary !== b.primary) {
      return a.primary ? -1 : 1;
    }
    return a.origin.localeCompare(b.origin);
  });
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

export function getLastMainMonitorName(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(mainLastMonitorStorageKey);
}

export function setLastMainMonitorName(name: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(mainLastMonitorStorageKey, name);
}

export function clearLastMainMonitorName(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(mainLastMonitorStorageKey);
}

export function toMonitorPreferenceKey(
  name: string,
  width: number,
  height: number,
  positionX?: number,
  positionY?: number
): string {
  if (
    Number.isFinite(positionX)
    && Number.isFinite(positionY)
  ) {
    return `${name}|${width}x${height}|${positionX},${positionY}`;
  }

  return `${name}|${width}x${height}`;
}

export function parseMonitorPreferenceKey(
  key: string
): { name: string; width: number; height: number; positionX?: number; positionY?: number } | null {
  const parseSizeSegment = (segment: string): { width: number; height: number } | null => {
    const [widthRaw, heightRaw] = segment.split('x');
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    return { width, height };
  };

  const parsePositionSegment = (segment: string): { positionX: number; positionY: number } | null => {
    const [positionXRaw, positionYRaw] = segment.split(',');
    const positionX = Number(positionXRaw);
    const positionY = Number(positionYRaw);
    if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) {
      return null;
    }

    return { positionX, positionY };
  };

  const parseRuntimePositionSegment = (segment: string): { positionX: number; positionY: number } | null => {
    const [positionXRaw, positionYRaw] = segment.split(':');
    const positionX = Number(positionXRaw);
    const positionY = Number(positionYRaw);
    if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) {
      return null;
    }

    return { positionX, positionY };
  };

  const parts = key.split('|');
  if (parts.length >= 3) {
    const position = parsePositionSegment(parts[parts.length - 1] ?? '');
    const size = parseSizeSegment(parts[parts.length - 2] ?? '');
    const name = parts.slice(0, parts.length - 2).join('|');
    if (position && size && name) {
      return { name, ...size, ...position };
    }
  }

  if (parts.length >= 2) {
    const size = parseSizeSegment(parts[parts.length - 1] ?? '');
    const name = parts.slice(0, parts.length - 1).join('|');
    if (size && name) {
      return { name, ...size };
    }
  }

  if (parts.length >= 4) {
    const size = parseSizeSegment(parts[parts.length - 2] ?? '');
    const runtimePosition = parseRuntimePositionSegment(parts[parts.length - 3] ?? '');
    const name = parts.slice(0, parts.length - 3).join('|');
    if (size && runtimePosition && name) {
      return { name, ...size, ...runtimePosition };
    }
  }

  return null;
}

export function getOverlayAlwaysOnTopPreference(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  const raw = window.localStorage.getItem(overlayAlwaysOnTopStorageKey);
  if (raw === null) {
    return true;
  }

  return raw === 'true';
}

export function setOverlayAlwaysOnTopPreference(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(overlayAlwaysOnTopStorageKey, String(enabled));
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

export async function listFolders(): Promise<readonly SessionFolder[]> {
  if (!inTauri()) {
    return [];
  }

  return invoke<SessionFolder[]>('list_folders');
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

export async function createFolder(name: string): Promise<SessionFolder> {
  return invoke<SessionFolder>('create_folder', { name });
}

export async function renameFolder(id: string, name: string): Promise<SessionFolder> {
  return invoke<SessionFolder>('rename_folder', { id, name });
}

export async function deleteFolder(id: string): Promise<void> {
  await invoke('delete_folder', { id });
}

export async function moveSessionsToFolder(sessionIds: readonly string[], folderId: string | null): Promise<number> {
  return invoke<number>('move_sessions_to_folder', {
    sessionIds,
    folderId
  });
}

export async function deleteSession(id: string): Promise<void> {
  await invoke('delete_session', { id });
}

export async function openSessionsFolder(): Promise<void> {
  await invoke('open_sessions_folder');
}

export async function restoreFromBackup(path: string): Promise<void> {
  await invoke('restore_from_backup', { path });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
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
  setOverlayAlwaysOnTopPreference(enabled);
}

export async function getMonitors(): Promise<readonly DetectedMonitor[]> {
  if (!inTauri()) {
    return [];
  }

  try {
    const monitors = await invoke<DetectedMonitor[]>('get_monitors');
    return [...monitors].sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }

      if (left.positionX !== right.positionX) {
        return left.positionX - right.positionX;
      }

      return left.positionY - right.positionY;
    });
  } catch (error) {
    logMonitorDebug('backend get_monitors failed', { error: String(error) });
    return [];
  }
}

export async function getRuntimeMonitorCount(): Promise<number | null> {
  if (!inTauri()) {
    return null;
  }

  try {
    const monitors = await runtimeAvailableMonitors();
    return monitors.length;
  } catch (error) {
    logMonitorDebug('runtime availableMonitors failed', { error: String(error) });
    return null;
  }
}

export async function moveWindowToMonitor(monitorKey: string): Promise<void> {
  await invoke('move_window_to_monitor', {
    monitorKey
  });
  setLastMainMonitorName(monitorKey);
}

export async function listMonitors(): Promise<readonly MonitorInfo[]> {
  if (!inTauri()) {
    return [];
  }

  const runtimeMonitorsPromise = (async () => {
    try {
      const [available, current, primary] = await Promise.all([
        runtimeAvailableMonitors(),
        runtimeCurrentMonitor().catch(() => null),
        runtimePrimaryMonitor().catch(() => null)
      ]);

      const snapshots: RuntimeMonitorSnapshot[] = [...available];
      if (current) {
        snapshots.push(current);
      }
      if (primary) {
        snapshots.push(primary);
      }

      const primaryId = primary ? monitorIdFromRuntime(primary) : null;
      const uniqueById = new Map<string, RuntimeMonitorSnapshot>();
      for (const monitor of snapshots) {
        uniqueById.set(monitorIdFromRuntime(monitor), monitor);
      }

      return Array.from(uniqueById.values()).map((monitor) => toMonitorInfo(monitor, primaryId));
    } catch (error) {
      logMonitorDebug('runtime monitor APIs failed', { error: String(error) });
      return [] as MonitorInfo[];
    }
  })();

  const backendMonitorsPromise = invoke<MonitorInfo[]>('list_monitors').catch((error) => {
    logMonitorDebug('backend list_monitors failed', { error: String(error) });
    return [];
  });
  const [runtimeMonitors, backendMonitors] = await Promise.all([
    runtimeMonitorsPromise,
    backendMonitorsPromise
  ]);

  const merged = mergeMonitorInfos(runtimeMonitors, backendMonitors);
  logMonitorDebug('monitor sources merged', {
    runtimeCount: runtimeMonitors.length,
    backendCount: backendMonitors.length,
    mergedCount: merged.length,
    runtimeMonitors,
    backendMonitors,
    merged
  });

  return merged;
}

export async function getRuntimeCurrentMonitorId(): Promise<string | null> {
  if (!inTauri()) {
    return null;
  }

  try {
    const monitor = await runtimeCurrentMonitor();
    return monitor ? monitorIdFromRuntime(monitor) : null;
  } catch (error) {
    logMonitorDebug('runtime currentMonitor failed', { error: String(error) });
    return null;
  }
}

export async function getRuntimePrimaryMonitorId(): Promise<string | null> {
  if (!inTauri()) {
    return null;
  }

  try {
    const monitor = await runtimePrimaryMonitor();
    return monitor ? monitorIdFromRuntime(monitor) : null;
  } catch (error) {
    logMonitorDebug('runtime primaryMonitor failed', { error: String(error) });
    return null;
  }
}

export async function getMainWindowCurrentMonitor(): Promise<MonitorInfo | null> {
  if (!inTauri()) {
    return null;
  }

  try {
    return await invoke<MonitorInfo | null>('get_main_window_current_monitor');
  } catch (error) {
    logMonitorDebug('backend current main monitor failed', { error: String(error) });
    return null;
  }
}

export async function moveOverlayToMonitor(monitorName: string): Promise<void> {
  await invoke('move_overlay_to_monitor', { monitorName });
  setLastOverlayMonitorName(monitorName);
}

export async function moveMainToMonitor(monitorName: string): Promise<void> {
  await invoke('move_main_to_monitor', { monitorName });
  setLastMainMonitorName(monitorName);
}

export interface SnapOverlayResult {
  readonly x: number;
  readonly y: number;
  readonly monitorName: string;
}

export async function snapOverlayToTopCenter(): Promise<SnapOverlayResult> {
  return invoke<SnapOverlayResult>('snap_overlay_to_center');
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

  const result = await invoke<ShowOverlayResult>('show_overlay_window');
  if (result.monitorName) {
    setLastOverlayMonitorName(result.monitorName);
  }
  await setOverlayAlwaysOnTop(getOverlayAlwaysOnTopPreference());

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
  const savedMonitorKey = getLastMainMonitorName();
  await invoke('show_main_window', { savedMonitorKey });
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

export async function listenForMonitorChanged(
  onChanged: (payload: MonitorChangedPayload) => void
): Promise<() => void> {
  if (!inTauri()) {
    return () => undefined;
  }

  const unlisten = await listen<MonitorChangedPayload>('monitor_changed', (event) => {
    onChanged(event.payload);
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

export async function emitAppReady(): Promise<void> {
  if (!inTauri()) {
    return;
  }

  await emit('app_ready');
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
