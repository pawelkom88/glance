import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn()
}));

import { open as openUrl } from '@tauri-apps/plugin-shell';
import { HelpView } from './help-view';

const openMock = openUrl as unknown as ReturnType<typeof vi.fn>;

function setPlatform(value: string): void {
  Object.defineProperty(window.navigator, 'platform', {
    value,
    configurable: true
  });
}

describe('HelpView behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatform('MacIntel');
  });

  it('renders platform modifier labels for keyboard shortcuts', () => {
    setPlatform('Win32');
    const { unmount } = render(<HelpView />);
    expect(screen.queryByText('Ctrl1')).not.toBeNull();

    unmount();
    setPlatform('MacIntel');
    render(<HelpView />);
    expect(screen.queryByText('⌘1')).not.toBeNull();
  });

  it('opens donation link via shell integration', async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    await user.click(screen.getByRole('link', { name: /Buy me a coffee/i }));

    expect(openMock).toHaveBeenCalledWith('https://buymeacoffee.com/ordo');
  });
});
