import { startTransition, useEffect, useRef, useState } from 'react';
import type { SessionSummary } from '../types';

interface LibraryViewProps {
  readonly sessions: readonly SessionSummary[];
  readonly activeSessionId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onCreate: (name: string) => void;
  readonly onDelete: (id: string, notify?: boolean) => void;
  readonly onImport: () => void;
  readonly showToast: (message: string, variant?: any) => void;
}

function defaultSessionName(): string {
  const now = new Date();
  const day = now.getDate();
  const month = now.toLocaleDateString('en-GB', { month: 'short' });
  const year = now.getFullYear();
  return `Session ${day} ${month} ${year}`;
}

function SessionDocIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.5 3h7L18 7.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M13.5 3.6V8H18" />
      <path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5H13" />
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="100%" height="100%">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function formatUpdatedLabel(updatedAt: string): string {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return 'Updated recently';
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfUpdatedDay = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate());
  const dayDiff = Math.floor((startOfToday.getTime() - startOfUpdatedDay.getTime()) / 86_400_000);
  const timeLabel = updated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (dayDiff <= 0) {
    return `Updated today at ${timeLabel}`;
  }

  if (dayDiff === 1) {
    return `Updated yesterday at ${timeLabel}`;
  }

  if (dayDiff < 7) {
    const weekday = updated.toLocaleDateString([], { weekday: 'long' });
    return `Updated ${weekday} at ${timeLabel}`;
  }

  const fullDate = updated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Updated ${fullDate}`;
}

export function LibraryView(props: LibraryViewProps) {
  const {
    sessions,
    activeSessionId,
    onOpen,
    onCreate,
    onDelete,
    onImport,
    showToast
  } = props;

  const [draftSessionName, setDraftSessionName] = useState(defaultSessionName());
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [isComposerClosing, setIsComposerClosing] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [isDeleteDialogClosing, setIsDeleteDialogClosing] = useState(false);
  const [exitingSessionIds, setExitingSessionIds] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [bulkExitingIds, setBulkExitingIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleteConfirmClosing, setIsBulkDeleteConfirmClosing] = useState(false);
  const [lastDeletedCount, setLastDeletedCount] = useState(0);

  const longPressTimerRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const deleteTimeoutsRef = useRef<Record<string, number>>({});
  const closeDeleteDialogTimeoutRef = useRef<number | null>(null);
  const closeComposerTimeoutRef = useRef<number | null>(null);
  const previousModalFocusRef = useRef<HTMLElement | null>(null);
  const modalRestoreFocusRef = useRef<HTMLElement | null>(null);
  const newSessionButtonRef = useRef<HTMLButtonElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement | null>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement | null>(null);

  const [pulsingCardId, setPulsingCardId] = useState<string | null>(null);

  const deleteCandidate = sessions.find((session) => session.id === deleteCandidateId) ?? null;

  const toggleSelection = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedSessionIds(new Set(sessions.map(s => s.id)));
  };

  const deselectAll = () => {
    setSelectedSessionIds(new Set());
  };

  const isAllSelected = sessions.length > 0 && selectedSessionIds.size === sessions.length;

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
    return () => {
      if (closeDeleteDialogTimeoutRef.current !== null) {
        window.clearTimeout(closeDeleteDialogTimeoutRef.current);
      }
      if (closeComposerTimeoutRef.current !== null) {
        window.clearTimeout(closeComposerTimeoutRef.current);
      }
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
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

  const handleBulkDelete = async () => {
    if (selectedSessionIds.size === 0) return;

    setLastDeletedCount(selectedSessionIds.size);
    const idsToDelete = Array.from(selectedSessionIds);

    // Staggered exit animation
    for (let i = 0; i < idsToDelete.length; i++) {
      const id = idsToDelete[i];
      setBulkExitingIds((prev) => new Set(prev).add(id));
      await new Promise((resolve) => setTimeout(resolve, 80)); // Stagger delay
    }

    // Wait for the last animation to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Execute deletion
    for (const id of idsToDelete) {
      onDelete(id, false);
    }

    // Cleanup and exit selection mode
    setBulkExitingIds(new Set());
    setSelectedSessionIds(new Set());
    setIsSelectionMode(false);

    // Show success toast via prop
    showToast(`${lastDeletedCount} sessions deleted`, 'success');
  };

  const startLongPress = (sessionId: string) => {
    if (isSelectionMode) return;

    longPressTimerRef.current = window.setTimeout(() => {
      setPulsingCardId(sessionId);
      window.setTimeout(() => {
        setIsSelectionMode(true);
        setSelectedSessionIds(new Set([sessionId]));
        setPulsingCardId(null);
      }, 300); // Pulse duration
    }, 500); // Long press threshold
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

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
    <section className="panel library-panel sessions-pane">
      <header className="sessions-header">
        <h2 className="sessions-title">Sessions</h2>

        <div className="sessions-header-actions">
          {!isSelectionMode ? (
            <>
              <button
                type="button"
                className="sessions-import-button"
                aria-label="Import Markdown"
                onClick={onImport}
              >
                <span>↓ Import</span>
              </button>

              <button
                ref={newSessionButtonRef}
                type="button"
                className="sessions-new-button"
                aria-expanded={isCreatingSession}
                onClick={() => {
                  if (isCreatingSession) {
                    closeComposer(true);
                    return;
                  }

                  startTransition(() => {
                    setIsComposerClosing(false);
                    setDraftSessionName(defaultSessionName());
                    setShowComposer(true);
                    setIsCreatingSession(true);
                  });
                }}
              >
                <span>+ New Session</span>
              </button>

              {sessions.length > 1 && (
                <button
                  type="button"
                  className="sessions-select-mode-button tertiary-button"
                  onClick={() => setIsSelectionMode(true)}
                  style={{
                    background: 'transparent',
                    color: 'var(--selection-blue)',
                    border: 'none',
                    fontSize: '14px',
                    fontWeight: '600',
                    padding: '7px 12px',
                    cursor: 'pointer'
                  }}
                >
                  Select
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="sessions-cancel-selection-button"
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedSessionIds(new Set());
              }}
              style={{
                background: 'transparent',
                color: 'var(--selection-blue)',
                border: 'none',
                fontSize: '14px',
                fontWeight: '600',
                padding: '7px 12px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </header>

      <div className={`select-all-row ${isSelectionMode ? 'is-visible' : ''}`}>
        <div
          className={`selection-checkbox ${isAllSelected ? 'is-checked' : ''}`}
          onClick={() => {
            if (isAllSelected) {
              deselectAll();
            } else {
              selectAll();
            }
          }}
        >
          {isAllSelected && (
            <div className="selection-checkbox-inner">
              <CheckIcon />
            </div>
          )}
        </div>
        <span
          className="select-all-label"
          onClick={() => {
            if (isAllSelected) {
              deselectAll();
            } else {
              selectAll();
            }
          }}
        >
          {isAllSelected ? 'Deselect All' : 'Select All'}
        </span>
      </div>

      {showComposer ? (
        <div
          className={`modal-overlay ${isComposerClosing ? 'is-closing' : ''}`}
          onClick={() => closeComposer(true)}
        >
          <form
            className="modal-sheet"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              createFromDraft();
            }}
          >
            <div className="modal-title">New Session</div>
            <div className="modal-subtitle">Give your session a name. You can rename it at any time.</div>
            <input
              ref={composerInputRef}
              type="text"
              className="modal-input"
              value={draftSessionName}
              maxLength={60}
              placeholder="e.g. Q2 Sales Call, Podcast Intro…"
              onChange={(event) => setDraftSessionName(event.target.value)}
              aria-label="Session name"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeComposer(true);
                }
              }}
            />
            <div className={`modal-char-count${draftSessionName.length >= 50 ? ' warn' : ''}`}>
              {draftSessionName.length} / 60
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => closeComposer(true)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="modal-btn-create"
                disabled={draftSessionName.trim().length === 0}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={`session-list ${isSelectionMode ? 'is-selection-mode' : ''}`}>
        {sessions.map((session) => (
          <article
            key={session.id}
            className={`session-card session-card-selectable 
              ${activeSessionId === session.id ? 'active' : ''} 
              ${exitingSessionIds.has(session.id) ? 'is-exiting' : ''} 
              ${selectedSessionIds.has(session.id) ? 'is-selected' : ''}
              ${pulsingCardId === session.id ? 'pulse-active' : ''}
              ${bulkExitingIds.has(session.id) ? 'bulk-exiting' : ''}
            `}
            role="button"
            tabIndex={0}
            onMouseDown={() => startLongPress(session.id)}
            onMouseUp={cancelLongPress}
            onMouseLeave={cancelLongPress}
            onTouchStart={() => startLongPress(session.id)}
            onTouchEnd={cancelLongPress}
            onClick={(e) => {
              if (isSelectionMode) {
                e.stopPropagation();
                toggleSelection(session.id);
                return;
              }
              if (exitingSessionIds.has(session.id) || bulkExitingIds.has(session.id)) {
                return;
              }
              onOpen(session.id);
            }}
            onKeyDown={(event) => {
              if (exitingSessionIds.has(session.id) || bulkExitingIds.has(session.id)) {
                return;
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (isSelectionMode) {
                  toggleSelection(session.id);
                } else {
                  onOpen(session.id);
                }
              }
            }}
          >
            <div className="card-checkbox-wrapper">
              <div
                className={`selection-checkbox ${selectedSessionIds.has(session.id) ? 'is-checked' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelection(session.id);
                }}
              >
                {selectedSessionIds.has(session.id) && (
                  <div className="selection-checkbox-inner">
                    <CheckIcon />
                  </div>
                )}
              </div>
            </div>

            <div className="session-doc-icon" aria-hidden="true">
              <SessionDocIcon />
            </div>
            <div className="session-info">
              <strong>{session.title}</strong>
              <span>{formatUpdatedLabel(session.updatedAt)}</span>
            </div>
            <div className="session-card-end">
              <div className="session-card-end-content">
                <span className="session-arrow" aria-hidden="true">›</span>
                <div className="session-row-menu-wrap">
                  <button
                    type="button"
                    className="row-menu-button"
                    aria-label={`Delete ${session.title}`}
                    disabled={exitingSessionIds.has(session.id) || isSelectionMode}
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
            </div>
          </article>
        ))}

        {sessions.length === 0 ? (
          <div className="empty-state sessions-empty-state" role="status">
            <p className="sessions-empty-icon" aria-hidden="true">📄</p>
            <p className="sessions-empty-copy">No sessions yet. Create one to get started.</p>
          </div>
        ) : null}
      </div>

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
            <h3>Delete "{deleteCandidate.title}" ?</h3>
            <p>This cannot be undone.</p>
            <div className="confirm-actions">
              <button
                ref={cancelDeleteRef}
                type="button"
                className="cancel-button"
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

      <div className={`bottom-action-bar ${isSelectionMode ? 'is-visible' : ''}`}>
        <div className={`selection-count ${selectedSessionIds.size > 0 ? 'is-visible' : ''}`}>
          {selectedSessionIds.size} sessions selected
        </div>
        <button
          type="button"
          className={`bulk-delete-button ${selectedSessionIds.size > 0 ? 'is-visible' : ''}`}
          disabled={selectedSessionIds.size === 0}
          onClick={() => setShowBulkDeleteConfirm(true)}
        >
          <TrashIcon />
          Delete {selectedSessionIds.size}
        </button>
      </div>

      {showBulkDeleteConfirm && (
        <div
          className="confirm-backdrop"
          data-state={isBulkDeleteConfirmClosing ? 'closing' : 'open'}
          onClick={() => {
            setIsBulkDeleteConfirmClosing(true);
            setTimeout(() => {
              setShowBulkDeleteConfirm(false);
              setIsBulkDeleteConfirmClosing(false);
            }, 140);
          }}
        >
          <div
            className="confirm-sheet"
            data-state={isBulkDeleteConfirmClosing ? 'closing' : 'open'}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Delete {selectedSessionIds.size} sessions ?</h3>
            <p>This cannot be undone. All selected recordings and scripts will be permanently removed.</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setIsBulkDeleteConfirmClosing(true);
                  setTimeout(() => {
                    setShowBulkDeleteConfirm(false);
                    setIsBulkDeleteConfirmClosing(false);
                  }, 140);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  setIsBulkDeleteConfirmClosing(true);
                  setTimeout(() => {
                    setShowBulkDeleteConfirm(false);
                    setIsBulkDeleteConfirmClosing(false);
                    void handleBulkDelete();
                  }, 140);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
}
