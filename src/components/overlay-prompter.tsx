import { useEffect, useMemo, useRef } from 'react';
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { markdownToDisplayLines, parseMarkdown } from '../lib/markdown';
import { listenForShortcutEvents } from '../lib/tauri';
import { ScrollEngine } from '../lib/scroll-engine';
import { useAppStore } from '../store/use-app-store';

const lineHeight = 54;
const boundsStorageKey = `glance-overlay-bounds-${navigator.platform.toLowerCase()}`;

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withModifier = event.metaKey || event.ctrlKey;
      if (!withModifier) {
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
  }, [changeScrollSpeedBy]);

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

    const saved = window.localStorage.getItem(boundsStorageKey);
    if (saved) {
      try {
        const parsedBounds = JSON.parse(saved) as { x: number; y: number; width: number; height: number };
        void appWindow.setPosition(new LogicalPosition(parsedBounds.x, parsedBounds.y));
        void appWindow.setSize(new LogicalSize(parsedBounds.width, parsedBounds.height));
      } catch {
        window.localStorage.removeItem(boundsStorageKey);
      }
    }

    let unlistenMoved: (() => void) | null = null;
    let unlistenResized: (() => void) | null = null;

    const persistBounds = () => {
      void Promise.all([appWindow.outerPosition(), appWindow.outerSize()]).then(([position, size]) => {
        window.localStorage.setItem(
          boundsStorageKey,
          JSON.stringify({
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height
          })
        );
      });
    };

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

  return (
    <main className="overlay-root" role="application" aria-label="Glance overlay">
      <header className="hint-bar" data-tauri-drag-region>
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
      </header>

      <section className="overlay-content" aria-live="polite">
        <div className="reading-ruler" aria-hidden="true" />
        <div className="overlay-lines" style={{ transform: `translateY(${-scrollPosition}px)` }}>
          {lines.map((line) => (
            <p key={line.id} className={`overlay-line overlay-line-${line.kind}`}>
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
