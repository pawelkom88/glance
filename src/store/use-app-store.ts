import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { startTransition } from 'react';
import { parseMarkdown } from '../lib/markdown';
import {
  clearLastActiveSessionId,
  createFolder,
  createSession,
  createSessionFromMarkdown,
  deleteFolder,
  deleteSession,
  duplicateSession,
  emitLanguageChanged,
  exportSessionToPath,
  getLastActiveSessionId,
  listFolders,
  listSessions,
  loadSession,
  moveSessionsToFolder,
  renameFolder,
  registerShortcuts,
  setLastActiveSessionId,
  saveSession
} from '../lib/tauri';
import { isAppLanguage } from '../i18n/languages';
import { detectSystemLanguage, normalizeStoredLanguage, resolveLanguage } from '../i18n/resolve-language';
import type { AppLanguage, ResolvedLanguage as AppResolvedLanguage } from '../i18n/types';
import { loadShortcutConfig, toShortcutBindings } from '../lib/shortcuts';
import { SAMPLE_SESSION_MARKDOWN } from '../lib/sample-session';
import {
  DEFAULT_SPEED_STEP,
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER
} from '../constants';
import type {
  ParseWarning,
  ResolvedTheme,
  SessionFolder,
  SessionMeta,
  SessionSummary,
  ThemeMode,
  ToastMessage,
  ToastVariant
} from '../types';

type PlaybackState = 'paused' | 'running';

interface AppStoreState {
  readonly sessions: readonly SessionSummary[];
  readonly folders: readonly SessionFolder[];
  readonly activeSessionId: string | null;
  readonly activeSessionTitle: string;
  readonly activeSessionMeta: SessionMeta | null;
  readonly markdown: string;
  readonly parseWarnings: readonly ParseWarning[];
  readonly playbackState: PlaybackState;
  readonly scrollPosition: number;
  readonly scrollSpeed: number;
  readonly overlayFontScale: number;
  readonly showReadingRuler: boolean;
  readonly themeMode: ThemeMode;
  readonly resolvedTheme: ResolvedTheme;
  readonly language: AppLanguage;
  readonly resolvedLanguage: AppResolvedLanguage;
  readonly speedStep: number;
  readonly dimLevel: number;
  readonly isControlsCollapsed: boolean;
  readonly shortcutWarning: string | null;
  readonly toastMessage: ToastMessage | null;
  readonly initialized: boolean;
  readonly hasCompletedOnboarding: boolean;
  readonly completeOnboarding: () => Promise<void>;
  readonly loadInitialState: () => Promise<void>;
  readonly createFolderWithName: (name: string) => Promise<void>;
  readonly renameFolderById: (id: string, name: string) => Promise<void>;
  readonly deleteFolderById: (id: string) => Promise<void>;
  readonly moveSessionsByIdsToFolder: (sessionIds: readonly string[], folderId: string | null) => Promise<number>;
  readonly createSessionWithName: (name: string, folderId?: string | null) => Promise<void>;
  readonly duplicateSessionById: (id: string) => Promise<void>;
  readonly deleteSessionById: (id: string, notify?: boolean) => Promise<void>;
  readonly importMarkdown: (name: string, markdown: string, notify?: boolean) => Promise<void>;
  readonly exportSessionById: (id: string, targetPath: string, notify?: boolean) => Promise<string | null>;
  readonly openSession: (id: string, preserveSettings?: boolean) => Promise<void>;
  readonly setMarkdown: (nextMarkdown: string) => void;
  readonly persistActiveSession: () => Promise<boolean>;
  readonly setPlaybackState: (value: PlaybackState) => void;
  readonly togglePlayback: () => void;
  readonly setScrollPosition: (value: number) => void;
  readonly setScrollSpeed: (value: number) => void;
  readonly changeScrollSpeedBy: (delta: number) => void;
  readonly setOverlayFontScale: (value: number) => void;
  readonly setShowReadingRuler: (value: boolean) => void;
  readonly setDimLevel: (value: number) => void;
  readonly setIsControlsCollapsed: (value: boolean) => void;
  readonly setThemeMode: (mode: ThemeMode) => void;
  readonly hydrateThemeFromStorage: () => void;
  readonly setLanguage: (language: AppLanguage, emit?: boolean) => void;
  readonly hydrateLanguageFromStorage: () => void;
  readonly setSpeedStep: (value: number) => void;
  readonly syncSystemTheme: () => void;
  readonly jumpToSectionByIndex: (index: number) => void;
  readonly setShortcutWarning: (value: string | null) => void;
  readonly showToast: (message: string, variant?: ToastVariant) => void;
  readonly clearToast: () => void;
}

function readLocalOnboardingState(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem('glance-onboarding-completed') === 'true';
}

const themeModeStorageKey = 'glance-theme-mode-v1';
const showReadingRulerStorageKey = 'glance-show-reading-ruler-v1';
const speedStepStorageKey = 'glance-speed-step-v1';
const languageStorageKey = 'glance-language-v1';

function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const raw = window.localStorage.getItem(themeModeStorageKey);
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }

  return 'system';
}

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return readSystemTheme();
  }

  return mode;
}

function writeThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(themeModeStorageKey, mode);
}

function readLanguageFromStorage(): AppLanguage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(languageStorageKey);
  return normalizeStoredLanguage(raw);
}

function writeLanguageToStorage(language: AppLanguage): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(languageStorageKey, language);
}

function readLanguage(): AppLanguage {
  const storedLanguage = readLanguageFromStorage();
  if (storedLanguage) {
    return storedLanguage;
  }

  const detectedLanguage = detectSystemLanguage();
  writeLanguageToStorage(detectedLanguage);
  return detectedLanguage;
}

function readShowReadingRuler(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  const raw = window.localStorage.getItem(showReadingRulerStorageKey);
  if (raw === null) {
    return true;
  }

  return raw !== 'false';
}

function writeShowReadingRuler(value: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(showReadingRulerStorageKey, value ? 'true' : 'false');
}

function readSpeedStep(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SPEED_STEP;
  }

  const raw = window.localStorage.getItem(speedStepStorageKey);
  if (raw === null) {
    return DEFAULT_SPEED_STEP;
  }

  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SPEED_STEP;
}

function writeSpeedStep(value: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(speedStepStorageKey, value.toString());
}

function writeLocalOnboardingState(completed: boolean): void {
  window.localStorage.setItem('glance-onboarding-completed', completed ? 'true' : 'false');
}

function readOverlayPersistentState() {
  const saved = window.localStorage.getItem('glance-overlay-state-v1');
  if (!saved) {
    return {
      position: 0,
      speed: 1.0,
      running: false,
      fontScale: 1,
      showReadingRuler: true,
      dimLevel: 1,
      isControlsCollapsed: false
    };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      position: Number.isFinite(parsed.position) ? parsed.position : 0,
      speed: Number.isFinite(parsed.speed) ? parsed.speed : 1.0,
      running: Boolean(parsed.running),
      fontScale: Number.isFinite(parsed.fontScale) ? parsed.fontScale : 1,
      showReadingRuler: typeof parsed.showReadingRuler === 'boolean' ? parsed.showReadingRuler : true,
      dimLevel: Number.isFinite(parsed.dimLevel) ? parsed.dimLevel : 1,
      isControlsCollapsed: typeof parsed.isControlsCollapsed === 'boolean' ? parsed.isControlsCollapsed : false
    };
  } catch {
    return {
      position: 0,
      speed: 1.0,
      running: false,
      fontScale: 1,
      showReadingRuler: true,
      dimLevel: 1,
      isControlsCollapsed: false
    };
  }
}

function writeOverlayPersistentState(input: {
  position: number;
  speed: number;
  running: boolean;
  fontScale: number;
  showReadingRuler: boolean;
  dimLevel: number;
  isControlsCollapsed: boolean;
}): void {
  window.localStorage.setItem(
    'glance-overlay-state-v1',
    JSON.stringify(input)
  );
}

function buildSessionMeta(state: AppStoreState): SessionMeta {
  const now = new Date().toISOString();
  const createdAt = state.activeSessionMeta?.createdAt ?? now;
  const wordCount = state.markdown.trim().length > 0
    ? state.markdown.trim().split(/\s+/).filter(Boolean).length
    : 0;

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
    },
    overlay: {
      fontScale: state.overlayFontScale,
      showReadingRuler: state.showReadingRuler
    },
    folderId: state.activeSessionMeta?.folderId ?? null,
    wordCount
  };
}

function normalizeFontScale(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0.85, Math.min(2.0, Number(value.toFixed(2))));
}

function persistOverlayState(state: AppStoreState): void {
  if (typeof window === 'undefined') {
    return;
  }

  writeOverlayPersistentState({
    position: state.scrollPosition,
    speed: state.scrollSpeed,
    running: state.playbackState === 'running',
    fontScale: state.overlayFontScale,
    showReadingRuler: state.showReadingRuler,
    dimLevel: state.dimLevel,
    isControlsCollapsed: state.isControlsCollapsed
  });
}

export const useAppStore = create<AppStoreState>((set, get) => {
  const storedOverlayState = typeof window === 'undefined'
    ? {
      position: 0,
      speed: 1.0,
      speedStep: DEFAULT_SPEED_STEP,
      running: false,
      fontScale: 1,
      showReadingRuler: true,
      dimLevel: 1,
      isControlsCollapsed: false
    }
    : readOverlayPersistentState();

  const initialParsed = parseMarkdown('# Intro\n\n- Start here');
  const initialThemeMode = readThemeMode();
  const initialResolvedTheme = resolveTheme(initialThemeMode);
  const initialLanguage = readLanguage();
  const initialResolvedLanguage = resolveLanguage(initialLanguage);

  return {
    sessions: [],
    folders: [],
    activeSessionId: null,
    activeSessionTitle: 'Untitled Session',
    activeSessionMeta: null,
    markdown: '# Intro\n\n- Start here',
    parseWarnings: initialParsed.warnings,
    playbackState: 'paused',
    scrollPosition: storedOverlayState.position,
    scrollSpeed: storedOverlayState.speed,
    overlayFontScale: storedOverlayState.fontScale,
    showReadingRuler: storedOverlayState.showReadingRuler,
    dimLevel: storedOverlayState.dimLevel,
    isControlsCollapsed: storedOverlayState.isControlsCollapsed,
    themeMode: initialThemeMode,
    resolvedTheme: initialResolvedTheme,
    language: initialLanguage,
    resolvedLanguage: initialResolvedLanguage,
    speedStep: readSpeedStep(),
    shortcutWarning: null,
    toastMessage: null,
    initialized: false,
    hasCompletedOnboarding: readLocalOnboardingState(),

    completeOnboarding: async () => {
      writeLocalOnboardingState(true);
      set({ hasCompletedOnboarding: true });
      if (get().sessions.length === 0) {
        await get().importMarkdown('Getting Started', SAMPLE_SESSION_MARKDOWN);
      }
    },

    loadInitialState: async () => {
      const [sessions, folders] = await Promise.all([
        listSessions(),
        listFolders()
      ]);
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
        set({ sessions, folders, shortcutWarning, initialized: true });
      });
      if (shortcutWarning) {
        get().showToast(shortcutWarning, 'warning');
      }

      if (sessions.length > 0) {
        const preferredSessionId = getLastActiveSessionId();
        const initialSession = preferredSessionId
          ? sessions.find((session) => session.id === preferredSessionId) ?? sessions[0]
          : sessions[0];
        await get().openSession(initialSession.id);
      } else {
        clearLastActiveSessionId();
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', (event) => {
          if (event.key === speedStepStorageKey) {
            const nextValue = readSpeedStep();
            set({ speedStep: nextValue });
          } else if (event.key === 'glance-theme-mode-v1') {
            get().hydrateThemeFromStorage();
          } else if (event.key === 'glance-show-reading-ruler-v1') {
            const nextValue = readShowReadingRuler();
            set({ showReadingRuler: nextValue });
          } else if (event.key === 'glance-overlay-state-v1') {
            const nextState = readOverlayPersistentState();
            set({
              scrollSpeed: nextState.speed,
              overlayFontScale: nextState.fontScale,
              showReadingRuler: nextState.showReadingRuler
            });
          }
        });
      }
    },

    createFolderWithName: async (name: string) => {
      try {
        const created = await createFolder(name);
        const [sessions, folders] = await Promise.all([
          listSessions(),
          listFolders()
        ]);
        startTransition(() => {
          set({ sessions, folders });
        });
        get().showToast(`Created folder "${created.name}"`, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create folder';
        get().showToast(message, 'error');
      }
    },

    renameFolderById: async (id: string, name: string) => {
      try {
        await renameFolder(id, name);
        const folders = await listFolders();
        startTransition(() => {
          set({ folders });
        });
        get().showToast('Folder renamed', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to rename folder';
        get().showToast(message, 'error');
      }
    },

    deleteFolderById: async (id: string) => {
      try {
        await deleteFolder(id);
        const [sessions, folders] = await Promise.all([
          listSessions(),
          listFolders()
        ]);
        startTransition(() => {
          set({ sessions, folders });
        });
        get().showToast('Folder deleted', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete folder';
        get().showToast(message, 'error');
      }
    },

    moveSessionsByIdsToFolder: async (sessionIds: readonly string[], folderId: string | null) => {
      if (sessionIds.length === 0) {
        return 0;
      }

      try {
        const moved = await moveSessionsToFolder(sessionIds, folderId);
        const sessions = await listSessions();
        startTransition(() => {
          set({ sessions });
        });
        return moved;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to move sessions';
        get().showToast(message, 'error');
        return 0;
      }
    },

    createSessionWithName: async (name: string, folderId: string | null = null) => {
      try {
        const newSession = await createSession(name);
        if (folderId !== null) {
          await moveSessionsToFolder([newSession.id], folderId);
        }
        const sessions = await listSessions();
        startTransition(() => {
          set({ sessions });
        });
        await get().openSession(newSession.id);
        get().showToast(`Created "${newSession.title}"`, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create session';
        get().showToast(message, 'error');
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
        get().showToast(`Duplicated "${copied.title}"`, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to duplicate session';
        get().showToast(message, 'error');
      }
    },

    deleteSessionById: async (id: string, notify = true) => {
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
            clearLastActiveSessionId();
            const parsed = parseMarkdown('# Intro\n\n- Start here');
            set({
              activeSessionId: null,
              activeSessionTitle: 'Untitled Session',
              activeSessionMeta: null,
              markdown: '# Intro\n\n- Start here',
              parseWarnings: parsed.warnings,
              playbackState: 'paused',
              scrollPosition: 0,
              scrollSpeed: 1.0,
              overlayFontScale: 1
            });
          }
        }

        if (notify) {
          get().showToast('Session deleted', 'success');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete session';
        get().showToast(message, 'error');
      }
    },

    importMarkdown: async (name: string, markdown: string, notify = true) => {
      try {
        const imported = await createSessionFromMarkdown(name, markdown);
        const sessions = await listSessions();
        startTransition(() => {
          set({ sessions });
        });
        await get().openSession(imported.id);
        if (notify) {
          get().showToast(`Imported "${imported.title}"`, 'success');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import markdown';
        get().showToast(message, 'error');
      }
    },

    exportSessionById: async (id: string, targetPath: string, notify = true) => {
      if (!id) {
        get().showToast('Select a session before exporting', 'warning');
        return null;
      }

      if (!targetPath) {
        get().showToast('Export canceled', 'info');
        return null;
      }

      try {
        const path = await exportSessionToPath(id, targetPath);
        if (notify) {
          get().showToast(`Exported to ${path}`, 'success');
        }
        return path;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to export session';
        get().showToast(message, 'error');
        return null;
      }
    },

    openSession: async (id: string, preserveSettings = false) => {
      try {
        const loaded = await loadSession(id);
        const parsed = parseMarkdown(loaded.markdown);

        if (preserveSettings) {
          set({
            activeSessionId: loaded.id,
            activeSessionTitle: loaded.meta.title,
            activeSessionMeta: loaded.meta,
            markdown: loaded.markdown,
            parseWarnings: parsed.warnings
          });
          return;
        }

        set({
          activeSessionId: loaded.id,
          activeSessionTitle: loaded.meta.title,
          activeSessionMeta: loaded.meta,
          markdown: loaded.markdown,
          parseWarnings: parsed.warnings,
          scrollPosition: loaded.meta.scroll.position,
          scrollSpeed: Number.isFinite(loaded.meta.scroll.speed) ? loaded.meta.scroll.speed : 1.0,
          playbackState: loaded.meta.scroll.running ? 'running' : 'paused',
          overlayFontScale: normalizeFontScale(loaded.meta.overlay?.fontScale),
          showReadingRuler: loaded.meta.overlay?.showReadingRuler ?? readShowReadingRuler()
        });
        setLastActiveSessionId(loaded.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to open session';
        get().showToast(message, 'error');
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
        get().showToast(message, 'error');
        return false;
      }
    },

    setPlaybackState: (value: PlaybackState) => {
      set((state) => {
        const next = { playbackState: value };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    togglePlayback: () => {
      set((state) => {
        const nextPlaybackState: PlaybackState = state.playbackState === 'running' ? 'paused' : 'running';
        const next = { playbackState: nextPlaybackState };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    setScrollPosition: (value: number) => {
      set((state) => {
        const next = { scrollPosition: Math.max(0, value) };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    setScrollSpeed: (value: number) => {
      const normalized = Math.max(MIN_SPEED_MULTIPLIER, Math.min(MAX_SPEED_MULTIPLIER, value));

      set((state) => {
        const next = { scrollSpeed: normalized };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    changeScrollSpeedBy: (delta: number) => {
      set((state) => {
        const nextMultiplier = state.scrollSpeed + (delta * state.speedStep);
        const clamped = Math.max(MIN_SPEED_MULTIPLIER, Math.min(MAX_SPEED_MULTIPLIER, nextMultiplier));
        const rounded = Number(clamped.toFixed(2));

        const next = { scrollSpeed: rounded };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);

        get().showToast(`Speed ${rounded}x`, 'info');
        return next;
      });
    },

    setOverlayFontScale: (value: number) => {
      const normalized = normalizeFontScale(value);
      set((state) => {
        const currentMeta = state.activeSessionMeta;
        const next = {
          overlayFontScale: normalized,
          activeSessionMeta: currentMeta
            ? {
              ...currentMeta,
              overlay: {
                ...currentMeta.overlay,
                fontScale: normalized
              }
            }
            : currentMeta
        };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    setShowReadingRuler: (value: boolean) => {
      writeShowReadingRuler(value);
      set((state) => {
        const currentMeta = state.activeSessionMeta;
        const next = {
          showReadingRuler: value,
          activeSessionMeta: currentMeta
            ? {
              ...currentMeta,
              overlay: {
                ...currentMeta.overlay,
                fontScale: state.overlayFontScale,
                showReadingRuler: value
              }
            }
            : currentMeta
        };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    setDimLevel: (value: number) => {
      set((state) => {
        const next = { dimLevel: value };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    setIsControlsCollapsed: (value: boolean) => {
      set((state) => {
        const next = { isControlsCollapsed: value };
        const nextState = { ...state, ...next };
        persistOverlayState(nextState);
        return next;
      });
    },

    setThemeMode: (mode: ThemeMode) => {
      const normalized: ThemeMode = mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system';
      const nextResolvedTheme = resolveTheme(normalized);
      writeThemeMode(normalized);
      set({
        themeMode: normalized,
        resolvedTheme: nextResolvedTheme
      });
    },

    hydrateThemeFromStorage: () => {
      const nextMode = readThemeMode();
      const nextResolvedTheme = resolveTheme(nextMode);
      const state = get();

      if (state.themeMode === nextMode && state.resolvedTheme === nextResolvedTheme) {
        return;
      }

      set({
        themeMode: nextMode,
        resolvedTheme: nextResolvedTheme
      });
    },

    setLanguage: (language: AppLanguage, emit = true) => {
      const normalizedLanguage: AppLanguage = isAppLanguage(language) ? language : 'en';
      const nextResolvedLanguage = resolveLanguage(normalizedLanguage);
      writeLanguageToStorage(normalizedLanguage);
      if (emit) {
        void emitLanguageChanged(normalizedLanguage);
      }
      set({
        language: normalizedLanguage,
        resolvedLanguage: nextResolvedLanguage
      });
    },

    hydrateLanguageFromStorage: () => {
      const nextLanguage = readLanguage();
      const nextResolvedLanguage = resolveLanguage(nextLanguage);
      const state = get();

      if (state.language === nextLanguage && state.resolvedLanguage === nextResolvedLanguage) {
        return;
      }

      set({
        language: nextLanguage,
        resolvedLanguage: nextResolvedLanguage
      });
    },

    setSpeedStep: (value: number) => {
      writeSpeedStep(value);
      set({ speedStep: value });
      persistOverlayState(get());
    },

    syncSystemTheme: () => {
      const state = get();
      if (state.themeMode !== 'system') {
        return;
      }

      const nextResolvedTheme = readSystemTheme();
      if (state.resolvedTheme === nextResolvedTheme) {
        return;
      }

      set({ resolvedTheme: nextResolvedTheme });
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

    showToast: (message: string, variant: ToastVariant = 'info') => {
      set({ toastMessage: { message, variant } });
    },

    clearToast: () => {
      set({ toastMessage: null });
    }
  };
});
