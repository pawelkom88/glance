interface ShortcutKeycapsProps {
  readonly shortcuts: string | readonly string[];
  readonly className?: string;
  readonly keycapClassName?: string;
  readonly separatorClassName?: string;
  readonly comboSeparator?: string;
  readonly alternativeSeparator?: string;
}

function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
}

function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

function mapTokenToLabel(token: string, mac: boolean): string {
  const normalized = normalizeToken(token);
  const tokenMapMac: Record<string, string> = {
    cmd: '⌘',
    command: '⌘',
    cmdorctrl: '⌘',
    ctrl: '⌃',
    control: '⌃',
    alt: '⌥',
    option: '⌥',
    shift: '⇧',
    up: '↑',
    down: '↓',
    left: '←',
    right: '→',
    plus: '+',
    minus: '−',
    escape: 'Esc',
    esc: 'Esc',
    spacebar: 'Space',
    space: 'Space'
  };
  const tokenMapWindows: Record<string, string> = {
    cmdorctrl: 'Ctrl',
    cmd: 'Ctrl',
    command: 'Ctrl',
    ctrl: 'Ctrl',
    control: 'Ctrl',
    alt: 'Alt',
    option: 'Alt',
    shift: 'Shift',
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    plus: '+',
    minus: '−',
    escape: 'Esc',
    esc: 'Esc',
    spacebar: 'Space',
    space: 'Space'
  };

  const mapped = (mac ? tokenMapMac : tokenMapWindows)[normalized];
  if (mapped) {
    return mapped;
  }

  if (token.length === 1) {
    return token.toUpperCase();
  }

  return token;
}

function toTokens(shortcut: string): string[] {
  return shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function ShortcutKeycaps({
  shortcuts,
  className,
  keycapClassName,
  separatorClassName = 'shortcut-keycaps-separator',
  comboSeparator = '+',
  alternativeSeparator = '/',
}: ShortcutKeycapsProps) {
  const mac = isMacPlatform();
  const shortcutList = Array.isArray(shortcuts) ? shortcuts : [shortcuts];

  return (
    <span className={['shortcut-keycaps', className].filter(Boolean).join(' ')}>
      {shortcutList.map((shortcut, shortcutIndex) => {
        const tokens = toTokens(shortcut);
        return (
          <span key={`${shortcut}-${shortcutIndex}`} className="shortcut-keycaps-chord">
            {tokens.map((token, tokenIndex) => (
              <span key={`${shortcut}-${token}-${tokenIndex}`} className="shortcut-keycaps-keygroup">
                <kbd className={keycapClassName}>{mapTokenToLabel(token, mac)}</kbd>
                {tokenIndex < tokens.length - 1 ? (
                  <span className={separatorClassName}>{comboSeparator}</span>
                ) : null}
              </span>
            ))}
            {shortcutIndex < shortcutList.length - 1 ? (
              <span className={separatorClassName}>{alternativeSeparator}</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}
