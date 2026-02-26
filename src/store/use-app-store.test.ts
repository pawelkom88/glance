import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdown } from '../lib/markdown';

let tauriRuntime = true;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => tauriRuntime
}));

vi.mock('../lib/tauri', () => ({
  clearLastActiveSessionId: vi.fn(),
  createSession: vi.fn(),
  createSessionFromMarkdown: vi.fn(),
  deleteSession: vi.fn(),
  duplicateSession: vi.fn(),
  exportSessionToPath: vi.fn(),
  getLastActiveSessionId: vi.fn(),
  listSessions: vi.fn(),
  loadSession: vi.fn(),
  registerShortcuts: vi.fn(),
  saveSession: vi.fn(),
  setLastActiveSessionId: vi.fn()
}));

import * as tauriBridge from '../lib/tauri';
import { useAppStore } from './use-app-store';

const tauriMock = tauriBridge as unknown as {
  clearLastActiveSessionId: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  createSessionFromMarkdown: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  duplicateSession: ReturnType<typeof vi.fn>;
  exportSessionToPath: ReturnType<typeof vi.fn>;
  getLastActiveSessionId: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  loadSession: ReturnType<typeof vi.fn>;
  registerShortcuts: ReturnType<typeof vi.fn>;
  saveSession: ReturnType<typeof vi.fn>;
  setLastActiveSessionId: ReturnType<typeof vi.fn>;
};

const defaultMarkdown = '# Intro\n\n- Start here';

function resetStore() {
  useAppStore.setState({
    sessions: [],
    activeSessionId: null,
    activeSessionTitle: 'Untitled Session',
    activeSessionMeta: null,
    markdown: defaultMarkdown,
    parseWarnings: parseMarkdown(defaultMarkdown).warnings,
    playbackState: 'paused',
    scrollPosition: 0,
    scrollSpeed: 42,
    overlayFontScale: 1,
    showReadingRuler: true,
    themeMode: 'system',
    resolvedTheme: 'light',
    shortcutWarning: null,
    toastMessage: null,
    initialized: false,
    hasCompletedOnboarding: true
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  tauriRuntime = true;
  resetStore();

  tauriMock.listSessions.mockResolvedValue([]);
  tauriMock.getLastActiveSessionId.mockReturnValue(null);
  tauriMock.registerShortcuts.mockResolvedValue(undefined);
  tauriMock.createSession.mockResolvedValue({
    id: 'new-1',
    title: 'Demo',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastOpenedAt: '2024-01-01T00:00:00Z'
  });
  tauriMock.loadSession.mockImplementation(async (id: string) => ({
    id,
    markdown: '# Intro\n\nContent',
    meta: {
      id,
      title: id === 's2' ? 'Session 2' : 'Session 1',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      lastOpenedAt: '2024-01-01T00:00:00Z',
      scroll: { position: 0, speed: 42, running: false },
      overlay: { fontScale: 1, showReadingRuler: true }
    }
  }));
  tauriMock.deleteSession.mockResolvedValue(undefined);
  tauriMock.saveSession.mockResolvedValue(undefined);
  tauriMock.createSessionFromMarkdown.mockResolvedValue({
    id: 'imported-1',
    title: 'Imported',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastOpenedAt: '2024-01-01T00:00:00Z'
  });
  tauriMock.exportSessionToPath.mockResolvedValue('/tmp/export.md');
});

describe('useAppStore session lifecycle behavior', () => {
  it('selects last active session when available and falls back to first session otherwise', async () => {
    const sessions = [
      { id: 's1', title: 'Session 1', createdAt: '', updatedAt: '', lastOpenedAt: '' },
      { id: 's2', title: 'Session 2', createdAt: '', updatedAt: '', lastOpenedAt: '' }
    ];

    tauriMock.listSessions.mockResolvedValue(sessions);
    tauriMock.getLastActiveSessionId.mockReturnValue('s2');

    await useAppStore.getState().loadInitialState();

    expect(useAppStore.getState().activeSessionId).toBe('s2');

    resetStore();
    tauriMock.listSessions.mockResolvedValue(sessions);
    tauriMock.getLastActiveSessionId.mockReturnValue('missing-id');

    await useAppStore.getState().loadInitialState();

    expect(useAppStore.getState().activeSessionId).toBe('s1');
  });

  it('creates and opens a session with success toast', async () => {
    tauriMock.listSessions.mockResolvedValue([
      { id: 'new-1', title: 'Demo', createdAt: '', updatedAt: '', lastOpenedAt: '' }
    ]);

    await useAppStore.getState().createSessionWithName('Demo');

    const state = useAppStore.getState();
    expect(state.activeSessionId).toBe('new-1');
    expect(state.toastMessage).toEqual({ message: 'Created "Demo"', variant: 'success' });
  });

  it('resets to draft state when deleting the final active session', async () => {
    const parsed = parseMarkdown('# Existing\n\nText');
    useAppStore.setState({
      sessions: [{ id: 's1', title: 'Session 1', createdAt: '', updatedAt: '', lastOpenedAt: '' }],
      activeSessionId: 's1',
      activeSessionTitle: 'Session 1',
      markdown: '# Existing\n\nText',
      parseWarnings: parsed.warnings,
      scrollPosition: 120,
      scrollSpeed: 50,
      playbackState: 'running'
    });

    tauriMock.listSessions.mockResolvedValue([]);

    await useAppStore.getState().deleteSessionById('s1');

    const state = useAppStore.getState();
    expect(state.activeSessionId).toBeNull();
    expect(state.activeSessionTitle).toBe('Untitled Session');
    expect(state.markdown).toBe(defaultMarkdown);
    expect(state.playbackState).toBe('paused');
    expect(state.scrollPosition).toBe(0);
    expect(state.scrollSpeed).toBe(42);
  });

  it('returns false and does not save when no active session exists', async () => {
    useAppStore.setState({ activeSessionId: null });

    const persisted = await useAppStore.getState().persistActiveSession();

    expect(persisted).toBe(false);
    expect(tauriMock.saveSession).not.toHaveBeenCalled();
  });

  it('clamps scroll speed between 10 and 140', () => {
    useAppStore.getState().setScrollSpeed(200);
    expect(useAppStore.getState().scrollSpeed).toBe(140);

    useAppStore.getState().setScrollSpeed(5);
    expect(useAppStore.getState().scrollSpeed).toBe(10);
  });

  it('clamps and rounds overlay font scale', () => {
    useAppStore.getState().setOverlayFontScale(0.1);
    expect(useAppStore.getState().overlayFontScale).toBe(0.85);

    useAppStore.getState().setOverlayFontScale(1.333);
    expect(useAppStore.getState().overlayFontScale).toBe(1.33);

    useAppStore.getState().setOverlayFontScale(9);
    expect(useAppStore.getState().overlayFontScale).toBe(1.4);
  });

  it('does not change scroll position for invalid section indexes', () => {
    useAppStore.setState({ markdown: '# One\n\nText\n\n# Two\n\nMore', scrollPosition: 77 });

    useAppStore.getState().jumpToSectionByIndex(99);
    expect(useAppStore.getState().scrollPosition).toBe(77);

    useAppStore.getState().jumpToSectionByIndex(-1);
    expect(useAppStore.getState().scrollPosition).toBe(77);
  });

  it('shows an error toast when tauri call fails', async () => {
    tauriMock.createSession.mockRejectedValue(new Error('create failed'));

    await useAppStore.getState().createSessionWithName('Will Fail');

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'create failed',
      variant: 'error'
    });
  });

  it('imports sample onboarding session only when session library is empty', async () => {
    await useAppStore.getState().completeOnboarding();
    expect(tauriMock.createSessionFromMarkdown).toHaveBeenCalledTimes(1);
    expect(tauriMock.createSessionFromMarkdown.mock.calls[0]?.[0]).toBe('Getting Started');

    vi.clearAllMocks();
    tauriMock.createSessionFromMarkdown.mockResolvedValue({
      id: 'imported-2',
      title: 'Imported',
      createdAt: '',
      updatedAt: '',
      lastOpenedAt: ''
    });
    tauriMock.listSessions.mockResolvedValue([
      { id: 's1', title: 'Session 1', createdAt: '', updatedAt: '', lastOpenedAt: '' }
    ]);
    useAppStore.setState({
      sessions: [{ id: 's1', title: 'Session 1', createdAt: '', updatedAt: '', lastOpenedAt: '' }]
    });

    await useAppStore.getState().completeOnboarding();
    expect(tauriMock.createSessionFromMarkdown).not.toHaveBeenCalled();
  });

  it('duplicates sessions and shows error toast when duplication fails', async () => {
    tauriMock.duplicateSession.mockResolvedValue({
      id: 'copy-1',
      title: 'Session 1 Copy',
      createdAt: '',
      updatedAt: '',
      lastOpenedAt: ''
    });
    tauriMock.listSessions.mockResolvedValue([
      { id: 's1', title: 'Session 1', createdAt: '', updatedAt: '', lastOpenedAt: '' },
      { id: 'copy-1', title: 'Session 1 Copy', createdAt: '', updatedAt: '', lastOpenedAt: '' }
    ]);
    tauriMock.loadSession.mockResolvedValue({
      id: 'copy-1',
      markdown: '# Copy',
      meta: {
        id: 'copy-1',
        title: 'Session 1 Copy',
        createdAt: '',
        updatedAt: '',
        lastOpenedAt: '',
        scroll: { position: 0, speed: 42, running: false },
        overlay: { fontScale: 1, showReadingRuler: true }
      }
    });

    await useAppStore.getState().duplicateSessionById('s1');
    expect(useAppStore.getState().activeSessionId).toBe('copy-1');
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Duplicated "Session 1 Copy"',
      variant: 'success'
    });

    tauriMock.duplicateSession.mockRejectedValue(new Error('duplicate failed'));
    await useAppStore.getState().duplicateSessionById('s1');
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'duplicate failed',
      variant: 'error'
    });
  });

  it('imports markdown and shows error toast when import fails', async () => {
    tauriMock.createSessionFromMarkdown.mockResolvedValue({
      id: 'imported-1',
      title: 'Imported',
      createdAt: '',
      updatedAt: '',
      lastOpenedAt: ''
    });
    tauriMock.listSessions.mockResolvedValue([
      { id: 'imported-1', title: 'Imported', createdAt: '', updatedAt: '', lastOpenedAt: '' }
    ]);
    tauriMock.loadSession.mockResolvedValue({
      id: 'imported-1',
      markdown: '# Imported',
      meta: {
        id: 'imported-1',
        title: 'Imported',
        createdAt: '',
        updatedAt: '',
        lastOpenedAt: '',
        scroll: { position: 0, speed: 42, running: false },
        overlay: { fontScale: 1, showReadingRuler: true }
      }
    });

    await useAppStore.getState().importMarkdown('Imported', '# Imported');
    expect(useAppStore.getState().activeSessionId).toBe('imported-1');
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Imported "Imported"',
      variant: 'success'
    });

    tauriMock.createSessionFromMarkdown.mockRejectedValue(new Error('import failed'));
    await useAppStore.getState().importMarkdown('Imported', '# Imported');
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'import failed',
      variant: 'error'
    });
  });

  it('exports sessions and handles export failures with user-facing toasts', async () => {
    tauriMock.exportSessionToPath.mockResolvedValue('/tmp/out.md');

    const path = await useAppStore.getState().exportSessionById('s1', '/tmp/out.md');
    expect(path).toBe('/tmp/out.md');
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Exported to /tmp/out.md',
      variant: 'success'
    });

    tauriMock.exportSessionToPath.mockRejectedValue(new Error('export failed'));
    const failedPath = await useAppStore.getState().exportSessionById('s1', '/tmp/out.md');
    expect(failedPath).toBeNull();
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'export failed',
      variant: 'error'
    });
  });

  it('hydrates scroll, speed, playback, font scale, and ruler state from openSession metadata', async () => {
    tauriMock.loadSession.mockResolvedValue({
      id: 's1',
      markdown: '# One',
      meta: {
        id: 's1',
        title: 'Session 1',
        createdAt: '',
        updatedAt: '',
        lastOpenedAt: '',
        scroll: { position: 220, speed: 73, running: true },
        overlay: { fontScale: 1.33, showReadingRuler: false }
      }
    });

    await useAppStore.getState().openSession('s1');

    const state = useAppStore.getState();
    expect(state.scrollPosition).toBe(220);
    expect(state.scrollSpeed).toBe(73);
    expect(state.playbackState).toBe('running');
    expect(state.overlayFontScale).toBe(1.33);
    expect(state.showReadingRuler).toBe(false);
  });

  it('updates theme mode, hydrates theme from storage, and syncs system theme', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      })),
      configurable: true
    });

    useAppStore.getState().setThemeMode('dark');
    expect(useAppStore.getState().themeMode).toBe('dark');
    expect(useAppStore.getState().resolvedTheme).toBe('dark');
    expect(window.localStorage.getItem('glance-theme-mode-v1')).toBe('dark');

    window.localStorage.setItem('glance-theme-mode-v1', 'light');
    useAppStore.setState({ themeMode: 'dark', resolvedTheme: 'dark' });
    useAppStore.getState().hydrateThemeFromStorage();
    expect(useAppStore.getState().themeMode).toBe('light');

    useAppStore.setState({ themeMode: 'system', resolvedTheme: 'light' });
    useAppStore.getState().syncSystemTheme();
    expect(useAppStore.getState().resolvedTheme).toBe('dark');

    Object.defineProperty(window, 'matchMedia', {
      value: originalMatchMedia,
      configurable: true
    });
  });

  it('persists reading ruler preference and updates active session meta', () => {
    useAppStore.setState({
      overlayFontScale: 1.22,
      activeSessionMeta: {
        id: 's1',
        title: 'Session 1',
        createdAt: '',
        updatedAt: '',
        lastOpenedAt: '',
        scroll: { position: 0, speed: 42, running: false },
        overlay: { fontScale: 1.22, showReadingRuler: true }
      }
    });

    useAppStore.getState().setShowReadingRuler(false);

    expect(window.localStorage.getItem('glance-show-reading-ruler-v1')).toBe('false');
    expect(useAppStore.getState().activeSessionMeta?.overlay).toEqual({
      fontScale: 1.22,
      showReadingRuler: false
    });
  });

  it('formats speed-change toast text with two decimal precision', () => {
    useAppStore.setState({ scrollSpeed: 42 });

    useAppStore.getState().changeScrollSpeedBy(1);

    expect(useAppStore.getState().scrollSpeed).toBe(43);
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Speed 1.02x',
      variant: 'info'
    });
  });

  it('shows shortcut warning in browser preview and when shortcut registration fails', async () => {
    tauriRuntime = false;
    tauriMock.listSessions.mockResolvedValue([]);

    await useAppStore.getState().loadInitialState();
    expect(useAppStore.getState().shortcutWarning).toBe('Global shortcuts are unavailable in browser preview.');
    expect(tauriMock.registerShortcuts).not.toHaveBeenCalled();
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Global shortcuts are unavailable in browser preview.',
      variant: 'warning'
    });

    resetStore();
    tauriRuntime = true;
    tauriMock.listSessions.mockResolvedValue([]);
    tauriMock.registerShortcuts.mockRejectedValue(new Error('register failed'));

    await useAppStore.getState().loadInitialState();
    expect(useAppStore.getState().shortcutWarning).toBe('register failed');
    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'register failed',
      variant: 'warning'
    });
  });
});
