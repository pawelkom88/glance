import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { markdownToDisplayLines, parseMarkdown } from '../lib/markdown';
import {
  closeOverlayWindow,
  getLastOverlayMonitorName,
  listenForShortcutEvents,
  saveOverlayBoundsForMonitor,
  setLastOverlayMonitorName,
  showMainWindow
} from '../lib/tauri';
import { ScrollEngine } from '../lib/scroll-engine';
import { useAppStore } from '../store/use-app-store';

const lineHeight = 54;
const fadeDurationMs = 140;
const rulerHeight = 56;
const rulerPadding = 34;

interface RulerStyle {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly visible: boolean;
}

function platformModifier(): string {
  return navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function OverlayPrompter() {
  const markdown = useAppStore((state) => state.markdown);
  const playbackState = useAppStore((state) => state.playbackState);
  const scrollPosition = useAppStore((state) => state.scrollPosition);
  const scrollSpeed = useAppStore((state) => state.scrollSpeed);
  const togglePlayback = useAppStore((state) => state.togglePlayback);
  const setPlaybackState = useAppStore((state) => state.setPlaybackState);
  const setScrollPosition = useAppStore((state) => state.setScrollPosition);
  const setScrollSpeed = useAppStore((state) => state.setScrollSpeed);
  const changeScrollSpeedBy = useAppStore((state) => state.changeScrollSpeedBy);
  const jumpToSectionByIndex = useAppStore((state) => state.jumpToSectionByIndex);
  const showToast = useAppStore((state) => state.showToast);

  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const sections = parsed.sections;
  const lines = useMemo(() => markdownToDisplayLines(markdown), [markdown]);

  const engineRef = useRef<ScrollEngine | null>(null);
  const speedRef = useRef(scrollSpeed);
  const initialSpeedToastSkippedRef = useRef(false);
  const lineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const monitorNameRef = useRef<string | null>(getLastOverlayMonitorName());
  const contentRef = useRef<HTMLElement | null>(null);

  const [isClosing, setIsClosing] = useState(false);
  const [rulerStyle, setRulerStyle] = useState<RulerStyle>({
    left: 16,
    top: 0,
    width: 260,
    visible: false
  });

  useEffect(() => {
    speedRef.current = scrollSpeed;
  }, [scrollSpeed]);

  useEffect(() => {
    engineRef.current = new ScrollEngine({
      getSpeed: () => speedRef.current,
      onTick: (position) => {
        const maxPosition = Math.max(0, lines.length * lineHeight - window.innerHeight + 160);
        setScrollPosition(Math.min(position, maxPosition));
      }
    });

    engineRef.current.setPosition(useAppStore.getState().scrollPosition);

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [lines.length, setScrollPosition]);

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
        jumpToSectionByIndex(payload.index);
      }

      if (payload.action === 'speed-change' && typeof payload.delta === 'number') {
        changeScrollSpeedBy(payload.delta);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten();
    };
  }, [changeScrollSpeedBy, jumpToSectionByIndex, togglePlayback]);

  const requestCloseOverlay = useCallback(() => {
    if (isClosing) {
      return;
    }

    setPlaybackState('paused');
    setIsClosing(true);

    window.setTimeout(() => {
      void (async () => {
        try {
          await closeOverlayWindow();
          await showMainWindow();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to close prompter';
          showToast(message);
        } finally {
          setIsClosing(false);
        }
      })();
    }, fadeDurationMs);
  }, [isClosing, setPlaybackState, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
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
        changeScrollSpeedBy(4);
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        changeScrollSpeedBy(-4);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [changeScrollSpeedBy, requestCloseOverlay]);

  useEffect(() => {
    if (!initialSpeedToastSkippedRef.current) {
      initialSpeedToastSkippedRef.current = true;
      return;
    }

    showToast(`Speed ${(scrollSpeed / 42).toFixed(2)}x`);
  }, [scrollSpeed, showToast]);

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

  useEffect(() => {
    const updateRuler = () => {
      const contentElement = contentRef.current;
      if (!contentElement || lines.length === 0) {
        return;
      }

      const anchorOffset = scrollPosition + contentElement.clientHeight * 0.42;
      const nextLineIndex = Math.max(0, Math.min(lines.length - 1, Math.floor(anchorOffset / lineHeight)));
      const lineElement = lineRefs.current[nextLineIndex];
      const line = lines[nextLineIndex];

      if (!lineElement || line.kind === 'empty') {
        setRulerStyle((previous) => ({ ...previous, visible: false }));
        return;
      }

      const contentRect = contentElement.getBoundingClientRect();
      const lineRect = lineElement.getBoundingClientRect();
      const measuredWidth = lineElement.scrollWidth;
      const minWidth = 220;
      const maxWidth = Math.max(minWidth, contentRect.width - 44);
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, measuredWidth + rulerPadding));
      const nextLeft = Math.max(
        16,
        Math.min(lineRect.left - contentRect.left - 16, contentRect.width - nextWidth - 16)
      );
      const nextTop = lineRect.top - contentRect.top + (lineRect.height - rulerHeight) / 2;

      setRulerStyle((previous) => {
        const roundedWidth = Math.round(nextWidth);
        const roundedLeft = Math.round(nextLeft);
        const roundedTop = Math.round(nextTop);

        if (
          previous.visible
          && Math.abs(previous.width - roundedWidth) < 1
          && Math.abs(previous.left - roundedLeft) < 1
          && Math.abs(previous.top - roundedTop) < 1
        ) {
          return previous;
        }

        return {
          width: roundedWidth,
          left: roundedLeft,
          top: roundedTop,
          visible: true
        };
      });
    };

    const frameId = window.requestAnimationFrame(updateRuler);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [lines, scrollPosition]);

  useEffect(() => {
    const onResize = () => {
      setRulerStyle((previous) => ({ ...previous, visible: false }));
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <main
      className={`overlay-root ${isClosing ? 'overlay-closing' : ''}`}
      role="application"
      aria-label="Glance overlay"
    >
      <header className="hint-bar">
        <div className="hint-drag-region" data-tauri-drag-region>
          <div className="hint-items" role="tablist" aria-label="Section shortcuts">
            {sections.slice(0, 9).map((section, index) => (
              <button
                key={section.id}
                type="button"
                className="hint-item"
                onClick={() => jumpToSectionByIndex(index)}
              >
                [{platformModifier()}{index + 1}] {section.title}
              </button>
            ))}
            {sections.length > 9 ? <span className="hint-overflow">+{sections.length - 9} more</span> : null}
          </div>
        </div>
        <button
          type="button"
          className="overlay-close-button"
          onClick={requestCloseOverlay}
          aria-label="Close prompter"
        >
          Close
        </button>
      </header>

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
              {line.kind === 'bullet' ? '• ' : ''}
              {line.text || '\u00A0'}
            </p>
          ))}
        </div>
      </section>

      <footer className="overlay-controls">
        <button type="button" className="control-button" onClick={() => togglePlayback()}>
          {playbackState === 'running' ? 'Pause' : 'Play'}
        </button>

        <span className={`status-indicator ${playbackState === 'running' ? 'running' : 'paused'}`}>
          {playbackState === 'running' ? '🟢 Running' : '🔴 Paused'}
        </span>

        <div className="speed-control">
          <span>Turtle</span>
          <input
            type="range"
            min={10}
            max={140}
            value={scrollSpeed}
            onChange={(event) => setScrollSpeed(Number(event.target.value))}
            aria-label="Scroll speed"
          />
          <span>Rabbit</span>
        </div>
      </footer>
    </main>
  );
}
