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
  recoverOverlayFocus,
  saveOverlayBoundsForMonitor,
  startOverlayDrag,
  setLastOverlayMonitorName,
  showMainWindow
} from '../lib/tauri';
import { ScrollEngine } from '../lib/scroll-engine';
import { useAppStore } from '../store/use-app-store';

const baseLineHeight = 54;
const overlayLineGapPx = 10;
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

function isTypingTarget(target: HTMLElement | null): boolean {
  if (!target) {
    return false;
  }

  if (target instanceof HTMLTextAreaElement || target.isContentEditable) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  const type = (target.type || 'text').toLowerCase();
  return [
    'text',
    'search',
    'url',
    'tel',
    'email',
    'password',
    'number'
  ].includes(type);
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

function RestartIcon() {
  return (
    <svg className="overlay-rewind-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polygon points="19 20 9 12 19 4 19 20" fill="currentColor"></polygon>
      <line x1="5" y1="19" x2="5" y2="5"></line>
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
      {open ? <path d="m10 7 5 5-5 5" /> : <path d="m14 7-5 5 5 5" />}
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
  const showReadingRuler = useAppStore((state) => state.showReadingRuler);
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
  const overlayRootRef = useRef<HTMLElement | null>(null);
  const jumpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const jumpMenuRef = useRef<HTMLDivElement | null>(null);
  const fontTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fontMenuRef = useRef<HTMLDivElement | null>(null);
  const fontPersistTimeoutRef = useRef<number | null>(null);
  const speedIconAnimationTimeoutRef = useRef<number | null>(null);
  const speedBubbleTimeoutRef = useRef<number | null>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const moveTimeoutRef = useRef<number | null>(null);
  const hasShownInactiveHintRef = useRef(false);

  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(true);
  const [isJumpMenuOpen, setIsJumpMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isOverlayFocused, setIsOverlayFocused] = useState(true);

  const [animatedSpeedIcon, setAnimatedSpeedIcon] = useState<'slow' | 'fast' | null>(null);
  const [isSpeedBubbleVisible, setIsSpeedBubbleVisible] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
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

  useEffect(() => {
    // Start from top each time the overlay route mounts.
    setPlaybackState('paused');
    setScrollPosition(0);
  }, [setPlaybackState, setScrollPosition]);

  const scaledLineHeight = Math.max(46, Math.round(baseLineHeight * overlayFontScale));
  const lineStride = scaledLineHeight + overlayLineGapPx;
  const focusLaneRatio = 0.14;
  const lanePadding = useMemo(
    () => {
      const preferredOffset = contentMetrics.height * focusLaneRatio;
      const clampedOffset = Math.max(52, Math.min(contentMetrics.height * 0.24, preferredOffset));
      return Math.max(0, clampedOffset - (scaledLineHeight * 0.5));
    },
    [contentMetrics.height, scaledLineHeight]
  );

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
    return sections.map((section) => {
      const headingId = `heading-${section.lineIndex}`;
      const headingLineIndex = lines.findIndex((line) => line.id === headingId);
      return headingLineIndex >= 0 ? headingLineIndex : 0;
    });
  }, [lines, sections]);

  const linePositions = useMemo(() => {
    const positions: number[] = [];
    let currentY = 0;
    for (const line of lines) {
      positions.push(currentY);
      if (line.kind === 'empty') {
        currentY += (scaledLineHeight * 0.5) + overlayLineGapPx;
      } else {
        currentY += scaledLineHeight + overlayLineGapPx;
      }
    }
    return { positions, totalHeight: currentY };
  }, [lines, overlayLineGapPx, scaledLineHeight]);

  const anchorLineIndex = useMemo(() => {
    if (lines.length === 0) {
      return 0;
    }

    const { positions } = linePositions;
    for (let i = 0; i < positions.length; i += 1) {
      if (positions[i] > scrollPosition) {
        return Math.max(0, i - 1);
      }
    }

    return Math.max(0, lines.length - 1);
  }, [linePositions, lines.length, scrollPosition]);

  const currentSectionIndex = useMemo(() => {
    if (sections.length === 0) {
      return 0;
    }

    const resolved = currentSectionFromLine(lines, anchorLineIndex);
    return Math.max(0, Math.min(sections.length - 1, resolved));
  }, [anchorLineIndex, lines, sections.length]);

  const currentSection = sections[currentSectionIndex] ?? null;
  const nextSection = sections[currentSectionIndex + 1] ?? null;
  const firstRenderableLine = useMemo(
    () => lines.find((line) => line.kind !== 'empty') ?? null,
    [lines]
  );
  const firstLineLaneNudge = firstRenderableLine?.kind === 'heading'
    ? -18
    : firstRenderableLine?.kind === 'bullet'
      ? -10
      : 0;
  const normalizedSpeed = scrollSpeed / baseSpeed;
  const speedProgress = ((scrollSpeed - minSpeed) / (maxSpeed - minSpeed)) * 100;
  const showSectionTitlesInRail = overlaySize.width < 1200;
  const isCompactTopBar = overlaySize.width < 1200;

  const renderTopActions = () => (
    <div className="overlay-top-actions">
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
      {!isCompactTopBar ? (
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
      ) : null}
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
  );

  const renderSectionRail = () => (
    <>
      <span className="overlay-section-counter">
        {sections.length > 0 ? `${currentSectionIndex + 1}/${sections.length}` : '0/0'}
      </span>

      <div className="overlay-section-rail" aria-label="Current and next section">
        <span className="overlay-rail-pill overlay-rail-current" title={currentSection?.title ?? 'Current section'}>
          {showSectionTitlesInRail
            ? (currentSection?.title ?? 'Waiting for headings')
            : `${currentSectionIndex + 1}`}
        </span>

        {nextSection ? (
          <span className="overlay-rail-pill overlay-rail-next" title={nextSection.title}>
            {showSectionTitlesInRail ? `Next: ${nextSection.title}` : `${currentSectionIndex + 2}`}
          </span>
        ) : null}
      </div>
    </>
  );

  const renderPlaybackControls = (className = '') => (
    <footer className={`overlay-controls ${className}`.trim()}>
      <div className="overlay-controls-row">
        <div className="overlay-control-group">
          <button
            type="button"
            className="overlay-icon-button overlay-secondary-button"
            aria-label="Restart"
            onClick={(e) => {
              setPlaybackState('paused');
              setScrollPosition(0);
              e.currentTarget.blur();
              overlayRootRef.current?.focus({ preventScroll: true });
            }}
          >
            <RestartIcon />
          </button>
          <span className="overlay-control-hint" aria-hidden="true">
            <span className="overlay-control-keycap">R</span>
            <span>Restart</span>
          </span>
        </div>
        <div className="overlay-control-group">
          <button
            type="button"
            className={`control-button overlay-icon-button overlay-primary-button overlay-play-toggle ${playbackState === 'running' ? 'is-running' : ''}`}
            onClick={(e) => {
              togglePlayback();
              e.currentTarget.blur();
              overlayRootRef.current?.focus({ preventScroll: true });
            }}
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
          <span className="overlay-control-hint" aria-hidden="true">
            <span className="overlay-control-keycap">Space</span>
            <span>Play</span>
          </span>
        </div>
      </div>
    </footer>
  );

  const renderSpeedControls = (className: string) => (
    <footer className={className}>
      <div className="overlay-speed-inline">
        <span
          className={`overlay-speed-icon overlay-speed-icon-slow ${animatedSpeedIcon === 'slow' ? 'is-animating' : ''}`}
          aria-hidden="true"
        >
          <SlowSpeedIcon />
        </span>
        <div className="overlay-speed-track-wrap">
          <div
            className={`overlay-speed-bubble ${isSpeedBubbleVisible ? 'is-visible' : ''}`}
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
            step={0.1}
            value={scrollSpeed}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              setScrollSpeed(nextValue);
              revealSpeedBubble();
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
            onPointerDown={() => revealSpeedBubble()}
            onFocus={() => revealSpeedBubble()}
            onPointerUp={(e) => {
              e.currentTarget.blur();
              overlayRootRef.current?.focus({ preventScroll: true });
            }}
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
  );

  const overlayVars = useMemo(() => ({
    '--overlay-font-scale': overlayFontScale.toString(),
    '--overlay-line-height': `${scaledLineHeight}px`,
    '--overlay-line-gap': `${overlayLineGapPx}px`,
    '--overlay-lane-padding': `${Math.max(0, Math.round(lanePadding + firstLineLaneNudge))}px`
  } as CSSProperties), [firstLineLaneNudge, lanePadding, overlayFontScale, scaledLineHeight]);

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
    if (index < 0 || index >= sectionStartLineIndexes.length) {
      return;
    }

    const targetLine = sectionStartLineIndexes[index];
    if (typeof targetLine !== 'number' || !Number.isFinite(targetLine)) {
      return;
    }

    const targetY = linePositions.positions[targetLine] ?? 0;
    setScrollPosition(targetY);
  }, [linePositions.positions, sectionStartLineIndexes, setScrollPosition]);

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
      if (speedBubbleTimeoutRef.current !== null) {
        window.clearTimeout(speedBubbleTimeoutRef.current);
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

  const revealSpeedBubble = useCallback(() => {
    setIsSpeedBubbleVisible(true);
    if (speedBubbleTimeoutRef.current !== null) {
      window.clearTimeout(speedBubbleTimeoutRef.current);
    }
    speedBubbleTimeoutRef.current = window.setTimeout(() => {
      setIsSpeedBubbleVisible(false);
      speedBubbleTimeoutRef.current = null;
    }, 680);
  }, []);

  useEffect(() => {
    speedRef.current = scrollSpeed;
  }, [scrollSpeed]);

  useEffect(() => {
    const maxPosition = Math.max(0, linePositions.totalHeight - lineStride);

    engineRef.current = new ScrollEngine({
      getSpeed: () => speedRef.current,
      onTick: (position) => {
        setScrollPosition(Math.min(position, maxPosition));
      }
    });

    engineRef.current.setPosition(
      Math.min(useAppStore.getState().scrollPosition, maxPosition)
    );

    if (useAppStore.getState().playbackState === 'running') {
      engineRef.current.play();
    }

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [linePositions.totalHeight, lineStride, setScrollPosition]);

  useEffect(() => {
    const maxPosition = Math.max(0, linePositions.totalHeight - lineStride);
    if (scrollPosition > maxPosition) {
      setScrollPosition(maxPosition);
    }
  }, [linePositions.totalHeight, lineStride, scrollPosition, setScrollPosition]);

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
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void listenForShortcutEvents((payload) => {
      if (payload.action === 'toggle-play') {
        togglePlayback();
        return;
      }

      if (payload.action === 'jump-section' && typeof payload.index === 'number') {
        jumpToSection(payload.index);
        return;
      }

      if (payload.action === 'speed-change' && typeof payload.delta === 'number') {
        changeScrollSpeedBy(payload.delta);
        revealSpeedBubble();
        if (payload.delta < 0) {
          triggerSpeedIconAnimation('slow');
        } else if (payload.delta > 0) {
          triggerSpeedIconAnimation('fast');
        }
        return;
      }

      if (payload.action === 'start-over') {
        setPlaybackState('paused');
        setScrollPosition(0);
        return;
      }

      if (payload.action === 'font-scale-change' && typeof payload.delta === 'number') {
        commitFontScale(overlayFontScale + payload.delta * fontScaleStep);
        return;
      }

      if (payload.action === 'font-scale-reset') {
        commitFontScale(1);
        return;
      }

      if (payload.action === 'escape-pressed') {
        if (isJumpMenuOpen) {
          closeJumpMenu(true);
          return;
        }
        if (isFontMenuOpen) {
          closeFontMenu(true);
          return;
        }
        requestCloseOverlay();
      }
    }).then((fn) => {
      if (isDisposed) {
        fn();
        return;
      }

      unlisten = fn;
    });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [
    changeScrollSpeedBy,
    closeFontMenu,
    closeJumpMenu,
    commitFontScale,
    isFontMenuOpen,
    isJumpMenuOpen,
    overlayFontScale,
    requestCloseOverlay,
    jumpToSection,
    revealSpeedBubble,
    setPlaybackState,
    setScrollPosition,
    togglePlayback,
    triggerSpeedIconAnimation
  ]);

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

    void appWindow.isFocused().then((focused) => {
      setIsOverlayFocused(focused);
    }).catch(() => {
      setIsOverlayFocused(true);
    });

    void appWindow.onFocusChanged(({ payload }) => {
      setIsOverlayFocused(payload);
      if (payload) {
        syncActiveSession();
        return;
      }

      if (!hasShownInactiveHintRef.current) {
        hasShownInactiveHintRef.current = true;
        showToast('Overlay inactive. Click it to re-enable shortcuts.', 'info');
      }
    }).then((fn) => {
      unlistenFocus = fn;
    });

    return () => {
      unlistenFocus?.();
    };
  }, [activeSessionId, openSession, showToast]);

  useEffect(() => {
    const tauriRuntime = isTauriRuntime();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextLikeTarget = isTypingTarget(target);

      if (event.key === 'Escape') {
        event.preventDefault();
        if (isJumpMenuOpen) {
          closeJumpMenu(true);
          return;
        }
        if (isFontMenuOpen) {
          closeFontMenu(true);
          return;
        }
        requestCloseOverlay();
        return;
      }

      const withModifier = event.metaKey || event.ctrlKey;

      if (!withModifier && !isTextLikeTarget && !tauriRuntime) {
        const isSpaceKey = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';

        if (isSpaceKey) {
          event.preventDefault();
          event.stopPropagation();
          togglePlayback();
          return;
        }

        if (event.key.toLowerCase() === 'r') {
          event.preventDefault();
          event.stopPropagation();
          setPlaybackState('paused');
          setScrollPosition(0);
          return;
        }
      }

      if (!withModifier) {
        return;
      }

      if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        requestCloseOverlay();
        return;
      }

      if (event.key === '=' || event.key === '+') {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        commitFontScale(overlayFontScale + fontScaleStep);
        return;
      }

      if (event.key === '-' || event.key === '_') {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        commitFontScale(overlayFontScale - fontScaleStep);
        return;
      }

      if (event.key === '0') {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        commitFontScale(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        changeScrollSpeedBy(1);
        revealSpeedBubble();
        triggerSpeedIconAnimation('fast');
        return;
      }

      if (event.key === 'ArrowDown') {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        changeScrollSpeedBy(-1);
        revealSpeedBubble();
        triggerSpeedIconAnimation('slow');
        return;
      }

      // Cmd+1..9 for section jumps
      const numKey = parseInt(event.key, 10);
      if (numKey >= 1 && numKey <= 9) {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        jumpToSection(numKey - 1);
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
    requestCloseOverlay,
    setPlaybackState,
    setScrollPosition,
    togglePlayback
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

    void appWindow.onMoved(() => {
      persistBounds();
      if (moveTimeoutRef.current !== null) {
        window.clearTimeout(moveTimeoutRef.current);
      }
      moveTimeoutRef.current = window.setTimeout(() => {
        void recoverOverlayFocus().catch(() => {
          getCurrentWindow().setFocus().catch(() => { });
        });
        overlayRootRef.current?.focus({ preventScroll: true });
      }, 80);
    }).then((fn) => {
      unlistenMoved = fn;
    });

    void appWindow.onResized(() => {
      persistBounds();
      setIsResizing(true);
      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        setIsResizing(false);
      }, 800);
    }).then((fn) => {
      unlistenResized = fn;
    });

    return () => {
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, []);

  const queueFocusRecovery = useCallback(() => {
    const retryDelays = [0, 80, 180, 320, 520];
    for (const delay of retryDelays) {
      window.setTimeout(() => {
        void recoverOverlayFocus().catch(() => {
          getCurrentWindow().setFocus().catch(() => { });
        });
        overlayRootRef.current?.focus({ preventScroll: true });
      }, delay);
    }
  }, []);

  const startWindowDrag = useCallback(() => {
    queueFocusRecovery();
    void startOverlayDrag().finally(() => {
      queueFocusRecovery();
    });
  }, [queueFocusRecovery]);

  const handleDragMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || isJumpMenuOpen || isFontMenuOpen) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(nonDraggableSelector)) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = Math.abs(moveEvent.clientX - startX);
      const dy = Math.abs(moveEvent.clientY - startY);
      if (dx > 3 || dy > 3) {
        cleanup();
        void startWindowDrag();
      }
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', cleanup);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', cleanup);
  }, [isFontMenuOpen, isJumpMenuOpen, startWindowDrag]);

  const handleRootMouseDownCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(nonDraggableSelector)) {
      return;
    }

    overlayRootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      overlayRootRef.current?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

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

      const line = lines[anchorLineIndex];
      if (!line) {
        return;
      }

      const contentRect = contentElement.getBoundingClientRect();
      const minWidth = 220;
      const horizontalInset = 24;
      const width = Math.max(minWidth, contentRect.width - (horizontalInset * 2));
      const rulerHeight = Math.round(50 * overlayFontScale);
      const effectivePadding = Math.max(0, lanePadding + firstLineLaneNudge);
      const top = effectivePadding + ((scaledLineHeight - rulerHeight) / 2);

      setRulerStyle((previous) => {
        const roundedTop = Math.round(top);
        const roundedWidth = Math.round(width);
        const nextLeft = horizontalInset;

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
  }, [anchorLineIndex, firstLineLaneNudge, lanePadding, lines, overlayFontScale, scaledLineHeight]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-overlay-window', 'true');
    return () => {
      document.documentElement.removeAttribute('data-overlay-window');
    };
  }, []);

  return (
    <main
      ref={overlayRootRef}
      className={`overlay-root overlay-sidebar-collapsed ${isOpening ? 'overlay-opening' : ''} ${isClosing ? 'overlay-closing' : ''} ${isOverlayFocused ? '' : 'overlay-unfocused'}`}
      role="application"
      aria-label="Glance overlay"
      tabIndex={-1}
      style={overlayVars}
      onMouseDownCapture={handleRootMouseDownCapture}
      onPointerDownCapture={() => {
        overlayRootRef.current?.focus({ preventScroll: true });
      }}
      onMouseDown={handleDragMouseDown}
    >
      <div className={`overlay-debug-size ${isResizing ? 'is-visible' : ''}`} aria-live="polite" aria-label="Overlay size">
        {overlaySize.width} × {overlaySize.height}
      </div>
      <aside className="overlay-left-sidebar" onMouseDown={handleDragMouseDown}>
        {!isCompactTopBar ? (
          <div className="overlay-left-sidebar-layout">
            <div className="overlay-left-utility-cluster">
              {renderTopActions()}
            </div>
            <div className="overlay-left-context-cluster">
              <span className="overlay-section-counter">
                {sections.length > 0 ? `${currentSectionIndex + 1}/${sections.length}` : '0/0'}
              </span>
            </div>
            <div className="overlay-left-nav-cluster">
              <div className="overlay-section-rail" aria-label="Current and next section">
                <span className="overlay-rail-pill overlay-rail-current" title={currentSection?.title ?? 'Current section'}>
                  {showSectionTitlesInRail
                    ? (currentSection?.title ?? 'Waiting for headings')
                    : `${currentSectionIndex + 1}`}
                </span>

                {nextSection ? (
                  <span className="overlay-rail-pill overlay-rail-next" title={nextSection.title}>
                    {showSectionTitlesInRail ? `Next: ${nextSection.title}` : `${currentSectionIndex + 2}`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

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

      <section
        className={`overlay-content ${showReadingRuler ? '' : 'overlay-content-no-ruler'}`.trim()}
        aria-live="polite"
        ref={contentRef}
        data-overlay-no-drag="true"
        style={{
          '--spotlight-top': `${rulerStyle.top}px`,
          '--spotlight-height': `${Math.round(50 * overlayFontScale)}px`
        } as CSSProperties}
      >
        {showReadingRuler ? (
          <div
            className={`reading-ruler ${rulerStyle.visible ? 'visible' : ''}`}
            aria-hidden="true"
            style={{ top: `${rulerStyle.top}px` }}
          />
        ) : null}

        <div
          className="overlay-lines"
          style={{
            transform: `translateY(${-scrollPosition}px)`,
            paddingTop: `${lanePadding}px`,
            paddingBottom: `${lanePadding}px`
          }}
        >
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
        {isCompactTopBar ? (
          <div className="overlay-compact-dock">
            <div className="overlay-compact-context-bar">
              <div className="overlay-compact-context-main">
                {renderSectionRail()}
              </div>
              <div className="overlay-compact-utility-cluster">
                {renderTopActions()}
              </div>
              {isFontMenuOpen ? (
                <div ref={fontMenuRef} className="overlay-popover overlay-font-popover overlay-font-popover-compact" role="dialog" aria-label="Font size controls">
                  <div className="overlay-font-controls">
                    <button
                      type="button"
                      className="overlay-popover-button"
                      data-font-focus="true"
                      onClick={(e) => {
                        commitFontScale(overlayFontScale - fontScaleStep);
                        e.currentTarget.blur();
                        overlayRootRef.current?.focus({ preventScroll: true });
                      }}
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
                      onPointerUp={(e) => {
                        e.currentTarget.blur();
                        overlayRootRef.current?.focus({ preventScroll: true });
                      }}
                      aria-label="Font size"
                    />
                    <button
                      type="button"
                      className="overlay-popover-button"
                      onClick={(e) => {
                        commitFontScale(overlayFontScale + fontScaleStep);
                        e.currentTarget.blur();
                        overlayRootRef.current?.focus({ preventScroll: true });
                      }}
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
            </div>

            <div className="overlay-compact-control-bar">
              {renderPlaybackControls()}
              <div className="overlay-compact-speed-row">
                {renderSpeedControls('overlay-speed-footer overlay-speed-footer-compact')}
              </div>
            </div>
          </div>
        ) : null}
        {!isCompactTopBar ? renderPlaybackControls('overlay-controls-desktop') : null}
      </aside>

      {!isCompactTopBar ? renderSpeedControls('overlay-speed-footer') : null}
    </main>
  );
}
