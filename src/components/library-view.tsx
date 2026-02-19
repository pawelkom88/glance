import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionSummary } from '../types';

interface LibraryViewProps {
  readonly sessions: readonly SessionSummary[];
  readonly activeSessionId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onCreate: (name: string) => void;
  readonly onDuplicate: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onImport: () => void;
  readonly onExportSession: (id: string) => void;
}

interface MenuState {
  readonly sessionId: string;
  readonly top: number;
  readonly left: number;
}

const menuWidth = 188;

function buildMenuPosition(trigger: HTMLElement): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const left = Math.max(
    viewportPadding,
    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
  );
  const top = Math.min(rect.bottom + 8, window.innerHeight - 130);

  return { top, left };
}

export function LibraryView(props: LibraryViewProps) {
  const {
    sessions,
    activeSessionId,
    onSelect,
    onOpen,
    onCreate,
    onDuplicate,
    onDelete,
    onImport,
    onExportSession
  } = props;

  const [draftSessionName, setDraftSessionName] = useState(`Session ${new Date().toLocaleDateString()}`);
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement | null>(null);
  const previousModalFocusRef = useRef<HTMLElement | null>(null);
  const closeMenuTimeoutRef = useRef<number | null>(null);

  const deleteCandidate = sessions.find((session) => session.id === deleteCandidateId) ?? null;

  const createFromDraft = () => {
    const name = draftSessionName.trim();
    if (name.length === 0) {
      return;
    }

    onCreate(name);
    setDraftSessionName(`Session ${new Date().toLocaleDateString()}`);
  };

  const closeMenu = (restoreFocus: boolean = true) => {
    if (!menuState) {
      return;
    }

    setIsMenuClosing(true);
    if (closeMenuTimeoutRef.current !== null) {
      window.clearTimeout(closeMenuTimeoutRef.current);
    }

    closeMenuTimeoutRef.current = window.setTimeout(() => {
      setMenuState(null);
      setIsMenuClosing(false);
      closeMenuTimeoutRef.current = null;

      if (restoreFocus) {
        lastMenuTriggerRef.current?.focus();
      }
    }, 140);
  };

  const openMenu = (sessionId: string, trigger: HTMLElement) => {
    if (closeMenuTimeoutRef.current !== null) {
      window.clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }
    lastMenuTriggerRef.current = trigger as HTMLButtonElement;
    const position = buildMenuPosition(trigger);
    setIsMenuClosing(false);
    setMenuState({ sessionId, ...position });
  };

  useEffect(() => {
    if (!menuState || isMenuClosing) {
      return;
    }

    menuItemRefs.current = [];
    const timeoutId = window.setTimeout(() => {
      menuItemRefs.current[0]?.focus();
    }, 0);

    const closeOnResize = () => closeMenu(false);
    const closeOnScroll = () => closeMenu(false);

    window.addEventListener('resize', closeOnResize);
    window.addEventListener('scroll', closeOnScroll, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('resize', closeOnResize);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [isMenuClosing, menuState]);

  useEffect(() => {
    return () => {
      if (closeMenuTimeoutRef.current !== null) {
        window.clearTimeout(closeMenuTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!deleteCandidate) {
      if (previousModalFocusRef.current) {
        window.setTimeout(() => {
          previousModalFocusRef.current?.focus();
          previousModalFocusRef.current = null;
        }, 0);
      }

      return;
    }

    previousModalFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const timeoutId = window.setTimeout(() => {
      cancelDeleteRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deleteCandidate]);

  return (
    <section className="panel library-panel">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Session Library</p>
          <h2>Local Sessions</h2>
        </div>
        <div className="header-actions">
          <input
            type="text"
            className="session-name-input"
            value={draftSessionName}
            onChange={(event) => setDraftSessionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                createFromDraft();
              }
            }}
            aria-label="New session name"
          />
          <button type="button" className="ghost-button" onClick={onImport}>
            Import
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              if (!activeSessionId) {
                return;
              }

              onExportSession(activeSessionId);
            }}
            disabled={!activeSessionId}
          >
            Export…
          </button>
          <button type="button" className="primary-button" onClick={createFromDraft}>
            New Session
          </button>
        </div>
      </header>

      <div className="session-list">
        {sessions.map((session) => (
          <article
            key={session.id}
            className={`session-card session-card-selectable ${activeSessionId === session.id ? 'active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              onSelect(session.id);
              closeMenu(false);
            }}
            onDoubleClick={() => {
              onOpen(session.id);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSelect(session.id);

                const trigger = menuButtonRefs.current[session.id];
                if (trigger) {
                  openMenu(session.id, trigger);
                }
                return;
              }

              if (event.key === ' ') {
                event.preventDefault();
                onSelect(session.id);
              }
            }}
          >
            <div className="session-row-top">
              <div>
                <p className="session-title">{session.title}</p>
                <p className="session-meta">Updated {new Date(session.updatedAt).toLocaleString()}</p>
              </div>

              <div className="session-row-menu-wrap">
                <button
                  ref={(node) => {
                    menuButtonRefs.current[session.id] = node;
                  }}
                  type="button"
                  className="row-menu-button"
                  aria-label={`Actions for ${session.title}`}
                  aria-haspopup="menu"
                  aria-expanded={menuState?.sessionId === session.id}
                  onClick={(event) => {
                    event.stopPropagation();

                    if (menuState?.sessionId === session.id) {
                      closeMenu();
                      return;
                    }

                    openMenu(session.id, event.currentTarget);
                  }}
                >
                  •••
                </button>
              </div>
            </div>
          </article>
        ))}

        {sessions.length === 0 ? <p className="empty-state">No sessions yet. Create one to begin.</p> : null}
      </div>

      {menuState
        ? createPortal(
            <>
              <button
                type="button"
                className="floating-menu-backdrop"
                aria-label="Close actions menu"
                data-state={isMenuClosing ? 'closing' : 'open'}
                onClick={() => {
                  closeMenu();
                }}
              />
              <div
                className="floating-menu"
                role="menu"
                data-state={isMenuClosing ? 'closing' : 'open'}
                style={{ top: `${menuState.top}px`, left: `${menuState.left}px` }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeMenu();
                    return;
                  }

                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const items = menuItemRefs.current.filter(
                      (item): item is HTMLButtonElement => item !== null
                    );

                    if (items.length === 0) {
                      return;
                    }

                    const currentIndex = items.findIndex((item) => item === document.activeElement);
                    const delta = event.key === 'ArrowDown' ? 1 : -1;
                    const fallbackIndex = event.key === 'ArrowDown' ? 0 : items.length - 1;
                    const nextIndex = currentIndex === -1
                      ? fallbackIndex
                      : (currentIndex + delta + items.length) % items.length;
                    items[nextIndex].focus();
                    return;
                  }

                  if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault();
                    const items = menuItemRefs.current.filter(
                      (item): item is HTMLButtonElement => item !== null
                    );
                    if (items.length === 0) {
                      return;
                    }

                    if (event.key === 'Home') {
                      items[0].focus();
                      return;
                    }

                    items[items.length - 1].focus();
                  }
                }}
              >
                <button
                  ref={(node) => {
                    menuItemRefs.current[0] = node;
                  }}
                  type="button"
                  className="menu-item"
                  role="menuitem"
                  onClick={() => {
                    onDuplicate(menuState.sessionId);
                    closeMenu();
                  }}
                >
                  Duplicate
                </button>
                <button
                  ref={(node) => {
                    menuItemRefs.current[1] = node;
                  }}
                  type="button"
                  className="menu-item menu-item-danger"
                  role="menuitem"
                  onClick={() => {
                    setDeleteCandidateId(menuState.sessionId);
                    closeMenu(false);
                  }}
                >
                  Delete…
                </button>
              </div>
            </>,
            document.body
          )
        : null}

      {deleteCandidate ? (
        <div
          className="confirm-backdrop"
          data-state="open"
          onClick={() => {
            setDeleteCandidateId(null);
          }}
        >
          <div
            className="confirm-sheet"
            data-state="open"
            role="dialog"
            aria-modal="true"
            aria-label="Delete session confirmation"
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setDeleteCandidateId(null);
                return;
              }

              const buttons = [cancelDeleteRef.current, confirmDeleteRef.current].filter(
                (item): item is HTMLButtonElement => item !== null
              );

              if (buttons.length === 0) {
                return;
              }

              if (event.key === 'Tab') {
                event.preventDefault();
                const currentIndex = buttons.findIndex((item) => item === document.activeElement);
                const nextIndex = event.shiftKey
                  ? (currentIndex - 1 + buttons.length) % buttons.length
                  : (currentIndex + 1) % buttons.length;
                buttons[nextIndex < 0 ? 0 : nextIndex].focus();
                return;
              }

              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const currentIndex = buttons.findIndex((item) => item === document.activeElement);
                const delta = event.key === 'ArrowRight' ? 1 : -1;
                const nextIndex = currentIndex === -1
                  ? 0
                  : (currentIndex + delta + buttons.length) % buttons.length;
                buttons[nextIndex].focus();
              }
            }}
          >
            <h3>Delete "{deleteCandidate.title}"?</h3>
            <p>This cannot be undone.</p>
            <div className="confirm-actions">
              <button
                ref={cancelDeleteRef}
                type="button"
                className="ghost-button"
                onClick={() => {
                  setDeleteCandidateId(null);
                }}
              >
                Cancel
              </button>
              <button
                ref={confirmDeleteRef}
                type="button"
                className="danger-button"
                onClick={() => {
                  onDelete(deleteCandidate.id);
                  setDeleteCandidateId(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
