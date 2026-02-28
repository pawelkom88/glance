import type { ParseWarning, SectionItem } from '../types';
import { useI18n } from '../i18n/use-i18n';

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

function estimateReadDuration(words: number, t: (keyPath: any, params?: any) => string): string {
  const totalSeconds = Math.max(0, Math.round((words / 130) * 60));
  if (totalSeconds < 60) {
    return t('editor.estimateReadSeconds', { seconds: totalSeconds });
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return t('editor.estimateReadMinutes', { minutes, seconds });
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
  const { t } = useI18n();
  const sectionCount = sections.length;
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).filter(Boolean).length : 0;
  const scriptWordsLabel = t('editor.wordCountApprox', { count: wordCount });
  const estimatedRead = estimateReadDuration(wordCount, t);

  if (!hasSessions) {
    return (
      <section className="panel editor-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">{t('editor.headerLabel')}</p>
            <h2>{t('editor.createFirstSessionTitle')}</h2>
          </div>
          <div className="header-actions">
            <button type="button" className="cancel-button editor-action-button" onClick={onImportSession}>
              <ImportIcon />
              <span>{t('editor.importMarkdown')}</span>
            </button>
            <button type="button" className="primary-button editor-action-button" onClick={onCreateSession}>
              <PlusIcon />
              <span>{t('editor.newSession')}</span>
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
          <h3 className="editor-empty-title">{t('editor.noSessionsYetTitle')}</h3>
          <p className="editor-empty-copy">{t('editor.noSessionsYetCopy')}</p>
        </div>
      </section>
    );
  }

  if (!hasActiveSession) {
    return (
      <section className="panel editor-panel">
        <header className="panel-header">
          <div>
            <p className="eyebrow">{t('editor.headerLabel')}</p>
            <h2>{t('editor.selectSessionTitle')}</h2>
          </div>
          <div className="header-actions">
            <button type="button" className="ghost-button editor-action-button" onClick={onCreateSession}>
              <PlusIcon />
              <span>{t('editor.newSession')}</span>
            </button>
            <button type="button" className="primary-button" onClick={onOpenSessions}>
              <span>{t('editor.goToSessions')}</span>
            </button>
          </div>
        </header>

        <div className="editor-empty-state" role="status" aria-live="polite">
          <div className="editor-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h3A2.5 2.5 0 0 1 12 6.5V20H6.5A2.5 2.5 0 0 1 4 17.5v-11Zm8 13.5V6.5A2.5 2.5 0 0 1 14.5 4h3A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H12Z" />
            </svg>
          </div>
          <h3 className="editor-empty-title">{t('editor.noSessionSelectedTitle')}</h3>
          <p className="editor-empty-copy">{t('editor.noSessionSelectedCopy')}</p>
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
          {`‹ ${t('editor.breadcrumbSessions')}`}
        </button>
        <div className="editor-breadcrumb editor-breadcrumb-desktop">
          <button type="button" className="editor-breadcrumb-link" onClick={onOpenSessions}>{t('editor.breadcrumbSessions')}</button>
          <span className="editor-breadcrumb-separator" aria-hidden="true">›</span>
          <span className="editor-breadcrumb-current" title={activeSessionTitle}>{activeSessionTitle}</span>
        </div>
        <div className="editor-topbar-spacer" aria-hidden="true" />
        <span className={`autosave-badge ${autosaveStatus === 'saving' ? 'is-saving' : ''}`}>
          {autosaveStatus === 'saving' ? t('editor.autosaveSaving') : t('editor.autosaveSaved')}
        </span>
      </div>

      <div className="editor-mobile-actions">
        <button
          type="button"
          className="editor-mobile-launch"
          onClick={onLaunchOverlay}
        >
          <RocketIcon />
          {t('editor.launch')}
        </button>
        <button type="button" className="editor-mobile-export" onClick={onExportMarkdown}>
          <ExportIcon />
          {t('editor.export')}
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
              <span className="editor-info-pill-label">{t('editor.infoSections')}</span>
              <span className="editor-info-pill-value">{sectionCount}</span>
            </span>
            <span className="editor-info-pill">
              <span className="editor-info-pill-label">{t('editor.infoWords')}</span>
              <span className="editor-info-pill-value">{scriptWordsLabel}</span>
            </span>
            <span className="editor-info-pill">
              <span className="editor-info-pill-label">{t('editor.infoEstimatedRead')}</span>
              <span className="editor-info-pill-value">{estimatedRead}</span>
            </span>
          </div>

          <div className="editor-statusbar">
            <span>{t('editor.statusMarkdown')}</span>
            <span aria-hidden="true">·</span>
            <span>{t('editor.statusEncoding')}</span>
            <span className="editor-statusbar-wordcount" aria-hidden="true">·</span>
            <span className="editor-statusbar-wordcount">{t('editor.statusWordCount', { count: wordCount })}</span>
          </div>
        </div>

        <aside className="editor-sidebar">
          <section className="editor-sidebar-panel">
            <span className="editor-sidebar-label">{t('editor.actions')}</span>
            <button
              type="button"
              className="editor-sidebar-launch"
              onClick={onLaunchOverlay}
            >
              <RocketIcon />
              {t('editor.launchPrompter')}
            </button>
            <button type="button" className="editor-sidebar-export" onClick={onExportMarkdown}>
              <ExportIcon />
              {t('editor.exportMarkdown')}
            </button>
          </section>

          <section className="editor-sidebar-panel">
            <span className="editor-sidebar-label">{t('editor.scriptInfo')}</span>
            <div className="editor-script-info-row">
              <span className="editor-script-info-label">{t('editor.infoSections')}</span>
              <span className="editor-script-info-value">{sectionCount}</span>
            </div>
            <div className="editor-script-info-row">
              <span className="editor-script-info-label">{t('editor.infoWords')}</span>
              <span className="editor-script-info-value">{scriptWordsLabel}</span>
            </div>
            <div className="editor-script-info-row">
              <span className="editor-script-info-label">{t('editor.infoEstimatedRead')}</span>
              <span className="editor-script-info-value">{estimatedRead}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
