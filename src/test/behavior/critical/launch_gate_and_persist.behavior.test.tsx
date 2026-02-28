import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { invalidMarkdown, validMarkdown, validSessionSummary } from '../fixtures/sessions';
import { resetAppState } from '../harness/reset-app-state';
import { useAppStore } from '../../../store/use-app-store';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true
}));

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
  emitThemeChanged: vi.fn(),
  emitLanguageChanged: vi.fn(),
  getLastMainMonitorName: vi.fn(),
  hideMainWindow: vi.fn(),
  listenForLanguageChanged: vi.fn(),
  listenForMainWindowShown: vi.fn(),
  listenForThemeChanged: vi.fn(),
  moveWindowToMonitor: vi.fn(),
  openOverlayWindow: vi.fn(),
  parseMonitorPreferenceKey: vi.fn()
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
    listenForThemeChanged: tauriMocks.listenForThemeChanged,
    moveWindowToMonitor: tauriMocks.moveWindowToMonitor,
    openOverlayWindow: tauriMocks.openOverlayWindow,
    parseMonitorPreferenceKey: tauriMocks.parseMonitorPreferenceKey
  };
});

describe('Critical behavior: launch gating and persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = '';

    tauriMocks.getLastMainMonitorName.mockReturnValue(null);
    tauriMocks.parseMonitorPreferenceKey.mockReturnValue(null);
    tauriMocks.listenForLanguageChanged.mockResolvedValue(() => undefined);
    tauriMocks.listenForThemeChanged.mockResolvedValue(() => undefined);
    tauriMocks.listenForMainWindowShown.mockResolvedValue(() => undefined);
    tauriMocks.openOverlayWindow.mockResolvedValue({ monitorName: 'Built-in', usedSavedBounds: false });
    tauriMocks.hideMainWindow.mockResolvedValue(undefined);
    tauriMocks.emitThemeChanged.mockResolvedValue(undefined);

    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: validMarkdown
    });
    useAppStore.setState({
      loadInitialState: vi.fn().mockResolvedValue(undefined),
      persistActiveSession: vi.fn().mockResolvedValue(true)
    });
  });

  it('keeps launch unavailable when no session is selected', async () => {
    const user = userEvent.setup();
    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: null,
      markdown: validMarkdown
    });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));

    expect(await screen.findByText('No session selected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Launch Prompter' })).toBeNull();
  });

  it('blocks launch and warns when markdown has no headings', async () => {
    const user = userEvent.setup();
    resetAppState({
      sessions: [validSessionSummary],
      activeSessionId: validSessionSummary.id,
      markdown: invalidMarkdown
    });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await user.click(await screen.findByRole('button', { name: 'Launch Prompter' }));

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'Invalid file structure: Add at least one heading (# Title) to your file to use it as a prompter session.',
        variant: 'warning'
      });
    });

    expect(tauriMocks.openOverlayWindow).not.toHaveBeenCalled();
  });

  it('blocks launch when autosave persistence fails', async () => {
    const user = userEvent.setup();
    const persistActiveSession = vi.fn().mockResolvedValue(false);
    useAppStore.setState({ persistActiveSession });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await user.click(await screen.findByRole('button', { name: 'Launch Prompter' }));

    await waitFor(() => {
      expect(persistActiveSession).toHaveBeenCalledTimes(1);
    });

    expect(tauriMocks.openOverlayWindow).not.toHaveBeenCalled();
    expect(tauriMocks.hideMainWindow).not.toHaveBeenCalled();
  });

  it('launches overlay only after successful save', async () => {
    const user = userEvent.setup();
    const persistActiveSession = vi.fn().mockResolvedValue(true);
    useAppStore.setState({ persistActiveSession });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await user.click(await screen.findByRole('button', { name: 'Launch Prompter' }));

    await waitFor(() => {
      expect(tauriMocks.openOverlayWindow).toHaveBeenCalledTimes(1);
    });

    expect(tauriMocks.hideMainWindow).toHaveBeenCalledTimes(1);
  });
});
