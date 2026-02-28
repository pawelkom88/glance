import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlayPrompter } from '../../../components/overlay-prompter';
import { resetAppState } from '../harness/reset-app-state';
import { validMarkdown, validSessionSummary } from '../fixtures/sessions';

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
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
  recoverOverlayFocus: tauriMocks.recoverOverlayFocus,
  saveOverlayBoundsForMonitor: tauriMocks.saveOverlayBoundsForMonitor,
  setLastOverlayMonitorName: tauriMocks.setLastOverlayMonitorName,
  showMainWindow: tauriMocks.showMainWindow,
  snapOverlayToTopCenter: tauriMocks.snapOverlayToTopCenter,
  startOverlayDrag: tauriMocks.startOverlayDrag
}));

describe('Medium behavior: timer mode persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    tauriMocks.listenForShortcutEvents.mockResolvedValue(() => undefined);
    tauriMocks.closeOverlayWindow.mockResolvedValue(undefined);
    tauriMocks.showMainWindow.mockResolvedValue(undefined);
    tauriMocks.snapOverlayToTopCenter.mockResolvedValue({ x: 0, y: 0, monitorName: 'Built-in' });

    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: validMarkdown
    });
  });

  it('persists count-down timer preferences and restores them on next render', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OverlayPrompter />);

    const timerTrigger = await screen.findByRole('button', { name: /timer/i });
    await user.click(timerTrigger);

    expect(await screen.findByRole('dialog', { name: 'Presentation timer controls' })).toBeTruthy();

    await user.click(screen.getByRole('radio', { name: 'Count Down' }));

    const minutesInput = screen.getByRole('spinbutton', { name: 'Minutes' });
    await user.clear(minutesInput);
    await user.type(minutesInput, '1');
    const secondsInput = screen.getByRole('spinbutton', { name: 'Seconds' });
    await user.clear(secondsInput);
    await user.type(secondsInput, '0');

    await user.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Presentation timer controls' })).toBeNull();
    });

    const rawPrefs = window.localStorage.getItem('glance-overlay-timer-prefs-v1');
    expect(rawPrefs).not.toBeNull();

    const parsed = JSON.parse(rawPrefs ?? '{}') as { mode?: string; targetSeconds?: number };
    expect(parsed.mode).toBe('count-down');
    expect(parsed.targetSeconds).toBe(60);

    unmount();
    render(<OverlayPrompter />);

    expect(await screen.findByText('Remaining')).toBeTruthy();
  });

  it('advances timer while running and freezes display when paused', async () => {
    vi.useFakeTimers();
    const perfSpy = vi.spyOn(performance, 'now');
    let now = 0;
    perfSpy.mockImplementation(() => now);

    try {
      render(<OverlayPrompter />);

      expect(screen.getByText('00:00')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Play' }));

      act(() => {
        now = 1500;
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('00:01')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      act(() => {
        now = 4200;
        vi.advanceTimersByTime(600);
      });

      expect(screen.getByText('00:01')).toBeTruthy();
    } finally {
      perfSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
