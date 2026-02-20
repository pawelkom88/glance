import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { startTransition } from 'react';
import { parseMarkdown } from '../lib/markdown';
import {
  createSession,
  createSessionFromMarkdown,
  deleteSession,
  duplicateSession,
  exportSessionToPath,
  listSessions,
  loadSession,
  registerShortcuts,
  saveSession
} from '../lib/tauri';
import { loadShortcutConfig, toShortcutBindings } from '../lib/shortcuts';
import type { ParseWarning, SessionMeta, SessionSummary } from '../types';

type PlaybackState = 'paused' | 'running';

interface AppStoreState {
  readonly sessions: readonly SessionSummary[];
  readonly activeSessionId: string | null;
  readonly activeSessionTitle: string;
  readonly activeSessionMeta: SessionMeta | null;
  readonly markdown: string;
  readonly parseWarnings: readonly ParseWarning[];
  readonly playbackState: PlaybackState;
  readonly scrollPosition: number;
  readonly scrollSpeed: number;
  readonly shortcutWarning: string | null;
  readonly toastMessage: string | null;
  readonly initialized: boolean;
  readonly loadInitialState: () => Promise<void>;
  readonly createSessionWithName: (name: string) => Promise<void>;
  readonly duplicateSessionById: (id: string) => Promise<void>;
  readonly deleteSessionById: (id: string) => Promise<void>;
  readonly importMarkdown: (name: string, markdown: string) => Promise<void>;
  readonly exportSessionById: (id: string, targetPath: string, notify?: boolean) => Promise<string | null>;
  readonly openSession: (id: string) => Promise<void>;
  readonly setMarkdown: (nextMarkdown: string) => void;
  readonly persistActiveSession: () => Promise<boolean>;
  readonly setPlaybackState: (value: PlaybackState) => void;
  readonly togglePlayback: () => void;
  readonly setScrollPosition: (value: number) => void;
  readonly setScrollSpeed: (value: number) => void;
  readonly changeScrollSpeedBy: (delta: number) => void;
  readonly jumpToSectionByIndex: (index: number) => void;
  readonly setShortcutWarning: (value: string | null) => void;
  readonly showToast: (message: string) => void;
  readonly clearToast: () => void;
}

function readLocalScrollState() {
  const saved = window.localStorage.getItem('glance-scroll-state');
  if (!saved) {
    return { position: 0, speed: 42, playbackState: 'paused' as PlaybackState };
  }

  try {
    const parsed = JSON.parse(saved) as { position: number; speed: number; running: boolean };
    return {
      position: Number.isFinite(parsed.position) ? parsed.position : 0,
      speed: Number.isFinite(parsed.speed) ? parsed.speed : 42,
      playbackState: parsed.running ? ('running' as PlaybackState) : ('paused' as PlaybackState)
    };
  } catch {
    return { position: 0, speed: 42, playbackState: 'paused' as PlaybackState };
  }
}

function writeLocalScrollState(input: {
  position: number;
  speed: number;
  playbackState: PlaybackState;
}): void {
  window.localStorage.setItem(
    'glance-scroll-state',
    JSON.stringify({
      position: input.position,
      speed: input.speed,
      running: input.playbackState === 'running'
    })
  );
}

function buildSessionMeta(state: AppStoreState): SessionMeta {
  const now = new Date().toISOString();
  const createdAt = state.activeSessionMeta?.createdAt ?? now;

  return {
    id: state.activeSessionId ?? `draft-${Date.now()}`,
    title: state.activeSessionTitle,
    createdAt,
    updatedAt: now,
    lastOpenedAt: now,
    scroll: {
      position: state.scrollPosition,
      speed: state.scrollSpeed,
      running: state.playbackState === 'running'
    }
  };
}

function storeScrollState(state: Pick<AppStoreState, 'scrollPosition' | 'scrollSpeed' | 'playbackState'>): void {
  if (typeof window === 'undefined') {
    return;
  }

  writeLocalScrollState({
    position: state.scrollPosition,
    speed: state.scrollSpeed,
    playbackState: state.playbackState
  });
}

export const useAppStore = create<AppStoreState>((set, get) => {
  const storedScrollState = typeof window === 'undefined'
    ? { position: 0, speed: 42, playbackState: 'paused' as PlaybackState }
    : readLocalScrollState();

  const initialParsed = parseMarkdown('# Intro\n\n- Start here');

  return {
    sessions: [],
    activeSessionId: null,
    activeSessionTitle: 'Untitled Session',
    activeSessionMeta: null,
    markdown: '# Intro\n\n- Start here',
    parseWarnings: initialParsed.warnings,
    playbackState: storedScrollState.playbackState,
    scrollPosition: storedScrollState.position,
    scrollSpeed: storedScrollState.speed,
    shortcutWarning: null,
    toastMessage: null,
    initialized: false,

    loadInitialState: async () => {
      const sessions = await listSessions();
      let shortcutWarning: string | null = null;

      if (!isTauri()) {
        shortcutWarning = 'Global shortcuts are unavailable in browser preview.';
      } else {
        try {
          const shortcutConfig = loadShortcutConfig();
          await registerShortcuts(toShortcutBindings(shortcutConfig));
        } catch (error) {
          shortcutWarning = error instanceof Error ? error.message : 'Shortcut registration failed';
        }
      }

      startTransition(() => {
        set({ sessions, shortcutWarning, initialized: true });
      });
      if (shortcutWarning) {
        get().showToast(shortcutWarning);
      }

      if (sessions.length > 0) {
        await get().openSession(sessions[0].id);
      }
    },

    createSessionWithName: async (name: string) => {
      try {
        const newSession = await createSession(name);
        const sessions = await listSessions();
        startTransition(() => {
          set({ sessions });
        });
        await get().openSession(newSession.id);
        get().showToast(`Created "${newSession.title}"`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create session';
        get().showToast(message);
      }
    },

    duplicateSessionById: async (id: string) => {
      try {
        const copied = await duplicateSession(id);
        const sessions = await listSessions();
        startTransition(() => {
          set({ sessions });
        });
        await get().openSession(copied.id);
        get().showToast(`Duplicated "${copied.title}"`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to duplicate session';
        get().showToast(message);
      }
    },

    deleteSessionById: async (id: string) => {
      try {
        await deleteSession(id);
        const sessions = await listSessions();
        const activeSessionId = get().activeSessionId;

        startTransition(() => {
          set({ sessions });
        });

        if (activeSessionId === id) {
          if (sessions.length > 0) {
            await get().openSession(sessions[0].id);
          } else {
            const parsed = parseMarkdown('# Intro\n\n- Start here');
            set({
              activeSessionId: null,
              activeSessionTitle: 'Untitled Session',
              activeSessionMeta: null,
              markdown: '# Intro\n\n- Start here',
              parseWarnings: parsed.warnings,
              playbackState: 'paused',
              scrollPosition: 0,
              scrollSpeed: 42
            });
          }
        }

        get().showToast('Session deleted');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete session';
        get().showToast(message);
      }
    },

    importMarkdown: async (name: string, markdown: string) => {
      try {
        const imported = await createSessionFromMarkdown(name, markdown);
        const sessions = await listSessions();
        startTransition(() => {
          set({ sessions });
        });
        await get().openSession(imported.id);
        get().showToast(`Imported "${imported.title}"`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import markdown';
        get().showToast(message);
      }
    },

    exportSessionById: async (id: string, targetPath: string, notify = true) => {
      if (!id) {
        get().showToast('Select a session before exporting');
        return null;
      }

      if (!targetPath) {
        get().showToast('Export canceled');
        return null;
      }

      try {
        const path = await exportSessionToPath(id, targetPath);
        if (notify) {
          get().showToast(`Exported to ${path}`);
        }
        return path;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to export session';
        get().showToast(message);
        return null;
      }
    },

    openSession: async (id: string) => {
      try {
        const loaded = await loadSession(id);
        const parsed = parseMarkdown(loaded.markdown);

        set({
          activeSessionId: loaded.id,
          activeSessionTitle: loaded.meta.title,
          activeSessionMeta: loaded.meta,
          markdown: loaded.markdown,
          parseWarnings: parsed.warnings,
          scrollPosition: loaded.meta.scroll.position,
          scrollSpeed: loaded.meta.scroll.speed,
          playbackState: loaded.meta.scroll.running ? 'running' : 'paused'
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open session';
        get().showToast(message);
      }
    },

    setMarkdown: (nextMarkdown: string) => {
      const parsed = parseMarkdown(nextMarkdown);
      set({ markdown: nextMarkdown, parseWarnings: parsed.warnings });
    },

    persistActiveSession: async () => {
      const state = get();
      if (!state.activeSessionId) {
        return false;
      }

      try {
        const nextMeta = buildSessionMeta(state);
        await saveSession(state.activeSessionId, state.markdown, nextMeta);
        const sessions = await listSessions();
        startTransition(() => {
          set({ sessions, activeSessionMeta: nextMeta, activeSessionTitle: nextMeta.title });
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save session';
        get().showToast(message);
        return false;
      }
    },

    setPlaybackState: (value: PlaybackState) => {
      set((state) => {
        const next = { playbackState: value };
        storeScrollState({ ...state, ...next });
        return next;
      });
    },

    togglePlayback: () => {
      set((state) => {
        const nextPlaybackState: PlaybackState = state.playbackState === 'running' ? 'paused' : 'running';
        const next = { playbackState: nextPlaybackState };
        storeScrollState({ ...state, ...next });
        return next;
      });
    },

    setScrollPosition: (value: number) => {
      set((state) => {
        const next = { scrollPosition: Math.max(0, value) };
        storeScrollState({ ...state, ...next });
        return next;
      });
    },

    setScrollSpeed: (value: number) => {
      const normalized = Math.max(10, Math.min(140, value));

      set((state) => {
        const next = { scrollSpeed: normalized };
        storeScrollState({ ...state, ...next });
        return next;
      });
    },

    changeScrollSpeedBy: (delta: number) => {
      const currentSpeed = get().scrollSpeed;
      const next = Math.max(10, Math.min(140, currentSpeed + delta));
      get().setScrollSpeed(next);
      get().showToast(`Speed ${(next / 42).toFixed(2)}x`);
    },

    jumpToSectionByIndex: (index: number) => {
      const parsed = parseMarkdown(get().markdown);
      const target = parsed.sections[index];
      if (!target) {
        return;
      }

      const lineHeight = 54;
      get().setScrollPosition(target.lineIndex * lineHeight);
    },

    setShortcutWarning: (value: string | null) => {
      set({ shortcutWarning: value });
    },

    showToast: (message: string) => {
      set({ toastMessage: message });
    },

    clearToast: () => {
      set({ toastMessage: null });
    }
  };
});
