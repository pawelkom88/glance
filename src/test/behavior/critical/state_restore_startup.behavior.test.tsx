import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarkdown } from '../../../lib/markdown';
import { useAppStore } from '../../../store/use-app-store';
import { resetAppState } from '../harness/reset-app-state';
import { restoredMeta, validSessionSummary } from '../fixtures/sessions';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true
}));

const tauriMocks = vi.hoisted(() => ({
  clearLastActiveSessionId: vi.fn(),
  getLastActiveSessionId: vi.fn(),
  listFolders: vi.fn(),
  listSessions: vi.fn(),
  loadSession: vi.fn(),
  registerShortcuts: vi.fn(),
  setLastActiveSessionId: vi.fn()
}));

vi.mock('../../../lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tauri')>();
  return {
    ...actual,
    clearLastActiveSessionId: tauriMocks.clearLastActiveSessionId,
    getLastActiveSessionId: tauriMocks.getLastActiveSessionId,
    listFolders: tauriMocks.listFolders,
    listSessions: tauriMocks.listSessions,
    loadSession: tauriMocks.loadSession,
    registerShortcuts: tauriMocks.registerShortcuts,
    setLastActiveSessionId: tauriMocks.setLastActiveSessionId
  };
});

describe('Critical behavior: startup restoration safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    resetAppState();

    tauriMocks.listFolders.mockResolvedValue([]);
    tauriMocks.registerShortcuts.mockResolvedValue(undefined);
  });

  it('restores the last active session and reading state on startup', async () => {
    tauriMocks.listSessions.mockResolvedValue([validSessionSummary]);
    tauriMocks.getLastActiveSessionId.mockReturnValue(validSessionSummary.id);
    tauriMocks.loadSession.mockResolvedValue({
      id: validSessionSummary.id,
      markdown: '# Intro\n\nWelcome',
      meta: restoredMeta
    });

    await useAppStore.getState().loadInitialState();

    const state = useAppStore.getState();
    expect(state.activeSessionId).toBe(validSessionSummary.id);
    expect(state.scrollPosition).toBe(270);
    expect(state.scrollSpeed).toBe(1.35);
    expect(state.playbackState).toBe('running');
    expect(state.overlayFontScale).toBe(1.25);
    expect(state.showReadingRuler).toBe(false);
  });

  it('falls back safely to first available session when remembered session is missing', async () => {
    tauriMocks.listSessions.mockResolvedValue([
      validSessionSummary,
      {
        ...validSessionSummary,
        id: 'session-second',
        title: 'Backup Session'
      }
    ]);
    tauriMocks.getLastActiveSessionId.mockReturnValue('session-missing');
    tauriMocks.loadSession.mockResolvedValue({
      id: validSessionSummary.id,
      markdown: '# Restored',
      meta: {
        ...restoredMeta,
        id: validSessionSummary.id,
        title: validSessionSummary.title
      }
    });

    await useAppStore.getState().loadInitialState();

    expect(useAppStore.getState().activeSessionId).toBe(validSessionSummary.id);
  });

  it('normalizes corrupt persisted playback metadata instead of crashing startup', async () => {
    tauriMocks.listSessions.mockResolvedValue([validSessionSummary]);
    tauriMocks.getLastActiveSessionId.mockReturnValue(validSessionSummary.id);
    tauriMocks.loadSession.mockResolvedValue({
      id: validSessionSummary.id,
      markdown: 'No heading content',
      meta: {
        ...restoredMeta,
        scroll: {
          position: -50,
          speed: Number.NaN,
          running: false
        },
        overlay: {
          fontScale: 50,
          showReadingRuler: true
        }
      }
    });

    await useAppStore.getState().loadInitialState();

    const state = useAppStore.getState();
    expect(state.scrollSpeed).toBe(1);
    expect(state.overlayFontScale).toBe(2);
    expect(state.parseWarnings).toEqual(parseMarkdown('No heading content').warnings);
  });
});
