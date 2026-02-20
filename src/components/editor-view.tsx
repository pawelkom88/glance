import type { ParseWarning, SectionItem } from '../types';

interface EditorViewProps {
  readonly markdown: string;
  readonly sections: readonly SectionItem[];
  readonly warnings: readonly ParseWarning[];
  readonly onChange: (value: string) => void;
  readonly onLaunchOverlay: () => void;
  readonly onCloseOverlay: () => void;
  readonly onSave: () => void;
}

function shortcutLabel(index: number): string {
  return navigator.platform.includes('Mac') ? `⌘${index}` : `Ctrl+${index}`;
}

export function EditorView(props: EditorViewProps) {
  const { markdown, sections, warnings, onChange, onLaunchOverlay, onSave } = props;
  const hasSections = sections.length > 0;

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
        <label className="editor-area" htmlFor="session-markdown">
          <span className="editor-area-span">Markdown</span>
          <textarea
            id="session-markdown"
            value={markdown}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
          />
        </label>

        <div>
        <span className="editor-area-span">Sessions</span>
        <aside className="sections-panel" aria-label="Derived sections">
          {hasSections ? (
            <ul>
              {sections.map((section) => (
                <li key={section.id}>
                  <span>{section.title}</span>
                  <span>{section.hotkeyIndex ? shortcutLabel(section.hotkeyIndex) : 'Click only'}</span>
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
