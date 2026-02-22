import { open } from '@tauri-apps/plugin-shell';

interface ShortcutRow {
  readonly label: string;
  readonly combo: string;
}

function modifierKeyLabel(): string {
  if (typeof navigator === 'undefined') {
    return 'Ctrl';
  }

  return navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
}

export function HelpView() {
  const modifier = modifierKeyLabel();
  const shortcutRows: readonly ShortcutRow[] = [
    { label: 'Play / Pause', combo: 'Space' },
    { label: 'Rewind', combo: 'R' },
    { label: 'Jump to section', combo: `${modifier}+1…9` },
    { label: 'Adjust speed', combo: `${modifier}+↑ / ${modifier}+↓` }
  ];

  const handleDonationClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    await open('https://buymeacoffee.com/ordo');
  };

  return (
    <section className="panel help-panel">
      <header className="panel-header">
        <div>
          <h2>Shortcuts & Flow</h2>
        </div>
      </header>

      <div className="help-grid">
        <article className="help-card" aria-labelledby="help-shortcuts-title">
          <h3 id="help-shortcuts-title">Shortcuts</h3>
          <dl className="help-shortcuts-list" aria-label="Shortcut list">
            {shortcutRows.map((row) => (
              <div key={row.label} className="help-shortcut-row">
                <dt>{row.label}</dt>
                <dd>
                  <span className="help-keycap">{row.combo}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="help-shortcuts-note">Section hotkeys control the first 9 headings.</p>
        </article>

        <article className="help-card" aria-labelledby="help-flow-title">
          <h3 id="help-flow-title">5-step call flow</h3>
          <ol className="help-flow-list" aria-label="Call flow steps">
            <li>Create a session in Sessions.</li>
            <li>Write one # heading per call phase.</li>
            <li>Launch Prompter.</li>
            <li>Press Play and set your pace.</li>
            <li>Jump sections as the conversation shifts.</li>
          </ol>
        </article>
      </div>

      <div className="local-only-banner-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-canvas-2)', padding: '16px 20px', borderRadius: '12px', marginTop: '24px', border: '1px solid var(--line-soft)' }}>
        <p className="local-only-banner" role="note" aria-label="Local privacy notice" style={{ margin: 0, padding: 0, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="local-only-icon" aria-hidden="true" style={{ display: 'flex' }}>
            <svg width="24" height="24" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="12" d="M95.958 22C121.031 42.867 149.785 42 158 42c-1.797 118.676-15 95-62.042 128C49 137 35.798 160.676 34 42c8.13 0 36.883.867 61.958-20Z" /></svg>
          </span>
          <span style={{ fontSize: '0.95rem', color: 'var(--text-body)' }}>Local by default. No account, no cloud sync, no remote storage.</span>
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
