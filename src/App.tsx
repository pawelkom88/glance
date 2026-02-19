import { useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { EditorView } from './components/editor-view';
import { HelpView } from './components/help-view';
import { LibraryView } from './components/library-view';
import { OverlayPrompter } from './components/overlay-prompter';
import { SettingsView } from './components/settings-view';
import { parseMarkdown } from './lib/markdown';
import { closeOverlayWindow, openOverlayWindow } from './lib/tauri';
import { useAppStore } from './store/use-app-store';

type MainTab = 'library' | 'editor' | 'settings' | 'help';

const tabs: ReadonlyArray<{ readonly id: MainTab; readonly label: string }> = [
  { id: 'library', label: 'Library' },
  { id: 'editor', label: 'Editor' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' }
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
            void openOverlayWindow().catch((error) => {
              const message = error instanceof Error ? error.message : 'Failed to launch prompter';
              showToast(message);
            });
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
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <h1>Glance</h1>
        <nav>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-pill ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="content-area">
        {!initialized ? <p className="startup-label">Loading local workspace…</p> : activePanel}
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
