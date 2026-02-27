import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { loadSession } from '../lib/tauri';
import type { SessionFolder, SessionSummary, ToastVariant } from '../types';

const UNFILED_FOLDER_ID = '__unfiled__';
const TOUCH_CONTEXT_MENU_DELAY_MS = 450;
const POINTER_DRAG_START_THRESHOLD_PX = 6;
const DRAG_CANCEL_CLICK_MS = 180;
const DOUBLE_CLICK_MAX_MS = 320;
const DOUBLE_CLICK_MAX_MOVE_PX = 4;
const COACHMARK_AUTO_DISMISS_MS = 6000;
const COACHMARK_RESHOW_COOLDOWN_HOURS = 24;
const CONFUSION_TRIGGER_COUNT = 2;
const CONFUSION_WINDOW_MS = 10000;
const INTERACTION_MODEL_ACK_KEY = 'glance-sessions-interaction-v2-ack';
const INTERACTION_MODEL_LAST_SHOWN_KEY = 'glance-sessions-interaction-v2-last-shown';
const DEFAULT_FOLDER_NAME_STORAGE_KEY = 'glance-default-folder-name-v1';
const DEFAULT_FOLDER_HIDDEN_STORAGE_KEY = 'glance-default-folder-hidden-v1';

type SortMode = 'updated-desc' | 'updated-asc' | 'name-asc' | 'name-desc' | 'word-desc' | 'word-asc';
type FolderFilter = 'all' | 'none' | string;

const SORT_OPTIONS: ReadonlyArray<{ readonly value: SortMode; readonly label: string }> = [
  { value: 'updated-desc', label: 'Date Modified (Newest)' },
  { value: 'updated-asc', label: 'Date Modified (Oldest)' },
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'word-desc', label: 'Word Count (High-Low)' },
  { value: 'word-asc', label: 'Word Count (Low-High)' }
];

interface LibraryViewProps {
  readonly sessions: readonly SessionSummary[];
  readonly folders: readonly SessionFolder[];
  readonly createSessionRequestToken?: number;
  readonly activeSessionId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onCreate: (name: string, folderId: string | null) => void;
  readonly onDelete: (id: string, notify?: boolean) => void;
  readonly onCreateFolder: (name: string) => void;
  readonly onRenameFolder: (id: string, name: string) => void;
  readonly onDeleteFolder: (id: string) => void;
  readonly onMoveSessions: (sessionIds: readonly string[], folderId: string | null) => Promise<number>;
  readonly onImport: () => void;
  readonly showToast: (message: string, variant?: ToastVariant) => void;
}

interface SessionGroup {
  readonly id: string;
  readonly label: string;
  readonly isBuiltIn: boolean;
  readonly sessions: readonly SessionSummary[];
}

interface DragState {
  readonly status: 'idle' | 'dragging';
  readonly sessionId: string | null;
  readonly sessionTitle: string;
  readonly sourceGroupId: string | null;
  readonly cardHeight: number;
}

interface MoveMenuState {
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly sourceGroupId: string;
  readonly x: number;
  readonly y: number;
}

interface ActiveDragPayload {
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly sourceGroupId: string;
  readonly cardHeight: number;
}

interface PointerDragCandidate {
  readonly pointerId: number;
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly sourceGroupId: string;
  readonly originX: number;
  readonly originY: number;
  readonly cardHeight: number;
  readonly sourceElement: HTMLElement;
  readonly pointerOffsetX: number;
  readonly pointerOffsetY: number;
  readonly started: boolean;
}

interface DragPreviewElements {
  readonly shell: HTMLDivElement;
  readonly card: HTMLDivElement;
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

function NewFolderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3.5 7a2 2 0 0 1 2-2h4.8l1.7 2h6a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-12.5a2 2 0 0 1-2-2V7Z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  );
}

function FilterCheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m4 10.5 3.3 3.4L16 5.8" />
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

function folderIdFromGroupId(groupId: string): string | null {
  return groupId === UNFILED_FOLDER_ID ? null : groupId;
}

function createDragPreview(card: HTMLElement): DragPreviewElements {
  const shell = document.createElement('div');
  shell.className = 'session-drag-preview-shell';

  const previewCard = card.cloneNode(true) as HTMLDivElement;
  const rect = card.getBoundingClientRect();
  const computed = window.getComputedStyle(card);

  previewCard.classList.remove('is-drop-arrival', 'is-drag-origin', 'is-selected', 'active');
  previewCard.classList.add('session-drag-preview-card');
  previewCard.style.width = `${rect.width}px`;
  previewCard.style.height = `${rect.height}px`;
  previewCard.style.margin = '0';
  previewCard.style.boxSizing = 'border-box';
  previewCard.style.borderRadius = computed.borderRadius;

  shell.style.setProperty('--session-drag-preview-x', '-9999px');
  shell.style.setProperty('--session-drag-preview-y', '-9999px');
  shell.appendChild(previewCard);
  document.body.appendChild(shell);

  return { shell, card: previewCard };
}

export function LibraryView(props: LibraryViewProps) {
  const {
    sessions,
    folders,
    createSessionRequestToken = 0,
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
  const [showNewSessionFolderDialog, setShowNewSessionFolderDialog] = useState(false);
  const [newSessionFolderId, setNewSessionFolderId] = useState<string>('none');

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
  const [dragState, setDragState] = useState<DragState>({
    status: 'idle',
    sessionId: null,
    sessionTitle: '',
    sourceGroupId: null,
    cardHeight: 0
  });
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const [recentlyMovedSessionId, setRecentlyMovedSessionId] = useState<string | null>(null);
  const [moveMenu, setMoveMenu] = useState<MoveMenuState | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [defaultFolderName, setDefaultFolderName] = useState('Unfiled');
  const [isDefaultFolderHidden, setIsDefaultFolderHidden] = useState(false);
  const [showInteractionCoachmark, setShowInteractionCoachmark] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listControlsRef = useRef<HTMLDivElement | null>(null);
  const sessionComposerInputRef = useRef<HTMLInputElement | null>(null);
  const folderComposerInputRef = useRef<HTMLInputElement | null>(null);
  const lastCreateSessionRequestTokenRef = useRef(0);
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const dragPreviewCardRef = useRef<HTMLElement | null>(null);
  const dragPreviewFrameRef = useRef<number | null>(null);
  const dragPreviewPositionRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const touchPressTimerRef = useRef<number | null>(null);
  const touchOriginRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextCardClickRef = useRef(false);
  const activeDragRef = useRef<ActiveDragPayload | null>(null);
  const pointerDragCandidateRef = useRef<PointerDragCandidate | null>(null);
  const pointerDragHoverGroupIdRef = useRef<string | null>(null);
  const lastMouseClickRef = useRef<{ sessionId: string | null; at: number; x: number; y: number }>({
    sessionId: null,
    at: 0,
    x: 0,
    y: 0
  });
  const interactionAckRef = useRef(false);
  const confusionTrackerRef = useRef<{ sessionId: string | null; count: number; windowStart: number; lastAt: number }>({
    sessionId: null,
    count: 0,
    windowStart: 0,
    lastAt: 0
  });
  const hasMultipleSessions = sessions.length > 1;
  const hasCustomFolders = folders.length > 0;
  const canMoveSessions = hasCustomFolders;
  const canDragSessions = canMoveSessions && !isSelectionMode && !isTouchDevice;

  const deleteCandidate = sessions.find((session) => session.id === deleteCandidateId) ?? null;
  const folderDeleteCandidate = folders.find((folder) => folder.id === folderDeleteCandidateId) ?? null;
  const unfiledSessionsCount = useMemo(
    () => sessions.filter((session) => session.folderId === null).length,
    [sessions]
  );

  const resolvedFolderRenameCandidate = useMemo(() => {
    if (!folderRenameCandidateId) {
      return null;
    }

    if (folderRenameCandidateId === UNFILED_FOLDER_ID) {
      return {
        id: UNFILED_FOLDER_ID,
        name: defaultFolderName,
        isBuiltIn: true
      } as const;
    }

    const folder = folders.find((entry) => entry.id === folderRenameCandidateId);
    if (!folder) {
      return null;
    }

    return {
      id: folder.id,
      name: folder.name,
      isBuiltIn: false
    } as const;
  }, [defaultFolderName, folderRenameCandidateId, folders]);

  const resolvedFolderDeleteCandidate = useMemo(() => {
    if (!folderDeleteCandidateId) {
      return null;
    }

    if (folderDeleteCandidateId === UNFILED_FOLDER_ID) {
      return {
        id: UNFILED_FOLDER_ID,
        name: defaultFolderName,
        isBuiltIn: true
      } as const;
    }

    if (!folderDeleteCandidate) {
      return null;
    }

    return {
      id: folderDeleteCandidate.id,
      name: folderDeleteCandidate.name,
      isBuiltIn: false
    } as const;
  }, [defaultFolderName, folderDeleteCandidate, folderDeleteCandidateId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(DEFAULT_FOLDER_NAME_STORAGE_KEY)?.trim();
    if (stored) {
      setDefaultFolderName(stored);
    }

    setIsDefaultFolderHidden(window.localStorage.getItem(DEFAULT_FOLDER_HIDDEN_STORAGE_KEY) === '1');
  }, []);

  useEffect(() => {
    if (unfiledSessionsCount === 0 || typeof window === 'undefined') {
      return;
    }

    setIsDefaultFolderHidden(false);
    window.localStorage.removeItem(DEFAULT_FOLDER_HIDDEN_STORAGE_KEY);
  }, [unfiledSessionsCount]);

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
      if (hasMultipleSessions && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
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
  }, [hasMultipleSessions, searchQuery.length, showSearch]);

  useEffect(() => {
    if (hasMultipleSessions) {
      return;
    }

    setShowSearch(false);
    setSearchQuery('');
    setShowListControls(false);
    setFolderFilter('all');
    setShowRecentlyEditedOnly(false);
  }, [hasMultipleSessions]);

  useEffect(() => {
    if (canMoveSessions) {
      return;
    }

    setShowBulkMoveDialog(false);
    setBulkMoveFolderId('none');
  }, [canMoveSessions]);

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
    if (!showNewSessionFolderDialog || newSessionFolderId === 'none') {
      return;
    }

    const folderExists = folders.some((folder) => folder.id === newSessionFolderId);
    if (!folderExists) {
      setNewSessionFolderId(folders[0]?.id ?? 'none');
    }
  }, [folders, newSessionFolderId, showNewSessionFolderDialog]);

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

  useEffect(() => {
    if (!showFolderComposer) {
      return;
    }

    const timer = window.setTimeout(() => {
      folderComposerInputRef.current?.focus();
      folderComposerInputRef.current?.select();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showFolderComposer]);

  useEffect(() => {
    if (createSessionRequestToken <= lastCreateSessionRequestTokenRef.current) {
      return;
    }

    lastCreateSessionRequestTokenRef.current = createSessionRequestToken;

    if (hasCustomFolders) {
      setNewSessionFolderId(folders[0]?.id ?? 'none');
      setShowNewSessionFolderDialog(true);
      return;
    }

    startTransition(() => {
      setNewSessionFolderId('none');
      setDraftSessionName(defaultSessionName());
      setIsCreatingSession(true);
    });
  }, [createSessionRequestToken, folders, hasCustomFolders]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      const hasTouchPoints = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0;
      setIsTouchDevice(hasTouchPoints);
      return;
    }

    const media = window.matchMedia('(pointer: coarse)');
    const syncTouch = () => {
      const hasTouchPoints = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0;
      setIsTouchDevice(media.matches || hasTouchPoints);
    };

    syncTouch();
    media.addEventListener('change', syncTouch);
    return () => {
      media.removeEventListener('change', syncTouch);
    };
  }, []);

  useEffect(() => {
    if (dragState.status !== 'dragging') {
      document.body.classList.remove('is-session-dragging');
      return;
    }

    document.body.classList.add('is-session-dragging');
    return () => {
      document.body.classList.remove('is-session-dragging');
    };
  }, [dragState.status]);

  useEffect(() => {
    if (!recentlyMovedSessionId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRecentlyMovedSessionId(null);
    }, 260);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [recentlyMovedSessionId]);

  useEffect(() => {
    if (!moveMenu) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.session-move-context-menu') || target?.closest('.session-move-menu-trigger')) {
        return;
      }
      setMoveMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoveMenu(null);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [moveMenu]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    interactionAckRef.current = window.localStorage.getItem(INTERACTION_MODEL_ACK_KEY) === '1';
    if (interactionAckRef.current || !hasMultipleSessions) {
      return;
    }

    const rawLastShown = window.localStorage.getItem(INTERACTION_MODEL_LAST_SHOWN_KEY);
    const lastShown = rawLastShown ? Number(rawLastShown) : 0;
    const cooldownMs = COACHMARK_RESHOW_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (Number.isFinite(lastShown) && Date.now() - lastShown < cooldownMs) {
      return;
    }

    setShowInteractionCoachmark(true);
    window.localStorage.setItem(INTERACTION_MODEL_LAST_SHOWN_KEY, String(Date.now()));
  }, [hasMultipleSessions]);

  useEffect(() => {
    if (!showInteractionCoachmark) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowInteractionCoachmark(false);
    }, COACHMARK_AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showInteractionCoachmark]);

  useEffect(() => {
    return () => {
      activeDragRef.current = null;
      pointerDragCandidateRef.current = null;
      pointerDragHoverGroupIdRef.current = null;
      dragPreviewPositionRef.current = null;
      if (dragPreviewRef.current) {
        dragPreviewRef.current.remove();
        dragPreviewRef.current = null;
      }
      dragPreviewCardRef.current = null;
      if (dragPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(dragPreviewFrameRef.current);
      }
      if (touchPressTimerRef.current !== null) {
        window.clearTimeout(touchPressTimerRef.current);
      }
    };
  }, []);

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
  const selectedSortLabel = useMemo(
    () => SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? SORT_OPTIONS[0].label,
    [sortMode]
  );
  const selectedFolderLabel = useMemo(() => {
    if (folderFilter === 'all') {
      return 'All folders';
    }

    if (folderFilter === 'none') {
      return defaultFolderName;
    }

    return folders.find((folder) => folder.id === folderFilter)?.name ?? 'All folders';
  }, [defaultFolderName, folderFilter, folders]);
  const selectedBulkMoveFolderLabel = useMemo(() => {
    if (bulkMoveFolderId === 'none') {
      return defaultFolderName;
    }

    return folders.find((folder) => folder.id === bulkMoveFolderId)?.name ?? defaultFolderName;
  }, [bulkMoveFolderId, defaultFolderName, folders]);
  const selectedNewSessionFolderLabel = useMemo(() => {
    if (newSessionFolderId === 'none') {
      return defaultFolderName;
    }

    return folders.find((folder) => folder.id === newSessionFolderId)?.name ?? defaultFolderName;
  }, [defaultFolderName, folders, newSessionFolderId]);

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
    if (!(isDefaultFolderHidden && unfiled.length === 0)) {
      ordered.push({
        id: UNFILED_FOLDER_ID,
        label: defaultFolderName,
        isBuiltIn: true,
        sessions: unfiled
      });
    }

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

    const byFilter = (() => {
      if (folderFilter === 'all') {
        return ordered;
      }

      if (folderFilter === 'none') {
        return ordered.filter((group) => group.id === UNFILED_FOLDER_ID);
      }

      return ordered.filter((group) => group.id === folderFilter);
    })();

    if (!isSelectionMode) {
      return byFilter;
    }

    return byFilter.filter((group) => group.sessions.length > 0);
  }, [defaultFolderName, folderFilter, folders, isDefaultFolderHidden, isSelectionMode, visibleSessions]);

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

  const clearTouchPressTimer = () => {
    if (touchPressTimerRef.current === null) {
      return;
    }

    window.clearTimeout(touchPressTimerRef.current);
    touchPressTimerRef.current = null;
  };

  const clearDragPreviewFrame = () => {
    if (dragPreviewFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(dragPreviewFrameRef.current);
    dragPreviewFrameRef.current = null;
  };

  const flushDragPreviewPosition = () => {
    dragPreviewFrameRef.current = null;

    const preview = dragPreviewRef.current;
    const pointer = dragPreviewPositionRef.current;
    if (!preview || !pointer) {
      return;
    }

    const x = Math.round(pointer.x - pointer.offsetX);
    const y = Math.round(pointer.y - pointer.offsetY);
    preview.style.setProperty('--session-drag-preview-x', `${x}px`);
    preview.style.setProperty('--session-drag-preview-y', `${y}px`);
  };

  const queueDragPreviewPositionFlush = () => {
    if (dragPreviewFrameRef.current !== null) {
      return;
    }

    dragPreviewFrameRef.current = window.requestAnimationFrame(flushDragPreviewPosition);
  };

  const clearDragPreview = () => {
    clearDragPreviewFrame();
    dragPreviewPositionRef.current = null;

    if (dragPreviewRef.current) {
      dragPreviewRef.current.remove();
      dragPreviewRef.current = null;
    }
    dragPreviewCardRef.current = null;
  };

  const updateDragPreviewPosition = (pointerX: number, pointerY: number, offsetX: number, offsetY: number) => {
    if (!dragPreviewRef.current) {
      return;
    }

    dragPreviewPositionRef.current = {
      x: pointerX,
      y: pointerY,
      offsetX,
      offsetY
    };
    queueDragPreviewPositionFlush();
  };


  const acknowledgeInteractionModel = () => {
    interactionAckRef.current = true;
    setShowInteractionCoachmark(false);
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(INTERACTION_MODEL_ACK_KEY, '1');
  };

  const dismissInteractionCoachmark = () => {
    setShowInteractionCoachmark(false);
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(INTERACTION_MODEL_LAST_SHOWN_KEY, String(Date.now()));
  };

  const maybeTriggerConfusionCoachmark = (sessionId: string) => {
    if (interactionAckRef.current || showInteractionCoachmark || typeof window === 'undefined') {
      return;
    }

    const now = Date.now();
    const tracker = confusionTrackerRef.current;
    if (tracker.sessionId !== sessionId || now - tracker.windowStart > CONFUSION_WINDOW_MS) {
      confusionTrackerRef.current = {
        sessionId,
        count: 1,
        windowStart: now,
        lastAt: now
      };
      return;
    }

    const nextCount = tracker.count + 1;
    confusionTrackerRef.current = {
      sessionId,
      count: nextCount,
      windowStart: tracker.windowStart,
      lastAt: now
    };

    if (nextCount < CONFUSION_TRIGGER_COUNT) {
      return;
    }

    const rawLastShown = window.localStorage.getItem(INTERACTION_MODEL_LAST_SHOWN_KEY);
    const lastShown = rawLastShown ? Number(rawLastShown) : 0;
    const cooldownMs = COACHMARK_RESHOW_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (Number.isFinite(lastShown) && Date.now() - lastShown < cooldownMs) {
      return;
    }

    setShowInteractionCoachmark(true);
    window.localStorage.setItem(INTERACTION_MODEL_LAST_SHOWN_KEY, String(now));
  };

  const openSessionFromList = (sessionId: string) => {
    acknowledgeInteractionModel();
    onOpen(sessionId);
  };

  const folderLabelForGroupId = (groupId: string) => {
    if (groupId === UNFILED_FOLDER_ID) {
      return defaultFolderName;
    }
    return folders.find((folder) => folder.id === groupId)?.name ?? 'folder';
  };

  const openMoveMenuForSession = (
    input: { readonly sessionId: string; readonly sessionTitle: string; readonly sourceGroupId: string },
    origin: { readonly x: number; readonly y: number }
  ) => {
    setMoveMenu({
      sessionId: input.sessionId,
      sessionTitle: input.sessionTitle,
      sourceGroupId: input.sourceGroupId,
      x: origin.x,
      y: origin.y
    });
  };

  const moveSessionWithFeedback = async (input: {
    readonly sessionId: string;
    readonly sessionTitle: string;
    readonly sourceGroupId: string;
    readonly destinationGroupId: string;
    readonly sourceCardHeight: number;
  }) => {
    if (input.sourceGroupId === input.destinationGroupId) {
      return false;
    }

    const movedCount = await onMoveSessions([input.sessionId], folderIdFromGroupId(input.destinationGroupId));
    if (movedCount > 0) {
      showToast(`"${input.sessionTitle}" moved to ${folderLabelForGroupId(input.destinationGroupId)}`, 'success');
      acknowledgeInteractionModel();
      setRecentlyMovedSessionId(input.sessionId);
      return true;
    }

    showToast("Couldn't move session. Try again.", 'error');
    return false;
  };

  const startCreateSessionFlow = () => {
    if (hasCustomFolders) {
      setNewSessionFolderId(folders[0]?.id ?? 'none');
      setShowNewSessionFolderDialog(true);
      return;
    }

    startTransition(() => {
      setNewSessionFolderId('none');
      setDraftSessionName(defaultSessionName());
      setIsCreatingSession(true);
    });
  };

  const createFromDraft = () => {
    const name = draftSessionName.trim();
    if (!name) {
      return;
    }

    onCreate(name, newSessionFolderId === 'none' ? null : newSessionFolderId);
    setDraftSessionName(defaultSessionName());
    setIsCreatingSession(false);
    setNewSessionFolderId('none');
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

  const handleBulkMove = async () => {
    if (!canMoveSessions) {
      return;
    }

    const idsToMove = Array.from(selectedSessionIds);
    const targetFolderId = bulkMoveFolderId === 'none' ? null : bulkMoveFolderId;

    const movedCount = await onMoveSessions(idsToMove, targetFolderId);
    const targetLabel = targetFolderId
      ? folders.find((folder) => folder.id === targetFolderId)?.name ?? 'folder'
      : defaultFolderName;
    if (movedCount > 0) {
      showToast(`Moved ${idsToMove.length} sessions to ${targetLabel}`, 'success');
    } else {
      showToast("Couldn't move selected sessions. Try again.", 'error');
    }

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

  const isDragging = dragState.status === 'dragging' && dragState.sessionId !== null && dragState.sourceGroupId !== null;

  const getKnownActiveDrag = (): ActiveDragPayload | null => {
    if (activeDragRef.current) {
      return activeDragRef.current;
    }

    if (!isDragging || !dragState.sessionId || !dragState.sourceGroupId) {
      return null;
    }

    return {
      sessionId: dragState.sessionId,
      sessionTitle: dragState.sessionTitle,
      sourceGroupId: dragState.sourceGroupId,
      cardHeight: dragState.cardHeight
    };
  };

  const getDropRejectionReason = (
    groupId: string,
    dragPayload: ActiveDragPayload | null = getKnownActiveDrag()
  ): string | null => {
    if (!canDragSessions) {
      return 'drag-disabled';
    }
    if (dragPayload === null) {
      return 'missing-drag-payload';
    }
    if (dragPayload.sourceGroupId === groupId) {
      return `same-source-group(${groupId})`;
    }
    return null;
  };

  const isValidDropTarget = (groupId: string, dragPayload: ActiveDragPayload | null = getKnownActiveDrag()) => (
    getDropRejectionReason(groupId, dragPayload) === null
  );

  const getMenuOptionsForGroup = (sourceGroupId: string) => {
    const options: Array<{ readonly id: string; readonly label: string }> = [
      { id: UNFILED_FOLDER_ID, label: defaultFolderName },
      ...folders.map((folder) => ({ id: folder.id, label: folder.name }))
    ];
    return options.filter((option) => option.id !== sourceGroupId);
  };

  const resetDragInteractionState = () => {
    pointerDragCandidateRef.current = null;
    pointerDragHoverGroupIdRef.current = null;
    activeDragRef.current = null;
    setDropTargetGroupId(null);
    setDragState({
      status: 'idle',
      sessionId: null,
      sessionTitle: '',
      sourceGroupId: null,
      cardHeight: 0
    });
    clearDragPreview();
  };

  const beginPointerDrag = (candidate: PointerDragCandidate) => {
    const payload: ActiveDragPayload = {
      sessionId: candidate.sessionId,
      sessionTitle: candidate.sessionTitle,
      sourceGroupId: candidate.sourceGroupId,
      cardHeight: candidate.cardHeight
    };

    activeDragRef.current = payload;
    const preview = createDragPreview(candidate.sourceElement);
    dragPreviewRef.current = preview.shell;
    dragPreviewCardRef.current = preview.card;
    dragPreviewCardRef.current.classList.add('is-lifted');
    updateDragPreviewPosition(candidate.originX, candidate.originY, candidate.pointerOffsetX, candidate.pointerOffsetY);
    setDragState({
      status: 'dragging',
      sessionId: payload.sessionId,
      sessionTitle: payload.sessionTitle,
      sourceGroupId: payload.sourceGroupId,
      cardHeight: payload.cardHeight
    });
    setDropTargetGroupId(null);
    pointerDragHoverGroupIdRef.current = null;
  };

  const handlePointerDragStart = (
    event: ReactPointerEvent<HTMLElement>,
    input: { readonly sessionId: string; readonly sessionTitle: string; readonly sourceGroupId: string }
  ) => {
    if (!canDragSessions || event.pointerType !== 'mouse' || event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [role="menuitem"], [data-overlay-no-drag="true"]')) {
      return;
    }

    const sourceRect = event.currentTarget.getBoundingClientRect();
    pointerDragCandidateRef.current = {
      pointerId: event.pointerId,
      sessionId: input.sessionId,
      sessionTitle: input.sessionTitle,
      sourceGroupId: input.sourceGroupId,
      originX: event.clientX,
      originY: event.clientY,
      cardHeight: sourceRect.height,
      sourceElement: event.currentTarget,
      pointerOffsetX: event.clientX - sourceRect.left,
      pointerOffsetY: event.clientY - sourceRect.top,
      started: false
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture errors and continue.
    }

  };

  const handlePointerDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const candidate = pointerDragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId || event.pointerType !== 'mouse') {
      return;
    }

    if (!candidate.started) {
      const dx = Math.abs(event.clientX - candidate.originX);
      const dy = Math.abs(event.clientY - candidate.originY);
      if (dx < POINTER_DRAG_START_THRESHOLD_PX && dy < POINTER_DRAG_START_THRESHOLD_PX) {
        return;
      }
      pointerDragCandidateRef.current = {
        ...candidate,
        started: true
      };
      beginPointerDrag({
        ...candidate,
        started: true
      });
      suppressNextCardClickRef.current = true;
      window.setTimeout(() => {
        suppressNextCardClickRef.current = false;
      }, DRAG_CANCEL_CLICK_MS);
    }

    event.preventDefault();
    updateDragPreviewPosition(event.clientX, event.clientY, candidate.pointerOffsetX, candidate.pointerOffsetY);
    const activeDrag = activeDragRef.current;
    if (!activeDrag) {
      return;
    }

    const hovered = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const groupElement = hovered?.closest<HTMLElement>('.session-folder-group');
    const nextGroupId = groupElement?.dataset.groupId ?? null;

    if (
      nextGroupId
      && isValidDropTarget(nextGroupId, activeDrag)
    ) {
      if (dropTargetGroupId !== nextGroupId) {
        setDropTargetGroupId(nextGroupId);
      }
      if (pointerDragHoverGroupIdRef.current !== nextGroupId) {
        pointerDragHoverGroupIdRef.current = nextGroupId;
      }
      return;
    }

    if (dropTargetGroupId !== null) {
      setDropTargetGroupId(null);
    }
    if (pointerDragHoverGroupIdRef.current !== null) {
      pointerDragHoverGroupIdRef.current = null;
    }
  };

  const handlePointerDragEnd = (event: ReactPointerEvent<HTMLElement>, canceled: boolean) => {
    const candidate = pointerDragCandidateRef.current;
    if (!candidate || candidate.pointerId !== event.pointerId || event.pointerType !== 'mouse') {
      return;
    }

    try {
      if (candidate.sourceElement.hasPointerCapture(event.pointerId)) {
        candidate.sourceElement.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore pointer capture errors and continue.
    }

    const activeDrag = activeDragRef.current;
    const destinationGroupId = dropTargetGroupId;
    const shouldMove = !canceled
      && candidate.started
      && activeDrag !== null
      && destinationGroupId !== null
      && isValidDropTarget(destinationGroupId, activeDrag);

    const finalizedDragPayload = activeDrag ? { ...activeDrag } : null;
    const finalizedDestinationGroupId = destinationGroupId;

    resetDragInteractionState();

    if (!shouldMove || !finalizedDragPayload || !finalizedDestinationGroupId) {
      return;
    }

    void (async () => {
      await moveSessionWithFeedback({
        sessionId: finalizedDragPayload.sessionId,
        sessionTitle: finalizedDragPayload.sessionTitle,
        sourceGroupId: finalizedDragPayload.sourceGroupId,
        destinationGroupId: finalizedDestinationGroupId,
        sourceCardHeight: finalizedDragPayload.cardHeight
      });
    })();
  };

  const handleRowClick = (event: ReactMouseEvent<HTMLElement>, sessionId: string) => {
    if (suppressNextCardClickRef.current) {
      suppressNextCardClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isSelectionMode) {
      event.stopPropagation();
      toggleSelection(sessionId);
      return;
    }

    const now = Date.now();
    const previous = lastMouseClickRef.current;
    const distance = Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
    const isDoubleClick = (
      previous.sessionId === sessionId
      && now - previous.at <= DOUBLE_CLICK_MAX_MS
      && distance <= DOUBLE_CLICK_MAX_MOVE_PX
    );

    if (isDoubleClick) {
      lastMouseClickRef.current = { sessionId: null, at: 0, x: 0, y: 0 };
      openSessionFromList(sessionId);
      return;
    }

    lastMouseClickRef.current = {
      sessionId,
      at: now,
      x: event.clientX,
      y: event.clientY
    };
    maybeTriggerConfusionCoachmark(sessionId);
  };

  const handleTouchPressStart = (
    event: ReactPointerEvent<HTMLElement>,
    input: { readonly sessionId: string; readonly sessionTitle: string; readonly sourceGroupId: string }
  ) => {
    if (!isTouchDevice || !canMoveSessions || isSelectionMode || event.pointerType !== 'touch') {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [role="menuitem"], [data-overlay-no-drag="true"]')) {
      return;
    }

    clearTouchPressTimer();
    touchOriginRef.current = { x: event.clientX, y: event.clientY };
    touchPressTimerRef.current = window.setTimeout(() => {
      suppressNextCardClickRef.current = true;
      window.setTimeout(() => {
        suppressNextCardClickRef.current = false;
      }, 700);
      openMoveMenuForSession(input, { x: event.clientX, y: event.clientY });
      touchPressTimerRef.current = null;
    }, TOUCH_CONTEXT_MENU_DELAY_MS);
  };

  const handleTouchPressMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isTouchDevice || event.pointerType !== 'touch' || !touchOriginRef.current) {
      return;
    }

    const dx = Math.abs(event.clientX - touchOriginRef.current.x);
    const dy = Math.abs(event.clientY - touchOriginRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTouchPressTimer();
    }
  };

  const handleTouchPressEnd = () => {
    touchOriginRef.current = null;
    clearTouchPressTimer();
  };

  const moveMenuOptions = moveMenu ? getMenuOptionsForGroup(moveMenu.sourceGroupId) : [];

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
                    setNewSessionFolderId('none');
                    return;
                  }
                  startCreateSessionFlow();
                }}
              >
                <span>+ New Session</span>
              </button>

              {hasMultipleSessions ? (
                <>
                  <button
                    type="button"
                    className={`sessions-inline-icon-button ${showSearch ? 'is-active' : ''}`}
                    aria-label="Search sessions"
                    aria-pressed={showSearch}
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
                      className={`sessions-inline-icon-button ${showListControls ? 'is-active' : ''}`}
                      aria-label="Sort and filter sessions"
                      aria-pressed={showListControls}
                      aria-expanded={showListControls}
                      onClick={() => setShowListControls((previous) => !previous)}
                    >
                      <FilterIcon />
                    </button>

                    <button
                      type="button"
                      className="sessions-inline-icon-button sessions-new-folder-button"
                      aria-label="Create new folder"
                      onClick={() => {
                        setShowFolderComposer(true);
                        setShowListControls(false);
                      }}
                    >
                      <NewFolderIcon />
                    </button>

                    {showListControls ? (
                      <div className="sessions-list-controls-popover" role="dialog" aria-label="Session list controls">
                        <section className="sessions-control-section">
                          <h3 className="sessions-control-label">Sort</h3>
                          <div className="sessions-control-display-row">
                            <span className="sessions-control-value">{selectedSortLabel}</span>
                            <span className="sessions-control-check" aria-hidden="true">
                              <FilterCheckIcon />
                            </span>
                            <select
                              id="sessions-sort-select"
                              className="sessions-control-native-select"
                              aria-label="Sort sessions"
                              value={sortMode}
                              onChange={(event) => setSortMode(event.target.value as SortMode)}
                            >
                              {SORT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </section>

                        <section className="sessions-control-section">
                          <h3 className="sessions-control-label">Folder</h3>
                          <div className="sessions-control-display-row">
                            <span className="sessions-control-value">{selectedFolderLabel}</span>
                            <span className="sessions-control-check" aria-hidden="true">
                              <FilterCheckIcon />
                            </span>
                            <select
                              id="sessions-folder-filter"
                              className="sessions-control-native-select"
                              aria-label="Filter folders"
                              value={folderFilter}
                              onChange={(event) => setFolderFilter(event.target.value)}
                            >
                              <option value="all">All folders</option>
                              <option value="none">{defaultFolderName}</option>
                              {folders.map((folder) => (
                                <option key={folder.id} value={folder.id}>{folder.name}</option>
                              ))}
                            </select>
                          </div>
                        </section>

                        <label className="sessions-toggle-row" htmlFor="sessions-recent-only">
                          <span className="sessions-toggle-label">Recently edited only <br />(7 days)</span>
                          <input
                            id="sessions-recent-only"
                            className="sessions-toggle-switch"
                            type="checkbox"
                            checked={showRecentlyEditedOnly}
                            onChange={(event) => setShowRecentlyEditedOnly(event.target.checked)}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="sessions-select-mode-button tertiary-button"
                    onClick={() => setIsSelectionMode(true)}
                  >
                    Select
                  </button>
                </>
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

      {hasMultipleSessions && showSearch ? (
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

      {showNewSessionFolderDialog ? (
        <div
          className="confirm-backdrop"
          onClick={() => {
            setShowNewSessionFolderDialog(false);
            setNewSessionFolderId('none');
          }}
        >
          <div
            className="confirm-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="New session folder selection"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Where should this session live?</h3>
            <p>Choose a folder before naming your session.</p>
            <label className="move-sheet-label" htmlFor="new-session-folder-select">Folder</label>
            <div className="move-sheet-select-wrap">
              <div className="move-sheet-select-display">
                <span className="move-sheet-select-value">{selectedNewSessionFolderLabel}</span>
                <span className="move-sheet-select-chevron" aria-hidden="true" />
                <select
                  id="new-session-folder-select"
                  className="move-sheet-select-native"
                  aria-label="Session folder"
                  value={newSessionFolderId}
                  onChange={(event) => setNewSessionFolderId(event.target.value)}
                >
                  <option value="none">{defaultFolderName}</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setShowNewSessionFolderDialog(false);
                  setNewSessionFolderId('none');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setShowNewSessionFolderDialog(false);
                  startTransition(() => {
                    setDraftSessionName(defaultSessionName());
                    setIsCreatingSession(true);
                  });
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreatingSession ? (
        <div
          className="modal-overlay"
          onClick={() => {
            setIsCreatingSession(false);
            setNewSessionFolderId('none');
          }}
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
              <button
                type="button"
                className="modal-btn-cancel"
                onClick={() => {
                  setIsCreatingSession(false);
                  setNewSessionFolderId('none');
                }}
              >
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
              ref={folderComposerInputRef}
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

      {resolvedFolderRenameCandidate ? (
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
              if (resolvedFolderRenameCandidate.id === UNFILED_FOLDER_ID) {
                setDefaultFolderName(trimmed);
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(DEFAULT_FOLDER_NAME_STORAGE_KEY, trimmed);
                }
                showToast('Folder renamed', 'success');
              } else {
                onRenameFolder(resolvedFolderRenameCandidate.id, trimmed);
              }
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
        {groupedSessions.map((group, index) => {
          const isCollapsed = collapsedFolderIds.has(group.id);
          const showDropTarget = dropTargetGroupId === group.id && isValidDropTarget(group.id);

          return (
            <section
              key={group.id}
              className={`session-folder-group ${showDropTarget ? 'is-drop-target' : ''}`}
              data-group-id={group.id}
              aria-label={`${group.label} folder`}
            >
              {index === 0 && showInteractionCoachmark && !isSelectionMode ? (
                <div className="session-interaction-coach session-interaction-coach-inline" role="status">
                  <span>Tip: Double-click a session to open it. Drag to move.</span>
                  <button
                    type="button"
                    className="session-interaction-coach-dismiss"
                    onClick={dismissInteractionCoachmark}
                  >
                    Got it
                  </button>
                </div>
              ) : null}
              <div
                className={`session-folder-header ${showDropTarget ? 'is-drop-target' : ''}`}
              >
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
                  {showDropTarget ? (
                    <span className="session-folder-drop-hint" aria-hidden="true">Drop here</span>
                  ) : null}
                </button>

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
              </div>

              {!isCollapsed ? (
                <div
                  id={`folder-group-${group.id}`}
                  className="session-folder-content"
                >
                  {group.sessions.length > 0 ? group.sessions.map((session) => {
                    const wordCount = wordCountBySessionId[session.id] ?? 0;
                    const snippet = previewForContent(sessionContentMap[session.id] ?? '', searchQuery);
                    const selected = selectedSessionIds.has(session.id);
                    const isDragOrigin = isDragging && dragState.sessionId === session.id;

                    return (
                      <article
                        key={session.id}
                        className={`session-card session-card-selectable ${activeSessionId === session.id ? 'active' : ''} ${selected ? 'is-selected' : ''} ${canDragSessions ? 'is-draggable' : ''} ${isDragOrigin ? 'is-drag-origin' : ''} ${recentlyMovedSessionId === session.id ? 'is-drop-arrival' : ''}`}
                        role="button"
                        tabIndex={0}
                        draggable={false}
                        aria-grabbed={canDragSessions ? isDragOrigin : undefined}
                        onPointerDown={(event) => {
                          const payload = {
                            sessionId: session.id,
                            sessionTitle: session.title,
                            sourceGroupId: group.id
                          };
                          handleTouchPressStart(event, payload);
                          handlePointerDragStart(event, payload);
                        }}
                        onPointerMove={(event) => {
                          handleTouchPressMove(event);
                          handlePointerDragMove(event);
                        }}
                        onPointerUp={(event) => {
                          handleTouchPressEnd();
                          handlePointerDragEnd(event, false);
                        }}
                        onPointerCancel={(event) => {
                          handleTouchPressEnd();
                          handlePointerDragEnd(event, true);
                        }}
                        onPointerLeave={handleTouchPressEnd}
                        onContextMenu={(event) => {
                          if (!canMoveSessions || isSelectionMode) {
                            return;
                          }
                          event.preventDefault();
                          event.stopPropagation();
                          openMoveMenuForSession(
                            {
                              sessionId: session.id,
                              sessionTitle: session.title,
                              sourceGroupId: group.id
                            },
                            { x: event.clientX, y: event.clientY }
                          );
                        }}
                        onClick={(event) => handleRowClick(event, session.id)}
                        onKeyDown={(event) => {
                          if (
                            canMoveSessions
                            && !isSelectionMode
                            && (
                              event.key === 'ContextMenu'
                              || (event.shiftKey && event.key === 'F10')
                            )
                          ) {
                            event.preventDefault();
                            const rect = event.currentTarget.getBoundingClientRect();
                            openMoveMenuForSession(
                              {
                                sessionId: session.id,
                                sessionTitle: session.title,
                                sourceGroupId: group.id
                              },
                              { x: rect.left + 10, y: rect.bottom + 8 }
                            );
                            return;
                          }

                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return;
                          }
                          event.preventDefault();
                          if (isSelectionMode) {
                            toggleSelection(session.id);
                            return;
                          }
                          if (event.key === 'Enter') {
                            openSessionFromList(session.id);
                            return;
                          }
                          maybeTriggerConfusionCoachmark(session.id);
                        }}
                      >
                        {canDragSessions ? (
                          <span className="session-drag-handle" aria-hidden="true">⋮⋮</span>
                        ) : null}
                        <div className="card-checkbox-wrapper">
                          <div
                            className={`selection-checkbox ${selected ? 'is-checked' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSelection(session.id);
                            }}
                          >
                            {selected ? (
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

      {moveMenu ? (
        <div
          className="session-move-context-menu"
          role="menu"
          aria-label={`Move ${moveMenu.sessionTitle} to folder`}
          style={{ left: moveMenu.x, top: moveMenu.y }}
        >
          {moveMenuOptions.length > 0 ? moveMenuOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className="session-move-context-item"
              role="menuitem"
              onClick={() => {
                void moveSessionWithFeedback({
                  sessionId: moveMenu.sessionId,
                  sessionTitle: moveMenu.sessionTitle,
                  sourceGroupId: moveMenu.sourceGroupId,
                  destinationGroupId: option.id,
                  sourceCardHeight: dragState.status === 'dragging' ? dragState.cardHeight : 84
                });
                setMoveMenu(null);
              }}
            >
              Move to {option.label}
            </button>
          )) : (
            <div className="session-move-context-empty" role="status">
              No destination folders
            </div>
          )}
        </div>
      ) : null}

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

      {resolvedFolderDeleteCandidate ? (
        <div className="confirm-backdrop" onClick={() => setFolderDeleteCandidateId(null)}>
          <div className="confirm-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>Delete folder "{resolvedFolderDeleteCandidate.name}" ?</h3>
            <p>
              {resolvedFolderDeleteCandidate.id === UNFILED_FOLDER_ID
                ? 'Unfiled can only be removed when empty. It will reappear automatically if a session has no folder.'
                : sessions.some((session) => session.folderId === resolvedFolderDeleteCandidate.id)
                  ? `Sessions in this folder will be moved to ${defaultFolderName}.`
                  : 'This folder is empty and will be removed.'}
            </p>
            <div className="confirm-actions">
              <button type="button" className="cancel-button" onClick={() => setFolderDeleteCandidateId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={resolvedFolderDeleteCandidate.id === UNFILED_FOLDER_ID && unfiledSessionsCount > 0}
                onClick={() => {
                  if (resolvedFolderDeleteCandidate.id === UNFILED_FOLDER_ID) {
                    setIsDefaultFolderHidden(true);
                    if (typeof window !== 'undefined') {
                      window.localStorage.setItem(DEFAULT_FOLDER_HIDDEN_STORAGE_KEY, '1');
                    }
                    showToast('Folder deleted', 'success');
                  } else {
                    onDeleteFolder(resolvedFolderDeleteCandidate.id);
                  }
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
          {canMoveSessions ? (
            <button
              type="button"
              className={`bulk-move-button ${selectionCount > 0 ? 'is-visible' : ''}`}
              disabled={selectionCount === 0}
              onClick={() => setShowBulkMoveDialog(true)}
            >
              Move {selectionCount}
            </button>
          ) : null}
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

      {canMoveSessions && showBulkMoveDialog ? (
        <div className="confirm-backdrop" onClick={() => setShowBulkMoveDialog(false)}>
          <div className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <h3>Move {selectionCount} sessions</h3>
            <p>Select a destination folder.</p>
            <label className="move-sheet-label" htmlFor="bulk-move-folder-select">Destination</label>
            <div className="move-sheet-select-wrap">
              <div className="move-sheet-select-display">
                <span className="move-sheet-select-value">{selectedBulkMoveFolderLabel}</span>
                <span className="move-sheet-select-chevron" aria-hidden="true" />
                <select
                  id="bulk-move-folder-select"
                  className="move-sheet-select-native"
                  value={bulkMoveFolderId}
                  onChange={(event) => setBulkMoveFolderId(event.target.value)}
                >
                  <option value="none">{defaultFolderName}</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </div>
            </div>
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
