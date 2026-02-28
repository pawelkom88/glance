import { type ReactElement, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { EditorView } from './components/editor-view';
import { HelpView } from './components/help-view';
import { LibraryView } from './components/library-view';
import { OverlayPrompter } from './components/overlay-prompter';
import { SettingsView } from './components/settings-view';
import { PrivacyGate } from './components/privacy-gate';
import { useAppReady } from './hooks/useAppReady';
import { parseMarkdown } from './lib/markdown';
import {
  closeOverlayWindow,
  emitThemeChanged,
  getLastMainMonitorName,
  hideMainWindow,
  listenForLanguageChanged,
  listenForThemeChanged,
  listenForMainWindowShown,
  moveWindowToMonitor,
  openOverlayWindow,
  parseMonitorPreferenceKey
} from './lib/tauri';
import { useAppStore } from './store/use-app-store';
import { useI18n } from './i18n/use-i18n';
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
  readonly labelKey: 'tabLibrary' | 'tabEditor' | 'tabSettings' | 'tabHelp';
  readonly icon: () => ReactElement;
}> = [
    { id: 'library', labelKey: 'tabLibrary', icon: LibraryIcon },
    { id: 'editor', labelKey: 'tabEditor', icon: EditorIcon },
    { id: 'settings', labelKey: 'tabSettings', icon: SettingsIcon },
    { id: 'help', labelKey: 'tabHelp', icon: HelpIcon }
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

function BannerIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <svg viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 7.5L6.8 9.3L10.5 5.5" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (variant === 'warning') {
    return (
      <svg viewBox="0 0 15 15" fill="none">
        <path d="M7.5 2L13.5 13H1.5L7.5 2Z" stroke="currentColor" strokeWidth="1.5"
          strokeLinejoin="round" />
        <path d="M7.5 6V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7.5" cy="11" r="0.75" fill="currentColor" />
      </svg>
    );
  }

  if (variant === 'error') {
    return (
      <svg viewBox="0 0 15 15" fill="none">
        <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 5L10 10M10 5L5 10" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 6.8V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7.5" cy="4.8" r="0.75" fill="currentColor" />
    </svg>
  );
}

export default function App() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<MainTab>('library');
  const [isOverlay] = useState<boolean>(isOverlayRoute);
  const [isTabSwitchAnimating, setIsTabSwitchAnimating] = useState(false);
  const [mainWindowTransition, setMainWindowTransition] = useState<'idle' | 'fade-out' | 'fade-in'>('idle');
  const [isToastClosing, setIsToastClosing] = useState(false);
  const [editorAutosaveStatus, setEditorAutosaveStatus] = useState<'saving' | 'saved'>('saved');
  const [createSessionRequestToken, setCreateSessionRequestToken] = useState(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const warningSignatureRef = useRef<string>('');
  const fadeInFrameRef = useRef<number | null>(null);
  const tabSwitchTimeoutRef = useRef<number | null>(null);
  const themeTransitionTimeoutRef = useRef<number | null>(null);
  const hasAppliedInitialThemeRef = useRef(false);
  const markAppReady = useAppReady();

  const initialized = useAppStore((state) => state.initialized);
  const sessions = useAppStore((state) => state.sessions);
  const folders = useAppStore((state) => state.folders);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const activeSessionTitle = useAppStore((state) => state.activeSessionTitle);
  const markdown = useAppStore((state) => state.markdown);
  const parseWarnings = useAppStore((state) => state.parseWarnings);
  const toastMessage = useAppStore((state) => state.toastMessage);
  const loadInitialState = useAppStore((state) => state.loadInitialState);
  const createSessionWithName = useAppStore((state) => state.createSessionWithName);
  const createFolderWithName = useAppStore((state) => state.createFolderWithName);
  const renameFolderById = useAppStore((state) => state.renameFolderById);
  const deleteFolderById = useAppStore((state) => state.deleteFolderById);
  const moveSessionsByIdsToFolder = useAppStore((state) => state.moveSessionsByIdsToFolder);
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
  const hydrateLanguageFromStorage = useAppStore((state) => state.hydrateLanguageFromStorage);
  const syncSystemTheme = useAppStore((state) => state.syncSystemTheme);

  const sections = useMemo(() => parseMarkdown(markdown).sections, [markdown]);
  const hasStartupContentReady = isOverlay || initialized;

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  useEffect(() => {
    if (!hasStartupContentReady || typeof window === 'undefined') {
      return;
    }

    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    firstFrameId = window.requestAnimationFrame(() => {
      secondFrameId = window.requestAnimationFrame(() => {
        markAppReady();
      });
    });

    return () => {
      if (firstFrameId !== null) {
        window.cancelAnimationFrame(firstFrameId);
      }
      if (secondFrameId !== null) {
        window.cancelAnimationFrame(secondFrameId);
      }
    };
  }, [hasStartupContentReady, markAppReady]);

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
        return;
      }

      if (event.key === 'glance-language-v1') {
        hydrateLanguageFromStorage();
      }
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [hydrateLanguageFromStorage, hydrateThemeFromStorage]);

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
    let didCancel = false;
    let unlisten: (() => void) | null = null;

    void (async () => {
      unlisten = await listenForLanguageChanged(({ language: nextLanguage }) => {
        if (didCancel) {
          return;
        }

        const state = useAppStore.getState();
        if (state.language !== nextLanguage) {
          state.setLanguage(nextLanguage, false);
          return;
        }

        state.hydrateLanguageFromStorage();
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
      setEditorAutosaveStatus('saved');
      return;
    }

    setEditorAutosaveStatus('saving');
    let didCancel = false;
    const timeoutId = window.setTimeout(() => {
      void persistActiveSession().finally(() => {
        if (!didCancel) {
          setEditorAutosaveStatus('saved');
        }
      });
    }, 700);

    return () => {
      didCancel = true;
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

  useEffect(() => {
    if (!isTauri() || isOverlay) {
      return;
    }

    const savedMonitorKey = getLastMainMonitorName();
    if (!savedMonitorKey) {
      return;
    }

    if (!parseMonitorPreferenceKey(savedMonitorKey)) {
      return;
    }

    void moveWindowToMonitor(savedMonitorKey).catch(() => {
      // Ignore at startup if the saved monitor is unavailable.
    });
  }, [isOverlay]);

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
          folders={folders}
          createSessionRequestToken={createSessionRequestToken}
          activeSessionId={activeSessionId}
          onOpen={(id) => {
            switchTab('editor');
            void openSession(id);
          }}
          onCreate={(name, folderId) => {
            void createSessionWithName(name, folderId);
            switchTab('editor');
          }}
          onDelete={(id, notify = true) => {
            void deleteSessionById(id, notify);
          }}
          onCreateFolder={(name) => {
            void createFolderWithName(name);
          }}
          onRenameFolder={(id, name) => {
            void renameFolderById(id, name);
          }}
          onDeleteFolder={(id) => {
            void deleteFolderById(id);
          }}
          onMoveSessions={(sessionIds, folderId) => {
            return moveSessionsByIdsToFolder(sessionIds, folderId);
          }}
          onImport={() => {
            importInputRef.current?.click();
          }}
          showToast={showToast}
        />
      );
    }

    if (activeTab === 'editor') {
      return (
        <EditorView
          markdown={markdown}
          activeSessionTitle={activeSessionTitle}
          autosaveStatus={editorAutosaveStatus}
          sections={sections}
          warnings={parseWarnings}
          hasSessions={sessions.length > 0}
          hasActiveSession={Boolean(activeSessionId)}
          onChange={setMarkdown}
          onCreateSession={() => {
            setCreateSessionRequestToken((previous) => previous + 1);
            switchTab('library');
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
                showToast(t('editor.exportErrorNoSessionToast'), 'warning');
                return;
              }

              if (!isTauri()) {
                showToast(t('editor.exportErrorDesktopOnlyToast'), 'info');
                return;
              }

              const selectedSession = sessions.find((session) => session.id === activeSessionId);
              const defaultFilename = toExportFilename(selectedSession?.title ?? t('library.exportFilenameFallback'));
              const selectedPath = await save({
                title: t('editor.exportSessionTitle'),
                defaultPath: defaultFilename,
                filters: [{ name: t('editor.exportMarkdownFilter'), extensions: ['md'] }]
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
                showToast(t('editor.exportSuccessToast'), 'success');
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
                const message = error instanceof Error ? error.message : t('editor.launchErrorToast');
                showToast(message, 'error');
              }
            })();
          }}
          onCloseOverlay={() => {
            void closeOverlayWindow().catch((error) => {
              const message = error instanceof Error ? error.message : t('editor.closeErrorToast');
              showToast(message, 'error');
            });
          }}
        />
      );
    }

    if (activeTab === 'settings') {
      return <SettingsView />;
    }

    return <HelpView onRestoreSuccess={() => switchTab('editor')} />;
  }, [
    activeSessionId,
    activeSessionTitle,
    activeTab,
    createSessionWithName,
    createFolderWithName,
    deleteFolderById,
    deleteSessionById,
    exportSessionById,
    markdown,
    moveSessionsByIdsToFolder,
    openSession,
    renameFolderById,
    parseWarnings,
    persistActiveSession,
    sections,
    sessions,
    folders,
    setMarkdown,
    editorAutosaveStatus,
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
      <nav className="sidebar-nav" aria-label={t('app.primaryNavigation')}>
        <nav className="icon-nav">
          <div className="icon-nav-group">
            {tabs.slice(0, 2).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`nav-icon-button ${activeTab === tab.id ? 'active' : ''}`}
                aria-label={t(`app.${tab.labelKey}`)}
                title={tab.id === 'library' ? t('app.sidebarSessionsTitle') : t('app.sidebarScriptsTitle')}
                onClick={() => {
                  switchTab(tab.id);
                }}
              >
                <tab.icon />
                <span className="sr-only">{t(`app.${tab.labelKey}`)}</span>
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
                aria-label={t(`app.${tab.labelKey}`)}
                title={tab.id === 'settings' ? t('app.tabSettings') : t('app.tabHelp')}
                onClick={() => {
                  switchTab(tab.id);
                }}
              >
                <tab.icon />
                <span className="sr-only">{t(`app.${tab.labelKey}`)}</span>
              </button>
            ))}
          </div>
        </nav>
      </nav>

      <section className="content-area">
        {toastMessage ? (
          <div className="toast-layer">
            <div
              className={`banner banner-${toastMessage.variant} ${isToastClosing ? 'banner-leaving' : ''}`}
              role={toastMessage.variant === 'error' ? 'alert' : 'status'}
              aria-live={toastMessage.variant === 'error' ? 'assertive' : 'polite'}
            >
              <div className="banner-stripe" />
              <div className="banner-body">
                <div className="banner-icon" aria-hidden="true">
                  <BannerIcon variant={toastMessage.variant} />
                </div>
                <div className="banner-text">
                  <div className="banner-title">{toastMessage.message}</div>
                </div>
              </div>
              <button className="banner-dismiss" aria-label={t('app.dismissBanner')} onClick={() => { setIsToastClosing(true); }}>✕</button>
            </div>
          </div>
        ) : null}

        {!initialized ? (
          <p className="startup-label">{t('app.loading')}</p>
        ) : (
          <div key={activeTab} className={`panel-switch ${isTabSwitchAnimating ? 'is-switching' : ''}`}>
            {activePanel}
          </div>
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
            return importMarkdown(suggestedName || t('library.importedSessionName'), content);
          });

          event.target.value = '';
        }}
      />

    </main>
  );
}
