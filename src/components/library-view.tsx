import { startTransition, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactViewTransition } from './react-view-transition';
import type { SessionSummary } from '../types';

interface LibraryViewProps {
  readonly sessions: readonly SessionSummary[];
  readonly activeSessionId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onCreate: (name: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onImport: () => void;
  readonly onExportSession: (id: string) => void;
}

interface FileMenuState {
  readonly kind: 'file';
  readonly top: number;
  readonly left: number;
}

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

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4h10.5L20 8.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm9.5 1.5V9H18" />
      <path d="M8 13h8M8 16h8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M42,3H28a2,2,0,0,0-2-2H22a2,2,0,0,0-2,2H6A2,2,0,0,0,6,7H42a2,2,0,0,0,0-4Z" />
      <path d="M39,9a2,2,0,0,0-2,2V43H11V11a2,2,0,0,0-4,0V45a2,2,0,0,0,2,2H39a2,2,0,0,0,2-2V11A2,2,0,0,0,39,9Z" />
      <path d="M21,37V19a2,2,0,0,0-4,0V37a2,2,0,0,0,4,0Z" />
      <path d="M31,37V19a2,2,0,0,0-4,0V37a2,2,0,0,0,4,0Z" />
    </svg>
  );
}

export function LibraryView(props: LibraryViewProps) {
  const {
    sessions,
    activeSessionId,
    onSelect,
    onOpen,
    onCreate,
    onDelete,
    onImport,
    onExportSession
  } = props;

  const [draftSessionName, setDraftSessionName] = useState(defaultSessionName());
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [isComposerClosing, setIsComposerClosing] = useState(false);
  const [menuState, setMenuState] = useState<FileMenuState | null>(null);
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [isDeleteDialogClosing, setIsDeleteDialogClosing] = useState(false);
  const [exitingSessionIds, setExitingSessionIds] = useState<Set<string>>(new Set());

  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMenuTimeoutRef = useRef<number | null>(null);
  const deleteTimeoutsRef = useRef<Record<string, number>>({});
  const closeDeleteDialogTimeoutRef = useRef<number | null>(null);
  const closeComposerTimeoutRef = useRef<number | null>(null);
  const previousModalFocusRef = useRef<HTMLElement | null>(null);
  const modalRestoreFocusRef = useRef<HTMLElement | null>(null);
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

  const openFileMenu = (trigger: HTMLElement) => {
    if (closeMenuTimeoutRef.current !== null) {
      window.clearTimeout(closeMenuTimeoutRef.current);
      closeMenuTimeoutRef.current = null;
    }

    const position = buildMenuPosition(trigger);
    lastMenuTriggerRef.current = trigger as HTMLButtonElement;
    setIsMenuClosing(false);
    setMenuState({ kind: 'file', ...position });
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
    if (!isCreatingSession || isComposerClosing) {
      return;
    }

    setIsComposerClosing(true);
    if (closeComposerTimeoutRef.current !== null) {
      window.clearTimeout(closeComposerTimeoutRef.current);
    }

    closeComposerTimeoutRef.current = window.setTimeout(() => {
      setIsCreatingSession(false);
      setShowComposer(false);
      setIsComposerClosing(false);
      setDraftSessionName(defaultSessionName());
      closeComposerTimeoutRef.current = null;

      if (restoreFocus) {
        window.setTimeout(() => {
          newSessionButtonRef.current?.focus();
        }, 0);
      }
    }, 150);
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
      if (closeDeleteDialogTimeoutRef.current !== null) {
        window.clearTimeout(closeDeleteDialogTimeoutRef.current);
      }
      if (closeComposerTimeoutRef.current !== null) {
        window.clearTimeout(closeComposerTimeoutRef.current);
      }

      Object.values(deleteTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      deleteTimeoutsRef.current = {};
    };
  }, []);

  const closeDeleteDialog = () => {
    if (!deleteCandidateId || isDeleteDialogClosing) {
      return;
    }

    setIsDeleteDialogClosing(true);
    if (closeDeleteDialogTimeoutRef.current !== null) {
      window.clearTimeout(closeDeleteDialogTimeoutRef.current);
    }

    closeDeleteDialogTimeoutRef.current = window.setTimeout(() => {
      setDeleteCandidateId(null);
      setIsDeleteDialogClosing(false);
      closeDeleteDialogTimeoutRef.current = null;
    }, 140);
  };

  useEffect(() => {
    const liveIds = new Set(sessions.map((session) => session.id));
    setExitingSessionIds((previous) => {
      const next = new Set<string>();
      previous.forEach((id) => {
        if (liveIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [sessions]);

  const deleteWithTransition = (sessionId: string) => {
    if (exitingSessionIds.has(sessionId)) {
      return;
    }

    setExitingSessionIds((previous) => {
      const next = new Set(previous);
      next.add(sessionId);
      return next;
    });

    deleteTimeoutsRef.current[sessionId] = window.setTimeout(() => {
      onDelete(sessionId);
      setExitingSessionIds((previous) => {
        const next = new Set(previous);
        next.delete(sessionId);
        return next;
      });
      deleteTimeoutsRef.current[sessionId] = 0;
      delete deleteTimeoutsRef.current[sessionId];
    }, 180);
  };

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
      const focusTarget = modalRestoreFocusRef.current ?? previousModalFocusRef.current;
      if (focusTarget) {
        window.setTimeout(() => {
          focusTarget.focus();
          previousModalFocusRef.current = null;
          modalRestoreFocusRef.current = null;
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
            <FileIcon />
            <span>File</span>
          </button>

          <button
            ref={newSessionButtonRef}
            type="button"
            className="primary-button"
            aria-expanded={isCreatingSession}
            onClick={() => {
              if (isCreatingSession) {
                closeComposer(true);
                return;
              }

              startTransition(() => {
                closeMenu(false);
                setIsComposerClosing(false);
                setDraftSessionName(defaultSessionName());
                setShowComposer(true);
                setIsCreatingSession(true);
              });
            }}
          >
            <PlusIcon />
            <span>New Session</span>
          </button>
        </div>
      </header>

      {showComposer ? (
        <form
          className={`new-session-composer ${isComposerClosing ? 'is-closing' : ''}`}
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
            <button type="button" className="cancel-button" onClick={() => closeComposer(true)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="session-list">
        {sessions.map((session) => (
          <ReactViewTransition
            key={session.id}
            name={`session-row-${session.id}`}
            update="session-row-update"
            enter="session-row-enter"
            exit="session-row-exit"
          >
            <article
              className={`session-card session-card-selectable ${activeSessionId === session.id ? 'active' : ''} ${exitingSessionIds.has(session.id) ? 'is-exiting' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (exitingSessionIds.has(session.id)) {
                  return;
                }
                onSelect(session.id);
                closeMenu(false);
              }}
              onDoubleClick={() => {
                if (exitingSessionIds.has(session.id)) {
                  return;
                }
                onOpen(session.id);
              }}
              onKeyDown={(event) => {
                if (exitingSessionIds.has(session.id)) {
                  return;
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onOpen(session.id);
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
                    type="button"
                    className="row-menu-button"
                    aria-label={`Delete ${session.title}`}
                    disabled={exitingSessionIds.has(session.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      startTransition(() => {
                        setIsDeleteDialogClosing(false);
                        setDeleteCandidateId(session.id);
                      });
                      modalRestoreFocusRef.current = event.currentTarget;
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </article>
          </ReactViewTransition>
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
                onClick={() => closeMenu()}
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

                  if (event.key === 'Tab') {
                    event.preventDefault();
                    const items = menuItemRefs.current.filter(
                      (item): item is HTMLButtonElement => item !== null && !item.disabled
                    );
                    if (items.length === 0) {
                      return;
                    }

                    const currentIndex = items.findIndex((item) => item === document.activeElement);
                    const delta = event.shiftKey ? -1 : 1;
                    const fallbackIndex = event.shiftKey ? items.length - 1 : 0;
                    const nextIndex = currentIndex === -1
                      ? fallbackIndex
                      : (currentIndex + delta + items.length) % items.length;
                    items[nextIndex].focus();
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
                    } else {
                      items[items.length - 1].focus();
                    }
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
                    onImport();
                    closeMenu();
                  }}
                >
                  Import Markdown
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
                  Export Selected
                </button>
              </div>
            </>,
            document.body
          )
        : null}

      {deleteCandidate ? (
        <div
          className="confirm-backdrop"
          data-state={isDeleteDialogClosing ? 'closing' : 'open'}
          onClick={() => closeDeleteDialog()}
        >
          <div
            className="confirm-sheet"
            data-state={isDeleteDialogClosing ? 'closing' : 'open'}
            role="dialog"
            aria-modal="true"
            aria-label="Delete session confirmation"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeDeleteDialog();
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
                const nextIndex = currentIndex === -1 ? 0 : (currentIndex + delta + buttons.length) % buttons.length;
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
                  closeDeleteDialog();
                }}
              >
                Cancel
              </button>
              <button
                ref={confirmDeleteRef}
                type="button"
                className="danger-button"
                onClick={() => {
                  deleteWithTransition(deleteCandidate.id);
                  closeDeleteDialog();
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
