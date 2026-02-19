export function HelpView() {
  return (
    <section className="panel help-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Help</p>
          <h2>Shortcuts & Flow</h2>
        </div>
      </header>

      <div className="help-grid">
        <article>
          <h3>Shortcuts</h3>
          <ul>
            <li>Toggle Play/Pause: Cmd/Ctrl+Shift+S</li>
            <li>Jump sections: Cmd/Ctrl+1..9</li>
            <li>Speed up/down: Cmd/Ctrl+↑ or Cmd/Ctrl+↓</li>
          </ul>
        </article>

        <article>
          <h3>5-step prep</h3>
          <ol>
            <li>Create a session in Library.</li>
            <li>Write H1 headers for each call phase.</li>
            <li>Launch the overlay.</li>
            <li>Start scrolling and adjust speed.</li>
            <li>Jump sections when the call direction changes.</li>
          </ol>
        </article>
      </div>

      <p className="local-only-banner">
        Local-only by default: no account, no cloud sync, no remote session storage.
      </p>
    </section>
  );
}
