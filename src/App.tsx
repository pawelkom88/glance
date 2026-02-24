import { type ReactElement, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { EditorView } from './components/editor-view';
import { HelpView } from './components/help-view';
import { LibraryView } from './components/library-view';
import { OverlayPrompter } from './components/overlay-prompter';
import { ReactViewTransition } from './components/react-view-transition';
import { SettingsView } from './components/settings-view';
import { PrivacyGate } from './components/privacy-gate';
import { parseMarkdown } from './lib/markdown';
import {
  closeOverlayWindow,
  emitThemeChanged,
  hideMainWindow,
  listenForThemeChanged,
  listenForMainWindowShown,
  openOverlayWindow
} from './lib/tauri';
import { useAppStore } from './store/use-app-store';
import type { ToastVariant } from './types';

type MainTab = 'library' | 'editor' | 'settings' | 'help';
const windowFadeDurationMs = 140;

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6.5a2.5 2.5 0 0 1 2.5-2.5h3A2.5 2.5 0 0 1 12 6.5V20H6.5A2.5 2.5 0 0 1 4 17.5v-11Zm8 13.5V6.5A2.5 2.5 0 0 1 14.5 4h3A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H12Z" />
    </svg>
  );
}

function EditorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4h10.5L20 8.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9.5 1.5V9H18" />
      <path d="M8 13h8M8 16h8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z" />
      <path d="M18.2 13.2a6.7 6.7 0 0 0 0-2.4l1.7-1.3-1.6-2.8-2 .8a6.9 6.9 0 0 0-2.1-1.2L13.9 4h-3.8l-.3 2.3a6.9 6.9 0 0 0-2.1 1.2l-2-.8-1.6 2.8 1.7 1.3a6.7 6.7 0 0 0 0 2.4l-1.7 1.3 1.6 2.8 2-.8a6.9 6.9 0 0 0 2.1 1.2l.3 2.3h3.8l.3-2.3a6.9 6.9 0 0 0 2.1-1.2l2 .8 1.6-2.8-1.7-1.3Z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm0-4.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm-1.2-4h1.9c0-2 2.7-2.1 2.7-4.8 0-1.9-1.6-3.1-3.7-3.1-1.8 0-3.3.9-4.1 2.5l1.6 1c.4-.9 1.2-1.5 2.4-1.5 1.1 0 1.8.5 1.8 1.3 0 1.5-2.6 1.8-2.6 4.6Z" />
    </svg>
  );
}

const tabs: ReadonlyArray<{
  readonly id: MainTab;
  readonly label: string;
  readonly icon: () => ReactElement;
}> = [
    { id: 'library', label: 'Session Library', icon: LibraryIcon },
    { id: 'editor', label: 'Session Editor', icon: EditorIcon },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'help', label: 'Help', icon: HelpIcon }
  ];

function isOverlayRoute(): boolean {
  return typeof window !== 'undefined' && window.location.hash.includes('overlay');
}

function toExportFilename(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${normalized || 'session'}.md`;
}

function defaultSessionTitle(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `Session ${day}/${month}/${year}`;
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <svg width="24" height="24" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M512 64a448 448 0 1 1 0 896 448 448 0 0 1 0-896zm-55.808 536.384-99.52-99.584a38.4 38.4 0 1 0-54.336 54.336l126.72 126.72a38.272 38.272 0 0 0 54.336 0l262.4-262.464a38.4 38.4 0 1 0-54.272-54.336L456.192 600.384z" /></svg>
    );
  }

  if (variant === 'warning') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2.7c.6 0 1.1.3 1.4.8l8.1 14a1.6 1.6 0 0 1-1.4 2.5H3.9a1.6 1.6 0 0 1-1.4-2.5l8.1-14c.3-.5.8-.8 1.4-.8Zm-1 6.1v4.6a1 1 0 0 0 2 0V8.8a1 1 0 0 0-2 0Zm1 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z" />
      </svg>
    );
  }

  if (variant === 'error') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm3.7-13.7a1 1 0 0 0-1.4-1.4L12 9.2 9.7 6.9a1 1 0 1 0-1.4 1.4l2.3 2.3-2.3 2.3a1 1 0 1 0 1.4 1.4l2.3-2.3 2.3 2.3a1 1 0 0 0 1.4-1.4l-2.3-2.3 2.3-2.3Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20Zm1-12.3a1 1 0 1 0-2 0v6a1 1 0 0 0 2 0v-6Zm-1-3.4a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" />
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('library');
  const [isOverlay] = useState<boolean>(isOverlayRoute);
  const [isTabSwitchAnimating, setIsTabSwitchAnimating] = useState(false);
  const [mainWindowTransition, setMainWindowTransition] = useState<'idle' | 'fade-out' | 'fade-in'>('idle');
  const [isToastClosing, setIsToastClosing] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const warningSignatureRef = useRef<string>('');
  const fadeInFrameRef = useRef<number | null>(null);
  const tabSwitchTimeoutRef = useRef<number | null>(null);
  const themeTransitionTimeoutRef = useRef<number | null>(null);
  const hasAppliedInitialThemeRef = useRef(false);

  const initialized = useAppStore((state) => state.initialized);
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const markdown = useAppStore((state) => state.markdown);
  const parseWarnings = useAppStore((state) => state.parseWarnings);
  const toastMessage = useAppStore((state) => state.toastMessage);
  const loadInitialState = useAppStore((state) => state.loadInitialState);
  const createSessionWithName = useAppStore((state) => state.createSessionWithName);
  const deleteSessionById = useAppStore((state) => state.deleteSessionById);
  const importMarkdown = useAppStore((state) => state.importMarkdown);
  const exportSessionById = useAppStore((state) => state.exportSessionById);
  const openSession = useAppStore((state) => state.openSession);
  const setMarkdown = useAppStore((state) => state.setMarkdown);
  const persistActiveSession = useAppStore((state) => state.persistActiveSession);
  const clearToast = useAppStore((state) => state.clearToast);
  const showToast = useAppStore((state) => state.showToast);
  const hasCompletedOnboarding = useAppStore((state) => state.hasCompletedOnboarding);
  const themeMode = useAppStore((state) => state.themeMode);
  const resolvedTheme = useAppStore((state) => state.resolvedTheme);
  const hydrateThemeFromStorage = useAppStore((state) => state.hydrateThemeFromStorage);
  const syncSystemTheme = useAppStore((state) => state.syncSystemTheme);

  const sections = useMemo(() => parseMarkdown(markdown).sections, [markdown]);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-theme-mode', themeMode);

    if (!hasAppliedInitialThemeRef.current) {
      hasAppliedInitialThemeRef.current = true;
      return;
    }

    document.documentElement.setAttribute('data-theme-transitioning', 'true');
    if (themeTransitionTimeoutRef.current !== null) {
      window.clearTimeout(themeTransitionTimeoutRef.current);
    }

    themeTransitionTimeoutRef.current = window.setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transitioning');
      themeTransitionTimeoutRef.current = null;
    }, 180);

    return () => {
      if (themeTransitionTimeoutRef.current !== null) {
        window.clearTimeout(themeTransitionTimeoutRef.current);
        themeTransitionTimeoutRef.current = null;
      }
      document.documentElement.removeAttribute('data-theme-transitioning');
    };
  }, [resolvedTheme, themeMode]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-theme-ready', 'false');
    const frameId = window.requestAnimationFrame(() => {
      document.documentElement.setAttribute('data-theme-ready', 'true');
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (themeMode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      syncSystemTheme();
    };

    syncSystemTheme();
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, [syncSystemTheme, themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'glance-theme-mode-v1') {
        hydrateThemeFromStorage();
      }
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [hydrateThemeFromStorage]);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      unlisten = await listenForThemeChanged(({ mode }) => {
        if (didCancel) {
          return;
        }

        const state = useAppStore.getState();
        if (state.themeMode !== mode) {
          state.setThemeMode(mode);
          return;
        }

        if (mode === 'system') {
          state.syncSystemTheme();
        }
      });
    })();

    return () => {
      didCancel = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    void emitThemeChanged(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistActiveSession();
    }, 700);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSessionId, markdown, persistActiveSession]);

  useEffect(() => {
    if (!toastMessage) {
      setIsToastClosing(false);
      return;
    }

    setIsToastClosing(false);
    const closeAnimationLeadMs = 220;
    const durationMs = 3000;
    const closePhaseId = window.setTimeout(() => {
      setIsToastClosing(true);
    }, durationMs - closeAnimationLeadMs);

    const timeoutId = window.setTimeout(() => {
      clearToast();
    }, durationMs);

    return () => {
      window.clearTimeout(closePhaseId);
      window.clearTimeout(timeoutId);
    };
  }, [clearToast, toastMessage]);

  useEffect(() => {
    if (parseWarnings.length === 0) {
      warningSignatureRef.current = '';
      return;
    }

    const signature = parseWarnings.map((warning) => `${warning.code}-${warning.lineIndex ?? 0}`).join('|');
    if (signature === warningSignatureRef.current) {
      return;
    }

    warningSignatureRef.current = signature;
    showToast(parseWarnings[0].message, 'warning');
  }, [parseWarnings, showToast]);

  useEffect(() => {
    return () => {
      if (tabSwitchTimeoutRef.current !== null) {
        window.clearTimeout(tabSwitchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: () => void = () => undefined;

    void listenForMainWindowShown(() => {
      setMainWindowTransition('fade-in');
      if (fadeInFrameRef.current !== null) {
        window.cancelAnimationFrame(fadeInFrameRef.current);
      }
      fadeInFrameRef.current = window.requestAnimationFrame(() => {
        setMainWindowTransition('idle');
        fadeInFrameRef.current = null;
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (fadeInFrameRef.current !== null) {
        window.cancelAnimationFrame(fadeInFrameRef.current);
      }
      unlisten();
    };
  }, []);

  const switchTab = (nextTab: MainTab) => {
    if (!initialized || nextTab === activeTab) {
      return;
    }

    if (tabSwitchTimeoutRef.current !== null) {
      window.clearTimeout(tabSwitchTimeoutRef.current);
    }

    setIsTabSwitchAnimating(true);
    tabSwitchTimeoutRef.current = window.setTimeout(() => {
      startTransition(() => {
        setActiveTab(nextTab);
      });
      window.requestAnimationFrame(() => {
        setIsTabSwitchAnimating(false);
      });
      tabSwitchTimeoutRef.current = null;
    }, 130);
  };

  const activePanel = useMemo(() => {
    if (activeTab === 'library') {
      return (
        <LibraryView
          sessions={sessions}
          activeSessionId={activeSessionId}
          onOpen={(id) => {
            switchTab('editor');
            void openSession(id);
          }}
          onCreate={(name) => {
            void createSessionWithName(name);
            switchTab('editor');
          }}
          onDelete={(id) => {
            void deleteSessionById(id);
          }}
          onImport={() => {
            importInputRef.current?.click();
          }}
        />
      );
    }

    if (activeTab === 'editor') {
      return (
        <EditorView
          markdown={markdown}
          sections={sections}
          warnings={parseWarnings}
          hasSessions={sessions.length > 0}
          hasActiveSession={Boolean(activeSessionId)}
          onChange={setMarkdown}
          onCreateSession={() => {
            void createSessionWithName(defaultSessionTitle());
          }}
          onImportSession={() => {
            importInputRef.current?.click();
          }}
          onOpenSessions={() => {
            switchTab('library');
          }}
          onOpenShortcutSettings={() => {
            switchTab('settings');
          }}
          onExportMarkdown={() => {
            void (async () => {
              if (!activeSessionId) {
                showToast('Open a session before exporting', 'warning');
                return;
              }

              if (!isTauri()) {
                showToast('Export is available in the desktop app runtime', 'info');
                return;
              }

              const selectedSession = sessions.find((session) => session.id === activeSessionId);
              const defaultPath = toExportFilename(selectedSession?.title ?? 'session');
              const selectedPath = await save({
                title: 'Export Markdown Session',
                defaultPath,
                filters: [{ name: 'Markdown', extensions: ['md'] }]
              });

              if (!selectedPath || Array.isArray(selectedPath)) {
                return;
              }

              const persisted = await persistActiveSession();
              if (!persisted) {
                return;
              }

              const exportedPath = await exportSessionById(activeSessionId, selectedPath, false);
              if (exportedPath) {
                showToast('Markdown exported', 'success');
              }
            })();
          }}
          onLaunchOverlay={() => {
            void (async () => {
              try {
                const persisted = await persistActiveSession();
                if (activeSessionId && !persisted) {
                  return;
                }

                setMainWindowTransition('fade-out');
                await new Promise((resolve) => {
                  window.setTimeout(resolve, windowFadeDurationMs);
                });
                await openOverlayWindow();
                await emitThemeChanged(themeMode);
                await hideMainWindow();
                setMainWindowTransition('idle');
              } catch (error) {
                setMainWindowTransition('idle');
                const message = error instanceof Error ? error.message : 'Failed to launch prompter';
                showToast(message, 'error');
              }
            })();
          }}
          onCloseOverlay={() => {
            void closeOverlayWindow().catch((error) => {
              const message = error instanceof Error ? error.message : 'Failed to close prompter';
              showToast(message, 'error');
            });
          }}
        />
      );
    }

    if (activeTab === 'settings') {
      return <SettingsView />;
    }

    return <HelpView />;
  }, [
    activeSessionId,
    activeTab,
    createSessionWithName,
    deleteSessionById,
    exportSessionById,
    markdown,
    openSession,
    parseWarnings,
    persistActiveSession,
    sections,
    sessions,
    setMarkdown,
    showToast,
    themeMode,
    initialized,
    switchTab
  ]);

  if (isOverlay) {
    return <OverlayPrompter />;
  }

  if (initialized && !hasCompletedOnboarding) {
    return <PrivacyGate />;
  }

  return (
    <main className={`app-shell main-window-transition-${mainWindowTransition}`}>
      <aside className="sidebar" aria-label="Primary navigation">
        <nav className="icon-nav">
          <div className="icon-nav-group">
            {tabs.slice(0, 2).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`nav-icon-button ${activeTab === tab.id ? 'active' : ''}`}
                aria-label={tab.label}
                title={tab.id === 'library' ? 'Sessions' : 'Scripts'}
                onClick={() => {
                  switchTab(tab.id);
                }}
              >
                <tab.icon />
                <span className="sr-only">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="icon-nav-spacer" aria-hidden="true" />
          <div className="icon-nav-group">
            {tabs.slice(2).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`nav-icon-button ${activeTab === tab.id ? 'active' : ''}`}
                aria-label={tab.label}
                title={tab.id === 'settings' ? 'Settings' : 'Help'}
                onClick={() => {
                  switchTab(tab.id);
                }}
              >
                <tab.icon />
                <span className="sr-only">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </aside>

      <section className="content-area">
        {toastMessage ? (
          <div className="toast-layer" aria-live="polite">
            <div
              className={`toast-banner toast-${toastMessage.variant} ${isToastClosing ? 'is-closing' : ''}`}
              role="status"
            >
              <span className="toast-icon" aria-hidden="true">
                <ToastIcon variant={toastMessage.variant} />
              </span>
              <span className="toast-copy">{toastMessage.message}</span>
            </div>
          </div>
        ) : null}

        {!initialized ? (
          <p className="startup-label">Loading local workspace…</p>
        ) : (
          <ReactViewTransition
            default="app-page-fade"
            update="app-page-update"
            enter="app-page-enter"
            exit="app-page-exit"
          >
            <div key={activeTab} className={`panel-switch ${isTabSwitchAnimating ? 'is-switching' : ''}`}>
              {activePanel}
            </div>
          </ReactViewTransition>
        )}
      </section>

      <input
        ref={importInputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        className="hidden-file-input"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (!selected) {
            return;
          }

          void selected.text().then((content) => {
            const suggestedName = selected.name.replace(/\.(md|markdown|txt)$/i, '');
            return importMarkdown(suggestedName || 'Imported Session', content);
          });

          event.target.value = '';
        }}
      />

    </main>
  );
}
