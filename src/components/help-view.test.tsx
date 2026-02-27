import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn()
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  ask: vi.fn()
}));

vi.mock('../lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof tauriBridge>();
  return {
    ...actual,
    openSessionsFolder: vi.fn(),
    restoreFromBackup: vi.fn(),
    listSessions: vi.fn().mockResolvedValue([]),
    listFolders: vi.fn().mockResolvedValue([]),
    loadSession: vi.fn().mockResolvedValue({ id: '1', markdown: '', meta: {} })
  };
});

import { open as openUrl } from '@tauri-apps/plugin-shell';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import * as tauriBridge from '../lib/tauri';
import { useAppStore } from '../store/use-app-store';
import { HelpView } from './help-view';

const openUrlMock = openUrl as unknown as ReturnType<typeof vi.fn>;
const openFileDialogMock = openFileDialog as unknown as ReturnType<typeof vi.fn>;
const askMock = (await import('@tauri-apps/plugin-dialog')).ask as unknown as ReturnType<typeof vi.fn>;
const tauriMock = tauriBridge as unknown as {
  openSessionsFolder: ReturnType<typeof vi.fn>;
  restoreFromBackup: ReturnType<typeof vi.fn>;
};

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

    expect(openUrlMock).toHaveBeenCalledWith('https://buymeacoffee.com/ordo');
  });

  it('triggers backup restoration flow with confirmation', async () => {
    const user = userEvent.setup();
    const onRestoreSuccess = vi.fn();
    openFileDialogMock.mockResolvedValue('/path/to/backup.bak');
    askMock.mockResolvedValue(true);
    tauriMock.restoreFromBackup.mockResolvedValue(undefined);

    render(<HelpView onRestoreSuccess={onRestoreSuccess} />);

    await user.click(screen.getByRole('button', { name: /Restore Session/i }));

    expect(openFileDialogMock).toHaveBeenCalled();
    expect(askMock).toHaveBeenCalledWith(
      expect.stringContaining('replace your current script content'),
      expect.objectContaining({ title: 'Restore this session?' })
    );
    expect(tauriMock.restoreFromBackup).toHaveBeenCalledWith('/path/to/backup.bak');
    expect(onRestoreSuccess).toHaveBeenCalled();

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Session restored successfully',
      variant: 'success'
    });
  });

  it('opens storage folder via tauri bridge', async () => {
    const user = userEvent.setup();
    render(<HelpView />);

    const openButton = screen.getByRole('button', { name: /Show in Finder|Open Local Folder/i });
    await user.click(openButton);

    expect(tauriMock.openSessionsFolder).toHaveBeenCalled();
  });
});
