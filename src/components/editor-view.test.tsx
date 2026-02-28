import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EditorView } from './editor-view';

function renderEditor(overrides: Partial<Parameters<typeof EditorView>[0]> = {}) {
  const props: Parameters<typeof EditorView>[0] = {
    markdown: '# Intro\n\nHello world',
    activeSessionTitle: 'Demo Session',
    autosaveStatus: 'saved',
    sections: [{ id: 's1', title: 'Intro', hotkeyIndex: null, lineIndex: 0 }],
    warnings: [],
    hasSessions: true,
    hasActiveSession: true,
    onChange: vi.fn(),
    onCreateSession: vi.fn(),
    onImportSession: vi.fn(),
    onOpenSessions: vi.fn(),
    onOpenShortcutSettings: vi.fn(),
    onLaunchOverlay: vi.fn(),
    onCloseOverlay: vi.fn(),
    onExportMarkdown: vi.fn(),
    ...overrides
  };

  const view = render(<EditorView {...props} />);
  return { ...view, props };
}

describe('EditorView behavior', () => {
  it('renders no-session and no-active-session empty states', () => {
    renderEditor({ hasSessions: false, hasActiveSession: false });
    expect(screen.queryByText('No sessions yet')).not.toBeNull();

    renderEditor({ hasSessions: true, hasActiveSession: false });
    expect(screen.queryByText('No session selected')).not.toBeNull();
  });

  it('keeps launch controls enabled when no sections exist', () => {
    renderEditor({
      sections: [],
      markdown: 'No headings yet'
    });

    expect(
      (screen.getByRole('button', { name: 'Launch Prompter' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('shows word count and estimated read duration based on markdown content', () => {
    const words = Array.from({ length: 130 }, () => 'word').join(' ');
    renderEditor({
      markdown: words
    });

    expect(screen.queryByText('130 words')).not.toBeNull();
    expect(screen.queryAllByText('~130').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('~1m 0s').length).toBeGreaterThan(0);
  });

  it('wires export and launch actions to user-visible buttons', async () => {
    const user = userEvent.setup();
    const onLaunchOverlay = vi.fn();
    const onExportMarkdown = vi.fn();

    renderEditor({ onLaunchOverlay, onExportMarkdown });

    await user.click(screen.getByRole('button', { name: 'Launch Prompter' }));
    await user.click(screen.getByRole('button', { name: 'Export Markdown' }));

    expect(onLaunchOverlay).toHaveBeenCalledTimes(1);
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);
  });
});
