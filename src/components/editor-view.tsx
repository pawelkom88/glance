import type { ParseWarning, SectionItem } from '../types';

interface EditorViewProps {
  readonly markdown: string;
  readonly activeSessionTitle: string;
  readonly autosaveStatus: 'saving' | 'saved';
  readonly sections: readonly SectionItem[];
  readonly warnings: readonly ParseWarning[];
  readonly hasSessions: boolean;
  readonly hasActiveSession: boolean;
  readonly onChange: (value: string) => void;
  readonly onCreateSession: () => void;
  readonly onImportSession: () => void;
  readonly onOpenSessions: () => void;
  readonly onOpenShortcutSettings: () => void;
  readonly onLaunchOverlay: () => void;
  readonly onCloseOverlay: () => void;
  readonly onExportMarkdown: () => void;
}

function estimateReadDuration(words: number): string {
  const totalSeconds = Math.max(0, Math.round((words / 130) * 60));
  if (totalSeconds < 60) {
    return `~${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `~${minutes}m ${seconds}s`;
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 15V5m0 0-3 3m3-3 3 3" />
      <path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 12.2 20 4l-8.2 16-1.8-6-6-1.8Z" />
      <path d="M10 14 20 4" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4v9m0 0-3-3m3 3 3-3" />
      <path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function EditorView(props: EditorViewProps) {
  const {
    markdown,
    activeSessionTitle,
    autosaveStatus,
    sections,
    warnings,
    hasSessions,
    hasActiveSession,
    onChange,
    onCreateSession,
    onImportSession,
    onOpenSessions,
    onOpenShortcutSettings,
    onLaunchOverlay,
    onExportMarkdown
  } = props;
  void onOpenShortcutSettings;
  void warnings;
  const hasSections = sections.length > 0;
  const sectionCount = (markdown.match(/^#{1,6}\s/gm) ?? []).length;
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).filter(Boolean).length : 0;
  const scriptWordsLabel = `~${wordCount}`;
  const estimatedRead = estimateReadDuration(wordCount);

  if (!hasSessions) {
    return (
      <section className="panel editor-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Session Editor</p>
            <h2>Create your first session</h2>
          </div>
          <div className="header-actions">
            <button type="button" className="cancel-button editor-action-button" onClick={onImportSession}>
              <ImportIcon />
              <span>Import Markdown</span>
            </button>
            <button type="button" className="primary-button editor-action-button" onClick={onCreateSession}>
              <PlusIcon />
              <span>New Session</span>
            </button>
          </div>
        </header>

        <div className="editor-empty-state" role="status" aria-live="polite">
          <div className="editor-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm6 1v4h4" />
              <path d="M9.5 13h5M12 10.5v5" />
            </svg>
          </div>
          <h3 className="editor-empty-title">No sessions yet</h3>
          <p className="editor-empty-copy">Create one to start writing markdown and section shortcuts.</p>
        </div>
      </section>
    );
  }

  if (!hasActiveSession) {
    return (
      <section className="panel editor-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">Session Editor</p>
            <h2>Select a session</h2>
          </div>
          <div className="header-actions">
            <button type="button" className="ghost-button editor-action-button" onClick={onCreateSession}>
              <PlusIcon />
              <span>New Session</span>
            </button>
            <button type="button" className="primary-button" onClick={onOpenSessions}>
              <span>Go to Sessions</span>
            </button>
          </div>
        </header>

        <div className="editor-empty-state" role="status" aria-live="polite">
          <div className="editor-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h3A2.5 2.5 0 0 1 12 6.5V20H6.5A2.5 2.5 0 0 1 4 17.5v-11Zm8 13.5V6.5A2.5 2.5 0 0 1 14.5 4h3A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H12Z" />
            </svg>
          </div>
          <h3 className="editor-empty-title">No session selected</h3>
          <p className="editor-empty-copy">
            Choose a session from Sessions to start writing and formatting markdown.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel editor-panel editor-panel-layout">
      <div className="editor-topbar">
        <button
          type="button"
          className="editor-breadcrumb-link editor-breadcrumb-mobile"
          onClick={onOpenSessions}
        >
          ‹ Sessions
        </button>
        <div className="editor-breadcrumb editor-breadcrumb-desktop">
          <button type="button" className="editor-breadcrumb-link" onClick={onOpenSessions}>Sessions</button>
          <span className="editor-breadcrumb-separator" aria-hidden="true">›</span>
          <span className="editor-breadcrumb-current" title={activeSessionTitle}>{activeSessionTitle}</span>
        </div>
        <div className="editor-topbar-spacer" aria-hidden="true" />
        <span className={`autosave-badge ${autosaveStatus === 'saving' ? 'is-saving' : ''}`}>
          {autosaveStatus === 'saving' ? 'Saving…' : 'Saved'}
        </span>
      </div>

      <div className="editor-mobile-actions">
        <button
          type="button"
          className="editor-mobile-launch"
          onClick={onLaunchOverlay}
          disabled={!hasSections}
        >
          <RocketIcon />
          Launch
        </button>
        <button type="button" className="editor-mobile-export" onClick={onExportMarkdown}>
          <ExportIcon />
          Export
        </button>
      </div>

      <div className="editor-body">
        <div className="editor-canvas">
          <textarea
            id="session-markdown"
            className="editor-textarea"
            value={markdown}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
          />

          <div className="editor-mobile-infostrip">
            <span className="editor-info-pill">
              <span className="editor-info-pill-label">Sections</span>
              <span className="editor-info-pill-value">{sectionCount}</span>
            </span>
            <span className="editor-info-pill">
              <span className="editor-info-pill-label">Words</span>
              <span className="editor-info-pill-value">{scriptWordsLabel}</span>
            </span>
            <span className="editor-info-pill">
              <span className="editor-info-pill-label">Est. read</span>
              <span className="editor-info-pill-value">{estimatedRead}</span>
            </span>
          </div>

          <div className="editor-statusbar">
            <span>Markdown</span>
            <span aria-hidden="true">·</span>
            <span>UTF-8</span>
            <span className="editor-statusbar-wordcount" aria-hidden="true">·</span>
            <span className="editor-statusbar-wordcount">{wordCount} words</span>
          </div>
        </div>

        <aside className="editor-sidebar">
          <section className="editor-sidebar-panel">
            <span className="editor-sidebar-label">Actions</span>
            <button
              type="button"
              className="editor-sidebar-launch"
              onClick={onLaunchOverlay}
              disabled={!hasSections}
            >
              <RocketIcon />
              Launch Prompter
            </button>
            <button type="button" className="editor-sidebar-export" onClick={onExportMarkdown}>
              <ExportIcon />
              Export Markdown
            </button>
          </section>

          <section className="editor-sidebar-panel">
            <span className="editor-sidebar-label">Script Info</span>
            <div className="editor-script-info-row">
              <span className="editor-script-info-label">Sections</span>
              <span className="editor-script-info-value">{sectionCount}</span>
            </div>
            <div className="editor-script-info-row">
              <span className="editor-script-info-label">Words</span>
              <span className="editor-script-info-value">{scriptWordsLabel}</span>
            </div>
            <div className="editor-script-info-row">
              <span className="editor-script-info-label">Est. read</span>
              <span className="editor-script-info-value">{estimatedRead}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
