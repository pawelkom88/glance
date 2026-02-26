import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdown } from './lib/markdown';
import { useAppStore } from './store/use-app-store';
import App from './App';

let tauriRuntime = true;
const currentMonitorMock = vi.fn();
let movedListener: ((event: { payload: { x: number; y: number } }) => void) | null = null;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => tauriRuntime
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    currentMonitor: currentMonitorMock,
    onMoved: vi.fn((callback: (event: { payload: { x: number; y: number } }) => void) => {
      movedListener = callback;
      return Promise.resolve(() => undefined);
    }),
    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    outerSize: vi.fn().mockResolvedValue({ width: 1200, height: 900 }),
    onResized: vi.fn().mockResolvedValue(() => undefined),
    onFocusChanged: vi.fn().mockResolvedValue(() => undefined),
    isFocused: vi.fn().mockResolvedValue(true),
    setPosition: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined)
  })
}));

vi.mock('./components/library-view', () => ({
  LibraryView: () => <div>Library Mock</div>
}));

vi.mock('./components/editor-view', () => ({
  EditorView: ({ onExportMarkdown }: { onExportMarkdown: () => void }) => (
    <div>
      <div>Editor Mock</div>
      <button type="button" onClick={onExportMarkdown}>Trigger Export</button>
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
  emitThemeChanged: vi.fn().mockResolvedValue(undefined),
  hideMainWindow: vi.fn().mockResolvedValue(undefined),
  listenForThemeChanged: vi.fn().mockResolvedValue(() => undefined),
  listenForMainWindowShown: vi.fn().mockResolvedValue(() => undefined),
  openOverlayWindow: vi.fn().mockResolvedValue(null),
  setLastMainMonitorName: vi.fn()
}));

import * as tauriBridge from './lib/tauri';

const tauriMock = tauriBridge as unknown as {
  setLastMainMonitorName: ReturnType<typeof vi.fn>;
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
    loadInitialState: vi.fn().mockResolvedValue(undefined),
    persistActiveSession: vi.fn().mockResolvedValue(true)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = '';
  tauriRuntime = true;
  movedListener = null;
  currentMonitorMock.mockResolvedValue({
    name: 'Display A',
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 2
  });
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

  it('persists current monitor id when main window moves', async () => {
    render(<App />);

    await waitFor(() => {
      expect(currentMonitorMock).toHaveBeenCalled();
    });

    act(() => {
      movedListener?.({ payload: { x: 50, y: 80 } });
    });

    await waitFor(() => {
      expect(tauriMock.setLastMainMonitorName).toHaveBeenCalledWith(
        'Display A|0:0|1920x1080|sf:2.0000'
      );
    });
  });

  it('does not persist monitor id when monitor lookup fails', async () => {
    currentMonitorMock.mockRejectedValue(new Error('monitor lookup failed'));

    render(<App />);

    await waitFor(() => {
      expect(currentMonitorMock).toHaveBeenCalled();
    });

    act(() => {
      movedListener?.({ payload: { x: 5, y: 5 } });
    });

    await waitFor(() => {
      expect(screen.queryByText('Library Mock')).not.toBeNull();
    });
    expect(tauriMock.setLastMainMonitorName).not.toHaveBeenCalled();
  });
});
