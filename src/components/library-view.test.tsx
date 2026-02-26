import type React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LibraryView } from './library-view';

vi.mock('../lib/tauri', () => ({
  loadSession: vi.fn(async (id: string) => ({
    id,
    markdown: id === 'b' ? 'Pitch deck notes for client launch' : 'General session text',
    meta: {
      id,
      title: id === 'b' ? 'Beta' : 'Alpha',
      createdAt: '',
      updatedAt: '',
      lastOpenedAt: '',
      scroll: { position: 0, speed: 42, running: false },
      overlay: { fontScale: 1 }
    }
  }))
}));

const sessions = [
  { id: 'a', title: 'Alpha', createdAt: '', updatedAt: '2025-01-01T10:00:00Z', lastOpenedAt: '', folderId: null },
  { id: 'b', title: 'Beta', createdAt: '', updatedAt: '2025-01-02T10:00:00Z', lastOpenedAt: '', folderId: 'f-1' }
];

const folders = [
  { id: 'f-1', name: 'Client Work', createdAt: '', updatedAt: '' }
];

function renderLibrary(custom?: Partial<React.ComponentProps<typeof LibraryView>>) {
  const props: React.ComponentProps<typeof LibraryView> = {
    sessions,
    folders,
    activeSessionId: 'a',
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onCreateFolder: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    onMoveSessions: vi.fn(),
    onImport: vi.fn(),
    showToast: vi.fn(),
    ...custom
  };

  render(<LibraryView {...props} />);
  return props;
}

describe('LibraryView behavior', () => {
  it('creates a session from composer with a trimmed name', async () => {
    const user = userEvent.setup();
    const props = renderLibrary();

    await user.click(screen.getByRole('button', { name: /\+ New Session/i }));

    const input = await screen.findByLabelText('Session name');
    await user.clear(input);
    await user.type(input, '   Demo Session   ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(props.onCreate).toHaveBeenCalledWith('Demo Session');
  });

  it('toggles selection mode and select all state', async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByText('Select All'));

    expect((screen.getByRole('button', { name: /Delete 2/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /Move 2/i }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByText('Deselect All'));

    expect((screen.getByRole('button', { name: /Delete 0/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves selected sessions to a folder from bulk move dialog', async () => {
    const user = userEvent.setup();
    const props = renderLibrary();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByText('Select All'));
    await user.click(screen.getByRole('button', { name: /Move 2/i }));

    const select = await screen.findByLabelText('Destination');
    await user.selectOptions(select, 'f-1');
    await user.click(screen.getByRole('button', { name: 'Move' }));

    const moveSpy = props.onMoveSessions as unknown as ReturnType<typeof vi.fn>;
    expect(moveSpy).toHaveBeenCalledTimes(1);
    const [ids, folderId] = moveSpy.mock.calls[0] as [readonly string[], string | null];
    expect(new Set(ids)).toEqual(new Set(['a', 'b']));
    expect(folderId).toBe('f-1');
  });

  it('supports cmd/ctrl+f and filters by content matches', async () => {
    const user = userEvent.setup();
    renderLibrary();

    fireEvent.keyDown(window, { key: 'f', metaKey: true });

    const input = await screen.findByPlaceholderText('Search titles and script content');
    await user.type(input, 'launch');

    await waitFor(() => {
      expect(screen.getByText('Beta')).toBeTruthy();
      expect(screen.queryByText('Alpha')).toBeNull();
    });
  });
});
