import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { markdownToDisplayLines, parseMarkdown } from '../lib/markdown';
import {
  closeOverlayWindow,
  getLastActiveSessionId,
  getLastOverlayMonitorName,
  listenForShortcutEvents,
  saveOverlayBoundsForMonitor,
  startOverlayDrag,
  setLastOverlayMonitorName,
  showMainWindow
} from '../lib/tauri';
import { ScrollEngine } from '../lib/scroll-engine';
import { useAppStore } from '../store/use-app-store';

const baseLineHeight = 54;
const fadeDurationMs = 140;
const baseSpeed = 42;
const minSpeed = 10;
const maxSpeed = 140;
const minFontScale = 0.85;
const maxFontScale = 1.4;
const fontScaleStep = 0.05;
const nonDraggableSelector = 'button, input, select, textarea, a, [role="menuitem"], [data-overlay-no-drag="true"]';

interface RulerStyle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly visible: boolean;
}

interface ContentMetrics {
  readonly width: number;
  readonly height: number;
}

function isMacPlatform(): boolean {
  return navigator.platform.includes('Mac');
}

function platformModifier(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl+';
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function normalizeFontScale(value: number): number {
  const clamped = Math.max(minFontScale, Math.min(maxFontScale, value));
  const stepped = Math.round(clamped / fontScaleStep) * fontScaleStep;
  return Number(stepped.toFixed(2));
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 6h4v12H7zm6 0h4v12h-4z" />
    </svg>
  );
}

function RewindIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M11.2 6.8a.9.9 0 0 0-1.3 0l-4.2 4a.9.9 0 0 0 0 1.3l4.2 4a.9.9 0 1 0 1.3-1.3l-2.7-2.5h6.6a4 4 0 1 1 0 8h-6.2a.9.9 0 1 0 0 1.8h6.2a5.8 5.8 0 0 0 0-11.6H8.5L11.2 8a.9.9 0 0 0 0-1.2Z" />
    </svg>
  );
}

function FontSizeIcon() {
  return (
    <svg className="overlay-font-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M0 0h16v4h-2V2H9v12h3v2H4v-2h3V2H2v2H0V2z" fillRule="evenodd" />
    </svg>
  );
}

function JumpSectionsIcon({ open }: { readonly open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {open ? <path d="m7 14 5-5 5 5" /> : <path d="m7 10 5 5 5-5" />}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

function SidebarToggleIcon({ expanded }: { readonly expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5h16v14H4z" />
      <path d={expanded ? 'M15 5v14' : 'M9 5v14'} />
    </svg>
  );
}

function SlowSpeedIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g>
          <path d="M28 38 Q26 22 36 18 Q48 14 52 26 Q56 38 44 44 Q34 48 28 38Z" strokeWidth="2.2" />
          <path d="M34 38 Q32 28 38 24 Q46 20 48 28 Q50 36 43 40 Q37 43 34 38Z" strokeWidth="1.6" />
          <path d="M38 37 Q37 31 41 29 Q45 27 46 31 Q47 35 43 37 Q40 38 38 37Z" strokeWidth="1.2" />
          <circle cx="42" cy="33" r="1.4" fill="currentColor" stroke="none" />
        </g>
        <g>
          <path d="M10 42 Q18 46 28 44 Q34 43 36 40" strokeWidth="2.4" />
          <path d="M10 40 Q8 36 10 32 Q12 28 18 30 Q22 31 22 36" strokeWidth="2.4" />
          <circle cx="16" cy="29" r="5" strokeWidth="2" />
          <circle cx="18" cy="27" r="1.2" fill="currentColor" stroke="none" />
          <line x1="14" y1="25" x2="10" y2="18" strokeWidth="1.8" />
          <circle cx="10" cy="17" r="1.5" fill="currentColor" stroke="none" />
          <line x1="18" y1="24" x2="20" y2="17" strokeWidth="1.8" />
          <circle cx="20" cy="16" r="1.5" fill="currentColor" stroke="none" />
        </g>
      </g>
    </svg>
  );
}

function FastSpeedIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g>
          <path d="M24 26 Q20 16 21 9 Q22 4 26 5 Q30 6 29 14 Q28 20 26 26" strokeWidth="2.2" />
          <path d="M38 26 Q42 16 41 9 Q40 4 36 5 Q32 6 33 14 Q34 20 36 26" strokeWidth="2.2" />
          <ellipse cx="31" cy="32" rx="10" ry="9" strokeWidth="2.2" />
          <circle cx="27" cy="30" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="35" cy="30" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="31" cy="34" r="0.9" fill="currentColor" stroke="none" />
          <path d="M29 35 Q31 37 33 35" strokeWidth="1.3" />
          <ellipse cx="31" cy="46" rx="9" ry="7" strokeWidth="2" />
          <circle cx="42" cy="46" r="3.5" strokeWidth="1.8" />
          <path d="M25 51 Q22 55 20 58" strokeWidth="2" />
          <path d="M30 52 Q28 56 26 59" strokeWidth="2" />
          <path d="M33 52 Q35 57 34 60" strokeWidth="2" />
          <path d="M38 51 Q41 55 43 58" strokeWidth="2" />
        </g>
      </g>
    </svg>
  );
}

function currentSectionFromLine(lines: readonly { sectionIndex: number | null }[], lineIndex: number): number {
  if (lines.length === 0) {
    return 0;
  }

  let cursor = Math.max(0, Math.min(lines.length - 1, lineIndex));
  for (; cursor >= 0; cursor -= 1) {
    const sectionIndex = lines[cursor]?.sectionIndex;
    if (typeof sectionIndex === 'number' && sectionIndex >= 0) {
      return sectionIndex;
    }
  }

  return 0;
}

export function OverlayPrompter() {
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const markdown = useAppStore((state) => state.markdown);
  const playbackState = useAppStore((state) => state.playbackState);
  const scrollPosition = useAppStore((state) => state.scrollPosition);
  const scrollSpeed = useAppStore((state) => state.scrollSpeed);
  const overlayFontScale = useAppStore((state) => state.overlayFontScale);
  const openSession = useAppStore((state) => state.openSession);
  const togglePlayback = useAppStore((state) => state.togglePlayback);
  const setPlaybackState = useAppStore((state) => state.setPlaybackState);
  const setScrollPosition = useAppStore((state) => state.setScrollPosition);
  const setScrollSpeed = useAppStore((state) => state.setScrollSpeed);
  const setOverlayFontScale = useAppStore((state) => state.setOverlayFontScale);
  const changeScrollSpeedBy = useAppStore((state) => state.changeScrollSpeedBy);
  const persistActiveSession = useAppStore((state) => state.persistActiveSession);
  const showToast = useAppStore((state) => state.showToast);

  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const sections = parsed.sections;

  const engineRef = useRef<ScrollEngine | null>(null);
  const speedRef = useRef(scrollSpeed);
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const monitorNameRef = useRef<string | null>(getLastOverlayMonitorName());
  const contentRef = useRef<HTMLElement | null>(null);
  const jumpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const jumpMenuRef = useRef<HTMLDivElement | null>(null);
  const fontTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fontMenuRef = useRef<HTMLDivElement | null>(null);
  const fontPersistTimeoutRef = useRef<number | null>(null);
  const speedIconAnimationTimeoutRef = useRef<number | null>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(true);
  const [isJumpMenuOpen, setIsJumpMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [animatedSpeedIcon, setAnimatedSpeedIcon] = useState<'slow' | 'fast' | null>(null);
  const [overlaySize, setOverlaySize] = useState(() => ({
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight)
  }));
  const [contentMetrics, setContentMetrics] = useState<ContentMetrics>({ width: 880, height: 420 });
  const [rulerStyle, setRulerStyle] = useState<RulerStyle>({
    left: 24,
    top: 0,
    width: 260,
    visible: false
  });

  const scaledLineHeight = Math.max(46, Math.round(baseLineHeight * overlayFontScale));

  const measureText = useCallback((text: string): number => {
    if (typeof window === 'undefined') {
      return text.length * 16;
    }

    if (!measureCanvasRef.current) {
      measureCanvasRef.current = document.createElement('canvas');
    }

    const context = measureCanvasRef.current.getContext('2d');
    if (!context) {
      return text.length * 16;
    }

    const fontSize = Math.round(28 * overlayFontScale);
    context.font = `500 ${fontSize}px "Inter Variable", "Inter", sans-serif`;
    return context.measureText(text).width;
  }, [overlayFontScale]);

  const lines = useMemo(() => {
    const maxLineWidthPx = Math.max(280, contentMetrics.width - 120);
    return markdownToDisplayLines(markdown, {
      maxLineWidthPx,
      measureText
    });
  }, [contentMetrics.width, markdown, measureText]);

  const sectionStartLineIndexes = useMemo(() => {
    const starts = Array.from({ length: sections.length }, () => 0);
    lines.forEach((line, index) => {
      if (line.kind !== 'heading' || typeof line.sectionIndex !== 'number') {
        return;
      }

      if (starts[line.sectionIndex] === 0) {
        starts[line.sectionIndex] = index;
      }
    });
    return starts;
  }, [lines, sections.length]);

  const anchorLineIndex = useMemo(() => {
    if (lines.length === 0) {
      return 0;
    }

    const anchorOffset = scrollPosition + contentMetrics.height * 0.42;
    return Math.max(0, Math.min(lines.length - 1, Math.floor(anchorOffset / scaledLineHeight)));
  }, [contentMetrics.height, lines.length, scaledLineHeight, scrollPosition]);

  const currentSectionIndex = useMemo(() => {
    if (sections.length === 0) {
      return 0;
    }

    const resolved = currentSectionFromLine(lines, anchorLineIndex);
    return Math.max(0, Math.min(sections.length - 1, resolved));
  }, [anchorLineIndex, lines, sections.length]);

  const currentSection = sections[currentSectionIndex] ?? null;
  const nextSection = sections[currentSectionIndex + 1] ?? null;
  const normalizedSpeed = scrollSpeed / baseSpeed;
  const speedProgress = ((scrollSpeed - minSpeed) / (maxSpeed - minSpeed)) * 100;

  const overlayVars = useMemo(() => ({
    '--overlay-font-scale': overlayFontScale.toString(),
    '--overlay-line-height': `${scaledLineHeight}px`
  } as CSSProperties), [overlayFontScale, scaledLineHeight]);

  const closeJumpMenu = useCallback((restoreFocus: boolean) => {
    setIsJumpMenuOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => {
        jumpTriggerRef.current?.focus();
      }, 0);
    }
  }, []);

  const closeFontMenu = useCallback((restoreFocus: boolean) => {
    setIsFontMenuOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => {
        fontTriggerRef.current?.focus();
      }, 0);
    }
  }, []);

  const jumpToSection = useCallback((index: number) => {
    const targetLine = sectionStartLineIndexes[index] ?? 0;
    setScrollPosition(targetLine * scaledLineHeight);
  }, [scaledLineHeight, sectionStartLineIndexes, setScrollPosition]);

  const commitFontScale = useCallback((nextValue: number) => {
    const normalized = normalizeFontScale(nextValue);
    setOverlayFontScale(normalized);

    if (!activeSessionId) {
      return;
    }

    if (fontPersistTimeoutRef.current !== null) {
      window.clearTimeout(fontPersistTimeoutRef.current);
    }

    fontPersistTimeoutRef.current = window.setTimeout(() => {
      void persistActiveSession();
      fontPersistTimeoutRef.current = null;
    }, 240);
  }, [activeSessionId, persistActiveSession, setOverlayFontScale]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsOpening(false);
    }, 8);

    return () => {
      window.clearTimeout(timeoutId);
      if (fontPersistTimeoutRef.current !== null) {
        window.clearTimeout(fontPersistTimeoutRef.current);
      }
      if (speedIconAnimationTimeoutRef.current !== null) {
        window.clearTimeout(speedIconAnimationTimeoutRef.current);
      }
    };
  }, []);

  const triggerSpeedIconAnimation = useCallback((icon: 'slow' | 'fast') => {
    setAnimatedSpeedIcon(icon);
    if (speedIconAnimationTimeoutRef.current !== null) {
      window.clearTimeout(speedIconAnimationTimeoutRef.current);
    }
    speedIconAnimationTimeoutRef.current = window.setTimeout(() => {
      setAnimatedSpeedIcon(null);
      speedIconAnimationTimeoutRef.current = null;
    }, 420);
  }, []);

  useEffect(() => {
    speedRef.current = scrollSpeed;
  }, [scrollSpeed]);

  useEffect(() => {
    engineRef.current = new ScrollEngine({
      getSpeed: () => speedRef.current,
      onTick: (position) => {
        const maxPosition = Math.max(0, lines.length * scaledLineHeight - window.innerHeight + 160);
        setScrollPosition(Math.min(position, maxPosition));
      }
    });

    engineRef.current.setPosition(useAppStore.getState().scrollPosition);

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [lines.length, scaledLineHeight, setScrollPosition]);

  useEffect(() => {
    if (!engineRef.current) {
      return;
    }

    if (Math.abs(engineRef.current.currentPosition() - scrollPosition) > 2) {
      engineRef.current.setPosition(scrollPosition);
    }
  }, [scrollPosition]);

  useEffect(() => {
    if (!engineRef.current) {
      return;
    }

    if (playbackState === 'running') {
      engineRef.current.play();
      return;
    }

    engineRef.current.pause();
  }, [playbackState]);

  useEffect(() => {
    let unlisten: () => void = () => {};

    void listenForShortcutEvents((payload) => {
      if (payload.action === 'toggle-play') {
        togglePlayback();
      }

      if (payload.action === 'jump-section' && typeof payload.index === 'number') {
        jumpToSection(payload.index);
      }

      if (payload.action === 'speed-change' && typeof payload.delta === 'number') {
        changeScrollSpeedBy(payload.delta);
      }

      if (payload.action === 'start-over') {
        setPlaybackState('paused');
        setScrollPosition(0);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten();
    };
  }, [changeScrollSpeedBy, jumpToSection, setPlaybackState, setScrollPosition, togglePlayback]);

  const requestCloseOverlay = useCallback(() => {
    if (isClosing) {
      return;
    }

    setPlaybackState('paused');
    setIsClosing(true);

    window.setTimeout(() => {
      void (async () => {
        try {
          await persistActiveSession();
          await closeOverlayWindow();
          await showMainWindow();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to close prompter';
          showToast(message, 'error');
        } finally {
          setIsClosing(false);
        }
      })();
    }, fadeDurationMs);
  }, [isClosing, persistActiveSession, setPlaybackState, showToast]);

  useEffect(() => {
    const syncActiveSession = () => {
      const preferredSessionId = getLastActiveSessionId();
      if (!preferredSessionId || preferredSessionId === activeSessionId) {
        return;
      }

      void openSession(preferredSessionId);
    };

    syncActiveSession();

    if (!isTauriRuntime()) {
      return;
    }

    const appWindow = getCurrentWindow();
    let unlistenFocus: (() => void) | null = null;

    void appWindow.onFocusChanged(({ payload }) => {
      if (payload) {
        syncActiveSession();
      }
    }).then((fn) => {
      unlistenFocus = fn;
    });

    return () => {
      unlistenFocus?.();
    };
  }, [activeSessionId, openSession]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isJumpMenuOpen) {
          event.preventDefault();
          closeJumpMenu(true);
          return;
        }

        if (isFontMenuOpen) {
          event.preventDefault();
          closeFontMenu(true);
          return;
        }

        event.preventDefault();
        requestCloseOverlay();
        return;
      }

      const withModifier = event.metaKey || event.ctrlKey;
      if (!withModifier) {
        return;
      }

      if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        requestCloseOverlay();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        changeScrollSpeedBy(2);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        changeScrollSpeedBy(-2);
        return;
      }

      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        commitFontScale(overlayFontScale + fontScaleStep);
        return;
      }

      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        commitFontScale(overlayFontScale - fontScaleStep);
        return;
      }

      if (event.key === '0') {
        event.preventDefault();
        commitFontScale(1);
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [
    changeScrollSpeedBy,
    closeFontMenu,
    closeJumpMenu,
    commitFontScale,
    isFontMenuOpen,
    isJumpMenuOpen,
    overlayFontScale,
    requestCloseOverlay
  ]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        isJumpMenuOpen
        && jumpMenuRef.current
        && !jumpMenuRef.current.contains(target)
        && !jumpTriggerRef.current?.contains(target)
      ) {
        closeJumpMenu(false);
      }

      if (
        isFontMenuOpen
        && fontMenuRef.current
        && !fontMenuRef.current.contains(target)
        && !fontTriggerRef.current?.contains(target)
      ) {
        closeFontMenu(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [closeFontMenu, closeJumpMenu, isFontMenuOpen, isJumpMenuOpen]);

  useEffect(() => {
    if (!isJumpMenuOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      jumpMenuRef.current?.querySelector<HTMLButtonElement>('[data-jump-item="true"]')?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isJumpMenuOpen]);

  useEffect(() => {
    if (!isFontMenuOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      fontMenuRef.current?.querySelector<HTMLButtonElement>('[data-font-focus="true"]')?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isFontMenuOpen]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const updateMetrics = () => {
      setContentMetrics({
        width: contentElement.clientWidth,
        height: contentElement.clientHeight
      });
    };

    updateMetrics();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateMetrics);
      return () => {
        window.removeEventListener('resize', updateMetrics);
      };
    }

    const observer = new ResizeObserver(updateMetrics);
    observer.observe(contentElement);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const syncSize = () => {
      setOverlaySize({
        width: Math.round(window.innerWidth),
        height: Math.round(window.innerHeight)
      });
    };

    syncSize();
    window.addEventListener('resize', syncSize);
    return () => {
      window.removeEventListener('resize', syncSize);
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const appWindow = getCurrentWindow();
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    const getRuntimeMonitorName = async (): Promise<string | null> => {
      const monitorAwareWindow = appWindow as unknown as {
        currentMonitor?: () => Promise<{ name?: string | null } | null>;
      };

      if (typeof monitorAwareWindow.currentMonitor !== 'function') {
        return null;
      }

      try {
        const monitor = await monitorAwareWindow.currentMonitor();
        return monitor?.name ?? null;
      } catch {
        return null;
      }
    };

    const persistBounds = () => {
      void Promise.all([appWindow.outerPosition(), appWindow.outerSize(), getRuntimeMonitorName()]).then(
        ([position, size, monitor]) => {
          const monitorName = monitor ?? monitorNameRef.current ?? getLastOverlayMonitorName();
          if (!monitorName) {
            return;
          }

          monitorNameRef.current = monitorName;
          setLastOverlayMonitorName(monitorName);
          saveOverlayBoundsForMonitor(monitorName, {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height
          });
        }
      );
    };

    void getRuntimeMonitorName().then((monitorName) => {
      if (monitorName) {
        monitorNameRef.current = monitorName;
        setLastOverlayMonitorName(monitorName);
      }
    });

    void appWindow.onMoved(() => persistBounds()).then((fn) => {
      unlistenMoved = fn;
    });

    void appWindow.onResized(() => persistBounds()).then((fn) => {
      unlistenResized = fn;
    });

    return () => {
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  const startWindowDrag = useCallback(() => {
    void startOverlayDrag().catch(() => {
      // best-effort
    });
  }, []);

  const handleDragMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || isJumpMenuOpen || isFontMenuOpen) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(nonDraggableSelector)) {
      return;
    }

    void startWindowDrag();
  }, [isFontMenuOpen, isJumpMenuOpen, startWindowDrag]);

  const handleJumpMenuKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      jumpMenuRef.current?.querySelectorAll<HTMLButtonElement>('[data-jump-item="true"]') ?? []
    );
    if (items.length === 0) {
      return;
    }

    const activeIndex = items.findIndex((item) => item === document.activeElement);
    const moveFocus = (nextIndex: number) => {
      const clamped = Math.max(0, Math.min(items.length - 1, nextIndex));
      items[clamped]?.focus();
    };

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(activeIndex < 0 ? 0 : activeIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(activeIndex <= 0 ? 0 : activeIndex - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      moveFocus(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      moveFocus(items.length - 1);
    }
  }, []);

  useEffect(() => {
    const updateRuler = () => {
      const contentElement = contentRef.current;
      if (!contentElement || lines.length === 0) {
        return;
      }

      const lineElement = lineRefs.current[anchorLineIndex];
      const line = lines[anchorLineIndex];
      if (!lineElement || !line || line.kind === 'empty') {
        setRulerStyle((previous) => ({ ...previous, visible: false }));
        return;
      }

      const contentRect = contentElement.getBoundingClientRect();
      const lineRect = lineElement.getBoundingClientRect();
      const minWidth = 220;
      const maxWidth = Math.max(minWidth, contentRect.width - 60);
      const measuredWidth = lineElement.scrollWidth + 24;
      const width = Math.max(minWidth, Math.min(maxWidth, measuredWidth));
      const top = lineRect.top - contentRect.top + (lineRect.height - Math.round(50 * overlayFontScale)) / 2;

      setRulerStyle((previous) => {
        const roundedTop = Math.round(top);
        const roundedWidth = Math.round(width);
        const nextLeft = 24;

        if (
          previous.visible
          && Math.abs(previous.top - roundedTop) < 1
          && Math.abs(previous.width - roundedWidth) < 1
        ) {
          return previous;
        }

        return {
          left: nextLeft,
          top: roundedTop,
          width: roundedWidth,
          visible: true
        };
      });
    };

    const frameId = window.requestAnimationFrame(updateRuler);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [anchorLineIndex, lines, overlayFontScale]);

  return (
    <main
      className={`overlay-root ${isSidebarExpanded ? 'overlay-sidebar-expanded' : 'overlay-sidebar-collapsed'} ${isOpening ? 'overlay-opening' : ''} ${isClosing ? 'overlay-closing' : ''}`}
      role="application"
      aria-label="Glance overlay"
      style={overlayVars}
      onMouseDown={handleDragMouseDown}
    >
      <div className="overlay-debug-size" aria-live="polite" aria-label="Overlay size">
        {overlaySize.width} × {overlaySize.height}
      </div>
      <aside className="overlay-left-sidebar" onMouseDown={handleDragMouseDown}>
        <div className="overlay-top-actions">
          <button
            type="button"
            className={`overlay-top-action ${isSidebarExpanded ? 'is-active' : ''}`}
            aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            title={isSidebarExpanded ? 'Collapse' : 'Expand'}
            aria-pressed={isSidebarExpanded}
            onClick={() => setIsSidebarExpanded((previous) => !previous)}
          >
            <SidebarToggleIcon expanded={isSidebarExpanded} />
          </button>
          <button
            ref={fontTriggerRef}
            type="button"
            className={`overlay-top-action ${isFontMenuOpen ? 'is-active' : ''}`}
            aria-label="Font size settings"
            title="Font size"
            aria-haspopup="dialog"
            aria-expanded={isFontMenuOpen}
            aria-pressed={isFontMenuOpen}
            onClick={() => {
              setIsJumpMenuOpen(false);
              setIsFontMenuOpen((previous) => !previous);
            }}
          >
            <FontSizeIcon />
          </button>
          <button
            ref={jumpTriggerRef}
            type="button"
            className={`overlay-top-action ${isJumpMenuOpen ? 'is-active' : ''}`}
            aria-label="Jump to section"
            title="Jump"
            aria-haspopup="menu"
            aria-expanded={isJumpMenuOpen}
            aria-pressed={isJumpMenuOpen}
            onClick={() => {
              setIsFontMenuOpen(false);
              setIsJumpMenuOpen((previous) => !previous);
            }}
          >
            <JumpSectionsIcon open={isJumpMenuOpen} />
          </button>
          <button
            type="button"
            className="overlay-close-button"
            onClick={requestCloseOverlay}
            aria-label="Close prompter"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
<br/>
        <span className="overlay-section-counter">
          {sections.length > 0 ? `${currentSectionIndex + 1}/${sections.length}` : '0/0'}
        </span>

        <div className="overlay-section-rail" aria-label="Current and next section">
          <span className="overlay-rail-pill overlay-rail-current" title={currentSection?.title ?? 'Current section'}>
            {isSidebarExpanded
              ? (currentSection?.title ?? 'Waiting for headings')
              : `${currentSectionIndex + 1}`}
          </span>
          {nextSection ? (
            <span className="overlay-rail-pill overlay-rail-next" title={nextSection.title}>
              {isSidebarExpanded ? `Next: ${nextSection.title}` : `${currentSectionIndex + 2}`}
            </span>
          ) : null}
        </div>

        {isFontMenuOpen ? (
          <div ref={fontMenuRef} className="overlay-popover overlay-font-popover" role="dialog" aria-label="Font size controls">
            <div className="overlay-font-controls">
              <button
                type="button"
                className="overlay-popover-button"
                data-font-focus="true"
                onClick={() => commitFontScale(overlayFontScale - fontScaleStep)}
                aria-label="Decrease font size"
              >
                A−
              </button>
              <input
                type="range"
                min={minFontScale}
                max={maxFontScale}
                step={fontScaleStep}
                value={overlayFontScale}
                onChange={(event) => commitFontScale(Number(event.target.value))}
                aria-label="Font size"
              />
              <button
                type="button"
                className="overlay-popover-button"
                onClick={() => commitFontScale(overlayFontScale + fontScaleStep)}
                aria-label="Increase font size"
              >
                A+
              </button>
            </div>
            <div className="overlay-font-footer">
              <span>{Math.round(overlayFontScale * 100)}%</span>
              <span className="overlay-font-shortcuts">
                {platformModifier()}+/− · {platformModifier()}0
              </span>
              <button
                type="button"
                className="overlay-popover-link"
                onClick={() => commitFontScale(1)}
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}

        {isJumpMenuOpen ? (
          <div
            ref={jumpMenuRef}
            className="overlay-popover overlay-jump-popover"
            role="menu"
            aria-label="Jump to section"
            onKeyDown={handleJumpMenuKeyDown}
          >
            {sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                role="menuitem"
                data-jump-item="true"
                className={`overlay-jump-item ${index === currentSectionIndex ? 'is-current' : ''}`}
                onClick={() => {
                  jumpToSection(index);
                  closeJumpMenu(true);
                }}
              >
                <span className="overlay-jump-title">{section.title}</span>
                {index < 9 ? (
                  <span className="overlay-jump-keycap">{platformModifier()}{index + 1}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      <section className="overlay-content" aria-live="polite" ref={contentRef}>
        <div
          className={`reading-ruler ${rulerStyle.visible ? 'visible' : ''}`}
          aria-hidden="true"
          style={{
            left: `${rulerStyle.left}px`,
            top: `${rulerStyle.top}px`,
            width: `${rulerStyle.width}px`
          }}
        />

        <div className="overlay-lines" style={{ transform: `translateY(${-scrollPosition}px)` }}>
          {lines.map((line, index) => (
            <p
              key={line.id}
              ref={(node) => {
                lineRefs.current[index] = node;
              }}
              className={`overlay-line overlay-line-${line.kind}`}
            >
              {line.kind === 'bullet' ? <span className="overlay-bullet-marker">•</span> : null}
              <span className="overlay-line-content">
                {line.segments?.length
                  ? line.segments.map((segment) => {
                    if (segment.kind === 'cue') {
                      return (
                        <span key={segment.id} className="overlay-cue-chip">
                          {segment.text}
                        </span>
                      );
                    }

                    return (
                      <span key={segment.id} className={`overlay-segment-${segment.kind}`}>
                        {segment.text}
                      </span>
                    );
                  })
                  : line.text || '\u00A0'}
              </span>
            </p>
          ))}
        </div>
      </section>

      <aside className="overlay-right-sidebar" onMouseDown={handleDragMouseDown}>
        <footer className="overlay-controls">
          <div className="overlay-controls-row">
            <button
              type="button"
              className="overlay-icon-button overlay-secondary-button"
              aria-label="Rewind to start"
              onClick={() => {
                setPlaybackState('paused');
                setScrollPosition(0);
              }}
            >
              <RewindIcon />
            </button>
            <button
              type="button"
              className={`control-button overlay-icon-button overlay-primary-button overlay-play-toggle ${playbackState === 'running' ? 'is-running' : ''}`}
              onClick={() => togglePlayback()}
              aria-label={playbackState === 'running' ? 'Pause' : 'Play'}
            >
              <span className="overlay-play-icon-stack" aria-hidden="true">
                <span className="overlay-play-icon overlay-play-icon-play">
                  <PlayIcon />
                </span>
                <span className="overlay-play-icon overlay-play-icon-pause">
                  <PauseIcon />
                </span>
              </span>
            </button>
          </div>
        </footer>
      </aside>

      <footer className="overlay-speed-footer">
        <div className="overlay-speed-inline">
          <span
            className={`overlay-speed-icon overlay-speed-icon-slow ${animatedSpeedIcon === 'slow' ? 'is-animating' : ''}`}
            aria-hidden="true"
          >
            <SlowSpeedIcon />
          </span>
          <div className="overlay-speed-track-wrap">
            <div
              className="overlay-speed-bubble"
              aria-hidden="true"
              style={{ left: `${Math.max(0, Math.min(100, speedProgress)).toFixed(2)}%` }}
            >
              {normalizedSpeed.toFixed(2)}x
            </div>
            <input
              className="overlay-speed-slider"
              type="range"
              min={minSpeed}
              max={maxSpeed}
              step={1}
              value={scrollSpeed}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setScrollSpeed(nextValue);
                if (nextValue < scrollSpeed) {
                  triggerSpeedIconAnimation('slow');
                  return;
                }
                if (nextValue > scrollSpeed) {
                  triggerSpeedIconAnimation('fast');
                  return;
                }
                triggerSpeedIconAnimation(nextValue <= baseSpeed ? 'slow' : 'fast');
              }}
              aria-label="Scroll speed"
              style={{
                '--overlay-speed-progress': `${Math.max(0, Math.min(100, speedProgress)).toFixed(2)}%`
              } as CSSProperties}
            />
          </div>
          <span
            className={`overlay-speed-icon overlay-speed-icon-fast ${animatedSpeedIcon === 'fast' ? 'is-animating' : ''}`}
            aria-hidden="true"
          >
            <FastSpeedIcon />
          </span>
        </div>
      </footer>
    </main>
  );
}
