import type React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const oneSession = [sessions[0]];
const noFolders: React.ComponentProps<typeof LibraryView>['folders'] = [];

const folders = [
  { id: 'f-1', name: 'Client Work', createdAt: '', updatedAt: '' }
];
const multipleFolders = [
  { id: 'f-1', name: 'Client Work', createdAt: '', updatedAt: '' },
  { id: 'f-2', name: 'Internal', createdAt: '', updatedAt: '' }
];

function mockElementFromPoint(impl: (x: number, y: number) => Element | null) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  const mock = vi.fn(impl);
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    writable: true,
    value: mock
  });

  return {
    mock,
    restore: () => {
      if (originalDescriptor) {
        Object.defineProperty(document, 'elementFromPoint', originalDescriptor);
      } else {
        delete (document as Document & { elementFromPoint?: unknown }).elementFromPoint;
      }
    }
  };
}

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
    onMoveSessions: vi.fn(async () => 1),
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
    const props = renderLibrary({ folders: noFolders });

    await user.click(screen.getByRole('button', { name: /\+ New Session/i }));

    const input = await screen.findByLabelText('Session name');
    await user.clear(input);
    await user.type(input, '   Demo Session   ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(props.onCreate).toHaveBeenCalledWith('Demo Session', null);
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
    const props = renderLibrary({ folders: multipleFolders });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByText('Select All'));
    await user.click(screen.getByRole('button', { name: /Move 2/i }));

    const select = await screen.findByLabelText('Destination');
    await user.selectOptions(select, 'f-2');
    await user.click(screen.getByRole('button', { name: 'Move' }));

    const moveSpy = props.onMoveSessions as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledTimes(1);
    });
    const [ids, folderId] = moveSpy.mock.calls[0] as [readonly string[], string | null];
    expect(new Set(ids)).toEqual(new Set(['a', 'b']));
    expect(folderId).toBe('f-2');
  });

  it('does not render bulk move action when there are no custom folders', async () => {
    const user = userEvent.setup();
    renderLibrary({ folders: noFolders });

    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.queryByRole('button', { name: /Move 0/i })).toBeNull();
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

  it('shows active state on search and filter buttons when toggled', async () => {
    const user = userEvent.setup();
    renderLibrary();

    const searchButton = screen.getByRole('button', { name: 'Search sessions' });
    const filterButton = screen.getByRole('button', { name: 'Sort and filter sessions' });

    expect(searchButton.getAttribute('aria-pressed')).toBe('false');
    expect(searchButton.className).not.toContain('is-active');
    expect(filterButton.getAttribute('aria-pressed')).toBe('false');
    expect(filterButton.className).not.toContain('is-active');

    await user.click(searchButton);
    expect(searchButton.getAttribute('aria-pressed')).toBe('true');
    expect(searchButton.className).toContain('is-active');
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search titles and script content')).toBeTruthy();
    });

    await user.click(filterButton);
    expect(filterButton.getAttribute('aria-pressed')).toBe('true');
    expect(filterButton.className).toContain('is-active');
    expect(screen.getByRole('dialog', { name: 'Session list controls' })).toBeTruthy();
  });

  it('asks for a folder before creating a new session when at least one custom folder exists', async () => {
    const user = userEvent.setup();
    const props = renderLibrary();

    await user.click(screen.getByRole('button', { name: /\+ New Session/i }));

    expect(screen.getByRole('dialog', { name: 'New session folder selection' })).toBeTruthy();
    expect(screen.queryByLabelText('Session name')).toBeNull();

    const folderSelect = screen.getByLabelText('Session folder');
    await user.selectOptions(folderSelect, 'f-1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const input = await screen.findByLabelText('Session name');
    await user.clear(input);
    await user.type(input, 'Roadmap');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(props.onCreate).toHaveBeenCalledWith('Roadmap', 'f-1');
  });

  it('opens folder selection when a new session is requested externally', async () => {
    renderLibrary({ createSessionRequestToken: 1 });
    expect(await screen.findByRole('dialog', { name: 'New session folder selection' })).toBeTruthy();
  });

  it('focuses folder name input when opening the new folder modal', async () => {
    const user = userEvent.setup();
    renderLibrary();

    await user.click(screen.getByRole('button', { name: 'Sort and filter sessions' }));
    await user.click(screen.getByRole('button', { name: /\+ New Folder/i }));

    const input = await screen.findByLabelText('Folder name');
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });

  it('shows search, filter, and select controls only when there is more than one session', async () => {
    await act(async () => {
      renderLibrary({ sessions: oneSession });
    });

    expect(screen.queryByRole('button', { name: 'Search sessions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sort and filter sessions' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });

  it('enables card dragging only when at least two folder groups exist', async () => {
    const { rerender } = render(
      <LibraryView
        sessions={sessions}
        folders={noFolders}
        activeSessionId="a"
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
        onCreateFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        onMoveSessions={vi.fn(async () => 1)}
        onImport={vi.fn()}
        showToast={vi.fn()}
      />
    );
    await act(async () => {});

    const cardWithoutTargets = screen.getByText('Alpha').closest('article');
    expect(cardWithoutTargets?.className).not.toContain('is-draggable');

    await act(async () => {
      rerender(
        <LibraryView
          sessions={sessions}
          folders={folders}
          activeSessionId="a"
          onOpen={vi.fn()}
          onCreate={vi.fn()}
          onDelete={vi.fn()}
          onCreateFolder={vi.fn()}
          onRenameFolder={vi.fn()}
          onDeleteFolder={vi.fn()}
          onMoveSessions={vi.fn(async () => 1)}
          onImport={vi.fn()}
          showToast={vi.fn()}
        />
      );
    });
    await act(async () => {});

    const cardWithTargets = screen.getByText('Alpha').closest('article');
    expect(cardWithTargets?.className).toContain('is-draggable');
  });

  it('moves a pointer-dragged session into a different folder target', async () => {
    const props = renderLibrary({ folders: multipleFolders });

    const alphaCard = screen.getByText('Alpha').closest('article');
    const internalGroup = screen.getByLabelText('Internal folder');
    expect(alphaCard).toBeTruthy();
    expect(internalGroup).toBeTruthy();

    const elementFromPoint = mockElementFromPoint(() => internalGroup as Element);
    fireEvent.pointerDown(alphaCard as HTMLElement, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 32, clientY: 32 });
    fireEvent.pointerMove(alphaCard as HTMLElement, { pointerId: 1, pointerType: 'mouse', buttons: 1, clientX: 48, clientY: 52 });
    expect(internalGroup.className).toContain('is-drop-target');
    fireEvent.pointerUp(alphaCard as HTMLElement, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 48, clientY: 52 });
    elementFromPoint.restore();

    const moveSpy = props.onMoveSessions as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith(['a'], 'f-2');
    });
  });

  it('keeps cross-folder drop indication stable while moving across nested elements', async () => {
    renderLibrary({ folders: multipleFolders });

    const alphaCard = screen.getByText('Alpha').closest('article');
    const internalGroup = screen.getByLabelText('Internal folder');
    const internalLabel = within(internalGroup).getByText('Internal');
    expect(alphaCard).toBeTruthy();

    const elementFromPoint = mockElementFromPoint(() => internalLabel as Element);
    elementFromPoint.mock
      .mockReturnValueOnce(internalLabel as Element)
      .mockReturnValueOnce(internalGroup as Element)
      .mockReturnValueOnce(document.body as Element);

    fireEvent.pointerDown(alphaCard as HTMLElement, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 40, clientY: 40 });
    fireEvent.pointerMove(alphaCard as HTMLElement, { pointerId: 2, pointerType: 'mouse', buttons: 1, clientX: 60, clientY: 66 });

    await waitFor(() => {
      expect(within(internalGroup).getByText('Drop here')).toBeTruthy();
    });

    fireEvent.pointerMove(alphaCard as HTMLElement, { pointerId: 2, pointerType: 'mouse', buttons: 1, clientX: 66, clientY: 70 });

    await waitFor(() => {
      expect(within(internalGroup).getByText('Drop here')).toBeTruthy();
    });

    fireEvent.pointerMove(alphaCard as HTMLElement, { pointerId: 2, pointerType: 'mouse', buttons: 1, clientX: 12, clientY: 12 });
    await waitFor(() => {
      expect(within(internalGroup).queryByText('Drop here')).toBeNull();
    });
    fireEvent.pointerUp(alphaCard as HTMLElement, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 12, clientY: 12 });
    elementFromPoint.restore();
  });

  it('accepts dropping onto nested folder header content', async () => {
    const props = renderLibrary({ folders: multipleFolders });

    const alphaCard = screen.getByText('Alpha').closest('article');
    const internalGroup = screen.getByLabelText('Internal folder');
    const internalLabel = within(internalGroup).getByText('Internal');
    expect(alphaCard).toBeTruthy();

    const elementFromPoint = mockElementFromPoint(() => internalLabel as Element);
    fireEvent.pointerDown(alphaCard as HTMLElement, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 25, clientY: 25 });
    fireEvent.pointerMove(alphaCard as HTMLElement, { pointerId: 3, pointerType: 'mouse', buttons: 1, clientX: 44, clientY: 52 });
    fireEvent.pointerUp(alphaCard as HTMLElement, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 44, clientY: 52 });
    elementFromPoint.restore();

    const moveSpy = props.onMoveSessions as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith(['a'], 'f-2');
    });
  });

  it('shows drop target when pointer-dragging over nested folder label only', async () => {
    renderLibrary({ folders: multipleFolders });

    const alphaCard = screen.getByText('Alpha').closest('article');
    const internalGroup = screen.getByLabelText('Internal folder');
    const internalLabel = within(internalGroup).getByText('Internal');
    expect(alphaCard).toBeTruthy();

    const elementFromPoint = mockElementFromPoint(() => internalLabel as Element);
    fireEvent.pointerDown(alphaCard as HTMLElement, { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 24, clientY: 24 });
    fireEvent.pointerMove(alphaCard as HTMLElement, { pointerId: 4, pointerType: 'mouse', buttons: 1, clientX: 50, clientY: 54 });

    await waitFor(() => {
      expect(internalGroup.className).toContain('is-drop-target');
    });
    fireEvent.pointerUp(alphaCard as HTMLElement, { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 50, clientY: 54 });
    elementFromPoint.restore();
  });

  it('opens keyboard move menu and moves session without dragging', async () => {
    const user = userEvent.setup();
    const props = renderLibrary({ folders: multipleFolders });

    expect(screen.queryByRole('button', { name: 'Move Alpha' })).toBeNull();

    const alphaCard = screen.getByText('Alpha').closest('article');
    expect(alphaCard).toBeTruthy();
    (alphaCard as HTMLElement).focus();
    fireEvent.keyDown(alphaCard as HTMLElement, { key: 'F10', shiftKey: true });
    await user.click(screen.getByRole('menuitem', { name: 'Move to Internal' }));

    const moveSpy = props.onMoveSessions as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith(['a'], 'f-2');
    });
  });
});
