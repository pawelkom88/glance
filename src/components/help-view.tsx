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
    { label: 'Play / Pause', combo: `${modifier}+Shift+S` },
    { label: 'Jump to section', combo: `${modifier}+1…9` },
    { label: 'Adjust speed', combo: `${modifier}+↑ / ${modifier}+↓` }
  ];

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

      <p className="local-only-banner" role="note" aria-label="Local privacy notice">
        <span className="local-only-icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" fill="none"><path stroke="#000000" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" stroke-width="12" d="M95.958 22C121.031 42.867 149.785 42 158 42c-1.797 118.676-15 95-62.042 128C49 137 35.798 160.676 34 42c8.13 0 36.883.867 61.958-20Z"/></svg>
        </span>
        <span>Local by default. No account, no cloud sync, no remote storage.</span>
      </p>
    </section>
  );
}
