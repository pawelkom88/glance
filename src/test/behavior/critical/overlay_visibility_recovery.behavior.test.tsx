import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlayPrompter } from '../../../components/overlay-prompter';
import { resetAppState } from '../harness/reset-app-state';
import { validMarkdown, validSessionSummary } from '../fixtures/sessions';
import { useAppStore } from '../../../store/use-app-store';

let shortcutCallback: ((payload: { action: string; delta?: number; index?: number }) => void) | null = null;

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
  quitApp: vi.fn(),
  showMainWindow: vi.fn(),
  listenForShortcutEvents: vi.fn(),
  recoverOverlayFocus: vi.fn(),
  saveOverlayBoundsForMonitor: vi.fn(),
  setLastOverlayMonitorName: vi.fn(),
  snapOverlayToTopCenter: vi.fn(),
  startOverlayDrag: vi.fn()
}));

vi.mock('../../../lib/tauri', () => ({
  clearLastActiveSessionId: vi.fn(),
  createFolder: vi.fn(),
  createSession: vi.fn(),
  createSessionFromMarkdown: vi.fn(),
  deleteFolder: vi.fn(),
  deleteSession: vi.fn(),
  duplicateSession: vi.fn(),
  emitLanguageChanged: vi.fn(),
  exportSessionToPath: vi.fn(),
  getLastActiveSessionId: vi.fn().mockReturnValue('session-valid'),
  getLastOverlayMonitorName: vi.fn().mockReturnValue(null),
  listFolders: vi.fn().mockResolvedValue([]),
  listSessions: vi.fn().mockResolvedValue([]),
  loadSession: vi.fn(),
  moveSessionsToFolder: vi.fn(),
  renameFolder: vi.fn(),
  registerShortcuts: vi.fn(),
  saveSession: vi.fn(),
  setLastActiveSessionId: vi.fn(),
  closeOverlayWindow: tauriMocks.closeOverlayWindow,
  listenForShortcutEvents: tauriMocks.listenForShortcutEvents,
  quitApp: tauriMocks.quitApp,
  recoverOverlayFocus: tauriMocks.recoverOverlayFocus,
  saveOverlayBoundsForMonitor: tauriMocks.saveOverlayBoundsForMonitor,
  setLastOverlayMonitorName: tauriMocks.setLastOverlayMonitorName,
  showMainWindow: tauriMocks.showMainWindow,
  snapOverlayToTopCenter: tauriMocks.snapOverlayToTopCenter,
  startOverlayDrag: tauriMocks.startOverlayDrag
}));

describe('Critical behavior: overlay visibility recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortcutCallback = null;

    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: validMarkdown
    });

    tauriMocks.closeOverlayWindow.mockResolvedValue(undefined);
    tauriMocks.quitApp.mockResolvedValue(undefined);
    tauriMocks.showMainWindow.mockResolvedValue(undefined);
    tauriMocks.listenForShortcutEvents.mockImplementation(async (callback: (payload: { action: string; delta?: number; index?: number }) => void) => {
      shortcutCallback = callback;
      return () => {
        shortcutCallback = null;
      };
    });
    tauriMocks.snapOverlayToTopCenter.mockResolvedValue({ x: 0, y: 0, monitorName: 'Built-in' });
    tauriMocks.startOverlayDrag.mockResolvedValue(undefined);
  });

  it('closes overlay and restores main window on Escape shortcut event', async () => {
    render(<OverlayPrompter />);

    await waitFor(() => {
      expect(shortcutCallback).not.toBeNull();
    });

    await act(async () => {
      shortcutCallback?.({ action: 'escape-pressed' });
    });

    await waitFor(() => {
      expect(tauriMocks.closeOverlayWindow).toHaveBeenCalledTimes(1);
    });

    expect(tauriMocks.showMainWindow).toHaveBeenCalledTimes(1);
  });

  it('responds to toggle-play shortcut events with user-visible playback state changes', async () => {
    render(<OverlayPrompter />);

    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();

    await waitFor(() => {
      expect(shortcutCallback).not.toBeNull();
    });

    await act(async () => {
      shortcutCallback?.({ action: 'toggle-play' });
    });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();

    await act(async () => {
      shortcutCallback?.({ action: 'toggle-play' });
    });

    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('keeps playback unchanged when no shortcut event is emitted while unfocused', async () => {
    const user = userEvent.setup();
    render(<OverlayPrompter />);

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(useAppStore.getState().playbackState).toBe('running');

    await act(async () => {
      await Promise.resolve();
    });

    expect(useAppStore.getState().playbackState).toBe('running');
  });
});
