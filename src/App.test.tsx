import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdown } from './lib/markdown';
import { useAppStore } from './store/use-app-store';
import App from './App';

let tauriRuntime = true;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => tauriRuntime
}));

vi.mock('./components/library-view', () => ({
  LibraryView: () => <div>Library Mock</div>
}));

vi.mock('./components/editor-view', () => ({
  EditorView: ({
    onCreateSession,
    onExportMarkdown,
    onLaunchOverlay
  }: {
    onCreateSession: () => void;
    onExportMarkdown: () => void;
    onLaunchOverlay: () => void;
  }) => (
    <div>
      <div>Editor Mock</div>
      <button type="button" onClick={onCreateSession}>Trigger New Session</button>
      <button type="button" onClick={onExportMarkdown}>Trigger Export</button>
      <button type="button" onClick={onLaunchOverlay}>Trigger Launch</button>
    </div>
  )
}));

vi.mock('./components/settings-view', () => ({
  SettingsView: () => <div>Settings Mock</div>
}));

vi.mock('./components/help-view', () => ({
  HelpView: () => <div>Help Mock</div>
}));

vi.mock('./components/overlay-prompter', () => ({
  OverlayPrompter: () => <div>Overlay Mock</div>
}));

vi.mock('./components/privacy-gate', () => ({
  PrivacyGate: () => <div>Privacy Gate Mock</div>
}));

vi.mock('./lib/tauri', () => ({
  closeOverlayWindow: vi.fn().mockResolvedValue(undefined),
  emitLanguageChanged: vi.fn().mockResolvedValue(undefined),
  emitThemeChanged: vi.fn().mockResolvedValue(undefined),
  getLastMainMonitorName: vi.fn().mockReturnValue(null),
  hideMainWindow: vi.fn().mockResolvedValue(undefined),
  listenForLanguageChanged: vi.fn().mockResolvedValue(() => undefined),
  listenForThemeChanged: vi.fn().mockResolvedValue(() => undefined),
  listenForMainWindowShown: vi.fn().mockResolvedValue(() => undefined),
  moveWindowToMonitor: vi.fn().mockResolvedValue(undefined),
  openOverlayWindow: vi.fn().mockResolvedValue(null),
  parseMonitorPreferenceKey: vi.fn().mockReturnValue(null)
}));

import * as tauriBridge from './lib/tauri';

const tauriMock = tauriBridge as unknown as {
  getLastMainMonitorName: ReturnType<typeof vi.fn>;
  moveWindowToMonitor: ReturnType<typeof vi.fn>;
  openOverlayWindow: ReturnType<typeof vi.fn>;
  parseMonitorPreferenceKey: ReturnType<typeof vi.fn>;
};

const baseSession = {
  id: 's1',
  title: 'Session 1',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  lastOpenedAt: '2025-01-01T00:00:00Z'
};

function resetStore() {
  const markdown = '# Intro\n\n- Start here';

  useAppStore.setState({
    initialized: true,
    hasCompletedOnboarding: true,
    sessions: [baseSession],
    activeSessionId: null,
    activeSessionTitle: 'Untitled Session',
    markdown,
    parseWarnings: parseMarkdown(markdown).warnings,
    toastMessage: null,
    themeMode: 'system',
    resolvedTheme: 'light',
    language: 'en',
    resolvedLanguage: 'en',
    loadInitialState: vi.fn().mockResolvedValue(undefined),
    persistActiveSession: vi.fn().mockResolvedValue(true)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = '';
  tauriRuntime = true;
  tauriMock.getLastMainMonitorName.mockReturnValue(null);
  tauriMock.parseMonitorPreferenceKey.mockReturnValue(null);
  tauriMock.moveWindowToMonitor.mockResolvedValue(undefined);
  resetStore();
});

describe('App shell behavior', () => {
  it('shows onboarding gate when initialized and onboarding is incomplete', () => {
    useAppStore.setState({ initialized: true, hasCompletedOnboarding: false });

    render(<App />);

    expect(screen.queryByText('Privacy Gate Mock')).not.toBeNull();
  });

  it('shows loading state before initialization', () => {
    useAppStore.setState({ initialized: false, hasCompletedOnboarding: true });

    render(<App />);

    expect(screen.queryByText('Loading local workspace…')).not.toBeNull();
  });

  it('switches tabs when initialized', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.queryByText('Library Mock')).not.toBeNull();

    await user.click(screen.getByTitle('Scripts'));

    await waitFor(() => {
      expect(screen.queryByText('Editor Mock')).not.toBeNull();
    });
  });

  it('shows parse warning toast once per warning signature', async () => {
    const originalShowToast = useAppStore.getState().showToast;
    const showToastSpy = vi.fn((message: string, variant?: 'info' | 'success' | 'warning' | 'error') => {
      originalShowToast(message, variant);
    });

    useAppStore.setState({
      parseWarnings: [
        {
          code: 'duplicate-heading',
          message: 'Duplicate heading warning',
          lineIndex: 2
        }
      ],
      showToast: showToastSpy
    });

    render(<App />);

    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useAppStore.setState({
        parseWarnings: [
          {
            code: 'duplicate-heading',
            message: 'Duplicate heading warning',
            lineIndex: 2
          }
        ]
      });
    });

    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useAppStore.setState({
        parseWarnings: [
          {
            code: 'duplicate-heading',
            message: 'Duplicate heading warning',
            lineIndex: 3
          }
        ]
      });
    });

    await waitFor(() => {
      expect(showToastSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('shows warning when exporting without an active session', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ activeSessionId: null });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await waitFor(() => {
      expect(screen.queryByText('Editor Mock')).not.toBeNull();
    });
    await user.click(screen.getByRole('button', { name: 'Trigger Export' }));

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Open a session before exporting',
      variant: 'warning'
    });
  });

  it('shows invalid-structure warning and blocks launch when markdown has no headings', async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      activeSessionId: baseSession.id,
      markdown: 'Just plain text',
      parseWarnings: parseMarkdown('Just plain text').warnings
    });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await waitFor(() => {
      expect(screen.queryByText('Editor Mock')).not.toBeNull();
    });
    await user.click(screen.getByRole('button', { name: 'Trigger Launch' }));

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Invalid file structure: Add at least one heading (# Title) to your file to use it as a prompter session.',
      variant: 'warning'
    });
    expect(tauriMock.openOverlayWindow).not.toHaveBeenCalled();
  });

  it('shows select-file warning and blocks launch when no session is active', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ activeSessionId: null });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await waitFor(() => {
      expect(screen.queryByText('Editor Mock')).not.toBeNull();
    });
    await user.click(screen.getByRole('button', { name: 'Trigger Launch' }));

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Select a file to get started.',
      variant: 'warning'
    });
    expect(tauriMock.openOverlayWindow).not.toHaveBeenCalled();
  });

  it('keeps happy-path launch behavior unchanged when markdown is valid', async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      activeSessionId: baseSession.id,
      markdown: '# Intro\n\nReady',
      parseWarnings: parseMarkdown('# Intro\n\nReady').warnings
    });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await waitFor(() => {
      expect(screen.queryByText('Editor Mock')).not.toBeNull();
    });
    await user.click(screen.getByRole('button', { name: 'Trigger Launch' }));

    await waitFor(() => {
      expect(tauriMock.openOverlayWindow).toHaveBeenCalledTimes(1);
    });
  });

  it('routes editor new session action to sessions flow before creating', async () => {
    const user = userEvent.setup();
    const createSessionWithNameSpy = vi.fn();
    useAppStore.setState({ createSessionWithName: createSessionWithNameSpy });

    render(<App />);

    await user.click(screen.getByTitle('Scripts'));
    await waitFor(() => {
      expect(screen.queryByText('Editor Mock')).not.toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Trigger New Session' }));

    await waitFor(() => {
      expect(screen.queryByText('Library Mock')).not.toBeNull();
    });
    expect(createSessionWithNameSpy).not.toHaveBeenCalled();
  });

  it('moves main window to saved monitor preference on startup', async () => {
    tauriMock.getLastMainMonitorName.mockReturnValue('Built-in Retina Display|3024x1964|0,0');
    tauriMock.parseMonitorPreferenceKey.mockReturnValue({
      name: 'Built-in Retina Display',
      width: 3024,
      height: 1964,
      positionX: 0,
      positionY: 0
    });

    render(<App />);

    await waitFor(() => {
      expect(tauriMock.moveWindowToMonitor).toHaveBeenCalledWith(
        'Built-in Retina Display|3024x1964|0,0'
      );
    });
  });

  it('skips startup monitor move when saved preference cannot be parsed', async () => {
    tauriMock.getLastMainMonitorName.mockReturnValue('invalid-key');
    tauriMock.parseMonitorPreferenceKey.mockReturnValue(null);

    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText('Library Mock')).not.toBeNull();
    });
    expect(tauriMock.moveWindowToMonitor).not.toHaveBeenCalled();
  });

  it('hydrates language from storage events', async () => {
    render(<App />);

    act(() => {
      window.localStorage.setItem('glance-language-v1', 'fr');
      window.dispatchEvent(new StorageEvent('storage', { key: 'glance-language-v1' }));
    });

    await waitFor(() => {
      expect(useAppStore.getState().language).toBe('fr');
      expect(useAppStore.getState().resolvedLanguage).toBe('fr');
    });
  });
});
