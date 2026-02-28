import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { open as openFileDialog, ask } from '@tauri-apps/plugin-dialog';
import { HelpView } from '../../../components/help-view';
import { resetAppState } from '../harness/reset-app-state';
import { useAppStore } from '../../../store/use-app-store';

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn()
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  ask: vi.fn()
}));

const tauriMocks = vi.hoisted(() => ({
  openSessionsFolder: vi.fn(),
  readTextFile: vi.fn()
}));

vi.mock('../../../lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tauri')>();
  return {
    ...actual,
    openSessionsFolder: tauriMocks.openSessionsFolder,
    readTextFile: tauriMocks.readTextFile
  };
});

const openFileDialogMock = openFileDialog as unknown as ReturnType<typeof vi.fn>;
const askMock = ask as unknown as ReturnType<typeof vi.fn>;

describe('High behavior: restore failure modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAppState();
  });

  it('keeps content unchanged when restore dialog is cancelled', async () => {
    const user = userEvent.setup();
    useAppStore.setState({
      activeSessionId: 'active',
      markdown: '# Existing\n\nContent'
    });

    openFileDialogMock.mockResolvedValue(null);

    render(<HelpView />);

    await user.click(screen.getByRole('button', { name: /Restore Session/i }));

    expect(askMock).not.toHaveBeenCalled();
    expect(tauriMocks.readTextFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().markdown).toBe('# Existing\n\nContent');
  });

  it('shows error feedback when restore file read fails', async () => {
    const user = userEvent.setup();
    openFileDialogMock.mockResolvedValue('/tmp/corrupt.bak');
    askMock.mockResolvedValue(true);
    tauriMocks.readTextFile.mockRejectedValue(new Error('unable to read backup'));

    render(<HelpView />);

    await user.click(screen.getByRole('button', { name: /Restore Session/i }));

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'unable to read backup',
        variant: 'error'
      });
    });
  });

  it('does not show success toast when persisting restored active-session content fails', async () => {
    const user = userEvent.setup();
    const persistActiveSession = vi.fn().mockResolvedValue(false);

    useAppStore.setState({
      activeSessionId: 'active',
      markdown: '# Existing',
      persistActiveSession
    });

    openFileDialogMock.mockResolvedValue('/tmp/restore.md');
    askMock.mockResolvedValue(true);
    tauriMocks.readTextFile.mockResolvedValue('# Restored\n\nContent');

    render(<HelpView />);

    await user.click(screen.getByRole('button', { name: /Restore Session/i }));

    await waitFor(() => {
      expect(persistActiveSession).toHaveBeenCalledTimes(1);
    });

    expect(useAppStore.getState().toastMessage?.message).not.toBe('Session restored successfully');
  });
});
