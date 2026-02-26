import type React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LibraryView } from './library-view';

const sessions = [
  { id: 'a', title: 'Alpha', createdAt: '', updatedAt: '2025-01-01T10:00:00Z', lastOpenedAt: '' },
  { id: 'b', title: 'Beta', createdAt: '', updatedAt: '2025-01-02T10:00:00Z', lastOpenedAt: '' }
];

function renderLibrary(custom?: Partial<React.ComponentProps<typeof LibraryView>>) {
  const props: React.ComponentProps<typeof LibraryView> = {
    sessions,
    activeSessionId: 'a',
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
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

  it('disables Create when composer name is empty', async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole('button', { name: /\+ New Session/i }));

    const input = await screen.findByLabelText('Session name');
    await user.clear(input);

    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('toggles selection mode and select-all / deselect-all state', async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByText('Select All'));

    expect((screen.getByRole('button', { name: /Delete 2/i }) as HTMLButtonElement).disabled).toBe(false);

    await user.click(screen.getByText('Deselect All'));

    expect((screen.getByRole('button', { name: /Delete 0/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('supports keyboard controls in delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderLibrary({ sessions: [sessions[0]], activeSessionId: 'a' });

    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));

    const dialog = await screen.findByRole('dialog', { name: /Delete session confirmation/i });
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    const deleteButton = within(dialog).getByRole('button', { name: 'Delete' });

    await waitFor(() => {
      expect(document.activeElement).toBe(cancelButton);
    });

    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(deleteButton);

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement).toBe(cancelButton);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Delete session confirmation/i })).toBeNull();
    });
  });

  it('bulk deletes selected sessions and exits selection mode', async () => {
    const user = userEvent.setup();
    const props = renderLibrary();

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByText('Select All'));
    await user.click(screen.getByRole('button', { name: /Delete 2/i }));

    const confirmSheet = await screen.findByText('Delete 2 sessions ?');
    const confirmDeleteButton = within(confirmSheet.closest('.confirm-sheet') as HTMLElement).getByRole('button', {
      name: 'Delete'
    });

    await user.click(confirmDeleteButton);

    await waitFor(() => {
    expect(props.onDelete).toHaveBeenCalledTimes(2);
  });

  expect(props.onDelete).toHaveBeenCalledWith('a', false);
  expect(props.onDelete).toHaveBeenCalledWith('b', false);
  expect(screen.queryByRole('button', { name: 'Select' })).not.toBeNull();
});
});
