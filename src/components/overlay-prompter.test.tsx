import { render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverlayPrompter } from './overlay-prompter';
import { useAppStore } from '../store/use-app-store';

// Mock Tauri backend functions
vi.mock('../lib/tauri', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/tauri')>();
    return {
        ...actual,
        listenForShortcutEvents: vi.fn().mockResolvedValue(() => { }),
        closeOverlayWindow: vi.fn(),
        showMainWindow: vi.fn(),
    };
});

describe('OverlayPrompter Integration Tests (Shortcut Isolation)', () => {
    beforeEach(() => {
        useAppStore.setState({
            activeSessionId: 'test-1',
            markdown: '# Section 1\n\nContent 1\n\n# Section 2\n\nContent 2\n\n# Section 3\n\nContent 3',
            playbackState: 'paused',
            scrollPosition: 0,
            scrollSpeed: 42,
            overlayFontScale: 1,
            initialized: true,
            sessions: [{ id: 'test-1', title: 'Test', createdAt: '', updatedAt: '', lastOpenedAt: '' }],
        });
    });

    it('TC02: Active Command Execution - Space toggles Play/Pause', async () => {
        const user = userEvent.setup();
        render(<OverlayPrompter />);

        expect(useAppStore.getState().playbackState).toBe('paused');
        await user.keyboard(' ');
        expect(useAppStore.getState().playbackState).toBe('running');
        await user.keyboard(' ');
        expect(useAppStore.getState().playbackState).toBe('paused');
    });

    it('TC03: Section Jumps (1..9) work reliably', async () => {
        const user = userEvent.setup();
        render(<OverlayPrompter />);

        expect(useAppStore.getState().scrollPosition).toBe(0);

        // Jump to Section 2 (Cmd+2 on Mac, Ctrl+2 on Windows)
        // We explicitly mapped it as a native event in the updated component
        await user.keyboard('2'); // Wait, the local fallback needs Cmd+2 or just 2? Cmd+2
        // JSDOM userEvent.keyboard requires '{Meta>}2{/Meta}'
        await user.keyboard('{Meta>}2{/Meta}');

        // The scroll position should advance
        expect(useAppStore.getState().scrollPosition).toBeGreaterThan(0);
        const posAfterSection2 = useAppStore.getState().scrollPosition;

        // Jump to Section 3 (Cmd+3)
        await user.keyboard('{Meta>}3{/Meta}');
        expect(useAppStore.getState().scrollPosition).toBeGreaterThan(posAfterSection2);
    });

    it('TC04: Speed Modulation Limits', async () => {
        const user = userEvent.setup();
        render(<OverlayPrompter />);

        expect(useAppStore.getState().scrollSpeed).toBe(42);

        // Send ArrowUp (with Meta) multiple times to hit maximum (140)
        for (let i = 0; i < 50; i++) {
            await user.keyboard('{Meta>}{ArrowUp}{/Meta}');
        }

        expect(useAppStore.getState().scrollSpeed).toBe(140);
    });
});
