import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/use-app-store';
import { OverlayPrompter } from './overlay-prompter';

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
  quitApp: vi.fn(),
  showMainWindow: vi.fn(),
  listenForShortcutEvents: vi.fn(),
  listenForVadChanged: vi.fn().mockResolvedValue(() => undefined),
  listenForVoiceSyncChanged: vi.fn().mockResolvedValue(() => undefined),
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
  outerPosition: vi.fn(),
  outerSize: vi.fn(),
  setFocus: vi.fn(),
  setMinSize: vi.fn(),
  setSize: vi.fn(),
  scaleFactor: vi.fn(),
  innerSize: vi.fn()
}));
const originalAudioContext = globalThis.AudioContext;
const originalMediaDevices = navigator.mediaDevices;

let focusChangedListener: ((event: { payload: boolean }) => void) | null = null;
let movedListener: ((event: { payload: { x: number; y: number } }) => void) | null = null;

class FakeOverlayAudioContext {
  createAnalyser() {
    return {
      fftSize: 256,
      getByteTimeDomainData(buffer: Uint8Array) {
        buffer.fill(200);
      }
    };
  }

  createMediaStreamSource() {
    return {
      connect: () => undefined,
      disconnect: () => undefined
    };
  }

  close() {
    return Promise.resolve();
  }
}

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    outerPosition: windowMocks.outerPosition,
    outerSize: windowMocks.outerSize,
    innerSize: windowMocks.innerSize,
    currentMonitor: windowMocks.currentMonitor,
    setPosition: vi.fn().mockResolvedValue(undefined),
    setFocus: windowMocks.setFocus,
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
  listenForVadChanged: tauriMocks.listenForVadChanged,
  listenForVoiceSyncChanged: tauriMocks.listenForVoiceSyncChanged,
  quitApp: tauriMocks.quitApp,
  recoverOverlayFocus: tauriMocks.recoverOverlayFocus,
  saveOverlayBoundsForMonitor: tauriMocks.saveOverlayBoundsForMonitor,
  setLastOverlayMonitorName: tauriMocks.setLastOverlayMonitorName,
  showMainWindow: tauriMocks.showMainWindow,
  snapOverlayToTopCenter: tauriMocks.snapOverlayToTopCenter,
  startOverlayDrag: tauriMocks.startOverlayDrag
}));

vi.mock('../lib/speechmatics', () => ({
  createSpeechmaticsRealtimeClient: vi.fn().mockImplementation((options) => ({
    start: vi.fn().mockImplementation(async () => {
      options.onStatusChange?.('listening');
    }),
    stop: vi.fn().mockImplementation(() => {
      options.onStatusChange?.('stopped');
    }),
    getStatus: () => 'listening'
  }))
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
    isControlsCollapsed: false,
    showReadingRuler: true,
    vadEnabled: true,
    voicePauseDelayMs: 1500,
    voiceSyncEnabled: false,
    speechmaticsApiKey: '',
    toastMessage: null
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  Object.defineProperty(globalThis, 'AudioContext', {
    value: FakeOverlayAudioContext,
    configurable: true
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }]
      } as unknown as MediaStream)
    },
    configurable: true
  });
  setViewport(1440, 900);
  resetStore();

  focusChangedListener = null;
  movedListener = null;
  windowMocks.isFocused.mockResolvedValue(true);
  windowMocks.currentMonitor.mockResolvedValue({
    name: 'Display A',
    size: { width: 1920, height: 1080 },
    position: { x: 0, y: 0 },
    scaleFactor: 1
  });
  windowMocks.outerPosition.mockResolvedValue({ x: 0, y: 0 });
  windowMocks.outerSize.mockResolvedValue({ width: 1120, height: 400 });
  windowMocks.setFocus.mockResolvedValue(undefined);
  windowMocks.onMoved.mockImplementation((listener: (event: { payload: { x: number; y: number } }) => void) => {
    movedListener = listener;
    return Promise.resolve(() => undefined);
  });
  windowMocks.onResized.mockImplementation(() => Promise.resolve(() => undefined));
  windowMocks.onFocusChanged.mockImplementation(
    (listener: (event: { payload: boolean }) => void) => {
      focusChangedListener = listener;
      return Promise.resolve(() => undefined);
    }
  );
  tauriMocks.closeOverlayWindow.mockResolvedValue(undefined);
  tauriMocks.quitApp.mockResolvedValue(undefined);
  tauriMocks.showMainWindow.mockResolvedValue(undefined);
  tauriMocks.listenForShortcutEvents.mockResolvedValue(() => undefined);
  tauriMocks.recoverOverlayFocus.mockResolvedValue(undefined);
  tauriMocks.snapOverlayToTopCenter.mockImplementation(async () => {
    windowMocks.outerPosition.mockResolvedValue({ x: 400, y: 0 });
    return {
      x: 400,
      y: 0,
      monitorName: 'display-a'
    };
  });
  tauriMocks.startOverlayDrag.mockResolvedValue(undefined);

  windowMocks.setMinSize.mockResolvedValue(undefined);
  windowMocks.setSize.mockResolvedValue(undefined);
  windowMocks.scaleFactor.mockResolvedValue(1);
  windowMocks.innerSize.mockResolvedValue({ width: 1120, height: 400 });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'AudioContext', {
    value: originalAudioContext,
    configurable: true
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: originalMediaDevices,
    configurable: true
  });
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
    expect(screen.getByRole('dialog', { name: 'Font size settings' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Font size settings' })).toBeNull();
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
        fireEvent.keyDown(window, { key: '=', ctrlKey: true });
        fireEvent.keyDown(window, { key: '=', ctrlKey: true });
        flushRaf();
      });
      expect(useAppStore.getState().overlayFontScale).toBe(1.15);

      act(() => {
        fireEvent.keyDown(window, { key: '-', ctrlKey: true });
        flushRaf();
      });
      expect(useAppStore.getState().overlayFontScale).toBe(1.1);

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

  it('restores the main window without passing a stale monitor override on close', async () => {
    window.localStorage.setItem('glance-main-last-monitor-v1', 'External A|1920x1080|1920,0');
    render(<OverlayPrompter />);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(tauriMocks.closeOverlayWindow).toHaveBeenCalledTimes(1);
      expect(tauriMocks.showMainWindow).toHaveBeenCalledWith();
    });
  });

  it('quits the app on Cmd+W in Tauri mode instead of reopening the editor', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    render(<OverlayPrompter />);

    fireEvent.keyDown(window, { key: 'w', metaKey: true });

    await waitFor(() => {
      expect(tauriMocks.quitApp).toHaveBeenCalledTimes(1);
    });
    expect(tauriMocks.closeOverlayWindow).not.toHaveBeenCalled();
    expect(tauriMocks.showMainWindow).not.toHaveBeenCalled();
  });

  it('applies speed keyboard shortcuts with visible speed feedback', () => {
    const { container } = render(<OverlayPrompter />);
    act(() => {
      useAppStore.setState({ scrollSpeed: 3.2, speedStep: 0.1 });
    });

    fireEvent.keyDown(window, { key: 'ArrowUp', ctrlKey: true });
    expect(useAppStore.getState().scrollSpeed).toBe(3.3);
    expect(container.querySelector('.overlay-speed-bubble.is-visible')).toBeTruthy();
    expect(container.querySelector('.overlay-speed-icon-fast.is-animating')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'ArrowDown', ctrlKey: true });
    expect(useAppStore.getState().scrollSpeed).toBe(3.2);
    expect(container.querySelector('.overlay-speed-icon-slow.is-animating')).toBeTruthy();
  });

  it('keeps voice auto-pause controls out of the overlay UI', async () => {
    render(<OverlayPrompter />);

    expect(screen.queryByRole('slider', { name: 'Pause delay after silence' })).toBeNull();
    expect(screen.queryByText('Pause After Silence')).toBeNull();
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
    expect(screen.getByRole('dialog', { name: 'Font size settings' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Font size settings' })).toBeNull();
    });
  });

  it('changes opacity via the slider control', async () => {
    setViewport(1000, 900);
    render(<OverlayPrompter />);

    const opacitySlider = await screen.findByRole('slider', { name: 'Prompter opacity' });
    fireEvent.change(opacitySlider, { target: { value: '50' } });

    expect(useAppStore.getState().dimLevel).toBe(50);

    const overlayRoot = document.querySelector('.overlay-root') as HTMLElement;
    expect(overlayRoot?.style.getPropertyValue('--overlay-controls-opacity')).toBe('0.5');
  });

  it('renders the timer and a passive voice status in the desktop footer when enabled', () => {
    setViewport(1440, 900);
    const { container } = render(<OverlayPrompter />);

    const desktopStatus = container.querySelector('.overlay-speed-footer .overlay-footer-status-center-desktop');
    expect(desktopStatus?.querySelector('.overlay-timer-chip')).toBeTruthy();
    expect(desktopStatus?.querySelector('.overlay-voice-status')).toBeTruthy();
    expect(container.querySelector('.overlay-mic-toggle')).toBeNull();
    expect(screen.getAllByText('Voice').length).toBeGreaterThan(0);
  });

  it('renders a compact voice status chip instead of the desktop footer status below 1200px', () => {
    setViewport(1100, 900);
    const { container } = render(<OverlayPrompter />);

    const compactStatusRow = container.querySelector('.overlay-compact-status-row');
    expect(compactStatusRow?.querySelector('.overlay-timer-chip')).toBeTruthy();
    expect(compactStatusRow?.querySelector('.overlay-voice-status')).toBeTruthy();
    expect(compactStatusRow?.querySelector('.overlay-voice-status--compact')).toBeTruthy();
    expect(compactStatusRow?.querySelector('.overlay-voice-toggle')).toBeNull();
    expect(container.querySelectorAll('.overlay-voice-status')).toHaveLength(1);
    expect(container.querySelector('.overlay-speed-footer .overlay-footer-status-center-desktop')).toBeNull();
  });

  it('hides compact voice controls below 1200px when voice auto-pause is disabled', () => {
    useAppStore.setState({ vadEnabled: false });
    setViewport(1100, 900);
    const { container } = render(<OverlayPrompter />);

    const compactStatusRow = container.querySelector('.overlay-compact-status-row');
    expect(compactStatusRow?.querySelector('.overlay-timer-chip')).toBeTruthy();
    expect(compactStatusRow?.querySelector('.overlay-voice-status')).toBeNull();
    expect(container.querySelectorAll('.overlay-voice-status')).toHaveLength(0);
    expect(screen.queryByText('Voice')).toBeNull();
  });

  it('hides the passive voice status when voice auto-pause is disabled', () => {
    useAppStore.setState({ vadEnabled: false });
    const { container } = render(<OverlayPrompter />);

    expect(container.querySelector('.overlay-voice-status')).toBeNull();
    expect(container.querySelector('.overlay-voice-toggle')).toBeNull();
    expect(screen.queryByText('Voice')).toBeNull();
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

  it('shows focus-loss hint and clears it on focus regain', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    render(<OverlayPrompter />);

    await waitFor(() => {
      expect(windowMocks.onFocusChanged).toHaveBeenCalled();
      expect(focusChangedListener).not.toBeNull();
    });

    act(() => {
      focusChangedListener?.({ payload: false });
    });

    expect(document.querySelector('.overlay-unfocused-hint')).toBeTruthy();

    act(() => {
      focusChangedListener?.({ payload: true });
    });

    expect(document.querySelector('.overlay-unfocused-hint')).toBeNull();
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

  it('grows the compact window by the controls height and restores the previous height on collapse', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    setViewport(1100, 900);
    windowMocks.scaleFactor.mockResolvedValue(1);
    windowMocks.innerSize.mockResolvedValue({ width: 1000, height: 300 });

    const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function scrollHeight(this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains('overlay-compact-control-bar')) {
        return 240;
      }
      return 0;
    });

    useAppStore.setState({ isControlsCollapsed: true });
    const user = userEvent.setup();
    render(<OverlayPrompter />);

    try {
      await waitFor(() => {
        expect(windowMocks.setMinSize).toHaveBeenCalledWith(expect.objectContaining({ height: 200 }));
      });

      windowMocks.setMinSize.mockClear();
      windowMocks.setSize.mockClear();

      await user.click(screen.getByRole('button', { name: 'Toggle controls' }));

      await waitFor(() => {
        expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ height: 540 }));
      });
      expect(windowMocks.setMinSize).toHaveBeenCalledWith(expect.objectContaining({ height: 540 }));
      expect(useAppStore.getState().isControlsCollapsed).toBe(false);

      windowMocks.setMinSize.mockClear();
      windowMocks.setSize.mockClear();

      await user.click(screen.getByRole('button', { name: 'Toggle controls' }));

      await waitFor(() => {
        expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ height: 300 }));
      });
      expect(windowMocks.setMinSize).toHaveBeenCalledWith(expect.objectContaining({ height: 200 }));
      expect(useAppStore.getState().isControlsCollapsed).toBe(true);
    } finally {
      scrollHeightSpy.mockRestore();
    }
  });

  it('toggles controls when the toggle-controls shortcut event is received', async () => {
    let shortcutCallback: (payload: { action: string }) => void = () => { };
    tauriMocks.listenForShortcutEvents.mockImplementation(async (cb: (payload: { action: string }) => void) => {
      shortcutCallback = cb;
      return () => { };
    });

    render(<OverlayPrompter />);
    await waitFor(() => {
      expect(tauriMocks.listenForShortcutEvents).toHaveBeenCalledTimes(1);
    });

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
    expect(tauriMocks.listenForShortcutEvents).toHaveBeenCalledTimes(1);
  });

  it('uses the same compact resize path for toggle-controls shortcuts', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    setViewport(1100, 900);
    windowMocks.scaleFactor.mockResolvedValue(1);
    windowMocks.innerSize.mockResolvedValue({ width: 1000, height: 300 });

    const scrollHeightSpy = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function scrollHeight(this: HTMLElement) {
      if (this instanceof HTMLElement && this.classList.contains('overlay-compact-control-bar')) {
        return 240;
      }
      return 0;
    });

    useAppStore.setState({ isControlsCollapsed: true });

    let shortcutCallback: (payload: { action: string }) => void = () => { };
    tauriMocks.listenForShortcutEvents.mockImplementation(async (cb: (payload: { action: string }) => void) => {
      shortcutCallback = cb;
      return () => { };
    });

    render(<OverlayPrompter />);

    try {
      await waitFor(() => {
        expect(tauriMocks.listenForShortcutEvents).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        shortcutCallback({ action: 'toggle-controls' });
      });
      await waitFor(() => {
        expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ height: 540 }));
      });
      expect(useAppStore.getState().isControlsCollapsed).toBe(false);

      windowMocks.setSize.mockClear();

      await act(async () => {
        shortcutCallback({ action: 'toggle-controls' });
      });
      await waitFor(() => {
        expect(windowMocks.setSize).toHaveBeenCalledWith(expect.objectContaining({ height: 300 }));
      });
      expect(useAppStore.getState().isControlsCollapsed).toBe(true);
    } finally {
      scrollHeightSpy.mockRestore();
    }
  });

  it('switches from snap to lock controls at the home position and restores snap after a 1px move', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const user = userEvent.setup();
    tauriMocks.snapOverlayToTopCenter.mockImplementation(async () => {
      windowMocks.outerPosition.mockResolvedValue({ x: 401, y: 0 });
      return {
        x: 400,
        y: 0,
        monitorName: 'display-a'
      };
    });

    render(<OverlayPrompter />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lock window position' })).toBeTruthy();
    });

    windowMocks.outerPosition.mockResolvedValue({ x: 402, y: 0 });
    act(() => {
      movedListener?.({ payload: { x: 402, y: 0 } });
    });

    await user.click(screen.getByRole('button', { name: 'Snap to top' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lock window position' })).toBeTruthy();
    });

    expect(tauriMocks.snapOverlayToTopCenter).toHaveBeenCalledTimes(1);

    windowMocks.outerPosition.mockResolvedValue({ x: 403, y: 0 });
    act(() => {
      movedListener?.({ payload: { x: 403, y: 0 } });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Snap to top' })).toBeTruthy();
    });
  });

  it('treats the initial runtime position as home when the frontend cannot resolve the current monitor', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    windowMocks.currentMonitor.mockResolvedValue(null);
    windowMocks.outerPosition.mockResolvedValue({ x: 350, y: 76 });

    render(<OverlayPrompter />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lock window position' })).toBeTruthy();
    });
  });

  it('adopts the settled runtime position as home when launch coordinates shift without a resolved monitor', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    windowMocks.currentMonitor.mockResolvedValue(null);
    windowMocks.outerPosition.mockResolvedValue({ x: 350, y: 310 });

    render(<OverlayPrompter />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lock window position' })).toBeTruthy();
    });

    windowMocks.outerPosition.mockResolvedValue({ x: 350, y: 76 });
    act(() => {
      movedListener?.({ payload: { x: 350, y: 76 } });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lock window position' })).toBeTruthy();
    });
  });

  it('blocks dragging while the snapped position is pinned', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const user = userEvent.setup();
    const { container } = render(<OverlayPrompter />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Lock window position' })).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Lock window position' }));
    expect(screen.getByRole('button', { name: 'Unlock window position' })).toBeTruthy();

    const dragSurface = container.querySelector('.overlay-right-sidebar') as HTMLElement | null;
    expect(dragSurface).not.toBeNull();

    fireEvent.mouseDown(dragSurface as HTMLElement, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 18, clientY: 18 });

    expect(tauriMocks.startOverlayDrag).not.toHaveBeenCalled();
  });

  it('hides reading ruler and does not render eyeline guide when voiceSyncEnabled is true', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      showReadingRuler: true,
      markdown: '# Introduction\n\nWelcome to Glance teleprompter voice sync.'
    });

    let renderResult: any;
    await act(async () => {
      renderResult = render(<OverlayPrompter />);
    });
    const { container } = renderResult;

    expect(container.querySelector('.reading-ruler')).toBeNull();
    expect(container.querySelector('.voice-eyeline-guide')).toBeNull();
    expect(container.querySelector('.overlay-lines.is-voice-synced')).not.toBeNull();

    // Verify words are rendered with voice-word and data-word-global attributes
    const words = container.querySelectorAll('.voice-word');
    expect(words.length).toBeGreaterThan(0);
    expect(words[0]?.getAttribute('data-word-global')).toBe('0');
  });

  it('renders reading ruler when voiceSyncEnabled is false and showReadingRuler is true', async () => {
    useAppStore.setState({
      voiceSyncEnabled: false,
      showReadingRuler: true,
      markdown: '# Introduction\n\nWelcome to Glance teleprompter.'
    });

    let renderResult: any;
    await act(async () => {
      renderResult = render(<OverlayPrompter />);
    });
    const { container } = renderResult;

    expect(container.querySelector('.reading-ruler')).not.toBeNull();
    expect(container.querySelector('.voice-eyeline-guide')).toBeNull();
  });

  it('preserves cue chips and formatted inline elements when voiceSyncEnabled is true', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      showReadingRuler: true,
      markdown: 'Welcome everyone [pause] to **Glance** and *teleprompter*.'
    });

    let renderResult: any;
    await act(async () => {
      renderResult = render(<OverlayPrompter />);
    });
    const { container } = renderResult;

    // Verify cue chip is rendered
    const cueChip = container.querySelector('.overlay-cue-chip');
    expect(cueChip).not.toBeNull();
    expect(cueChip?.textContent).toBe('pause');

    // Verify strong and emphasis are rendered
    const strongEl = container.querySelector('strong');
    expect(strongEl).not.toBeNull();
    expect(strongEl?.textContent).toContain('Glance');

    const emEl = container.querySelector('em');
    expect(emEl).not.toBeNull();
    expect(emEl?.textContent).toContain('teleprompter');

    // Verify speakable words have data-word-global
    const words = container.querySelectorAll('.voice-word');
    expect(words.length).toBe(6); // Welcome, everyone, to, Glance, and, teleprompter
  });

  it('auto-plays on mount when voiceSyncEnabled is true and speechmaticsApiKey is configured', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-test-key',
      playbackState: 'paused',
      markdown: '# Test\n\nScript content'
    });

    await act(async () => {
      render(<OverlayPrompter />);
    });

    expect(useAppStore.getState().playbackState).toBe('running');
  });

  it('stays paused on mount when voiceSyncEnabled is false (standard teleprompter mode)', async () => {
    useAppStore.setState({
      voiceSyncEnabled: false,
      speechmaticsApiKey: 'valid-test-key',
      playbackState: 'running',
      markdown: '# Test\n\nScript content'
    });

    await act(async () => {
      render(<OverlayPrompter />);
    });

    expect(useAppStore.getState().playbackState).toBe('paused');
  });

  it('stays paused on mount when voiceSyncEnabled is true but apiKey is missing', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: '',
      playbackState: 'running',
      markdown: '# Test\n\nScript content'
    });

    await act(async () => {
      render(<OverlayPrompter />);
    });

    expect(useAppStore.getState().playbackState).toBe('paused');
  });

  it('hides speed slider and renders voice sync status in compact controls when voice sync is active', async () => {
    setViewport(1100, 900);
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-test-key',
      isControlsCollapsed: false,
      markdown: '# Test\n\nScript content'
    });

    let renderResult: any;
    await act(async () => {
      renderResult = render(<OverlayPrompter />);
    });
    const { container } = renderResult;

    // Speed slider should be hidden in compact controls
    expect(container.querySelector('.overlay-speed-slider')).toBeNull();
    // Voice sync setting row should be present
    expect(container.querySelector('.overlay-compact-setting-row--voice-sync')).not.toBeNull();
  });

  it('initializes first word as active with is-voice-current when voiceSyncEnabled and apiKey are configured', async () => {
    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-test-key',
      markdown: 'Welcome to Glance.'
    });

    let renderResult: any;
    await act(async () => {
      renderResult = render(<OverlayPrompter />);
    });
    const { container } = renderResult;

    const words = container.querySelectorAll('.voice-word');
    expect(words.length).toBe(3);
    // Word 0 ('Welcome') should be active immediately
    expect(words[0]?.classList.contains('is-voice-current')).toBe(true);
    // Word 1 and 2 should be upcoming
    expect(words[1]?.classList.contains('is-voice-upcoming')).toBe(true);
    expect(words[2]?.classList.contains('is-voice-upcoming')).toBe(true);
  });

  it('dynamically centers lanePadding when voice sync is active in short viewport heights', async () => {
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('overlay-content')) {
        return 120; // short viewport height (e.g. 120px)
      }
      return 0;
    });

    useAppStore.setState({
      voiceSyncEnabled: true,
      speechmaticsApiKey: 'valid-test-key',
      markdown: 'Welcome to Glance.'
    });

    let renderResult: any;
    await act(async () => {
      renderResult = render(<OverlayPrompter />);
    });
    const { container } = renderResult;

    const overlayLines = container.querySelector('.overlay-lines') as HTMLElement | null;
    expect(overlayLines).not.toBeNull();
    // In a 120px viewport, lanePadding should be centered around (120 - 60) / 2 = 30px
    // instead of hardcoded 70px which would push the line off-screen
    const paddingTop = parseInt(overlayLines?.style.paddingTop || '0', 10);
    expect(paddingTop).toBeLessThanOrEqual(35);
    expect(paddingTop).toBeGreaterThanOrEqual(20);

    clientHeightSpy.mockRestore();
  });

  it('toggles playback and prevents default when Space is pressed in webview without closing overlay', async () => {
    render(<OverlayPrompter />);
    expect(useAppStore.getState().playbackState).toBe('paused');

    act(() => {
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    });

    expect(useAppStore.getState().playbackState).toBe('running');
    expect(tauriMocks.closeOverlayWindow).not.toHaveBeenCalled();

    // Second space press pauses playback
    act(() => {
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    });
    expect(useAppStore.getState().playbackState).toBe('paused');
    expect(tauriMocks.closeOverlayWindow).not.toHaveBeenCalled();
  });

  it('jumps to section when Cmd/Ctrl+digit is pressed in webview', async () => {
    act(() => {
      useAppStore.setState({
        markdown: '# Section One\nLine 1\n# Section Two\nLine 2',
        scrollPosition: 100
      });
    });
    render(<OverlayPrompter />);

    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(performance.now() + 600);
      return 1;
    });

    const isMac = navigator.platform.toLowerCase().includes('mac');
    const modProps = isMac ? { metaKey: true } : { ctrlKey: true };

    act(() => {
      fireEvent.keyDown(window, {
        key: '1',
        code: 'Digit1',
        ...modProps
      });
    });

    expect(useAppStore.getState().scrollPosition).toBe(0);
    rafSpy.mockRestore();
  });

  it('deduplicates simultaneous DOM keydown and Tauri shortcut-event for the same action', async () => {
    let shortcutCallback: (payload: { action: string }) => void = () => { };
    tauriMocks.listenForShortcutEvents.mockImplementation(async (cb: (payload: { action: string }) => void) => {
      shortcutCallback = cb;
      return () => { };
    });

    render(<OverlayPrompter />);
    await waitFor(() => {
      expect(tauriMocks.listenForShortcutEvents).toHaveBeenCalledTimes(1);
    });

    expect(useAppStore.getState().playbackState).toBe('paused');

    // Simulate both DOM keydown and Tauri shortcut-event firing in rapid succession (<80ms)
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ', code: 'Space' });
      shortcutCallback({ action: 'toggle-play' });
    });

    // Should be toggled only ONCE (paused -> running), not toggled and immediately reverted to paused
    expect(useAppStore.getState().playbackState).toBe('running');
  });
});

