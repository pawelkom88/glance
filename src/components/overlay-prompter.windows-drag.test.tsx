import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store/use-app-store';

const tauriMocks = vi.hoisted(() => ({
  closeOverlayWindow: vi.fn(),
  listenForShortcutEvents: vi.fn(),
  quitApp: vi.fn(),
  recoverOverlayFocus: vi.fn(),
  saveOverlayBoundsForMonitor: vi.fn(),
  setLastOverlayMonitorName: vi.fn(),
  showMainWindow: vi.fn(),
  snapOverlayToTopCenter: vi.fn(),
  startOverlayDrag: vi.fn()
}));

const windowMocks = vi.hoisted(() => ({
  currentMonitor: vi.fn(),
  innerSize: vi.fn(),
  isFocused: vi.fn(),
  onFocusChanged: vi.fn(),
  onMoved: vi.fn(),
  onResized: vi.fn(),
  outerPosition: vi.fn(),
  outerSize: vi.fn(),
  scaleFactor: vi.fn(),
  setFocus: vi.fn(),
  setMinSize: vi.fn(),
  setPosition: vi.fn(),
  setSize: vi.fn(),
  startDragging: vi.fn()
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    currentMonitor: windowMocks.currentMonitor,
    innerSize: windowMocks.innerSize,
    isFocused: windowMocks.isFocused,
    onFocusChanged: windowMocks.onFocusChanged,
    onMoved: windowMocks.onMoved,
    onResized: windowMocks.onResized,
    outerPosition: windowMocks.outerPosition,
    outerSize: windowMocks.outerSize,
    scaleFactor: windowMocks.scaleFactor,
    setFocus: windowMocks.setFocus,
    setMinSize: windowMocks.setMinSize,
    setPosition: windowMocks.setPosition,
    setSize: windowMocks.setSize,
    startDragging: windowMocks.startDragging
  }),
  LogicalSize: class {
    constructor(public width: number, public height: number) {}
  }
}));

vi.mock('../lib/tauri', () => ({
  closeOverlayWindow: tauriMocks.closeOverlayWindow,
  getLastActiveSessionId: vi.fn().mockReturnValue(null),
  getLastOverlayMonitorName: vi.fn().mockReturnValue(null),
  listenForShortcutEvents: tauriMocks.listenForShortcutEvents,
  quitApp: tauriMocks.quitApp,
  recoverOverlayFocus: tauriMocks.recoverOverlayFocus,
  saveOverlayBoundsForMonitor: tauriMocks.saveOverlayBoundsForMonitor,
  setLastOverlayMonitorName: tauriMocks.setLastOverlayMonitorName,
  showMainWindow: tauriMocks.showMainWindow,
  snapOverlayToTopCenter: tauriMocks.snapOverlayToTopCenter,
  startOverlayDrag: tauriMocks.startOverlayDrag
}));

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
    markdown: '# Intro\n\nText\n\n# Discovery\n\nMore text',
    parseWarnings: [],
    playbackState: 'paused',
    scrollPosition: 0,
    scrollSpeed: 42,
    overlayFontScale: 1,
    isControlsCollapsed: false,
    showReadingRuler: true,
    vadEnabled: true,
    voicePauseDelayMs: 1500,
    toastMessage: null
  });
}

describe('OverlayPrompter Windows drag regression', () => {
  const originalPlatform = navigator.platform;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: 'Win32'
    });

    resetStore();

    windowMocks.currentMonitor.mockResolvedValue({
      name: 'Display A',
      size: { width: 1920, height: 1080 },
      position: { x: 0, y: 0 },
      scaleFactor: 1
    });
    windowMocks.innerSize.mockResolvedValue({ width: 1120, height: 400 });
    windowMocks.isFocused.mockResolvedValue(true);
    windowMocks.onFocusChanged.mockResolvedValue(() => undefined);
    windowMocks.onMoved.mockResolvedValue(() => undefined);
    windowMocks.onResized.mockResolvedValue(() => undefined);
    windowMocks.outerPosition.mockResolvedValue({ x: 0, y: 0 });
    windowMocks.outerSize.mockResolvedValue({ width: 1120, height: 400 });
    windowMocks.scaleFactor.mockResolvedValue(1);
    windowMocks.setFocus.mockResolvedValue(undefined);
    windowMocks.setMinSize.mockResolvedValue(undefined);
    windowMocks.setPosition.mockResolvedValue(undefined);
    windowMocks.setSize.mockResolvedValue(undefined);
    windowMocks.startDragging.mockResolvedValue(undefined);

    tauriMocks.closeOverlayWindow.mockResolvedValue(undefined);
    tauriMocks.listenForShortcutEvents.mockResolvedValue(() => undefined);
    tauriMocks.quitApp.mockResolvedValue(undefined);
    tauriMocks.recoverOverlayFocus.mockResolvedValue(undefined);
    tauriMocks.saveOverlayBoundsForMonitor.mockResolvedValue(undefined);
    tauriMocks.setLastOverlayMonitorName.mockResolvedValue(undefined);
    tauriMocks.showMainWindow.mockResolvedValue(undefined);
    tauriMocks.snapOverlayToTopCenter.mockResolvedValue({
      x: 0,
      y: 0,
      monitorName: 'display-a'
    });
    tauriMocks.startOverlayDrag.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: originalPlatform
    });
    vi.useRealTimers();
  });

  it('does not reclaim overlay focus while a Windows drag is being started', async () => {
    const { OverlayPrompter } = await import('./overlay-prompter');
    const { container } = render(<OverlayPrompter />);

    const dragSurface = container.querySelector('.overlay-root') as HTMLElement | null;
    expect(dragSurface).not.toBeNull();

    vi.useFakeTimers();

    fireEvent.mouseDown(dragSurface as HTMLElement, {
      button: 0,
      clientX: 12,
      clientY: 12
    });

    await act(async () => {
      await Promise.resolve();
      vi.runAllTimers();
    });

    expect(windowMocks.startDragging).toHaveBeenCalledTimes(1);
    expect(tauriMocks.startOverlayDrag).not.toHaveBeenCalled();
    expect(tauriMocks.recoverOverlayFocus).not.toHaveBeenCalled();
    expect(windowMocks.setFocus).not.toHaveBeenCalled();
  });
});
