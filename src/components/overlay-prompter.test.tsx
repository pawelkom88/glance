import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/use-app-store';
import { OverlayPrompter } from './overlay-prompter';

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
  showMainWindow: vi.fn(),
  listenForShortcutEvents: vi.fn(),
  recoverOverlayFocus: vi.fn(),
  saveOverlayBoundsForMonitor: vi.fn(),
  setLastOverlayMonitorName: vi.fn(),
  snapOverlayToTopCenter: vi.fn(),
  startOverlayDrag: vi.fn()
}));

const windowMocks = vi.hoisted(() => ({
  onFocusChanged: vi.fn(),
  onMoved: vi.fn(),
  onResized: vi.fn(),
  isFocused: vi.fn(),
  currentMonitor: vi.fn(),
  setMinSize: vi.fn(),
  setSize: vi.fn(),
  scaleFactor: vi.fn(),
  innerSize: vi.fn()
}));

let focusChangedListener: ((event: { payload: boolean }) => void) | null = null;

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
    outerSize: vi.fn().mockResolvedValue({ width: 1120, height: 400 }),
    innerSize: windowMocks.innerSize,
    currentMonitor: windowMocks.currentMonitor,
    setPosition: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
    isFocused: windowMocks.isFocused,
    onMoved: windowMocks.onMoved,
    onResized: windowMocks.onResized,
    onFocusChanged: windowMocks.onFocusChanged,
    setMinSize: windowMocks.setMinSize,
    setSize: windowMocks.setSize,
    scaleFactor: windowMocks.scaleFactor
  }),
  LogicalSize: class {
    constructor(public width: number, public height: number) { }
  }
}));

vi.mock('../lib/tauri', () => ({
  closeOverlayWindow: tauriMocks.closeOverlayWindow,
  getLastActiveSessionId: vi.fn().mockReturnValue(null),
  getLastOverlayMonitorName: vi.fn().mockReturnValue(null),
  listenForShortcutEvents: tauriMocks.listenForShortcutEvents,
  recoverOverlayFocus: tauriMocks.recoverOverlayFocus,
  saveOverlayBoundsForMonitor: tauriMocks.saveOverlayBoundsForMonitor,
  setLastOverlayMonitorName: tauriMocks.setLastOverlayMonitorName,
  showMainWindow: tauriMocks.showMainWindow,
  snapOverlayToTopCenter: tauriMocks.snapOverlayToTopCenter,
  startOverlayDrag: tauriMocks.startOverlayDrag
}));

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  window.dispatchEvent(new Event('resize'));
}

function resetStore(): void {
  useAppStore.setState({
    sessions: [
      {
        id: 'test-1',
        title: 'Test Session',
        createdAt: '',
        updatedAt: '',
        lastOpenedAt: ''
      }
    ],
    activeSessionId: 'test-1',
    activeSessionTitle: 'Test Session',
    markdown: '# Intro\n\nText\n\n# Discovery\n\nMore text\n\n# Close\n\nFinal text',
    parseWarnings: [],
    playbackState: 'paused',
    scrollPosition: 0,
    scrollSpeed: 42,
    overlayFontScale: 1,
    showReadingRuler: true,
    toastMessage: null
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  setViewport(1440, 900);
  resetStore();

  focusChangedListener = null;
  windowMocks.isFocused.mockResolvedValue(true);
  windowMocks.currentMonitor.mockResolvedValue({
    name: 'Display A',
    size: { width: 1920, height: 1080 },
    position: { x: 0, y: 0 },
    scaleFactor: 1
  });
  windowMocks.onMoved.mockImplementation(() => Promise.resolve(() => undefined));
  windowMocks.onResized.mockImplementation(() => Promise.resolve(() => undefined));
  windowMocks.onFocusChanged.mockImplementation(
    (listener: (event: { payload: boolean }) => void) => {
      focusChangedListener = listener;
      return Promise.resolve(() => undefined);
    }
  );
  tauriMocks.closeOverlayWindow.mockResolvedValue(undefined);
  tauriMocks.showMainWindow.mockResolvedValue(undefined);
  tauriMocks.listenForShortcutEvents.mockResolvedValue(() => undefined);
  tauriMocks.recoverOverlayFocus.mockResolvedValue(undefined);
  tauriMocks.snapOverlayToTopCenter.mockResolvedValue({
    x: 0,
    y: 0,
    monitorName: 'display-a'
  });
  tauriMocks.startOverlayDrag.mockResolvedValue(undefined);

  windowMocks.setMinSize.mockResolvedValue(undefined);
  windowMocks.setSize.mockResolvedValue(undefined);
  windowMocks.scaleFactor.mockResolvedValue(1);
  windowMocks.innerSize.mockResolvedValue({ width: 1120, height: 400 });
});

describe('OverlayPrompter behavior', () => {
  it('closes jump menu, then font menu, then overlay on sequential Escape presses', async () => {
    const user = userEvent.setup();
    render(<OverlayPrompter />);

    await user.click(screen.getByRole('button', { name: 'Jump to section' }));
    expect(screen.getByRole('menu', { name: 'Jump to section' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Jump to section' })).toBeNull();
    });
    expect(tauriMocks.closeOverlayWindow).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Font size settings' }));
    expect(screen.getByRole('dialog', { name: 'Font size controls' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Font size controls' })).toBeNull();
    });
    expect(tauriMocks.closeOverlayWindow).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(tauriMocks.closeOverlayWindow).toHaveBeenCalled();
      expect(tauriMocks.showMainWindow).toHaveBeenCalled();
    });
  });

  it('supports Cmd/Ctrl font shortcuts in non-Tauri mode', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      const message = String(args[0] ?? '');
      if (message.includes('not wrapped in act')) {
        return;
      }
    });
    const rafQueue: FrameRequestCallback[] = [];
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      });
    const cancelSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);
    const flushRaf = () => {
      while (rafQueue.length > 0) {
        const callback = rafQueue.shift();
        if (callback) {
          callback(0);
        }
      }
    };

    try {
      useAppStore.setState({ activeSessionId: null });
      render(<OverlayPrompter />);
      await act(async () => {
        flushRaf();
        await Promise.resolve();
      });

      act(() => {
        fireEvent.keyDown(window, { key: '=', ctrlKey: true });
        flushRaf();
      });
      expect(useAppStore.getState().overlayFontScale).toBe(1.05);

      act(() => {
        fireEvent.keyDown(window, { key: '-', ctrlKey: true });
        flushRaf();
      });
      expect(useAppStore.getState().overlayFontScale).toBe(1);

      useAppStore.setState({ overlayFontScale: 1.25 });
      act(() => {
        fireEvent.keyDown(window, { key: '0', ctrlKey: true });
        flushRaf();
      });
      expect(useAppStore.getState().overlayFontScale).toBe(1);
    } finally {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });

  it('dispatches overlay close once for a single Escape keydown event', async () => {
    render(<OverlayPrompter />);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(tauriMocks.closeOverlayWindow).toHaveBeenCalled();
      expect(tauriMocks.showMainWindow).toHaveBeenCalled();
    });
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    expect(tauriMocks.closeOverlayWindow).toHaveBeenCalledTimes(1);
    expect(tauriMocks.showMainWindow).toHaveBeenCalledTimes(1);
  });

  it('applies speed keyboard shortcuts with visible speed feedback', () => {
    const { container } = render(<OverlayPrompter />);

    fireEvent.keyDown(window, { key: 'ArrowUp', ctrlKey: true });
    expect(useAppStore.getState().scrollSpeed).toBe(43);
    expect(container.querySelector('.overlay-speed-bubble.is-visible')).toBeTruthy();
    expect(container.querySelector('.overlay-speed-icon-fast.is-animating')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
    expect(useAppStore.getState().scrollSpeed).toBe(42);
    expect(container.querySelector('.overlay-speed-icon-slow.is-animating')).toBeTruthy();
  });

  it('supports jump menu keyboard navigation with Arrow keys, Home, and End', async () => {
    const user = userEvent.setup();
    render(<OverlayPrompter />);

    await user.click(screen.getByRole('button', { name: 'Jump to section' }));
    const jumpMenu = screen.getByRole('menu', { name: 'Jump to section' });

    await waitFor(() => {
      expect((document.activeElement as HTMLElement | null)?.dataset.jumpItem).toBe('true');
    });

    fireEvent.keyDown(jumpMenu, { key: 'End' });
    expect(document.activeElement?.textContent).toContain('Close');

    fireEvent.keyDown(jumpMenu, { key: 'Home' });
    expect(document.activeElement?.textContent).toContain('Intro');

    fireEvent.keyDown(jumpMenu, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Discovery');

    fireEvent.keyDown(jumpMenu, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toContain('Intro');
  });

  it('closes jump and font menus on outside pointer interaction', async () => {
    const user = userEvent.setup();
    render(<OverlayPrompter />);

    await user.click(screen.getByRole('button', { name: 'Jump to section' }));
    expect(screen.getByRole('menu', { name: 'Jump to section' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('menu', { name: 'Jump to section' })).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Font size settings' }));
    expect(screen.getByRole('dialog', { name: 'Font size controls' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Font size controls' })).toBeNull();
    });
  });

  it('toggles reading ruler intensity and allows disabling the ruler from dim controls', async () => {
    setViewport(1000, 900);
    const user = userEvent.setup();
    render(<OverlayPrompter />);

    const levelTwoButton = await screen.findByRole('button', { name: 'Dim intensity level 2' });
    await user.click(levelTwoButton);
    const overlayContent = document.querySelector('.overlay-content');

    expect(useAppStore.getState().showReadingRuler).toBe(true);
    expect(overlayContent?.getAttribute('data-dim-level')).toBe('2');

    await user.click(levelTwoButton);
    expect(useAppStore.getState().showReadingRuler).toBe(false);
    expect(overlayContent?.getAttribute('data-dim-level')).toBe('0');
  });

  it('shows error toast when close request fails', async () => {
    const user = userEvent.setup();
    tauriMocks.closeOverlayWindow.mockRejectedValue(new Error('close failed'));
    render(<OverlayPrompter />);

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(useAppStore.getState().toastMessage).toEqual({
        message: 'close failed',
        variant: 'error'
      });
    });
  });

  it('advances timer while running and pauses when playback pauses', () => {
    vi.useFakeTimers();
    let now = 0;
    const perfSpy = vi.spyOn(performance, 'now').mockImplementation(() => now);

    try {
      render(<OverlayPrompter />);

      expect(screen.getByText('00:00')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Play' }));

      act(() => {
        now = 1_600;
        vi.advanceTimersByTime(360);
      });

      expect(screen.getByText('00:01')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      act(() => {
        now = 4_200;
        vi.advanceTimersByTime(600);
      });

      expect(screen.getByText('00:01')).toBeTruthy();
    } finally {
      perfSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('shows focus-loss hint toast only once after repeated blur events', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const originalShowToast = useAppStore.getState().showToast;
    const showToastSpy = vi.fn((message: string, variant?: 'info' | 'success' | 'warning' | 'error') => {
      originalShowToast(message, variant);
    });
    useAppStore.setState({ showToast: showToastSpy });

    render(<OverlayPrompter />);

    await waitFor(() => {
      expect(windowMocks.onFocusChanged).toHaveBeenCalled();
      expect(focusChangedListener).not.toBeNull();
    });

    act(() => {
      focusChangedListener?.({ payload: false });
      focusChangedListener?.({ payload: false });
    });

    const hintCalls = showToastSpy.mock.calls.filter(([message]) =>
      String(message).includes('Overlay inactive. Click it to re-enable shortcuts.')
    );
    expect(hintCalls).toHaveLength(1);
  });

  it('enforces dynamic height constraints when toggling controls', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    windowMocks.scaleFactor.mockResolvedValue(2); // 2x Retina
    windowMocks.innerSize.mockResolvedValue({ width: 1000, height: 400 }); // 200 logical

    useAppStore.setState({ isControlsCollapsed: true });
    const user = userEvent.setup();
    render(<OverlayPrompter />);

    // Initial check (collapsed)
    await waitFor(() => {
      expect(windowMocks.setMinSize).toHaveBeenCalledWith(expect.objectContaining({ height: 200 }));
    });

    // Toggle to expanded
    const toggleButton = screen.getByRole('button', { name: 'Toggle controls' });
    await user.click(toggleButton);

    // Verify constraints updated and window resized proactively
    await waitFor(() => {
      // Should set min height to 400
      expect(windowMocks.setMinSize).toHaveBeenCalledWith(expect.objectContaining({ height: 400 }));
      // Should proactively resize to 400 logical since it was at 400 physical (200 logical)
      expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ height: 400 }));
    });
  });

  it('toggles controls when the toggle-controls shortcut event is received', async () => {
    let shortcutCallback: (payload: { action: string }) => void = () => { };
    tauriMocks.listenForShortcutEvents.mockImplementation(async (cb: (payload: { action: string }) => void) => {
      shortcutCallback = cb;
      return () => { };
    });

    render(<OverlayPrompter />);

    // Initial state: expanded (from resetStore)
    expect(useAppStore.getState().isControlsCollapsed).toBe(false);

    // First shortcut event: should collapse
    await act(async () => {
      shortcutCallback({ action: 'toggle-controls' });
    });
    expect(useAppStore.getState().isControlsCollapsed).toBe(true);

    // Second shortcut event: should expand
    await act(async () => {
      shortcutCallback({ action: 'toggle-controls' });
    });
    expect(useAppStore.getState().isControlsCollapsed).toBe(false);
  });
});
