import { parseMarkdown } from '../../../lib/markdown';
import { useAppStore } from '../../../store/use-app-store';
import type { SessionSummary } from '../../../types';

interface ResetAppStateOptions {
  readonly sessions?: readonly SessionSummary[];
  readonly activeSessionId?: string | null;
  readonly markdown?: string;
}

export function resetAppState(options: ResetAppStateOptions = {}): void {
  const sessions = options.sessions ?? [];
  const markdown = options.markdown ?? '# Intro\n\nStart here';
  const activeSessionId = options.activeSessionId !== undefined
    ? options.activeSessionId
    : (sessions[0]?.id ?? null);

  useAppStore.setState({
    initialized: true,
    hasCompletedOnboarding: true,
    sessions,
    folders: [],
    activeSessionId,
    activeSessionTitle: sessions.find((session) => session.id === activeSessionId)?.title ?? 'Untitled Session',
    markdown,
    parseWarnings: parseMarkdown(markdown).warnings,
    toastMessage: null,
    playbackState: 'paused',
    scrollPosition: 0,
    scrollSpeed: 1,
    overlayFontScale: 1,
    showReadingRuler: true,
    dimLevel: 1,
    isControlsCollapsed: false,
    themeMode: 'system',
    resolvedTheme: 'light',
    language: 'en',
    resolvedLanguage: 'en'
  });
}
