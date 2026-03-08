import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverlayPrompter } from '../../../components/overlay-prompter';
import { loadShortcutConfig } from '../../../lib/shortcuts';
import { resetAppState } from '../harness/reset-app-state';
import { seedCorruptStorage } from '../fixtures/corrupt-storage';
import { validMarkdown, validSessionSummary } from '../fixtures/sessions';

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

describe('Low behavior: corrupted preference fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    seedCorruptStorage();

    tauriMocks.listenForShortcutEvents.mockResolvedValue(() => undefined);
    tauriMocks.closeOverlayWindow.mockResolvedValue(undefined);
    tauriMocks.quitApp.mockResolvedValue(undefined);
    tauriMocks.showMainWindow.mockResolvedValue(undefined);
    tauriMocks.snapOverlayToTopCenter.mockResolvedValue({ x: 0, y: 0, monitorName: 'Built-in' });

    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: validMarkdown
    });
  });

  it('loads defaults and remains usable when persisted shortcut config is malformed', () => {
    const config = loadShortcutConfig();

    expect(config['toggle-play']).toBe('Space');
    expect(config['start-over']).toBe('R');
  });

  it('renders overlay controls with safe defaults despite corrupted persisted JSON', async () => {
    render(<OverlayPrompter />);

    expect(await screen.findByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getAllByText(/1\.0+x/).length).toBeGreaterThan(0);
  });
});
