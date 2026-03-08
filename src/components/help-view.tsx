import { open as openFileDialog, ask } from '@tauri-apps/plugin-dialog';
import { loadShortcutConfig } from '../lib/shortcuts';
import { openSessionsFolder, readTextFile } from '../lib/tauri';
import { useAppStore } from '../store/use-app-store';
import { useI18n } from '../i18n/use-i18n';
import { ShortcutKeycaps } from './shortcut-keycaps';

interface HelpViewProps {
  onRestoreSuccess?: () => void;
}

function toSuggestedSessionName(path: string, fallbackName: string): string {
  const filename = path.split(/[\\/]/).pop() ?? '';
  const cleaned = filename
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/\.bak\.\d+$/i, '')
    .replace(/\.bak$/i, '')
    .trim();
  return cleaned || fallbackName;
}

export function HelpView({ onRestoreSuccess }: HelpViewProps) {
  const { t } = useI18n();
  const modifier = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl';
  const shortcutConfig = loadShortcutConfig();
  const playPauseShortcut = shortcutConfig['toggle-play'];
  const restartShortcut = shortcutConfig['start-over'];
  const jumpStartShortcut = shortcutConfig['jump-1'];
  const jumpEndShortcut = shortcutConfig['jump-9'];
  const speedUpShortcut = shortcutConfig['speed-up'];
  const speedDownShortcut = shortcutConfig['speed-down'];
  const snapShortcut = shortcutConfig['snap-to-center'];
  const hideOverlayShortcut = shortcutConfig['hide-overlay'];

  const showToast = useAppStore((state) => state.showToast);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const importMarkdown = useAppStore((state) => state.importMarkdown);
  const persistActiveSession = useAppStore((state) => state.persistActiveSession);
  const setMarkdown = useAppStore((state) => state.setMarkdown);


  const handleRestore = async () => {
    try {
      const selected = await openFileDialog({
        title: t('help.restoreDialogTitle'),
        multiple: false,
        filters: [{ name: t('help.restoreDialogFilterName'), extensions: ['md', 'markdown', 'txt', 'bak', '1', '2', '3', '4', '5'] }]
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      const confirmed = await ask(
        t('help.restoreDialogPrompt'),
        {
          title: t('help.restoreConfirmTitle'),
          kind: 'warning',
          okLabel: t('help.restoreConfirmOk'),
          cancelLabel: t('help.restoreConfirmCancel')
        }
      );

      if (!confirmed) {
        return;
      }

      const restoredMarkdown = await readTextFile(selected);
      if (activeSessionId) {
        setMarkdown(restoredMarkdown);
        const persisted = await persistActiveSession();
        if (!persisted) {
          return;
        }
      } else {
        const suggestedName = toSuggestedSessionName(selected, t('help.fallbackRestoredSessionName'));
        await importMarkdown(suggestedName, restoredMarkdown, false);
      }

      showToast(t('help.restoreSuccess'), 'success');

      // Navigate to editor so user can see their restored content immediately
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('help.restoreFailure');
      showToast(message, 'error');
    }
  };

  return (
    <section className="help-pane">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <h2 className="help-heading">{t('help.heading')}</h2>
      </header>

      {/* Keyboard Shortcuts card */}
      <div>
        <div className="setting-group-label">{t('help.keyboardShortcutsCurrent')}</div>
        <p className="help-group-note">{t('help.shortcutsDefaultsNote')}</p>
        <div className="help-shortcut-card" aria-label={t('help.keyboardShortcutsAria')}>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutPlayPause')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={playPauseShortcut} />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutRestart')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={restartShortcut} />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutJumpToSection')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={[jumpStartShortcut, jumpEndShortcut]} alternativeSeparator="…" />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutAdjustSpeed')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={[speedUpShortcut, speedDownShortcut]} />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutAdjustOpacity')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={[`${modifier}+Shift+Up`, `${modifier}+Shift+Down`]} />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutFontSize')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={[`${modifier}+Plus`, `${modifier}+Minus`]} />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutSnapToCenter')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={snapShortcut} />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutTogglePrompter')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={hideOverlayShortcut} />
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">{t('help.shortcutClosePrompter')}</span>
            <ShortcutKeycaps className="hsr-keys" shortcuts={['Esc', `${modifier}+W`]} />
          </div>
        </div>
      </div>

      {/* 5-Step Call Flow card */}
      <div>
        <div className="setting-group-label">{t('help.callFlowTitle')}</div>
        <div className="help-flow-card" aria-label={t('help.callFlowAria')}>
          <div className="flow-step">
            <div className="flow-step-num">1</div>
            <div className="flow-step-text">{t('help.callFlowStep1')}</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">2</div>
            <div className="flow-step-text">{t('help.callFlowStep2')}</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">3</div>
            <div className="flow-step-text">{t('help.callFlowStep3')}</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">4</div>
            <div className="flow-step-text">{t('help.callFlowStep4')}</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">5</div>
            <div className="flow-step-text">{t('help.callFlowStep5')}</div>
          </div>
        </div>
      </div>

      {/* Local Storage section */}
      <div>
        <div className="setting-group-label">{t('help.localStorageTitle')}</div>
        <div className="help-storage-card" aria-label={t('help.localStorageAria')}>
          <div className="storage-card-section recovery-section">
            <div className="storage-icon-circle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </div>
            <div className="storage-section-content">
              <div className="storage-section-title">{t('help.sessionRecoveryTitle')}</div>
              <p className="storage-section-description">{t('help.sessionRecoveryDescription')}</p>
              <button
                type="button"
                className="btn-restore-backup"
                onClick={() => void handleRestore()}
              >
                {t('help.restoreSession')}
              </button>
            </div>
          </div>

          <div className="storage-card-divider" />

          <div className="storage-card-section advanced-section">
            <div className="storage-icon-circle secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div className="storage-section-content">
              <div className="storage-section-title secondary">{t('help.manualStorageTitle')}</div>
              <p className="storage-section-description">
                {typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
                  ? t('help.manualStorageDescriptionMac')
                  : t('help.manualStorageDescriptionOther')}
              </p>
              <button
                type="button"
                className="btn-open-folder"
                onClick={() => void openSessionsFolder()}
              >
                {typeof navigator !== 'undefined' && navigator.platform.includes('Mac')
                  ? t('help.showInFinder')
                  : t('help.openLocalFolder')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      {/* <div className="help-footer">
        <div className="help-footer-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" fill="none">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="12" d="M95.958 22C121.031 42.867 149.785 42 158 42c-1.797 118.676-15 95-62.042 128C49 137 35.798 160.676 34 42c8.13 0 36.883.867 61.958-20Z" />
          </svg>
        </div>
        <p className="help-footer-text" role="note" aria-label={t('help.privacyNoteAria')}>
          <strong>{t('help.privacyNoteLead')}</strong> {t('help.privacyNoteTail')}
        </p>
        <a
          href="https://buymeacoffee.com/ordo"
          onClick={handleDonationClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: '#FFDD00',
            color: '#000000',
            fontWeight: 600,
            fontSize: '0.9rem',
            padding: '8px 16px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontFamily: 'Inter, sans-serif',
            boxShadow: '0 2px 8px rgba(255, 221, 0, 0.2)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            whiteSpace: 'nowrap',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 221, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(255, 221, 0, 0.2)';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
            <line x1="6" y1="1" x2="6" y2="4"></line>
            <line x1="10" y1="1" x2="10" y2="4"></line>
            <line x1="14" y1="1" x2="14" y2="4"></line>
          </svg>
          {t('help.buyMeACoffee')}
        </a>
      </div> */}
    </section>
  );
}
