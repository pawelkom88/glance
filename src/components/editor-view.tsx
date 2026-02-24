import type { ParseWarning, SectionItem } from '../types';

interface EditorViewProps {
  readonly markdown: string;
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

function shortcutLabel(index: number): string {
  return navigator.platform.includes('Mac') ? `⌘${index}` : `Ctrl+${index}`;
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
  const hasSections = sections.length > 0;

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
    <section className="panel editor-panel">
      <header className="panel-header">
        <div>
          <h2>Session Editor</h2>
          <p className="editor-autosave-note">Changes are saved automatically on this device.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button editor-action-button" onClick={onExportMarkdown}>
            <ExportIcon />
            Export Markdown
          </button>
          <button
            type="button"
            className="primary-button editor-action-button"
            onClick={onLaunchOverlay}
            disabled={!hasSections}
          >
            <RocketIcon />
            Launch Prompter
          </button>
        </div>
      </header>

      <div className="editor-grid">
        <div className="editor-area">
          <div className="editor-column-head">
            <label className="editor-area-span" htmlFor="session-markdown">Markdown</label>
          </div>
          <textarea
            id="session-markdown"
            value={markdown}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
          />
        </div>
<br/>
        <div className="sections-column">
            <div>
              <span className="editor-area-span">Quick Navigation</span>
              <p className="sections-help-text">Auto-generated shortcuts from your headings</p>
            </div>
          <aside className="sections-panel" aria-label="Derived sections">
            {hasSections ? (
              <ul>
                {sections.map((section, index) => (
                    <>
                  <li key={section.id}>
                    <span className="section-item-title">{section.title}</span>
                    <span className="section-item-hotkey">
                      {section.hotkeyIndex ? shortcutLabel(section.hotkeyIndex) : 'Click only'}
                    </span>
                  </li>
                      {index < sections.length - 1 &&
                      <div className="section-item-divider"></div>
                      }
                    </>
                ))}
              </ul>
            ) : (
              <p className="warning-text">Add at least one `# Heading` to enable the prompter.</p>
            )}

            {warnings.length > 0 ? (
              <div className="inline-warning-list" role="status" aria-live="polite">
                {warnings.map((warning) => (
                  <p key={`${warning.code}-${warning.lineIndex ?? 0}`} className="warning-text">
                    {warning.message}
                  </p>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
