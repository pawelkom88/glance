import { open as openUrl } from '@tauri-apps/plugin-shell';
import { open as openFileDialog, ask } from '@tauri-apps/plugin-dialog';
import { openSessionsFolder, readTextFile } from '../lib/tauri';
import { useAppStore } from '../store/use-app-store';

function modifierKeyLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'Ctrl';
  }

  return navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
}

interface HelpViewProps {
  onRestoreSuccess?: () => void;
}

function toSuggestedSessionName(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? '';
  const cleaned = filename
    .replace(/\.(md|markdown|txt)$/i, '')
    .replace(/\.bak\.\d+$/i, '')
    .replace(/\.bak$/i, '')
    .trim();
  return cleaned || 'Restored Session';
}

export function HelpView({ onRestoreSuccess }: HelpViewProps) {
  const modifier = modifierKeyLabel();

  const showToast = useAppStore((state) => state.showToast);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const importMarkdown = useAppStore((state) => state.importMarkdown);
  const persistActiveSession = useAppStore((state) => state.persistActiveSession);
  const setMarkdown = useAppStore((state) => state.setMarkdown);

  const handleDonationClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    await openUrl('https://buymeacoffee.com/ordo');
  };

  const handleRestore = async () => {
    try {
      const selected = await openFileDialog({
        title: 'Select Session File to Restore',
        multiple: false,
        filters: [{ name: 'Markdown / Backup', extensions: ['md', 'markdown', 'txt', 'bak', '1', '2', '3', '4', '5'] }]
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      const confirmed = await ask(
        'This will replace the content currently open in your editor with the selected file.',
        {
          title: 'Restore this session?',
          kind: 'warning',
          okLabel: 'Restore',
          cancelLabel: 'Cancel'
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
        const suggestedName = toSuggestedSessionName(selected);
        await importMarkdown(suggestedName, restoredMarkdown, false);
      }

      showToast('Session restored successfully', 'success');

      // Navigate to editor so user can see their restored content immediately
      if (onRestoreSuccess) {
        onRestoreSuccess();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restore session';
      showToast(message, 'error');
    }
  };

  return (
    <section className="help-pane">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <h2 className="help-heading">Help</h2>
      </header>

      {/* Keyboard Shortcuts card */}
      <div>
        <div className="setting-group-label">Keyboard Shortcuts</div>
        <div className="help-shortcut-card" aria-label="Keyboard shortcuts">
          <div className="help-shortcut-row">
            <span className="hsr-action">Play / Pause</span>
            <span className="hsr-keys"><kbd>Space</kbd></span>
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">Restart</span>
            <span className="hsr-keys"><kbd>R</kbd></span>
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">Jump to section</span>
            <span className="hsr-keys">
              <kbd>{modifier}1</kbd>
              <span className="ks">…</span>
              <kbd>{modifier}9</kbd>
            </span>
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">Adjust speed</span>
            <span className="hsr-keys">
              <kbd>{modifier}↑</kbd>
              <span className="ks">/</span>
              <kbd>{modifier}↓</kbd>
            </span>
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">Font size</span>
            <span className="hsr-keys">
              <kbd>{modifier}+</kbd>
              <span className="ks">/</span>
              <kbd>{modifier}−</kbd>
            </span>
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">Snap to center</span>
            <span className="hsr-keys"><kbd>{modifier}Shift+L</kbd></span>
          </div>
          <div className="help-shortcut-row">
            <span className="hsr-action">Close prompter</span>
            <span className="hsr-keys"><kbd>Esc</kbd></span>
          </div>
        </div>
      </div>

      {/* 5-Step Call Flow card */}
      <div>
        <div className="setting-group-label">5-Step Call Flow</div>
        <div className="help-flow-card" aria-label="5-step call flow">
          <div className="flow-step">
            <div className="flow-step-num">1</div>
            <div className="flow-step-text">Create a session in <strong>Sessions</strong>.</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">2</div>
            <div className="flow-step-text">Write one <strong># heading</strong> per call phase.</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">3</div>
            <div className="flow-step-text">Launch the <strong>Prompter</strong>.</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">4</div>
            <div className="flow-step-text">Press <strong>Play</strong> and set your pace.</div>
          </div>
          <div className="flow-step">
            <div className="flow-step-num">5</div>
            <div className="flow-step-text">Jump <strong>sections</strong> as the conversation shifts.</div>
          </div>
        </div>
      </div>

      {/* Local Storage section */}
      <div>
        <div className="setting-group-label">Local Storage</div>
        <div className="help-storage-card" aria-label="Local storage information">
          <div className="storage-card-section recovery-section">
            <div className="storage-icon-circle">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </div>
            <div className="storage-section-content">
              <div className="storage-section-title">Session Recovery</div>
              <p className="storage-section-description">
                Load script content from a markdown or backup file into the current editor session.
              </p>
              <button
                type="button"
                className="btn-restore-backup"
                onClick={() => void handleRestore()}
              >
                Restore Session
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
              <div className="storage-section-title secondary">Manual Storage</div>
              <p className="storage-section-description">
                Access your raw data files directly {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? 'in Finder' : 'on disk'}.
              </p>
              <button
                type="button"
                className="btn-open-folder"
                onClick={() => void openSessionsFolder()}
              >
                {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? 'Show in Finder' : 'Open Local Folder'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="help-footer">
        <div className="help-footer-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" fill="none">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="12" d="M95.958 22C121.031 42.867 149.785 42 158 42c-1.797 118.676-15 95-62.042 128C49 137 35.798 160.676 34 42c8.13 0 36.883.867 61.958-20Z" />
          </svg>
        </div>
        <p className="help-footer-text" role="note" aria-label="Local privacy notice">
          <strong>Local by default.</strong> No account, no cloud sync, no remote storage.
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
          Buy me a coffee
        </a>
      </div>
    </section>
  );
}
