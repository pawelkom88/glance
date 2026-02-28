import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { resetAppState } from '../harness/reset-app-state';
import { useAppStore } from '../../../store/use-app-store';
import { validSessionSummary } from '../fixtures/sessions';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true
}));

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
  emitLanguageChanged: vi.fn(),
  emitThemeChanged: vi.fn(),
  getLastMainMonitorName: vi.fn(),
  hideMainWindow: vi.fn(),
  listenForLanguageChanged: vi.fn(),
  listenForMainWindowShown: vi.fn(),
  listenForMonitorChanged: vi.fn(),
  listenForThemeChanged: vi.fn(),
  moveWindowToMonitor: vi.fn(),
  openOverlayWindow: vi.fn(),
  parseMonitorPreferenceKey: vi.fn(),
  setLastMainMonitorName: vi.fn()
}));

vi.mock('../../../lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tauri')>();
  return {
    ...actual,
    closeOverlayWindow: tauriMocks.closeOverlayWindow,
    emitLanguageChanged: tauriMocks.emitLanguageChanged,
    emitThemeChanged: tauriMocks.emitThemeChanged,
    getLastMainMonitorName: tauriMocks.getLastMainMonitorName,
    hideMainWindow: tauriMocks.hideMainWindow,
    listenForLanguageChanged: tauriMocks.listenForLanguageChanged,
    listenForMainWindowShown: tauriMocks.listenForMainWindowShown,
    listenForMonitorChanged: tauriMocks.listenForMonitorChanged,
    listenForThemeChanged: tauriMocks.listenForThemeChanged,
    moveWindowToMonitor: tauriMocks.moveWindowToMonitor,
    openOverlayWindow: tauriMocks.openOverlayWindow,
    parseMonitorPreferenceKey: tauriMocks.parseMonitorPreferenceKey,
    setLastMainMonitorName: tauriMocks.setLastMainMonitorName
  };
});

describe('High behavior: editor warning lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriMocks.getLastMainMonitorName.mockReturnValue(null);
    tauriMocks.parseMonitorPreferenceKey.mockReturnValue(null);
    tauriMocks.listenForLanguageChanged.mockResolvedValue(() => undefined);
    tauriMocks.listenForThemeChanged.mockResolvedValue(() => undefined);
    tauriMocks.listenForMainWindowShown.mockResolvedValue(() => undefined);
    tauriMocks.listenForMonitorChanged.mockResolvedValue(() => undefined);
    tauriMocks.openOverlayWindow.mockResolvedValue({ monitorName: 'Built-in', usedSavedBounds: false });
    tauriMocks.hideMainWindow.mockResolvedValue(undefined);
    tauriMocks.emitThemeChanged.mockResolvedValue(undefined);

    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: 'No headings in this text'
    });
    useAppStore.setState({
      loadInitialState: vi.fn().mockResolvedValue(undefined),
      persistActiveSession: vi.fn().mockResolvedValue(true)
    });
  });

  it('blocks launch with invalid markdown, then allows launch after user fixes headings', async () => {
    const user = userEvent.setup();
    const persistActiveSession = vi.fn().mockResolvedValue(true);
    useAppStore.setState({ persistActiveSession });
    render(<App />);

    await user.click(screen.getByTitle('Scripts'));

    await user.click(await screen.findByRole('button', { name: 'Launch Prompter' }));
    await waitFor(() => {
      expect(useAppStore.getState().toastMessage?.variant).toBe('warning');
    });

    expect(tauriMocks.openOverlayWindow).not.toHaveBeenCalled();

    const textarea = screen.getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, '# Intro{enter}{enter}Fixed structure');

    await user.click(screen.getByRole('button', { name: 'Launch Prompter' }));

    await waitFor(() => {
      expect(tauriMocks.openOverlayWindow).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces duplicate-heading warnings as actionable toast feedback', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Scripts'));

    const textarea = await screen.findByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, '# Intro{enter}{enter}Line{enter}{enter}# Intro');

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage?.message).toContain('Duplicate heading');
    });
  });
});
