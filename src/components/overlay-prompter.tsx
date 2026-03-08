import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { markdownToDisplayLines, parseMarkdown } from '../lib/markdown';
import {
  closeOverlayWindow,
  getLastActiveSessionId,
  getLastOverlayMonitorName,
  listenForShortcutEvents,
  recoverOverlayFocus,
  saveOverlayBoundsForMonitor,
  snapOverlayToTopCenter,
  startOverlayDrag,
  setLastOverlayMonitorName,
  showMainWindow
} from '../lib/tauri';
import { loadShortcutConfig } from '../lib/shortcuts';
import { ScrollEngine } from '../lib/scroll-engine';
import { useAppStore } from '../store/use-app-store';
import { useI18n } from '../i18n/use-i18n';
import {
  BASE_SPEED_UNITS,
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER
} from '../constants';
import { ShortcutKeycaps } from './shortcut-keycaps';
import { useVoiceActivity } from '../hooks/useVoiceActivity';

const baseLineHeight = 80;
const overlayLineGapPx = 0;
const fadeDurationMs = 140;
const minFontScale = 0.85;
const maxFontScale = 2.0;
const fontScaleStep = 0.05;
const nonDraggableSelector = 'button, input, select, textarea, a, [role="menuitem"], [data-overlay-no-drag="true"]';
const timerPrefsStorageKey = 'glance-overlay-timer-prefs-v1';

type TimerMode = 'count-up' | 'count-down';

interface TimerPrefs {
  readonly mode: TimerMode;
  readonly targetSeconds: number;
}

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

interface MonitorSnapshot {
  readonly size: { width: number; height: number };
  readonly position: { x: number; y: number };
  readonly name?: string | null;
  readonly scaleFactor?: number;
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

function calculateSnapTarget(
  monitor: MonitorSnapshot,
  windowSize: { width: number; height: number }
): { x: number; y: number } {
  const monitorCenterX = monitor.position.x + (monitor.size.width / 2);
  return {
    x: Math.round(monitorCenterX - (windowSize.width / 2)),
    y: Math.round(monitor.position.y)
  };
}

function monitorIdFromSnapshot(monitor: MonitorSnapshot, unnamedLabel: string): string {
  const label = monitor.name ?? unnamedLabel;
  const scale = typeof monitor.scaleFactor === 'number' && Number.isFinite(monitor.scaleFactor)
    ? monitor.scaleFactor
    : 1;
  return `${label}|${monitor.position.x}:${monitor.position.y}|${monitor.size.width}x${monitor.size.height}|sf:${scale.toFixed(4)}`;
}

function logSnapDebug(message: string, payload?: Record<string, unknown>): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (window.localStorage.getItem('glance-snap-debug') !== '1') {
    return;
  }
  if (payload) {
    console.debug(`[snap-debug] ${message}`, payload);
    return;
  }
  console.debug(`[snap-debug] ${message}`);
}

function readTimerPrefs(): TimerPrefs {
  if (typeof window === 'undefined') {
    return { mode: 'count-up', targetSeconds: 180 };
  }

  const raw = window.localStorage.getItem(timerPrefsStorageKey);
  if (!raw) {
    return { mode: 'count-up', targetSeconds: 180 };
  }

  try {
    const parsed = JSON.parse(raw) as { mode?: string; targetSeconds?: number };
    const mode: TimerMode = parsed.mode === 'count-down' ? 'count-down' : 'count-up';
    const targetSeconds = Number.isFinite(parsed.targetSeconds)
      ? Math.max(5, Math.min(23_940, Math.round(parsed.targetSeconds as number)))
      : 180;
    return { mode, targetSeconds };
  } catch {
    return { mode: 'count-up', targetSeconds: 180 };
  }
}

function writeTimerPrefs(value: TimerPrefs): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(timerPrefsStorageKey, JSON.stringify(value));
}

function formatTimerClock(totalMs: number): string {
  const safeMs = Math.max(0, Math.round(totalMs));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

function SnapToCentreIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="10" cy="10" r="6" />
      <line x1="10" y1="2.5" x2="10" y2="5.4" />
      <line x1="10" y1="14.6" x2="10" y2="17.5" />
      <line x1="2.5" y1="10" x2="5.4" y2="10" />
      <line x1="14.6" y1="10" x2="17.5" y2="10" />
      <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
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

function formatCompactShortcutHint(accelerator: string): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
  const normalized = accelerator.replace(/\s+/g, '');

  if (!normalized) {
    return isMac ? '⌘⇧K' : 'Ctrl+Shift+K';
  }

  if (!isMac) {
    return normalized
      .replace(/CmdOrCtrl/gi, 'Ctrl')
      .replace(/Command/gi, 'Ctrl');
  }

  const parts = normalized.split('+').filter(Boolean);
  const mapped = parts.map((part) => {
    const lower = part.toLowerCase();
    if (lower === 'cmdorctrl' || lower === 'cmd' || lower === 'command' || lower === 'meta') {
      return '⌘';
    }
    if (lower === 'shift') {
      return '⇧';
    }
    if (lower === 'alt' || lower === 'option') {
      return '⌥';
    }
    if (lower === 'ctrl' || lower === 'control') {
      return '⌃';
    }
    return part.toUpperCase();
  });

  return mapped.join('');
}

export function OverlayPrompter() {
  const { t } = useI18n();
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const markdown = useAppStore((state) => state.markdown);
  const playbackState = useAppStore((state) => state.playbackState);
  const scrollPosition = useAppStore((state) => state.scrollPosition);
  const scrollSpeed = useAppStore((state) => state.scrollSpeed);
  const overlayFontScale = useAppStore((state) => state.overlayFontScale);
  const showReadingRuler = useAppStore((state) => state.showReadingRuler);
  const dimLevel = useAppStore((state) => state.dimLevel);
  const isControlsCollapsed = useAppStore((state) => state.isControlsCollapsed);
  const setDimLevel = useAppStore((state) => state.setDimLevel);
  const openSession = useAppStore((state) => state.openSession);
  const togglePlayback = useAppStore((state) => state.togglePlayback);
  const setPlaybackState = useAppStore((state) => state.setPlaybackState);
  const setScrollPosition = useAppStore((state) => state.setScrollPosition);
  const setScrollSpeed = useAppStore((state) => state.setScrollSpeed);
  const setOverlayFontScale = useAppStore((state) => state.setOverlayFontScale);
  const changeScrollSpeedBy = useAppStore((state) => state.changeScrollSpeedBy);
  const speedStep = useAppStore((state) => state.speedStep);
  const persistActiveSession = useAppStore((state) => state.persistActiveSession);
  const showToast = useAppStore((state) => state.showToast);

  // Voice Activity Detection
  const vadPausedByVadRef = useRef(false);
  const { permissionError, vadEnabled, vadState } = useVoiceActivity({
    onSilence: useCallback(() => {
      const currentPlayback = useAppStore.getState().playbackState;
      if (currentPlayback === 'running') {
        vadPausedByVadRef.current = true;
        useAppStore.getState().setPlaybackState('paused');
      }
    }, []),
    onSpeech: useCallback(() => {
      if (vadPausedByVadRef.current) {
        vadPausedByVadRef.current = false;
        useAppStore.getState().setPlaybackState('running');
      }
    }, []),
  });

  // Show permission errors as toasts
  useEffect(() => {
    if (permissionError) {
      showToast(t('overlay.autoPausePermissionError'), 'error');
    }
  }, [permissionError, showToast, t]);

  const voiceStatusAriaLabel = useMemo(() => {
    if (!vadEnabled) {
      return '';
    }

    if (vadState === 'listening-speaking') {
      return t('overlay.autoPauseStatusListening');
    }

    if (vadState === 'listening-silent') {
      return t('overlay.autoPauseStatusSilent');
    }

    return t('overlay.autoPauseStatusStarting');
  }, [t, vadEnabled, vadState]);

  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const sections = parsed.sections;
  const hidePrompterShortcutHint = useMemo(() => {
    const configured = loadShortcutConfig()['hide-overlay'];
    return configured.trim() || 'CmdOrCtrl+Shift+K';
  }, []);
  const compactHidePrompterShortcutHint = useMemo(
    () => formatCompactShortcutHint(hidePrompterShortcutHint),
    [hidePrompterShortcutHint]
  );
  const focusLossHintTemplate = useMemo(
    () => t('overlay.pressToToggle', { key: '__SHORTCUT__' }),
    [t]
  );
  const [focusLossHintPrefix, focusLossHintSuffix] = useMemo(() => {
    const marker = '__SHORTCUT__';
    const split = focusLossHintTemplate.split(marker);
    if (split.length < 2) {
      return [focusLossHintTemplate, ''];
    }
    const [prefix, ...rest] = split;
    return [prefix ?? '', rest.join(marker)];
  }, [focusLossHintTemplate]);

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
  const timerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const timerMenuRef = useRef<HTMLDivElement | null>(null);
  const timerTickStartRef = useRef<number | null>(null);
  const fontPersistTimeoutRef = useRef<number | null>(null);
  const speedIconAnimationTimeoutRef = useRef<number | null>(null);
  const speedBubbleTimeoutRef = useRef<number | null>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const jumpScrollRafRef = useRef<number | null>(null);
  const moveTimeoutRef = useRef<number | null>(null);

  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(true);
  const [isJumpMenuOpen, setIsJumpMenuOpen] = useState(false);
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [isTimerMenuOpen, setIsTimerMenuOpen] = useState(false);
  const [isOverlayFocused, setIsOverlayFocused] = useState(true);

  const isJumpMenuOpenRef = useRef(isJumpMenuOpen);
  const isFontMenuOpenRef = useRef(isFontMenuOpen);
  const isTimerMenuOpenRef = useRef(isTimerMenuOpen);

  useEffect(() => { isJumpMenuOpenRef.current = isJumpMenuOpen; }, [isJumpMenuOpen]);
  useEffect(() => { isFontMenuOpenRef.current = isFontMenuOpen; }, [isFontMenuOpen]);
  useEffect(() => { isTimerMenuOpenRef.current = isTimerMenuOpen; }, [isTimerMenuOpen]);
  const [windowPosition, setWindowPosition] = useState<{ x: number; y: number } | null>(null);
  const [snapTarget, setSnapTarget] = useState<{ x: number; y: number } | null>(null);
  const [isSnapping, setIsSnapping] = useState(false);
  const [shouldRenderSnap, setShouldRenderSnap] = useState(false);
  const [isSnapExiting, setIsSnapExiting] = useState(false);
  const snapTargetRef = useRef<{ x: number; y: number } | null>(null);
  const isSnappingRef = useRef(false);

  const [animatedSpeedIcon, setAnimatedSpeedIcon] = useState<'slow' | 'fast' | null>(null);
  const [isSpeedBubbleVisible, setIsSpeedBubbleVisible] = useState(false);
  const [timerMode, setTimerMode] = useState<TimerMode>(() => readTimerPrefs().mode);
  const [timerTargetSeconds, setTimerTargetSeconds] = useState<number>(() => readTimerPrefs().targetSeconds);
  const [timerElapsedMs, setTimerElapsedMs] = useState<number>(0);
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
    // We keep it paused on mount (reopen), but we DO NOT reset scroll position
    // to allow resuming exactly where the user left off.
    setPlaybackState('paused');
    setTimerElapsedMs(0);
    timerTickStartRef.current = null;
  }, [setPlaybackState]);

  const scaledLineHeight = Math.max(60, Math.round(baseLineHeight * overlayFontScale));
  const lineStride = scaledLineHeight + overlayLineGapPx;
  const focusLaneRatio = 0.14;
  const lanePadding = useMemo(
    () => {
      const preferredOffset = contentMetrics.height * focusLaneRatio;
      const clampedOffset = Math.max(52, Math.min(contentMetrics.height * 0.24, preferredOffset));
      return Math.max(0, clampedOffset - (scaledLineHeight * 0.5));
    },
    [contentMetrics.height, focusLaneRatio, scaledLineHeight]
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
    context.font = `400 ${fontSize}px "Lora", serif`;
    return context.measureText(text).width;
  }, [overlayFontScale]);

  const lines = useMemo(() => {
    const maxLineWidthPx = Math.max(280, contentMetrics.width - 120);
    return markdownToDisplayLines(markdown, {
      maxLineWidthPx,
      measureText
    });
  }, [contentMetrics.width, markdown, measureText]);

  const firstRenderableLine = useMemo(
    () => lines.find((line) => line.kind !== 'empty') ?? null,
    [lines]
  );

  const firstLineLaneNudge = firstRenderableLine?.kind === 'heading'
    ? -18
    : firstRenderableLine?.kind === 'bullet'
      ? -10
      : 0;

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

    // Use DOM measurements for precision if available
    const effectivePadding = Math.max(0, lanePadding + firstLineLaneNudge);
    const nodes = lineRefs.current;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (node && node.offsetTop > scrollPosition + effectivePadding + 2) {
        return Math.max(0, i - 1);
      }
    }

    // Fallback to linePositions estimate
    const { positions } = linePositions;
    for (let i = 0; i < positions.length; i += 1) {
      if (positions[i] > scrollPosition) {
        return Math.max(0, i - 1);
      }
    }

    return Math.max(0, lines.length - 1);
  }, [firstLineLaneNudge, lanePadding, linePositions, lines.length, scrollPosition]);

  const currentSectionIndex = useMemo(() => {
    if (sections.length === 0) {
      return 0;
    }

    // Prefer DOM-based section detection to stay in sync with Jump logic.
    // We walk backwards from the end to find the last section that has started.
    const effectivePadding = Math.max(0, lanePadding + firstLineLaneNudge);
    const nodes = lineRefs.current;

    for (let i = sectionStartLineIndexes.length - 1; i >= 0; i -= 1) {
      const lineIndex = sectionStartLineIndexes[i];
      const node = nodes[lineIndex];
      // A small 5px buffer helps prevent flickering near the ruler line.
      if (node && node.offsetTop <= scrollPosition + effectivePadding + 5) {
        return i;
      }
    }

    // Fallback to line-index based detection
    const resolved = currentSectionFromLine(lines, anchorLineIndex);
    return Math.max(0, Math.min(sections.length - 1, resolved));
  }, [anchorLineIndex, firstLineLaneNudge, lanePadding, lines, scrollPosition, sectionStartLineIndexes, sections.length]);

  const currentSection = sections[currentSectionIndex] ?? null;
  const nextSection = sections[currentSectionIndex + 1] ?? null;

  const normalizedSpeed = scrollSpeed;
  const currentFontSize = Math.round(28 * overlayFontScale);
  const speedProgress = ((scrollSpeed - MIN_SPEED_MULTIPLIER) / (MAX_SPEED_MULTIPLIER - MIN_SPEED_MULTIPLIER)) * 100;
  const timerTargetMs = timerTargetSeconds * 1000;
  const timerRemainingMs = Math.max(0, timerTargetMs - timerElapsedMs);
  const timerDisplayMs = timerMode === 'count-down' ? timerRemainingMs : timerElapsedMs;
  const timerProgress = timerMode === 'count-down'
    ? (timerTargetMs > 0 ? Math.max(0, Math.min(1, timerElapsedMs / timerTargetMs)) : 0)
    : ((timerElapsedMs % 60_000) / 60_000);
  const timerProgressPercent = Math.max(0, Math.min(100, timerProgress * 100));
  const timerIsExpired = timerMode === 'count-down' && timerTargetMs > 0 && timerRemainingMs <= 0;
  const timerTargetMinutes = Math.floor(timerTargetSeconds / 60);
  const timerTargetRemainderSeconds = timerTargetSeconds % 60;
  const showSectionTitlesInRail = overlaySize.width <= 1200;
  const isCompactTopBar = overlaySize.width <= 1200;

  const isSnapButtonVisible = useMemo(() => {
    if (!windowPosition || isSnapping) return false;
    if (!snapTarget) return true;
    const dx = Math.abs(windowPosition.x - snapTarget.x);
    const dy = Math.abs(windowPosition.y - snapTarget.y);
    return dx > 2 || dy > 2;
  }, [windowPosition, snapTarget, isSnapping]);

  useEffect(() => {
    snapTargetRef.current = snapTarget;
  }, [snapTarget]);

  useEffect(() => {
    isSnappingRef.current = isSnapping;
  }, [isSnapping]);

  const refreshWindowPlacement = useCallback(async () => {
    if (!isTauriRuntime()) {
      return;
    }

    const appWindow = getCurrentWindow();
    const monitorAware = appWindow as unknown as {
      currentMonitor?: () => Promise<MonitorSnapshot | null>;
    };

    try {
      const [position, windowSize] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize()
      ]);

      setWindowPosition((previous) => {
        if (previous && previous.x === position.x && previous.y === position.y) {
          return previous;
        }
        return { x: position.x, y: position.y };
      });

      let nextTarget: { x: number; y: number } | null = null;
      if (typeof monitorAware.currentMonitor === 'function') {
        const monitor = await monitorAware.currentMonitor().catch(() => null);
        if (monitor) {
          nextTarget = calculateSnapTarget(monitor, windowSize);
          logSnapDebug('refresh target computed', {
            windowPosition: position,
            windowSize,
            monitorPosition: monitor.position,
            monitorSize: monitor.size,
            target: nextTarget
          });
        }
      }

      if (nextTarget) {
        snapTargetRef.current = nextTarget;
        setSnapTarget((previous) => {
          if (previous && previous.x === nextTarget.x && previous.y === nextTarget.y) {
            return previous;
          }
          return nextTarget;
        });
      }
    } catch {
      // Ignore transient window/monitor lookup failures.
    }
  }, []);

  useEffect(() => {
    if (isSnapButtonVisible) {
      setShouldRenderSnap(true);
      setIsSnapExiting(false);
    } else if (shouldRenderSnap) {
      setIsSnapExiting(true);
      const timer = window.setTimeout(() => {
        setShouldRenderSnap(false);
        setIsSnapExiting(false);
      }, 100);
      return () => window.clearTimeout(timer);
    }
  }, [isSnapButtonVisible, shouldRenderSnap]);

  const updateWindowConstraints = useCallback(async () => {
    if (!isTauriRuntime()) return;

    const appWindow = getCurrentWindow();
    const minHeight = isControlsCollapsed ? 200 : 400;

    try {
      await appWindow.setMinSize(new LogicalSize(500, minHeight));

      if (!isControlsCollapsed) {
        const [currentSize, scaleFactor] = await Promise.all([
          appWindow.innerSize(),
          appWindow.scaleFactor()
        ]);

        const logicalHeight = currentSize.height / scaleFactor;
        // If controls are being expanded but window is too short, expand it to 400px
        if (logicalHeight < 400) {
          const logicalWidth = currentSize.width / scaleFactor;
          await appWindow.setSize(new LogicalSize(logicalWidth, 400));
        }
      }
    } catch (error) {
      console.warn('Failed to update window constraints:', error);
    }
  }, [isControlsCollapsed]);

  useEffect(() => {
    void updateWindowConstraints();
  }, [updateWindowConstraints]);

  const handleSnapToCentre = useCallback(async () => {
    if (isSnapping) return;

    setIsSnapping(true);
    try {
      await snapOverlayToTopCenter();
      await updateWindowConstraints();
      await refreshWindowPlacement();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('overlay.snapError');
      showToast(message, 'error');
    } finally {
      setIsSnapping(false);
      void updateWindowConstraints();
      void refreshWindowPlacement();
    }
  }, [isSnapping, refreshWindowPlacement, showToast]);

  const toggleControls = useCallback(async () => {
    const currentState = useAppStore.getState();
    const nextCollapsed = !currentState.isControlsCollapsed;

    if (!nextCollapsed && isTauriRuntime()) {
      const appWindow = getCurrentWindow();
      try {
        const [currentSize, scaleFactor] = await Promise.all([
          appWindow.innerSize(),
          appWindow.scaleFactor()
        ]);

        const logicalHeight = currentSize.height / scaleFactor;

        if (logicalHeight < 400) {
          const logicalWidth = currentSize.width / scaleFactor;
          // Proactively grow window before expanding controls
          await appWindow.setSize(new LogicalSize(logicalWidth, 400));
        }
      } catch (error) {
        console.warn('Failed proactive expansion:', error);
      }
    }

    currentState.setIsControlsCollapsed(nextCollapsed);
  }, []);


  const renderTopActions = () => (
    <div className="overlay-top-actions">
      <button
        ref={fontTriggerRef}
        type="button"
        className={`overlay-top-action ${isFontMenuOpen ? 'is-active' : ''}`}
        aria-label={t('overlay.fontSizeSettings')}
        title={t('overlay.fontSize')}
        aria-haspopup="dialog"
        aria-expanded={isFontMenuOpen}
        aria-pressed={isFontMenuOpen}
        onClick={() => {
          setIsJumpMenuOpen(false);
          setIsTimerMenuOpen(false);
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
          aria-label={t('overlay.jumpToSection')}
          title={t('overlay.jump')}
          aria-haspopup="menu"
          aria-expanded={isJumpMenuOpen}
          aria-pressed={isJumpMenuOpen}
          onClick={() => {
            setIsFontMenuOpen(false);
            setIsTimerMenuOpen(false);
            setIsJumpMenuOpen((previous) => !previous);
          }}
        >
          <JumpSectionsIcon open={isJumpMenuOpen} />
        </button>
      ) : null}
      <div className={`overlay-snap-wrapper ${shouldRenderSnap ? 'is-visible' : ''} ${isSnapExiting ? 'is-exiting' : ''}`}>
        <button
          type="button"
          className="overlay-top-action overlay-snap-button"
          onClick={handleSnapToCentre}
          aria-label={t('overlay.snapToCentre')}
          title={t('overlay.snapToCentre')}
          tabIndex={shouldRenderSnap ? 0 : -1}
        >
          <SnapToCentreIcon />
        </button>
      </div>
      <button
        type="button"
        className={`overlay-top-action overlay-collapse-toggle ${isControlsCollapsed ? 'is-collapsed' : ''}`}
        onClick={toggleControls}
        title={t('overlay.toggleControls')}
        aria-label={t('overlay.toggleControls')}
        aria-expanded={!isControlsCollapsed}
        aria-controls="overlay-controls-area"
      >
        <ChevronIcon />
      </button>
      <button
        type="button"
        className="overlay-close-button"
        onClick={requestCloseOverlay}
        aria-label={t('overlay.close')}
        title={t('overlay.close')}
      >
        <CloseIcon />
      </button>
    </div>
  );

  const renderSectionRail = () => (
    <>
      <span className="overlay-section-counter">
        {sections.length > 0 ? t('overlay.sectionCounter', { current: currentSectionIndex + 1, total: sections.length }) : t('overlay.sectionCounter', { current: 0, total: 0 })}
      </span>

      <div className="overlay-section-rail" aria-label={t('overlay.currentSection')}>
        <span className="overlay-rail-pill overlay-rail-current" title={currentSection?.title ?? t('overlay.currentSection')}>
          {showSectionTitlesInRail
            ? (currentSection?.title ?? t('overlay.waitingForHeadings'))
            : (currentSectionIndex + 1)}
        </span>

        {nextSection ? (
          <span className="overlay-rail-pill overlay-rail-next" title={nextSection.title}>
            {showSectionTitlesInRail ? t('overlay.nextSection', { title: nextSection.title }) : (currentSectionIndex + 2)}
          </span>
        ) : null}
      </div>
    </>
  );

  const renderTimerControls = () => (
    <div className="overlay-timer-row">
      <div className="overlay-timer-cluster">
        <button
          ref={timerTriggerRef}
          type="button"
          className={`overlay-timer-chip ${isTimerMenuOpen ? 'is-active' : ''} ${timerIsExpired ? 'is-expired' : ''}`}
          aria-label={t('overlay.timerDisplay', { mode: timerMode === 'count-down' ? t('overlay.remaining') : t('overlay.elapsed'), time: formatTimerClock(timerDisplayMs) })}
          aria-haspopup="dialog"
          aria-expanded={isTimerMenuOpen}
          onClick={() => {
            setIsJumpMenuOpen(false);
            setIsFontMenuOpen(false);
            setIsTimerMenuOpen((previous) => !previous);
          }}
          style={{
            '--overlay-timer-progress': `${timerProgressPercent.toFixed(2)}%`
          } as CSSProperties}
        >
          <span className="overlay-timer-label">
            {timerMode === 'count-down' ? t('overlay.remaining') : t('overlay.elapsed')}
          </span>
          <span className="overlay-timer-value">{formatTimerClock(timerDisplayMs)}</span>
        </button>
        {isTimerMenuOpen ? (
          <div ref={timerMenuRef} className="overlay-popover overlay-timer-popover" role="dialog" aria-label={t('overlay.timerControlsAria')}>
            <div className="overlay-timer-mode-group" role="radiogroup" aria-label={t('overlay.timerModeAria')}>
              <button
                type="button"
                role="radio"
                aria-checked={timerMode === 'count-up'}
                className={`overlay-timer-mode-option ${timerMode === 'count-up' ? 'is-selected' : ''}`}
                onClick={() => setTimerMode('count-up')}
              >
                {t('overlay.countUp')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={timerMode === 'count-down'}
                className={`overlay-timer-mode-option ${timerMode === 'count-down' ? 'is-selected' : ''}`}
                onClick={() => setTimerMode('count-down')}
              >
                {t('overlay.countDown')}
              </button>
            </div>

            {timerMode === 'count-down' ? (
              <div className="overlay-timer-target">
                <label>
                  <span>{t('overlay.minutes')}</span>
                  <input
                    type="number"
                    min={0}
                    max={399}
                    value={timerTargetMinutes}
                    onChange={(event) => {
                      const minutes = Math.max(0, Math.min(399, Number(event.target.value) || 0));
                      const next = (minutes * 60) + timerTargetRemainderSeconds;
                      setTimerTargetSeconds(Math.max(5, Math.min(23_940, next)));
                    }}
                  />
                </label>
                <label>
                  <span>{t('overlay.seconds')}</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={timerTargetRemainderSeconds}
                    onChange={(event) => {
                      const seconds = Math.max(0, Math.min(59, Number(event.target.value) || 0));
                      const next = (timerTargetMinutes * 60) + seconds;
                      setTimerTargetSeconds(Math.max(5, Math.min(23_940, next)));
                    }}
                  />
                </label>
              </div>
            ) : null}

            <div className="overlay-timer-footer">
              <button
                type="button"
                className="overlay-popover-link"
                onClick={resetPresentationTimer}
              >
                {t('overlay.resetTimer')}
              </button>
              <button
                type="button"
                className="overlay-popover-link"
                onClick={() => closeTimerMenu(true)}
              >
                {t('overlay.done')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderVoiceStatus = (className = '') => {
    if (!vadEnabled) {
      return null;
    }

    return (
      <div
        className={`overlay-voice-status overlay-voice-status--${vadState} ${className}`.trim()}
        role="status"
        aria-live="polite"
        aria-label={voiceStatusAriaLabel}
        title={voiceStatusAriaLabel}
      >
        <span className="overlay-voice-status-dot" aria-hidden="true" />
        <span className="overlay-voice-status-label">{t('overlay.autoPauseStatusLabel')}</span>
      </div>
    );
  };

  const renderFooterStatus = (className = '') => (
    <div className={`overlay-footer-status-center ${className}`.trim()}>
      {renderTimerControls()}
      {renderVoiceStatus()}
    </div>
  );

  const renderPlaybackControls = (className = '', showStatus = true) => (
    <footer className={`overlay-controls ${className}`.trim()}>
      <div className="overlay-controls-row">
        <div className="overlay-control-hint" aria-hidden="true">
          <ShortcutKeycaps shortcuts="R" keycapClassName="overlay-control-keycap" />
        </div>

        <button
          type="button"
          className="overlay-icon-button overlay-secondary-button overlay-skip-back"
          aria-label={t('overlay.restart')}
          onClick={(e) => {
            setPlaybackState('paused');
            setScrollPosition(0);
            resetPresentationTimer();
            e.currentTarget.blur();
            overlayRootRef.current?.focus({ preventScroll: true });
          }}
        >
          <RestartIcon />
        </button>

        <div className="overlay-controls-divider" aria-hidden="true" />

        <div className="overlay-primary-button-wrap">
          <button
            type="button"
            className={`control-button overlay-icon-button overlay-primary-button overlay-play-toggle ${playbackState === 'running' ? 'is-running' : ''}`}
            onClick={(e) => {
              togglePlayback();
              e.currentTarget.blur();
              overlayRootRef.current?.focus({ preventScroll: true });
            }}
            aria-label={playbackState === 'running' ? t('overlay.pause') : t('overlay.play')}
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

        <div className="overlay-control-hint" aria-hidden="true">
          <ShortcutKeycaps shortcuts="Space" keycapClassName="overlay-control-keycap is-capsule" />
        </div>
      </div>
      {showStatus ? renderFooterStatus() : null}
    </footer>
  );

  const renderSpeedControls = (className: string, showFooterStatus = false) => (
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
            min={MIN_SPEED_MULTIPLIER}
            max={MAX_SPEED_MULTIPLIER}
            step={speedStep}
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
              triggerSpeedIconAnimation(nextValue <= 1.0 ? 'slow' : 'fast');
            }}
            aria-label={t('overlay.scrollSpeedAria')}
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
      {showFooterStatus ? renderFooterStatus('overlay-footer-status-center-desktop') : null}
    </footer>
  );

  const overlayVars = useMemo(() => ({
    '--overlay-font-scale': overlayFontScale.toString(),
    '--overlay-line-height': `${scaledLineHeight}px`,
    '--overlay-line-gap': `${overlayLineGapPx}px`,
    '--overlay-lane-padding': `${Math.max(0, Math.round(lanePadding + firstLineLaneNudge))}px`,
    '--overlay-controls-opacity': (dimLevel / 100).toString()
  } as CSSProperties), [dimLevel, firstLineLaneNudge, lanePadding, overlayFontScale, scaledLineHeight]);

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

  const closeTimerMenu = useCallback((restoreFocus: boolean) => {
    setIsTimerMenuOpen(false);
    if (restoreFocus) {
      window.setTimeout(() => {
        timerTriggerRef.current?.focus();
      }, 0);
    }
  }, []);

  const resetPresentationTimer = useCallback(() => {
    setTimerElapsedMs(0);
    timerTickStartRef.current = playbackState === 'running' ? performance.now() : null;
  }, [playbackState]);

  const jumpToSection = useCallback((index: number) => {
    if (index < 0 || index >= sectionStartLineIndexes.length) {
      return;
    }

    const targetLineIndex = sectionStartLineIndexes[index];
    if (typeof targetLineIndex !== 'number' || !Number.isFinite(targetLineIndex)) {
      return;
    }

    // Prefer DOM measurement over computed linePositions because the real CSS
    // typography (Lora 28px × 1.70 line-height, 32px paragraph margins, 64px
    // heading top margins) does not match the estimated scaledLineHeight values
    // used by linePositions.
    const node = lineRefs.current[targetLineIndex];
    const effectivePadding = Math.max(0, lanePadding + firstLineLaneNudge);
    const targetY = node
      ? Math.max(0, node.offsetTop - effectivePadding)
      : (linePositions.positions[targetLineIndex] ?? 0);

    // Cancel any in-progress jump animation.
    if (jumpScrollRafRef.current !== null) {
      cancelAnimationFrame(jumpScrollRafRef.current);
      jumpScrollRafRef.current = null;
    }

    const fromY = useAppStore.getState().scrollPosition;
    const distance = targetY - fromY;
    const linesEl = contentRef.current?.querySelector<HTMLElement>('.overlay-lines');

    // Skip animation for tiny distances (already close).
    if (Math.abs(distance) < 2) {
      setScrollPosition(targetY);
      return;
    }

    const DURATION_MS = 540;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / DURATION_MS, 1);

      // Scroll: ease-out cubic — fast start, gentle landing.
      const scrollEased = 1 - Math.pow(1 - t, 3);
      setScrollPosition(fromY + distance * scrollEased);

      // Opacity: sine arc (1 → 0 → 1) — dissolves at the midpoint of travel,
      // so the content fades as it moves and sharpens as it arrives.
      if (linesEl) {
        const opacity = 1 - Math.sin(Math.PI * t);
        linesEl.style.opacity = opacity.toFixed(3);
      }

      if (t < 1) {
        jumpScrollRafRef.current = requestAnimationFrame(tick);
      } else {
        // Ensure clean final state.
        if (linesEl) {
          linesEl.style.opacity = '';
        }
        jumpScrollRafRef.current = null;
      }
    };

    jumpScrollRafRef.current = requestAnimationFrame(tick);
  }, [firstLineLaneNudge, lanePadding, linePositions.positions, sectionStartLineIndexes, setScrollPosition]);

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

  const changeFontScaleBy = useCallback((delta: number) => {
    const currentScale = useAppStore.getState().overlayFontScale;
    commitFontScale(currentScale + (delta * fontScaleStep));
  }, [commitFontScale]);

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
      if (jumpScrollRafRef.current !== null) {
        cancelAnimationFrame(jumpScrollRafRef.current);
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
    writeTimerPrefs({
      mode: timerMode,
      targetSeconds: timerTargetSeconds
    });
  }, [timerMode, timerTargetSeconds]);

  useEffect(() => {
    if (playbackState !== 'running') {
      timerTickStartRef.current = null;
      return;
    }

    timerTickStartRef.current = performance.now();
    const intervalId = window.setInterval(() => {
      const startAt = timerTickStartRef.current;
      if (startAt === null) {
        timerTickStartRef.current = performance.now();
        return;
      }

      const now = performance.now();
      const delta = now - startAt;
      timerTickStartRef.current = now;
      setTimerElapsedMs((previous) => previous + delta);
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [playbackState]);

  useEffect(() => {
    const maxPosition = Math.max(0, linePositions.totalHeight - lineStride);

    engineRef.current = new ScrollEngine({
      getSpeed: () => speedRef.current * BASE_SPEED_UNITS,
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

  const shortcutHandlersRef = useRef({
    changeScrollSpeedBy,
    changeFontScaleBy,
    closeFontMenu,
    closeJumpMenu,
    closeTimerMenu,
    commitFontScale,
    handleSnapToCentre,
    jumpToSection,
    requestCloseOverlay,
    resetPresentationTimer,
    revealSpeedBubble,
    setPlaybackState,
    setScrollPosition,
    toggleControls,
    togglePlayback,
    triggerSpeedIconAnimation
  });

  useEffect(() => {
    shortcutHandlersRef.current = {
      changeScrollSpeedBy,
      changeFontScaleBy,
      closeFontMenu,
      closeJumpMenu,
      closeTimerMenu,
      commitFontScale,
      handleSnapToCentre,
      jumpToSection,
      requestCloseOverlay,
      resetPresentationTimer,
      revealSpeedBubble,
      setPlaybackState,
      setScrollPosition,
      toggleControls,
      togglePlayback,
      triggerSpeedIconAnimation
    };
  }, [
    changeScrollSpeedBy,
    changeFontScaleBy,
    closeFontMenu,
    closeJumpMenu,
    closeTimerMenu,
    commitFontScale,
    handleSnapToCentre,
    jumpToSection,
    requestCloseOverlay,
    resetPresentationTimer,
    revealSpeedBubble,
    setPlaybackState,
    setScrollPosition,
    toggleControls,
    togglePlayback,
    triggerSpeedIconAnimation
  ]);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void listenForShortcutEvents((payload) => {
      const handlers = shortcutHandlersRef.current;

      if (payload.action === 'toggle-play') {
        handlers.togglePlayback();
        return;
      }

      if (payload.action === 'snap-to-center') {
        void handlers.handleSnapToCentre();
        return;
      }

      if (payload.action === 'toggle-controls') {
        void handlers.toggleControls();
        return;
      }

      if (payload.action === 'jump-section' && typeof payload.index === 'number') {
        handlers.jumpToSection(payload.index);
        return;
      }

      if (payload.action === 'speed-change' && typeof payload.delta === 'number') {
        handlers.changeScrollSpeedBy(payload.delta);
        handlers.revealSpeedBubble();
        if (payload.delta < 0) {
          handlers.triggerSpeedIconAnimation('slow');
        } else if (payload.delta > 0) {
          handlers.triggerSpeedIconAnimation('fast');
        }
        return;
      }

      if (payload.action === 'start-over') {
        handlers.setPlaybackState('paused');
        handlers.setScrollPosition(0);
        handlers.resetPresentationTimer();
        return;
      }

      if (payload.action === 'font-scale-change' && typeof payload.delta === 'number') {
        handlers.changeFontScaleBy(payload.delta);
        return;
      }

      if (payload.action === 'font-scale-reset') {
        handlers.commitFontScale(1);
        return;
      }

      if (payload.action === 'escape-pressed') {
        if (isJumpMenuOpenRef.current) {
          handlers.closeJumpMenu(true);
          return;
        }
        if (isFontMenuOpenRef.current) {
          handlers.closeFontMenu(true);
          return;
        }
        if (isTimerMenuOpenRef.current) {
          handlers.closeTimerMenu(true);
          return;
        }
        handlers.requestCloseOverlay();
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
  }, []);

  useEffect(() => {
    const syncActiveSession = () => {
      const preferredSessionId = getLastActiveSessionId();
      if (!preferredSessionId || preferredSessionId === activeSessionId) {
        return;
      }

      void openSession(preferredSessionId, true);
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

      setPlaybackState('paused');
    }).then((fn) => {
      unlistenFocus = fn;
    });

    return () => {
      unlistenFocus?.();
    };
  }, [activeSessionId, openSession, setPlaybackState]);

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
        if (isTimerMenuOpen) {
          closeTimerMenu(true);
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
          resetPresentationTimer();
          return;
        }
      }

      if (!withModifier) {
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === 'l') {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        void handleSnapToCentre();
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
        changeFontScaleBy(1);
        return;
      }

      if (event.key === '-' || event.key === '_') {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        changeFontScaleBy(-1);
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

      if (event.key === 'ArrowUp' && !event.shiftKey) {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        changeScrollSpeedBy(1);
        revealSpeedBubble();
        triggerSpeedIconAnimation('fast');
        return;
      }

      if (event.key === 'ArrowUp' && event.shiftKey) {
        event.preventDefault();
        setDimLevel(Math.min(100, useAppStore.getState().dimLevel + 5));
        return;
      }

      if (event.key === 'ArrowDown' && !event.shiftKey) {
        if (tauriRuntime) {
          return;
        }
        event.preventDefault();
        changeScrollSpeedBy(-1);
        revealSpeedBubble();
        triggerSpeedIconAnimation('slow');
        return;
      }

      if (event.key === 'ArrowDown' && event.shiftKey) {
        event.preventDefault();
        setDimLevel(Math.max(0, useAppStore.getState().dimLevel - 5));
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
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [
    changeScrollSpeedBy,
    closeFontMenu,
    closeJumpMenu,
    closeTimerMenu,
    changeFontScaleBy,
    commitFontScale,
    isFontMenuOpen,
    isJumpMenuOpen,
    isTimerMenuOpen,
    requestCloseOverlay,
    resetPresentationTimer,
    setPlaybackState,
    setScrollPosition,
    togglePlayback,
    handleSnapToCentre
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

      if (
        isTimerMenuOpen
        && timerMenuRef.current
        && !timerMenuRef.current.contains(target)
        && !timerTriggerRef.current?.contains(target)
      ) {
        closeTimerMenu(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [closeFontMenu, closeJumpMenu, closeTimerMenu, isFontMenuOpen, isJumpMenuOpen, isTimerMenuOpen]);

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
      fontMenuRef.current?.querySelector<HTMLButtonElement>('[data-font-focus="true"]')?.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isFontMenuOpen]);

  const [compactFontPopoverStyle, setCompactFontPopoverStyle] = useState<CSSProperties | null>(null);

  const updateCompactFontPopoverStyle = useCallback(() => {
    if (typeof window === 'undefined' || !isCompactTopBar || !isFontMenuOpen) {
      setCompactFontPopoverStyle(null);
      return;
    }

    const trigger = fontTriggerRef.current;
    if (!trigger) {
      setCompactFontPopoverStyle(null);
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const minWidth = 220;
    const width = Math.min(280, Math.max(minWidth, window.innerWidth - 32));
    const popoverHeight = Math.round(fontMenuRef.current?.getBoundingClientRect().height ?? 170);
    const sideGap = 10;
    const idealLeft = rect.left - width - sideGap;
    const idealTop = (rect.top + (rect.height / 2)) - (popoverHeight / 2);
    const left = Math.max(16, Math.min(Math.round(idealLeft), window.innerWidth - Math.round(width) - 16));
    const top = Math.max(8, Math.min(Math.round(idealTop), window.innerHeight - popoverHeight - 8));

    setCompactFontPopoverStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${Math.round(width)}px`,
      maxWidth: 'calc(100vw - 32px)',
      zIndex: 520
    });
  }, [isCompactTopBar, isFontMenuOpen]);

  useLayoutEffect(() => {
    updateCompactFontPopoverStyle();
  }, [updateCompactFontPopoverStyle, overlaySize.height, overlaySize.width]);

  useLayoutEffect(() => {
    if (!isCompactTopBar || !isFontMenuOpen) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      updateCompactFontPopoverStyle();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isCompactTopBar, isFontMenuOpen, updateCompactFontPopoverStyle]);

  useEffect(() => {
    if (!isCompactTopBar || !isFontMenuOpen) {
      return;
    }

    const onResize = () => {
      updateCompactFontPopoverStyle();
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [isCompactTopBar, isFontMenuOpen, updateCompactFontPopoverStyle]);

  useEffect(() => {
    if (!isTimerMenuOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      timerMenuRef.current?.querySelector<HTMLButtonElement>('[role="radio"]')?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isTimerMenuOpen]);

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
    void refreshWindowPlacement();
  }, [overlaySize, refreshWindowPlacement]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let isDisposed = false;
    let isTickRunning = false;
    const tick = () => {
      if (isDisposed || isTickRunning) {
        return;
      }
      isTickRunning = true;
      void refreshWindowPlacement().finally(() => {
        isTickRunning = false;
      });
    };

    tick();
    const intervalId = window.setInterval(tick, 350);
    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [refreshWindowPlacement]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const appWindow = getCurrentWindow();
    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;
    const getRuntimeMonitorName = async (): Promise<string | null> => {
      const monitorAwareWindow = appWindow as unknown as {
        currentMonitor?: () => Promise<MonitorSnapshot | null>;
      };

      if (typeof monitorAwareWindow.currentMonitor !== 'function') {
        return null;
      }

      try {
        const monitor = await monitorAwareWindow.currentMonitor();
        if (!monitor) {
          return null;
        }
        return monitorIdFromSnapshot(monitor, t('overlay.unnamedMonitor'));
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

    void refreshWindowPlacement();

    void appWindow.onMoved(({ payload: pos }) => {
      // Skip position updates that originate from our own snap move — the
      // handleSnapToCentre handler sets the final position explicitly once
      // setPosition() has settled. Updating here would create a race where
      // stale state triggers a spurious re-appearance of the snap button.
      if (!isSnappingRef.current) {
        logSnapDebug('window moved', { position: pos });
        setWindowPosition({ x: pos.x, y: pos.y });
        persistBounds();
        if (moveTimeoutRef.current !== null) {
          window.clearTimeout(moveTimeoutRef.current);
        }
        moveTimeoutRef.current = window.setTimeout(() => {
          void refreshWindowPlacement();
          void recoverOverlayFocus().catch(() => {
            getCurrentWindow().setFocus().catch(() => { });
          });
          overlayRootRef.current?.focus({ preventScroll: true });
        }, 80);
      }
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
        void refreshWindowPlacement();
      }, 800);
    }).then((fn) => {
      unlistenResized = fn;
    });

    return () => {
      unlistenMoved?.();
      unlistenResized?.();
    };
  }, [refreshWindowPlacement]);

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
      window.setTimeout(() => {
        void refreshWindowPlacement();
      }, 180);
    });
  }, [queueFocusRecovery, refreshWindowPlacement]);

  const handleDragMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button !== 0 || isJumpMenuOpen || isFontMenuOpen || isTimerMenuOpen) {
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
  }, [isFontMenuOpen, isJumpMenuOpen, isTimerMenuOpen, startWindowDrag]);

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
    <>
      <main
        ref={overlayRootRef}
        className={`overlay-root overlay-sidebar-collapsed ${isOpening ? 'overlay-opening' : ''} ${isClosing ? 'overlay-closing' : ''} ${isOverlayFocused ? '' : 'overlay-unfocused'}`}
        role="application"
        aria-label={t('overlay.mainAria')}
        tabIndex={-1}
        style={overlayVars}
        onMouseDownCapture={handleRootMouseDownCapture}
        onPointerDownCapture={() => {
          overlayRootRef.current?.focus({ preventScroll: true });
        }}
        onMouseDown={handleDragMouseDown}
      >
        <div className={`overlay-debug-size ${isResizing ? 'is-visible' : ''}`} aria-live="polite" aria-label={t('overlay.sizeAria')}>
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
                <div className="overlay-section-rail" aria-label={t('overlay.currentSection')}>
                  <span className="overlay-rail-pill overlay-rail-current" title={currentSection?.title ?? t('overlay.currentSection')}>
                    {showSectionTitlesInRail
                      ? (currentSection?.title ?? t('overlay.waitingForHeadings'))
                      : (currentSectionIndex + 1)}
                  </span>

                  {nextSection ? (
                    <span className="overlay-rail-pill overlay-rail-next" title={nextSection.title}>
                      {showSectionTitlesInRail ? t('overlay.nextSection', { title: nextSection.title }) : (currentSectionIndex + 2)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {isFontMenuOpen ? (
            <div ref={fontMenuRef} className="overlay-popover overlay-font-popover" role="dialog" aria-label={t('overlay.fontSizeSettings')}>
              <div className="overlay-popover-header">TEXT & DISPLAY</div>

              <div className="overlay-popover-row">
                <span className="overlay-popover-label">Font Size</span>
                <div className="overlay-font-stepper" role="group" aria-label={t('overlay.fontSize')}>
                  <button
                    type="button"
                    className="overlay-font-stepper-button"
                    data-font-focus="true"
                    onClick={() => changeFontScaleBy(-1)}
                    aria-label={t('overlay.decreaseFontSize')}
                  >
                    −
                  </button>
                  <span className="overlay-font-stepper-divider" aria-hidden="true" />
                  <span className="overlay-font-stepper-value" aria-live="polite">{currentFontSize}</span>
                  <span className="overlay-font-stepper-divider" aria-hidden="true" />
                  <button
                    type="button"
                    className="overlay-font-stepper-button"
                    onClick={() => changeFontScaleBy(1)}
                    aria-label={t('overlay.increaseFontSize')}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="overlay-popover-divider" />

              <div className="overlay-popover-column">
                <div className="overlay-popover-row">
                  <span className="overlay-popover-label">Opacity</span>
                  <span className="overlay-popover-value">{dimLevel}%</span>
                </div>
                <div className="overlay-slider-row">
                  <input
                    className="overlay-popover-slider overlay-black-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={dimLevel}
                    onChange={(e) => setDimLevel(Number(e.target.value))}
                    onPointerUp={(e) => { e.currentTarget.blur(); overlayRootRef.current?.focus({ preventScroll: true }); }}
                    aria-label="Opacity"
                  />
                </div>
                <div className="overlay-popover-row overlay-slider-labels">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>

              <div className="overlay-popover-divider popover-bottom-divider" />

              <div className="overlay-popover-footer">
                <button
                  type="button"
                  className="overlay-popover-link overlay-font-reset"
                  onClick={() => {
                    commitFontScale(1);
                    setDimLevel(100);
                  }}
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
          ) : null}

          {isJumpMenuOpen ? (
            <div
              ref={jumpMenuRef}
              className="overlay-popover overlay-jump-popover"
              role="menu"
              aria-label={t('overlay.jumpToSection')}
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
                    <ShortcutKeycaps shortcuts={`CmdOrCtrl+${index + 1}`} keycapClassName="overlay-jump-keycap" />
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
            {lines.map((line, index) => {
              if (line.kind === 'empty') {
                return null;
              }

              if (line.kind === 'heading') {
                return (
                  <div
                    key={line.id}
                    ref={(node) => {
                      lineRefs.current[index] = node;
                    }}
                    className="script-section-title"
                  >
                    {line.text}
                  </div>
                );
              }

              const renderInlineContent = () => {
                if (line.segments?.length) {
                  return line.segments.map((segment) => {
                    if (segment.kind === 'strong') {
                      return <strong key={segment.id}>{segment.text}</strong>;
                    }
                    if (segment.kind === 'emphasis') {
                      return <em key={segment.id}>{segment.text}</em>;
                    }
                    if (segment.kind === 'cue') {
                      return (
                        <span key={segment.id} className="overlay-cue-chip">
                          {segment.text}
                        </span>
                      );
                    }
                    return <span key={segment.id}>{segment.text}</span>;
                  });
                }
                return line.text || '\u00A0';
              };

              return (
                <p
                  key={line.id}
                  ref={(node) => {
                    lineRefs.current[index] = node;
                  }}
                  className="script-p"
                >
                  {line.kind === 'bullet' ? <span className="overlay-bullet-marker">•</span> : null}
                  {renderInlineContent()}
                </p>
              );
            })}
          </div>
        </section>

        <aside className="overlay-right-sidebar" onMouseDown={handleDragMouseDown}>
          {isCompactTopBar ? (
            <div className={`overlay-compact-dock ${isControlsCollapsed ? 'is-collapsed' : ''}`}>
              <div className="overlay-compact-context-bar">
                <div className="overlay-compact-context-main">
                  {renderSectionRail()}
                </div>
                <div className="overlay-compact-utility-cluster">
                  {renderTopActions()}
                </div>
              </div>

              <div
                id="overlay-controls-area"
                className={`overlay-controls-collapsible ${isControlsCollapsed ? 'is-collapsed' : ''}`}
              >
                <div className="overlay-compact-control-bar">
                  {renderPlaybackControls()}
                  <div className="overlay-compact-speed-row">
                    {renderSpeedControls('overlay-speed-footer overlay-speed-footer-compact', false)}
                  </div>
                  <div className="overlay-compact-status-row">
                    <span className="overlay-compact-speed-display" aria-label={t('overlay.currentSpeedAria')}>
                      {normalizedSpeed.toFixed(normalizedSpeed % 0.1 === 0 ? 1 : 2)}x
                    </span>
                    <div className="overlay-compact-status-divider" />
                    <div className="overlay-compact-opacity-group" role="group" aria-label={t('overlay.opacityAria')}>
                      <svg className="overlay-compact-opacity-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 2a10 10 0 0 0 0 20V2Z" fill="currentColor" />
                      </svg>
                      <input
                        className="overlay-compact-opacity-slider"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={dimLevel}
                        onChange={(e) => setDimLevel(Number(e.target.value))}
                        onPointerUp={(e) => { e.currentTarget.blur(); overlayRootRef.current?.focus({ preventScroll: true }); }}
                        aria-label={t('overlay.opacityAria')}
                        style={{ '--overlay-opacity-progress': `${dimLevel}%` } as CSSProperties}
                      />
                      <span className="overlay-compact-opacity-value">{dimLevel}%</span>
                    </div>
                    <div className="overlay-compact-status-divider" />
                    <div className="overlay-compact-font-group">
                      <button
                        type="button"
                        className="overlay-compact-font-btn"
                        onClick={() => changeFontScaleBy(-1)}
                        aria-label={t('overlay.decreaseFontSize')}
                      >
                        {t('overlay.fontAminus')}
                      </button>
                      <span className="overlay-compact-font-size">{Math.round(28 * overlayFontScale)}</span>
                      <button
                        type="button"
                        className="overlay-compact-font-btn"
                        onClick={() => changeFontScaleBy(1)}
                        aria-label={t('overlay.increaseFontSize')}
                      >
                        {t('overlay.fontAplus')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {!isCompactTopBar ? renderPlaybackControls('overlay-controls-desktop', false) : null}
        </aside>

        {isCompactTopBar && isFontMenuOpen && compactFontPopoverStyle
          ? createPortal(
            <div
              ref={fontMenuRef}
              className="overlay-popover overlay-font-popover overlay-font-popover-compact overlay-font-popover-compact-portal"
              style={compactFontPopoverStyle}
              role="dialog"
              aria-label={t('overlay.fontSizeSettings')}
            >
              <div className="overlay-font-stepper" role="group" aria-label={t('overlay.fontSize')}>
                <button
                  type="button"
                  className="overlay-font-stepper-button"
                  data-font-focus="true"
                  onClick={(e) => {
                    changeFontScaleBy(-1);
                    e.currentTarget.blur();
                    overlayRootRef.current?.focus({ preventScroll: true });
                  }}
                  aria-label={t('overlay.decreaseFontSize')}
                >
                  −
                </button>
                <span className="overlay-font-stepper-divider" aria-hidden="true" />
                <span className="overlay-font-stepper-value" aria-live="polite">{currentFontSize}</span>
                <span className="overlay-font-stepper-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="overlay-font-stepper-button"
                  onClick={(e) => {
                    changeFontScaleBy(1);
                    e.currentTarget.blur();
                    overlayRootRef.current?.focus({ preventScroll: true });
                  }}
                  aria-label={t('overlay.increaseFontSize')}
                >
                  +
                </button>
              </div>
              <div className="overlay-font-slider-row">
                <span className="overlay-font-label-small" aria-hidden="true">A</span>
                <input
                  className="overlay-font-slider"
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
                  aria-label={t('overlay.fontSize')}
                />
                <span className="overlay-font-label-large" aria-hidden="true">A</span>
              </div>
              <div className="overlay-font-footer overlay-font-footer-row">
                <ShortcutKeycaps className="overlay-font-shortcuts overlay-font-shortcuts-row" shortcuts={['CmdOrCtrl+Plus', 'CmdOrCtrl+Minus']} alternativeSeparator="/" />
                <button
                  type="button"
                  className="overlay-popover-link overlay-font-reset"
                  onClick={() => commitFontScale(1)}
                >
                  {t('overlay.reset')}
                </button>
              </div>
            </div>,
            document.body
          )
          : null}

        {!isCompactTopBar ? renderSpeedControls('overlay-speed-footer', true) : null}
      </main >
      {!isOverlayFocused
        ? createPortal(
          <div className="overlay-unfocused-hint" aria-live="polite">
            <span>{focusLossHintPrefix}</span>
            <kbd>{compactHidePrompterShortcutHint}</kbd>
            <span>{focusLossHintSuffix}</span>
          </div>,
          document.body
        )
        : null
      }
    </>
  );
}
