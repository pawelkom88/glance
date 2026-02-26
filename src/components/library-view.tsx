import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { loadSession } from '../lib/tauri';
import type { SessionFolder, SessionSummary, ToastVariant } from '../types';

const UNFILED_FOLDER_ID = '__unfiled__';

type SortMode = 'updated-desc' | 'updated-asc' | 'name-asc' | 'name-desc' | 'word-desc' | 'word-asc';
type FolderFilter = 'all' | 'none' | string;

interface LibraryViewProps {
  readonly sessions: readonly SessionSummary[];
  readonly folders: readonly SessionFolder[];
  readonly activeSessionId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onCreate: (name: string) => void;
  readonly onDelete: (id: string, notify?: boolean) => void;
  readonly onCreateFolder: (name: string) => void;
  readonly onRenameFolder: (id: string, name: string) => void;
  readonly onDeleteFolder: (id: string) => void;
  readonly onMoveSessions: (sessionIds: readonly string[], folderId: string | null) => void;
  readonly onImport: () => void;
  readonly showToast: (message: string, variant?: ToastVariant) => void;
}

interface SessionGroup {
  readonly id: string;
  readonly label: string;
  readonly isBuiltIn: boolean;
  readonly sessions: readonly SessionSummary[];
}

function defaultSessionName(): string {
  const now = new Date();
  const day = now.getDate();
  const month = now.toLocaleDateString('en-GB', { month: 'short' });
  const year = now.getFullYear();
  return `Session ${day} ${month} ${year}`;
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

function countWords(markdown: string): number {
  if (!markdown.trim()) {
    return 0;
  }

  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.2 16.2 4 4" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.5 7a2 2 0 0 1 2-2h4.8l1.7 2h6a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-12.5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
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

function ChevronIcon({ expanded }: { readonly expanded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {expanded ? <path d="m5 7 5 6 5-6" /> : <path d="m7 5 6 5-6 5" />}
    </svg>
  );
}

function renderHighlightedText(text: string, query: string) {
  if (!query.trim()) {
    return <>{text}</>;
  }

  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => escapeRegExp(token));

  if (tokens.length === 0) {
    return <>{text}</>;
  }

  const matcher = new RegExp(`(${tokens.join('|')})`, 'ig');
  const parts = text.split(matcher);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) {
          return null;
        }

        const matched = tokens.some((token) => new RegExp(`^${token}$`, 'i').test(part));
        if (!matched) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }

        return (
          <mark key={`${part}-${index}`} className="sessions-search-highlight">
            {part}
          </mark>
        );
      })}
    </>
  );
}

function previewForContent(markdown: string, query: string): string | null {
  if (!query.trim()) {
    return null;
  }

  const normalized = markdown.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  const queryTerms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (queryTerms.length === 0) {
    return null;
  }

  const index = queryTerms
    .map((term) => normalized.toLowerCase().indexOf(term))
    .filter((matchIndex) => matchIndex >= 0)
    .sort((left, right) => left - right)[0];

  if (typeof index !== 'number') {
    return null;
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(normalized.length, index + 120);
  const snippet = normalized.slice(start, end).trim();

  const prefix = start > 0 ? '…' : '';
  const suffix = end < normalized.length ? '…' : '';
  return `${prefix}${snippet}${suffix}`;
}

export function LibraryView(props: LibraryViewProps) {
  const {
    sessions,
    folders,
    activeSessionId,
    onOpen,
    onCreate,
    onDelete,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveSessions,
    onImport,
    showToast
  } = props;

  const [draftSessionName, setDraftSessionName] = useState(defaultSessionName());
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showBulkMoveDialog, setShowBulkMoveDialog] = useState(false);
  const [bulkMoveFolderId, setBulkMoveFolderId] = useState<string>('none');

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showListControls, setShowListControls] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('updated-desc');
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [showRecentlyEditedOnly, setShowRecentlyEditedOnly] = useState(false);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());

  const [showFolderComposer, setShowFolderComposer] = useState(false);
  const [draftFolderName, setDraftFolderName] = useState('');
  const [folderRenameCandidateId, setFolderRenameCandidateId] = useState<string | null>(null);
  const [folderRenameDraft, setFolderRenameDraft] = useState('');
  const [folderDeleteCandidateId, setFolderDeleteCandidateId] = useState<string | null>(null);

  const [sessionContentMap, setSessionContentMap] = useState<Record<string, string>>({});

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listControlsRef = useRef<HTMLDivElement | null>(null);
  const sessionComposerInputRef = useRef<HTMLInputElement | null>(null);

  const deleteCandidate = sessions.find((session) => session.id === deleteCandidateId) ?? null;
  const folderRenameCandidate = folders.find((folder) => folder.id === folderRenameCandidateId) ?? null;
  const folderDeleteCandidate = folders.find((folder) => folder.id === folderDeleteCandidateId) ?? null;

  useEffect(() => {
    const liveSessionIds = new Set(sessions.map((session) => session.id));
    setSelectedSessionIds((previous) => {
      const next = new Set<string>();
      previous.forEach((id) => {
        if (liveSessionIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
    setSessionContentMap((previous) => {
      const next: Record<string, string> = {};
      sessions.forEach((session) => {
        if (typeof previous[session.id] === 'string') {
          next[session.id] = previous[session.id];
        }
      });
      return next;
    });
  }, [sessions]);

  useEffect(() => {
    const missingIds = sessions
      .map((session) => session.id)
      .filter((id) => sessionContentMap[id] === undefined);

    if (missingIds.length === 0) {
      return;
    }

    let active = true;
    void (async () => {
      const loadedEntries = await Promise.all(
        missingIds.map(async (sessionId) => {
          try {
            const loaded = await loadSession(sessionId);
            return [sessionId, loaded.markdown] as const;
          } catch {
            return [sessionId, ''] as const;
          }
        })
      );

      if (!active) {
        return;
      }

      setSessionContentMap((previous) => {
        const next = { ...previous };
        loadedEntries.forEach(([id, markdown]) => {
          next[id] = markdown;
        });
        return next;
      });
    })();

    return () => {
      active = false;
    };
  }, [sessionContentMap, sessions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setShowSearch(true);
        window.setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 0);
        return;
      }

      if (event.key === 'Escape' && showSearch && searchQuery.length === 0) {
        setShowSearch(false);
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, [searchQuery.length, showSearch]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (showListControls && listControlsRef.current && !listControlsRef.current.contains(target)) {
        setShowListControls(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showListControls]);

  useEffect(() => {
    if (!isCreatingSession) {
      return;
    }

    const timer = window.setTimeout(() => {
      sessionComposerInputRef.current?.focus();
      sessionComposerInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isCreatingSession]);

  const wordCountBySessionId = useMemo(() => {
    const result: Record<string, number> = {};
    sessions.forEach((session) => {
      if (typeof session.wordCount === 'number' && Number.isFinite(session.wordCount)) {
        result[session.id] = session.wordCount;
        return;
      }
      result[session.id] = countWords(sessionContentMap[session.id] ?? '');
    });
    return result;
  }, [sessionContentMap, sessions]);

  const visibleSessions = useMemo(() => {
    const queryTerms = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const now = Date.now();
    const recentThresholdMs = 7 * 24 * 60 * 60 * 1000;

    const filtered = sessions.filter((session) => {
      if (folderFilter !== 'all') {
        if (folderFilter === 'none' && session.folderId) {
          return false;
        }
        if (folderFilter !== 'none' && session.folderId !== folderFilter) {
          return false;
        }
      }

      if (showRecentlyEditedOnly) {
        const updated = new Date(session.updatedAt).getTime();
        if (!Number.isFinite(updated) || now - updated > recentThresholdMs) {
          return false;
        }
      }

      if (queryTerms.length === 0) {
        return true;
      }

      const haystacks = `${session.title}\n${sessionContentMap[session.id] ?? ''}`.toLowerCase();
      return queryTerms.every((term) => haystacks.includes(term));
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (sortMode === 'name-asc') {
        return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
      }

      if (sortMode === 'name-desc') {
        return right.title.localeCompare(left.title, undefined, { sensitivity: 'base' });
      }

      if (sortMode === 'updated-asc') {
        return left.updatedAt.localeCompare(right.updatedAt);
      }

      if (sortMode === 'word-desc') {
        return (wordCountBySessionId[right.id] ?? 0) - (wordCountBySessionId[left.id] ?? 0);
      }

      if (sortMode === 'word-asc') {
        return (wordCountBySessionId[left.id] ?? 0) - (wordCountBySessionId[right.id] ?? 0);
      }

      return right.updatedAt.localeCompare(left.updatedAt);
    });

    return sorted;
  }, [folderFilter, searchQuery, sessionContentMap, sessions, showRecentlyEditedOnly, sortMode, wordCountBySessionId]);

  const visibleSessionIds = useMemo(() => visibleSessions.map((session) => session.id), [visibleSessions]);

  const groupedSessions = useMemo(() => {
    const byFolder = new Map<string, SessionSummary[]>();
    folders.forEach((folder) => {
      byFolder.set(folder.id, []);
    });
    byFolder.set(UNFILED_FOLDER_ID, []);

    visibleSessions.forEach((session) => {
      const key = session.folderId ?? UNFILED_FOLDER_ID;
      const bucket = byFolder.get(key);
      if (bucket) {
        bucket.push(session);
      } else {
        byFolder.set(UNFILED_FOLDER_ID, [session]);
      }
    });

    const ordered: SessionGroup[] = [];

    const unfiled = byFolder.get(UNFILED_FOLDER_ID) ?? [];
    ordered.push({
      id: UNFILED_FOLDER_ID,
      label: 'Unfiled',
      isBuiltIn: true,
      sessions: unfiled
    });

    folders
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
      .forEach((folder) => {
        ordered.push({
          id: folder.id,
          label: folder.name,
          isBuiltIn: false,
          sessions: byFolder.get(folder.id) ?? []
        });
      });

    if (folderFilter === 'all') {
      return ordered;
    }

    if (folderFilter === 'none') {
      return ordered.filter((group) => group.id === UNFILED_FOLDER_ID);
    }

    return ordered.filter((group) => group.id === folderFilter);
  }, [folderFilter, folders, visibleSessions]);

  const selectionCount = selectedSessionIds.size;
  const isAllSelected = visibleSessionIds.length > 0 && visibleSessionIds.every((id) => selectedSessionIds.has(id));

  const toggleSelection = (sessionId: string) => {
    setSelectedSessionIds((previous) => {
      const next = new Set(previous);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedSessionIds(new Set(visibleSessionIds));
  };

  const deselectAll = () => {
    setSelectedSessionIds(new Set());
  };

  const createFromDraft = () => {
    const name = draftSessionName.trim();
    if (!name) {
      return;
    }

    onCreate(name);
    setDraftSessionName(defaultSessionName());
    setIsCreatingSession(false);
  };

  const createFolderFromDraft = () => {
    const name = draftFolderName.trim();
    if (!name) {
      return;
    }

    onCreateFolder(name);
    setDraftFolderName('');
    setShowFolderComposer(false);
  };

  const handleBulkDelete = () => {
    const idsToDelete = Array.from(selectedSessionIds);
    idsToDelete.forEach((id) => {
      onDelete(id, false);
    });
    showToast(`${idsToDelete.length} sessions deleted`, 'success');
    setShowBulkDeleteConfirm(false);
    setSelectedSessionIds(new Set());
    setIsSelectionMode(false);
  };

  const handleBulkMove = () => {
    const idsToMove = Array.from(selectedSessionIds);
    const targetFolderId = bulkMoveFolderId === 'none' ? null : bulkMoveFolderId;

    onMoveSessions(idsToMove, targetFolderId);
    const targetLabel = targetFolderId
      ? folders.find((folder) => folder.id === targetFolderId)?.name ?? 'folder'
      : 'Unfiled';
    showToast(`Moved ${idsToMove.length} sessions to ${targetLabel}`, 'success');

    setShowBulkMoveDialog(false);
    setSelectedSessionIds(new Set());
    setIsSelectionMode(false);
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedFolderIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

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
                type="button"
                className="sessions-new-button"
                aria-expanded={isCreatingSession}
                onClick={() => {
                  if (isCreatingSession) {
                    setIsCreatingSession(false);
                    return;
                  }

                  startTransition(() => {
                    setDraftSessionName(defaultSessionName());
                    setIsCreatingSession(true);
                  });
                }}
              >
                <span>+ New Session</span>
              </button>

              <button
                type="button"
                className="sessions-inline-icon-button"
                aria-label="Search sessions"
                onClick={() => {
                  setShowSearch((previous) => !previous);
                  window.setTimeout(() => {
                    searchInputRef.current?.focus();
                    searchInputRef.current?.select();
                  }, 0);
                }}
              >
                <SearchIcon />
              </button>

              <div className="sessions-list-controls-wrap" ref={listControlsRef}>
                <button
                  type="button"
                  className="sessions-inline-icon-button"
                  aria-label="Sort and filter sessions"
                  aria-expanded={showListControls}
                  onClick={() => setShowListControls((previous) => !previous)}
                >
                  <FilterIcon />
                </button>

                {showListControls ? (
                  <div className="sessions-list-controls-popover" role="dialog" aria-label="Session list controls">
                    <label className="sessions-control-label" htmlFor="sessions-sort-select">Sort</label>
                    <select
                      id="sessions-sort-select"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                    >
                      <option value="updated-desc">Date Modified (Newest)</option>
                      <option value="updated-asc">Date Modified (Oldest)</option>
                      <option value="name-asc">Name (A-Z)</option>
                      <option value="name-desc">Name (Z-A)</option>
                      <option value="word-desc">Word Count (High-Low)</option>
                      <option value="word-asc">Word Count (Low-High)</option>
                    </select>

                    <label className="sessions-control-label" htmlFor="sessions-folder-filter">Folder</label>
                    <select
                      id="sessions-folder-filter"
                      value={folderFilter}
                      onChange={(event) => setFolderFilter(event.target.value)}
                    >
                      <option value="all">All folders</option>
                      <option value="none">Unfiled</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>

                    <label className="sessions-checkbox-row" htmlFor="sessions-recent-only">
                      <input
                        id="sessions-recent-only"
                        type="checkbox"
                        checked={showRecentlyEditedOnly}
                        onChange={(event) => setShowRecentlyEditedOnly(event.target.checked)}
                      />
                      <span>Show only recently edited (7 days)</span>
                    </label>

                    <button
                      type="button"
                      className="sessions-new-folder-inline"
                      onClick={() => {
                        setShowFolderComposer(true);
                        setShowListControls(false);
                      }}
                    >
                      + New Folder
                    </button>
                  </div>
                ) : null}
              </div>

              {sessions.length > 1 ? (
                <button
                  type="button"
                  className="sessions-select-mode-button tertiary-button"
                  onClick={() => setIsSelectionMode(true)}
                >
                  Select
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              className="sessions-cancel-selection-button"
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedSessionIds(new Set());
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </header>

      {showSearch ? (
        <div className="sessions-search-row">
          <label className="sr-only" htmlFor="sessions-search-field">Search sessions</label>
          <input
            ref={searchInputRef}
            id="sessions-search-field"
            type="search"
            className="sessions-search-input"
            placeholder="Search titles and script content"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      ) : null}

      <div className={`select-all-row ${isSelectionMode ? 'is-visible' : ''}`}>
        <div
          className={`selection-checkbox ${isAllSelected ? 'is-checked' : ''}`}
          onClick={() => {
            if (isAllSelected) {
              deselectAll();
            } else {
              selectAllVisible();
            }
          }}
        >
          {isAllSelected ? (
            <div className="selection-checkbox-inner">
              <CheckIcon />
            </div>
          ) : null}
        </div>
        <span
          className="select-all-label"
          onClick={() => {
            if (isAllSelected) {
              deselectAll();
            } else {
              selectAllVisible();
            }
          }}
        >
          {isAllSelected ? 'Deselect All' : 'Select All'}
        </span>
      </div>

      {isCreatingSession ? (
        <div className="modal-overlay" onClick={() => setIsCreatingSession(false)}>
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
              ref={sessionComposerInputRef}
              type="text"
              className="modal-input"
              value={draftSessionName}
              maxLength={60}
              placeholder="e.g. Q2 Sales Call, Podcast Intro..."
              onChange={(event) => setDraftSessionName(event.target.value)}
              aria-label="Session name"
            />
            <div className={`modal-char-count${draftSessionName.length >= 50 ? ' warn' : ''}`}>
              {draftSessionName.length} / 60
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => setIsCreatingSession(false)}>
                Cancel
              </button>
              <button type="submit" className="modal-btn-create" disabled={draftSessionName.trim().length === 0}>
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showFolderComposer ? (
        <div className="modal-overlay" onClick={() => setShowFolderComposer(false)}>
          <form
            className="modal-sheet"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              createFolderFromDraft();
            }}
          >
            <div className="modal-title">New Folder</div>
            <div className="modal-subtitle">Organize your sessions in a folder.</div>
            <input
              type="text"
              className="modal-input"
              value={draftFolderName}
              maxLength={60}
              placeholder="e.g. Client Calls"
              onChange={(event) => setDraftFolderName(event.target.value)}
              aria-label="Folder name"
            />
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => setShowFolderComposer(false)}>
                Cancel
              </button>
              <button type="submit" className="modal-btn-create" disabled={draftFolderName.trim().length === 0}>
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {folderRenameCandidate ? (
        <div className="modal-overlay" onClick={() => setFolderRenameCandidateId(null)}>
          <form
            className="modal-sheet"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = folderRenameDraft.trim();
              if (!trimmed) {
                return;
              }
              onRenameFolder(folderRenameCandidate.id, trimmed);
              setFolderRenameCandidateId(null);
            }}
          >
            <div className="modal-title">Rename Folder</div>
            <input
              type="text"
              className="modal-input"
              value={folderRenameDraft}
              maxLength={60}
              onChange={(event) => setFolderRenameDraft(event.target.value)}
              aria-label="Rename folder"
            />
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => setFolderRenameCandidateId(null)}>
                Cancel
              </button>
              <button type="submit" className="modal-btn-create" disabled={folderRenameDraft.trim().length === 0}>
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className={`session-list ${isSelectionMode ? 'is-selection-mode' : ''}`}>
        {groupedSessions.map((group) => {
          const isCollapsed = collapsedFolderIds.has(group.id);
          const groupIsRealFolder = !group.isBuiltIn;

          return (
            <section key={group.id} className="session-folder-group" aria-label={`${group.label} folder`}>
              <div className="session-folder-header">
                <button
                  type="button"
                  className="session-folder-toggle"
                  onClick={() => toggleGroupCollapsed(group.id)}
                  aria-expanded={!isCollapsed}
                  aria-controls={`folder-group-${group.id}`}
                >
                  <span className="session-folder-chevron" aria-hidden="true">
                    <ChevronIcon expanded={!isCollapsed} />
                  </span>
                  <span className="session-folder-icon" aria-hidden="true">
                    <FolderIcon />
                  </span>
                  <span className="session-folder-label">{group.label}</span>
                  <span className="session-folder-count">{group.sessions.length}</span>
                </button>

                {groupIsRealFolder ? (
                  <div className="session-folder-actions">
                    <button
                      type="button"
                      className="session-folder-action"
                      onClick={() => {
                        setFolderRenameCandidateId(group.id);
                        setFolderRenameDraft(group.label);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="session-folder-action danger"
                      onClick={() => setFolderDeleteCandidateId(group.id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              {!isCollapsed ? (
                <div id={`folder-group-${group.id}`} className="session-folder-content">
                  {group.sessions.length > 0 ? group.sessions.map((session) => {
                    const wordCount = wordCountBySessionId[session.id] ?? 0;
                    const snippet = previewForContent(sessionContentMap[session.id] ?? '', searchQuery);

                    return (
                      <article
                        key={session.id}
                        className={`session-card session-card-selectable ${activeSessionId === session.id ? 'active' : ''} ${selectedSessionIds.has(session.id) ? 'is-selected' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          if (isSelectionMode) {
                            event.stopPropagation();
                            toggleSelection(session.id);
                            return;
                          }
                          onOpen(session.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return;
                          }
                          event.preventDefault();
                          if (isSelectionMode) {
                            toggleSelection(session.id);
                            return;
                          }
                          onOpen(session.id);
                        }}
                      >
                        <div className="card-checkbox-wrapper">
                          <div
                            className={`selection-checkbox ${selectedSessionIds.has(session.id) ? 'is-checked' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSelection(session.id);
                            }}
                          >
                            {selectedSessionIds.has(session.id) ? (
                              <div className="selection-checkbox-inner">
                                <CheckIcon />
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="session-doc-icon" aria-hidden="true">
                          <SessionDocIcon />
                        </div>
                        <div className="session-info">
                          <strong>{renderHighlightedText(session.title, searchQuery)}</strong>
                          <span>{formatUpdatedLabel(session.updatedAt)} · {wordCount} words</span>
                          {snippet ? (
                            <p className="session-search-snippet">
                              {renderHighlightedText(snippet, searchQuery)}
                            </p>
                          ) : null}
                        </div>
                        <div className="session-card-end">
                          <div className="session-card-end-content">
                            <span className="session-arrow" aria-hidden="true">›</span>
                            <div className="session-row-menu-wrap">
                              <button
                                type="button"
                                className="row-menu-button"
                                aria-label={`Delete ${session.title}`}
                                disabled={isSelectionMode}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteCandidateId(session.id);
                                }}
                              >
                                <TrashIcon />
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  }) : (
                    <div className="empty-state session-folder-empty-state" role="status">
                      <p className="sessions-empty-copy">No sessions in this folder.</p>
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}

        {visibleSessions.length === 0 ? (
          <div className="empty-state sessions-empty-state" role="status">
            <p className="sessions-empty-icon" aria-hidden="true">📄</p>
            <p className="sessions-empty-copy">
              {searchQuery.trim().length > 0
                ? 'No sessions match your search.'
                : 'No sessions yet. Create one to get started.'}
            </p>
          </div>
        ) : null}
      </div>

      {deleteCandidate ? (
        <div className="confirm-backdrop" onClick={() => setDeleteCandidateId(null)}>
          <div
            className="confirm-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Delete session confirmation"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Delete "{deleteCandidate.title}" ?</h3>
            <p>This cannot be undone.</p>
            <div className="confirm-actions">
              <button type="button" className="cancel-button" onClick={() => setDeleteCandidateId(null)}>
                Cancel
              </button>
              <button
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

      {folderDeleteCandidate ? (
        <div className="confirm-backdrop" onClick={() => setFolderDeleteCandidateId(null)}>
          <div className="confirm-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Delete folder "{folderDeleteCandidate.name}" ?</h3>
            <p>
              {sessions.some((session) => session.folderId === folderDeleteCandidate.id)
                ? 'Sessions in this folder will be moved to Unfiled.'
                : 'This folder is empty and will be removed.'}
            </p>
            <div className="confirm-actions">
              <button type="button" className="cancel-button" onClick={() => setFolderDeleteCandidateId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  onDeleteFolder(folderDeleteCandidate.id);
                  setFolderDeleteCandidateId(null);
                }}
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`bottom-action-bar ${isSelectionMode ? 'is-visible' : ''}`}>
        <div className={`selection-count ${selectionCount > 0 ? 'is-visible' : ''}`}>
          {selectionCount} sessions selected
        </div>
        <div className="bulk-action-buttons">
          <button
            type="button"
            className={`bulk-move-button ${selectionCount > 0 ? 'is-visible' : ''}`}
            disabled={selectionCount === 0}
            onClick={() => setShowBulkMoveDialog(true)}
          >
            Move {selectionCount}
          </button>
          <button
            type="button"
            className={`bulk-delete-button ${selectionCount > 0 ? 'is-visible' : ''}`}
            disabled={selectionCount === 0}
            onClick={() => setShowBulkDeleteConfirm(true)}
          >
            <TrashIcon />
            Delete {selectionCount}
          </button>
        </div>
      </div>

      {showBulkDeleteConfirm ? (
        <div className="confirm-backdrop" onClick={() => setShowBulkDeleteConfirm(false)}>
          <div className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <h3>Delete {selectionCount} sessions ?</h3>
            <p>This cannot be undone. All selected recordings and scripts will be permanently removed.</p>
            <div className="confirm-actions">
              <button type="button" className="cancel-button" onClick={() => setShowBulkDeleteConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={handleBulkDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBulkMoveDialog ? (
        <div className="confirm-backdrop" onClick={() => setShowBulkMoveDialog(false)}>
          <div className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <h3>Move {selectionCount} sessions</h3>
            <p>Select a destination folder.</p>
            <label className="sessions-control-label" htmlFor="bulk-move-folder-select">Destination</label>
            <select
              id="bulk-move-folder-select"
              value={bulkMoveFolderId}
              onChange={(event) => setBulkMoveFolderId(event.target.value)}
            >
              <option value="none">Unfiled</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </select>
            <div className="confirm-actions">
              <button type="button" className="cancel-button" onClick={() => setShowBulkMoveDialog(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={handleBulkMove}>
                Move
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
