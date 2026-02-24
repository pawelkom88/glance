export interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
}

export interface ScrollState {
  readonly position: number;
  readonly speed: number;
  readonly running: boolean;
}

export interface OverlayPreferences {
  readonly fontScale: number;
  readonly showReadingRuler?: boolean;
}

export interface SessionMeta {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly scroll: ScrollState;
  readonly overlay?: OverlayPreferences;
}

export interface SessionData {
  readonly id: string;
  readonly markdown: string;
  readonly meta: SessionMeta;
}

export interface SectionItem {
  readonly id: string;
  readonly title: string;
  readonly hotkeyIndex: number | null;
  readonly lineIndex: number;
}

export interface ParseWarning {
  readonly code: 'missing-h1' | 'duplicate-heading' | 'hotkeys-limited';
  readonly message: string;
  readonly lineIndex?: number;
}

export interface ParsedMarkdown {
  readonly sections: readonly SectionItem[];
  readonly warnings: readonly ParseWarning[];
}

export interface DisplayLine {
  readonly id: string;
  readonly kind: 'heading' | 'bullet' | 'text' | 'empty';
  readonly text: string;
  readonly sectionIndex: number | null;
  readonly segments?: readonly DisplaySegment[];
}

export interface DisplaySegment {
  readonly id: string;
  readonly kind: 'plain' | 'strong' | 'emphasis' | 'cue';
  readonly text: string;
}

export interface ShortcutEventPayload {
  readonly action:
    | 'toggle-play'
    | 'jump-section'
    | 'speed-change'
    | 'start-over'
    | 'escape-pressed'
    | 'font-scale-change'
    | 'font-scale-reset';
  readonly index?: number;
  readonly delta?: number;
}

export interface MonitorInfo {
  readonly name: string;
  readonly size: string;
  readonly primary: boolean;
}

export interface OverlayBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShowOverlayRequest {
  readonly savedMonitorName: string | null;
  readonly savedBounds: OverlayBounds | null;
  readonly preferTopCenter: boolean;
}

export interface ShowOverlayResult {
  readonly monitorName: string;
  readonly usedSavedBounds: boolean;
}

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  readonly message: string;
  readonly variant: ToastVariant;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
