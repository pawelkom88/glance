export interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string;
  readonly folderId?: string | null;
  readonly wordCount?: number;
}

export interface SessionFolder {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
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
  readonly folderId?: string | null;
  readonly wordCount?: number;
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
  | 'hide-overlay'
  | 'snap-to-center'
  | 'toggle-controls'
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

export interface DetectedMonitor {
  readonly name: string;
  readonly displayName: string;
  readonly width: number;
  readonly height: number;
  readonly compositeKey: string;
  readonly scaleFactor: number;
  readonly isPrimary: boolean;
  readonly positionX: number;
  readonly positionY: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
}

export interface MonitorChangedPayload {
  readonly name: string;
  readonly displayName: string;
  readonly width: number;
  readonly height: number;
  readonly compositeKey: string;
}

export interface MonitorInfo {
  readonly id: string;
  readonly name: string;
  readonly size: string;
  readonly origin: string;
  readonly primary: boolean;
}

export interface OverlayBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ShowOverlayResult {
  readonly monitorName: string;
  readonly usedSavedBounds: boolean;
}

export type AppLicenseState = 'unlicensed' | 'licensed';

export interface AppLicenseStatus {
  readonly state: AppLicenseState;
  readonly licenseId: string | null;
}

export interface AppActivationRecord {
  readonly licenseId: string;
  readonly deviceId: string;
  readonly platform: 'macos' | 'windows';
  readonly activatedAt: string;
  readonly activationToken?: string | null;
}

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  readonly message: string;
  readonly variant: ToastVariant;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
