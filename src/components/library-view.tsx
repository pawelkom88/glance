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

interface SessionMenuState {
  readonly kind: 'session';
  readonly sessionId: string;
  readonly top: number;
  readonly left: number;
}

interface FileMenuState {
  readonly kind: 'file';
  readonly top: number;
  readonly left: number;
}

type MenuState = SessionMenuState | FileMenuState;

const menuWidth = 220;

function defaultSessionName(): string {
  return `Session ${new Date().toLocaleDateString()}`;
}

function buildMenuPosition(trigger: HTMLElement): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 8;
  const left = Math.max(
    viewportPadding,
    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
  );
  const top = Math.min(rect.bottom + 8, window.innerHeight - 160);

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

  const [draftSessionName, setDraftSessionName] = useState(defaultSessionName());
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMenuTimeoutRef = useRef<number | null>(null);
  const previousModalFocusRef = useRef<HTMLElement | null>(null);
  const newSessionButtonRef = useRef<HTMLButtonElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement | null>(null);

  const deleteCandidate = sessions.find((session) => session.id === deleteCandidateId) ?? null;

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

  const openMenu = (nextMenuState: MenuState, trigger: HTMLElement) => {
    if (closeMenuTimeoutRef.current !== null) {
      window.clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }

    lastMenuTriggerRef.current = trigger as HTMLButtonElement;
    setIsMenuClosing(false);
    setMenuState(nextMenuState);
  };

  const openSessionMenu = (sessionId: string, trigger: HTMLElement) => {
    const position = buildMenuPosition(trigger);
    openMenu({ kind: 'session', sessionId, ...position }, trigger);
  };

  const openFileMenu = (trigger: HTMLElement) => {
    const position = buildMenuPosition(trigger);
    openMenu({ kind: 'file', ...position }, trigger);
  };

  const createFromDraft = () => {
    const name = draftSessionName.trim();
    if (name.length === 0) {
      return;
    }

    onCreate(name);
    setDraftSessionName(defaultSessionName());
    setIsCreatingSession(false);
  };

  const closeComposer = (restoreFocus: boolean = true) => {
    setIsCreatingSession(false);
    setDraftSessionName(defaultSessionName());

    if (restoreFocus) {
      window.setTimeout(() => {
        newSessionButtonRef.current?.focus();
      }, 0);
    }
  };

  useEffect(() => {
    if (!menuState || isMenuClosing) {
      return;
    }

    menuItemRefs.current = [];
    const timeoutId = window.setTimeout(() => {
      const items = menuItemRefs.current.filter((item): item is HTMLButtonElement => item !== null && !item.disabled);
      items[0]?.focus();
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
    if (!isCreatingSession) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      composerInputRef.current?.focus();
      composerInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isCreatingSession]);

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
      <header className="library-toolbar">
        <h2 className="library-title">Sessions</h2>

        <div className="library-toolbar-actions">
          <button
            type="button"
            className="ghost-button file-menu-button"
            aria-label="File actions"
            aria-haspopup="menu"
            aria-expanded={menuState?.kind === 'file'}
            onClick={(event) => {
              event.stopPropagation();

              if (menuState?.kind === 'file') {
                closeMenu();
                return;
              }

              setIsCreatingSession(false);
              openFileMenu(event.currentTarget);
            }}
          >
            File
          </button>

          <button
            ref={newSessionButtonRef}
            type="button"
            className="primary-button"
            aria-expanded={isCreatingSession}
            onClick={() => {
              setIsCreatingSession((previous) => {
                const next = !previous;
                if (next) {
                  closeMenu(false);
                  setDraftSessionName(defaultSessionName());
                }
                return next;
              });
            }}
          >
            New Session
          </button>
        </div>
      </header>

      {isCreatingSession ? (
        <form
          className="new-session-composer"
          onSubmit={(event) => {
            event.preventDefault();
            createFromDraft();
          }}
        >
          <input
            ref={composerInputRef}
            type="text"
            className="composer-input"
            value={draftSessionName}
            onChange={(event) => setDraftSessionName(event.target.value)}
            aria-label="Session name"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeComposer(true);
              }
            }}
          />
          <div className="composer-actions">
            <button type="submit" className="primary-button">
              Create
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                closeComposer(true);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

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
                  openSessionMenu(session.id, trigger);
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
                  aria-expanded={menuState?.kind === 'session' && menuState.sessionId === session.id}
                  onClick={(event) => {
                    event.stopPropagation();

                    if (menuState?.kind === 'session' && menuState.sessionId === session.id) {
                      closeMenu();
                      return;
                    }

                    setIsCreatingSession(false);
                    openSessionMenu(session.id, event.currentTarget);
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
                      (item): item is HTMLButtonElement => item !== null && !item.disabled
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
                      (item): item is HTMLButtonElement => item !== null && !item.disabled
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
                {menuState.kind === 'file' ? (
                  <>
                    <button
                      ref={(node) => {
                        menuItemRefs.current[0] = node;
                      }}
                      type="button"
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        onImport();
                        closeMenu();
                      }}
                    >
                      Import Markdown…
                    </button>
                    <button
                      ref={(node) => {
                        menuItemRefs.current[1] = node;
                      }}
                      type="button"
                      className="menu-item"
                      role="menuitem"
                      disabled={!activeSessionId}
                      onClick={() => {
                        if (!activeSessionId) {
                          return;
                        }
                        onExportSession(activeSessionId);
                        closeMenu();
                      }}
                    >
                      Export Selected…
                    </button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
