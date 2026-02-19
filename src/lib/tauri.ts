import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalSize } from '@tauri-apps/api/dpi';
import type { MonitorInfo, SessionData, SessionMeta, SessionSummary, ShortcutEventPayload } from '../types';

function inTauri(): boolean {
  return isTauri();
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

export async function registerDefaultShortcuts(): Promise<void> {
  await invoke('register_default_shortcuts');
}

export async function setOverlayAlwaysOnTop(enabled: boolean): Promise<void> {
  await invoke('set_overlay_always_on_top', { enabled });
}

export async function listMonitors(): Promise<readonly MonitorInfo[]> {
  return invoke<MonitorInfo[]>('list_monitors');
}

export async function moveOverlayToMonitor(monitorName: string): Promise<void> {
  await invoke('move_overlay_to_monitor', { monitorName });
  window.localStorage.setItem('glance-last-monitor', monitorName);
}

export async function resetOverlayPosition(): Promise<void> {
  const existing = await WebviewWindow.getByLabel('overlay');
  if (!existing) {
    return;
  }

  await existing.setSize(new LogicalSize(960, 620));
  await existing.center();
  window.localStorage.removeItem(`glance-overlay-bounds-${navigator.platform.toLowerCase()}`);
}

export async function openOverlayWindow(): Promise<void> {
  if (!inTauri()) {
    return;
  }

  const lastMonitor = window.localStorage.getItem('glance-last-monitor');
  if (lastMonitor) {
    try {
      await moveOverlayToMonitor(lastMonitor);
    } catch {
      window.localStorage.removeItem('glance-last-monitor');
    }
  }

  await invoke('show_overlay_window');
}

export async function closeOverlayWindow(): Promise<void> {
  if (!inTauri()) {
    return;
  }
  await invoke('hide_overlay_window');
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
