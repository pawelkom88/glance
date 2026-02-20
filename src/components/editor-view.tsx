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
  readonly onSave: () => void;
}

function shortcutLabel(index: number): string {
  return navigator.platform.includes('Mac') ? `⌘${index}` : `Ctrl+${index}`;
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
    onSave
  } = props;
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
            <button type="button" className="ghost-button" onClick={onImportSession}>
              Import Markdown
            </button>
            <button type="button" className="primary-button" onClick={onCreateSession}>
              New Session
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
            <button type="button" className="ghost-button" onClick={onCreateSession}>
              New Session
            </button>
            <button type="button" className="primary-button" onClick={onOpenSessions}>
              Go to Sessions
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
          <p className="eyebrow">Session Editor</p>
          <h2>Markdown Source</h2>
        </div>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={onSave}>
            Save
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onLaunchOverlay}
            disabled={!hasSections}
          >
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

        <div className="sections-column">
          <div className="editor-column-head editor-column-head-sections">
            <span className="editor-area-span">Sections</span>
            <button
              type="button"
              className="sections-customize-button"
              onClick={onOpenShortcutSettings}
            >
              Customize Shortcuts
            </button>
          </div>
          <aside className="sections-panel" aria-label="Derived sections">
            {hasSections ? (
              <ul>
                {sections.map((section) => (
                  <li key={section.id}>
                    <span className="section-item-title">{section.title}</span>
                    <span className="section-item-hotkey">
                      {section.hotkeyIndex ? shortcutLabel(section.hotkeyIndex) : 'Click only'}
                    </span>
                  </li>
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
