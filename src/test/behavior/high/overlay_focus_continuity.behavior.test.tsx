import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlayPrompter } from '../../../components/overlay-prompter';
import { resetAppState } from '../harness/reset-app-state';
import { validMarkdown, validSessionSummary } from '../fixtures/sessions';

const windowMocks = vi.hoisted(() => ({
  onFocusChanged: vi.fn(),
  onMoved: vi.fn(),
  onResized: vi.fn(),
  isFocused: vi.fn(),
  currentMonitor: vi.fn(),
  setMinSize: vi.fn(),
  setSize: vi.fn(),
  scaleFactor: vi.fn(),
  innerSize: vi.fn()
}));

let focusListener: ((event: { payload: boolean }) => void) | null = null;

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    outerSize: vi.fn().mockResolvedValue({ width: 1120, height: 400 }),
    innerSize: windowMocks.innerSize,
    currentMonitor: windowMocks.currentMonitor,
    setPosition: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
    isFocused: windowMocks.isFocused,
    onMoved: windowMocks.onMoved,
    onResized: windowMocks.onResized,
    onFocusChanged: windowMocks.onFocusChanged,
    setMinSize: windowMocks.setMinSize,
    setSize: windowMocks.setSize,
    scaleFactor: windowMocks.scaleFactor
  }),
  LogicalSize: class {
    constructor(public width: number, public height: number) {}
  }
}));

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

describe('High behavior: overlay focus continuity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    focusListener = null;
    vi.useRealTimers();

    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: validMarkdown
    });

    windowMocks.isFocused.mockResolvedValue(true);
    windowMocks.currentMonitor.mockResolvedValue({
      name: 'Built-in',
      size: { width: 1920, height: 1080 },
      position: { x: 0, y: 0 },
      scaleFactor: 1
    });
    windowMocks.onMoved.mockResolvedValue(() => undefined);
    windowMocks.onResized.mockResolvedValue(() => undefined);
    windowMocks.onFocusChanged.mockImplementation((listener: (event: { payload: boolean }) => void) => {
      focusListener = listener;
      return Promise.resolve(() => undefined);
    });
    windowMocks.setMinSize.mockResolvedValue(undefined);
    windowMocks.setSize.mockResolvedValue(undefined);
    windowMocks.scaleFactor.mockResolvedValue(1);
    windowMocks.innerSize.mockResolvedValue({ width: 1120, height: 400 });

    tauriMocks.listenForShortcutEvents.mockResolvedValue(() => undefined);
    tauriMocks.closeOverlayWindow.mockResolvedValue(undefined);
    tauriMocks.quitApp.mockResolvedValue(undefined);
    tauriMocks.showMainWindow.mockResolvedValue(undefined);
    tauriMocks.snapOverlayToTopCenter.mockResolvedValue({ x: 0, y: 0, monitorName: 'Built-in' });
  });

  it('shows delayed focus-loss hint and keeps playback controls usable after focus restore', async () => {
    const user = userEvent.setup();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};

    render(<OverlayPrompter />);

    await waitFor(() => {
      expect(focusListener).not.toBeNull();
    });

    act(() => {
      focusListener?.({ payload: false });
    });

    await waitFor(() => {
      expect(document.querySelector('.overlay-unfocused-hint')).toBeTruthy();
    });

    act(() => {
      focusListener?.({ payload: true });
    });

    await waitFor(() => {
      expect(document.querySelector('.overlay-unfocused-hint')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });
});
