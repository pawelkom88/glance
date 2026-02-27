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
    readTextFile: vi.fn(),
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
  readTextFile: ReturnType<typeof vi.fn>;
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
    useAppStore.setState({
      activeSessionId: null,
      sessions: [],
      toastMessage: null
    });
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

  it('imports restored content as a new session when no session is active', async () => {
    const user = userEvent.setup();
    const onRestoreSuccess = vi.fn();
    const importMarkdownSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      activeSessionId: null,
      importMarkdown: importMarkdownSpy
    });
    openFileDialogMock.mockResolvedValue('/path/to/backup.bak');
    askMock.mockResolvedValue(true);
    tauriMock.readTextFile.mockResolvedValue('# Restored\n\n- Content from file');

    render(<HelpView onRestoreSuccess={onRestoreSuccess} />);

    await user.click(screen.getByRole('button', { name: /Restore Session/i }));

    expect(openFileDialogMock).toHaveBeenCalled();
    expect(askMock).toHaveBeenCalledWith(
      expect.stringContaining('replace the content currently open in your editor'),
      expect.objectContaining({ title: 'Restore this session?' })
    );
    expect(tauriMock.readTextFile).toHaveBeenCalledWith('/path/to/backup.bak');
    expect(importMarkdownSpy).toHaveBeenCalledWith('backup', '# Restored\n\n- Content from file', false);
    expect(onRestoreSuccess).toHaveBeenCalled();

    expect(useAppStore.getState().toastMessage).toEqual({
      message: 'Session restored successfully',
      variant: 'success'
    });
  });

  it('replaces content in active session and persists when a session is active', async () => {
    const user = userEvent.setup();
    const persistActiveSessionSpy = vi.fn().mockResolvedValue(true);
    const importMarkdownSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      activeSessionId: 'session-1',
      markdown: '# Old',
      persistActiveSession: persistActiveSessionSpy,
      importMarkdown: importMarkdownSpy
    });
    openFileDialogMock.mockResolvedValue('/path/to/script.md');
    askMock.mockResolvedValue(true);
    tauriMock.readTextFile.mockResolvedValue('# Fresh\n\n- Loaded');

    render(<HelpView />);
    await user.click(screen.getByRole('button', { name: /Restore Session/i }));

    expect(tauriMock.readTextFile).toHaveBeenCalledWith('/path/to/script.md');
    expect(useAppStore.getState().markdown).toBe('# Fresh\n\n- Loaded');
    expect(persistActiveSessionSpy).toHaveBeenCalledTimes(1);
    expect(importMarkdownSpy).not.toHaveBeenCalled();
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
