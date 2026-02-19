import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { EditorView } from './components/editor-view';
import { HelpView } from './components/help-view';
import { LibraryView } from './components/library-view';
import { OverlayPrompter } from './components/overlay-prompter';
import { SettingsView } from './components/settings-view';
import { parseMarkdown } from './lib/markdown';
import {
  closeOverlayWindow,
  hideMainWindow,
  listenForMainWindowShown,
  openOverlayWindow
} from './lib/tauri';
import { useAppStore } from './store/use-app-store';

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
      <path d="M19.2 14.3a7.8 7.8 0 0 0 .1-1.3c0-.4 0-.9-.1-1.3l2-1.6a.7.7 0 0 0 .2-.9l-1.9-3.2a.7.7 0 0 0-.8-.3l-2.4 1a8.2 8.2 0 0 0-2.2-1.3l-.4-2.6a.7.7 0 0 0-.7-.6h-3.8a.7.7 0 0 0-.7.6l-.4 2.6a8.2 8.2 0 0 0-2.2 1.3l-2.4-1a.7.7 0 0 0-.8.3L2.6 9.2a.7.7 0 0 0 .2.9l2 1.6A7.8 7.8 0 0 0 4.7 13c0 .4 0 .9.1 1.3l-2 1.6a.7.7 0 0 0-.2.9l1.9 3.2c.2.3.5.4.8.3l2.4-1a8.2 8.2 0 0 0 2.2 1.3l.4 2.6c.1.3.3.6.7.6h3.8c.4 0 .6-.3.7-.6l.4-2.6a8.2 8.2 0 0 0 2.2-1.3l2.4 1c.3.1.6 0 .8-.3l1.9-3.2a.7.7 0 0 0-.2-.9l-2-1.6ZM12 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
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

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('library');
  const [isOverlay] = useState<boolean>(isOverlayRoute);
  const [isTabSwitchAnimating, setIsTabSwitchAnimating] = useState(false);
  const [mainWindowTransition, setMainWindowTransition] = useState<'idle' | 'fade-out' | 'fade-in'>('idle');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const warningSignatureRef = useRef<string>('');

  const initialized = useAppStore((state) => state.initialized);
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const markdown = useAppStore((state) => state.markdown);
  const parseWarnings = useAppStore((state) => state.parseWarnings);
  const shortcutWarning = useAppStore((state) => state.shortcutWarning);
  const toastMessage = useAppStore((state) => state.toastMessage);
  const loadInitialState = useAppStore((state) => state.loadInitialState);
  const createSessionWithName = useAppStore((state) => state.createSessionWithName);
  const duplicateSessionById = useAppStore((state) => state.duplicateSessionById);
  const deleteSessionById = useAppStore((state) => state.deleteSessionById);
  const importMarkdown = useAppStore((state) => state.importMarkdown);
  const exportSessionById = useAppStore((state) => state.exportSessionById);
  const openSession = useAppStore((state) => state.openSession);
  const setMarkdown = useAppStore((state) => state.setMarkdown);
  const persistActiveSession = useAppStore((state) => state.persistActiveSession);
  const clearToast = useAppStore((state) => state.clearToast);
  const showToast = useAppStore((state) => state.showToast);

  const sections = useMemo(() => parseMarkdown(markdown).sections, [markdown]);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

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
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearToast();
    }, 1400);

    return () => {
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
    showToast(parseWarnings[0].message);
  }, [parseWarnings, showToast]);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    setIsTabSwitchAnimating(true);
    const frame = window.requestAnimationFrame(() => {
      setIsTabSwitchAnimating(false);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeTab, initialized]);

  useEffect(() => {
    let unlisten: () => void = () => undefined;

    void listenForMainWindowShown(() => {
      setMainWindowTransition('fade-in');
      window.setTimeout(() => {
        setMainWindowTransition('idle');
      }, windowFadeDurationMs + 20);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten();
    };
  }, []);

  const activePanel = useMemo(() => {
    if (activeTab === 'library') {
      return (
        <LibraryView
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={(id) => {
            void openSession(id);
          }}
          onOpen={(id) => {
            setActiveTab('editor');
            void openSession(id);
          }}
          onCreate={(name) => {
            void createSessionWithName(name);
            setActiveTab('editor');
          }}
          onDuplicate={(id) => {
            void duplicateSessionById(id);
          }}
          onDelete={(id) => {
            void deleteSessionById(id);
          }}
          onImport={() => {
            importInputRef.current?.click();
          }}
          onExportSession={(id) => {
            if (!isTauri()) {
              showToast('Export is available in the desktop app runtime');
              return;
            }

            const selectedSession = sessions.find((session) => session.id === id);
            const defaultPath = toExportFilename(selectedSession?.title ?? 'session');

            void save({
              title: 'Export Markdown Session',
              defaultPath,
              filters: [{ name: 'Markdown', extensions: ['md'] }]
            }).then((selectedPath) => {
              if (!selectedPath || Array.isArray(selectedPath)) {
                return;
              }
              void exportSessionById(id, selectedPath);
            });
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
          onChange={setMarkdown}
          onSave={() => {
            void persistActiveSession();
          }}
          onLaunchOverlay={() => {
            void (async () => {
              try {
                setMainWindowTransition('fade-out');
                await new Promise((resolve) => {
                  window.setTimeout(resolve, windowFadeDurationMs);
                });
                await openOverlayWindow();
                await hideMainWindow();
                setMainWindowTransition('idle');
              } catch (error) {
                setMainWindowTransition('idle');
                const message = error instanceof Error ? error.message : 'Failed to launch prompter';
                showToast(message);
              }
            })();
          }}
          onCloseOverlay={() => {
            void closeOverlayWindow().catch((error) => {
              const message = error instanceof Error ? error.message : 'Failed to close prompter';
              showToast(message);
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
    duplicateSessionById,
    exportSessionById,
    markdown,
    openSession,
    parseWarnings,
    persistActiveSession,
    sections,
    sessions,
    setMarkdown,
    showToast
  ]);

  if (isOverlay) {
    return <OverlayPrompter />;
  }

  return (
    <main className={`app-shell main-window-transition-${mainWindowTransition}`}>
      <aside className="sidebar" aria-label="Primary navigation">
        <nav className="icon-nav">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-icon-button ${activeTab === tab.id ? 'active' : ''}`}
              aria-label={tab.label}
              data-tooltip={tab.label}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon />
              <span className="sr-only">{tab.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="content-area">
        {!initialized ? (
          <p className="startup-label">Loading local workspace…</p>
        ) : (
          <div className={`panel-switch ${isTabSwitchAnimating ? 'is-switching' : ''}`}>{activePanel}</div>
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

      {shortcutWarning ? <p className="warning-banner">Shortcut warning: {shortcutWarning}</p> : null}
      {toastMessage ? <p className="toast-banner">{toastMessage}</p> : null}
    </main>
  );
}
