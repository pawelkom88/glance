export type AppLanguage = 'en' | 'fr' | 'es' | 'pl' | 'de';
export type ResolvedLanguage = 'en' | 'fr' | 'es' | 'pl' | 'de';

export interface LanguageOption {
  readonly code: AppLanguage;
  readonly englishName: string;
  readonly nativeName: string;
  readonly localeTag: string;
}

export interface TranslationCatalog {
  readonly editor: {
    readonly headerLabel: string;
    readonly createFirstSessionTitle: string;
    readonly importMarkdown: string;
    readonly newSession: string;
    readonly noSessionsYetTitle: string;
    readonly noSessionsYetCopy: string;
    readonly selectSessionTitle: string;
    readonly goToSessions: string;
    readonly noSessionSelectedTitle: string;
    readonly noSessionSelectedCopy: string;
    readonly breadcrumbSessions: string;
    readonly autosaveSaving: string;
    readonly uncommittedChangesToast: string;
    readonly exportSessionTitle: string;
    readonly exportMarkdownFilter: string;
    readonly exportSuccessToast: string;
    readonly exportErrorNoSessionToast: string;
    readonly exportErrorDesktopOnlyToast: string;
    readonly launchErrorToast: string;
    readonly autosaveSaved: string;
    readonly launch: string;
    readonly export: string;
    readonly infoSections: string;
    readonly infoWords: string;
    readonly infoEstimatedRead: string;
    readonly estimateReadSeconds: (params: { readonly seconds: number }) => string;
    readonly estimateReadMinutes: (params: { readonly minutes: number; readonly seconds: number }) => string;
    readonly wordCountApprox: (params: { readonly count: number }) => string;
    readonly statusMarkdown: string;
    readonly statusEncoding: string;
    readonly statusWordCount: (params: { readonly count: number }) => string;
    readonly actions: string;
    readonly launchPrompter: string;
    readonly exportMarkdown: string;
    readonly scriptInfo: string;
  };
  readonly help: {
    readonly fallbackRestoredSessionName: string;
    readonly restoreDialogTitle: string;
    readonly restoreDialogFilterName: string;
    readonly restoreDialogPrompt: string;
    readonly restoreConfirmTitle: string;
    readonly restoreConfirmOk: string;
    readonly restoreConfirmCancel: string;
    readonly restoreSuccess: string;
    readonly restoreFailure: string;
    readonly heading: string;
    readonly keyboardShortcutsCurrent: string;
    readonly shortcutsDefaultsNote: string;
    readonly keyboardShortcutsAria: string;
    readonly shortcutPlayPause: string;
    readonly shortcutRestart: string;
    readonly shortcutJumpToSection: string;
    readonly shortcutAdjustSpeed: string;
    readonly shortcutFontSize: string;
    readonly shortcutSnapToCenter: string;
    readonly shortcutClosePrompter: string;
    readonly callFlowTitle: string;
    readonly callFlowAria: string;
    readonly callFlowStep1: string;
    readonly callFlowStep2: string;
    readonly callFlowStep3: string;
    readonly callFlowStep4: string;
    readonly callFlowStep5: string;
    readonly localStorageTitle: string;
    readonly localStorageAria: string;
    readonly sessionRecoveryTitle: string;
    readonly sessionRecoveryDescription: string;
    readonly restoreSession: string;
    readonly manualStorageTitle: string;
    readonly manualStorageDescriptionMac: string;
    readonly manualStorageDescriptionOther: string;
    readonly showInFinder: string;
    readonly openLocalFolder: string;
    readonly privacyNoteAria: string;
    readonly privacyNoteLead: string;
    readonly privacyNoteTail: string;
    readonly buyMeACoffee: string;
  };
  readonly splash: {
    readonly wordmark: string;
    readonly logoAlt: string;
  };
  readonly app: {
    readonly loading: string;
    readonly dismissBanner: string;
    readonly tabLibrary: string;
    readonly tabEditor: string;
    readonly tabSettings: string;
    readonly tabHelp: string;
    readonly sidebarSessionsTitle: string;
    readonly sidebarScriptsTitle: string;
    readonly sidebarFoldersTitle: string;
    readonly closeOverlay: string;
    readonly primaryNavigation: string;
  };
  readonly privacy: {
    readonly logoAlt: string;
    readonly wordmark: string;
    readonly heroLead: string;
    readonly heroSub: string;
    readonly body: string;
    readonly noticeTitle: string;
    readonly noticeBody: string;
    readonly getStarted: string;
    readonly footer: string;
  };
  readonly library: {
    readonly headerSessions: string;
    readonly importButton: string;
    readonly newSessionButton: string;
    readonly importMarkdownAria: string;
    readonly searchSessionsAria: string;
    readonly sortFilterSessionsAria: string;
    readonly createNewFolderAria: string;
    readonly sessionListControlsAria: string;
    readonly sortLabel: string;
    readonly folderLabel: string;
    readonly recentlyEditedOnly: string;
    readonly recentlyEditedOnlyWindow: string;
    readonly sortUpdatedNewest: string;
    readonly sortUpdatedOldest: string;
    readonly sortNameAz: string;
    readonly sortNameZa: string;
    readonly sortWordHighLow: string;
    readonly sortWordLowHigh: string;
    readonly allFolders: string;
    readonly sortSessionsAria: string;
    readonly filterFoldersAria: string;
    readonly select: string;
    readonly cancel: string;
    readonly searchSessionsLabel: string;
    readonly searchPlaceholder: string;
    readonly deselectAll: string;
    readonly selectAll: string;
    readonly newSessionFolderSelectionAria: string;
    readonly whereSessionLiveTitle: string;
    readonly chooseFolderBeforeNaming: string;
    readonly sessionFolderAria: string;
    readonly continue: string;
    readonly newSessionTitle: string;
    readonly newSessionSubtitle: string;
    readonly newSessionPlaceholder: string;
    readonly sessionNameAria: string;
    readonly create: string;
    readonly newFolderTitle: string;
    readonly newFolderSubtitle: string;
    readonly newFolderPlaceholder: string;
    readonly folderNameAria: string;
    readonly renameFolderTitle: string;
    readonly renameFolderAria: string;
    readonly save: string;
    readonly folderRenamedToast: string;
    readonly folderDeletedToast: string;
    readonly folderGroupAria: (params: { readonly label: string }) => string;
    readonly coachmarkTip: string;
    readonly gotIt: string;
    readonly dropHere: string;
    readonly rename: string;
    readonly delete: string;
    readonly noSessionsInFolder: string;
    readonly deleteSessionAria: (params: { readonly title: string }) => string;
    readonly noSessionsMatchSearch: string;
    readonly noSessionsYetGetStarted: string;
    readonly moveTo: (params: { readonly label: string }) => string;
    readonly noDestinationFolders: string;
    readonly deleteSessionTitle: (params: { readonly title: string }) => string;
    readonly deleteConfirmationSub: string;
    readonly deleteFolderTitle: (params: { readonly name: string }) => string;
    readonly deleteFolderConfirmationUnfiled: string;
    readonly deleteFolderConfirmationWithSessions: (params: { readonly folder: string }) => string;
    readonly deleteFolderConfirmationEmpty: string;
    readonly sessionsSelected: (params: { readonly count: number }) => string;
    readonly bulkDeleteTitle: (params: { readonly count: number }) => string;
    readonly bulkDeleteConfirmation: string;
    readonly bulkMoveTitle: (params: { readonly count: number }) => string;
    readonly bulkMoveSelectFolder: string;
    readonly moveCount: (params: { readonly count: number }) => string;
    readonly deleteCount: (params: { readonly count: number }) => string;
    readonly updatedRecently: string;
    readonly updatedTodayAt: (params: { readonly time: string }) => string;
    readonly updatedYesterdayAt: (params: { readonly time: string }) => string;
    readonly updatedWeekdayAt: (params: { readonly weekday: string; readonly time: string }) => string;
    readonly updatedOn: (params: { readonly date: string }) => string;
    readonly defaultSessionName: (params: { readonly day: number; readonly month: string; readonly year: number }) => string;
    readonly sessionMovedToast: (params: { readonly title: string; readonly folder: string }) => string;
    readonly sessionMoveFailedToast: string;
    readonly sessionsDeletedToast: (params: { readonly count: number }) => string;
    readonly sessionsMovedToast: (params: { readonly count: number; readonly folder: string }) => string;
    readonly selectedMoveFailedToast: string;
    readonly defaultFolderFallback: string;
    readonly importedSessionName: string;
    readonly exportFilenameFallback: string;
  };
  readonly overlay: {
    readonly unnamedMonitor: string;
    readonly minutes: string;
    readonly seconds: string;
    readonly resetTimer: string;
    readonly done: string;
    readonly countUp: string;
    readonly countDown: string;
    readonly dim: string;
    readonly pressToToggle: (params: { readonly key: string }) => string;
    readonly fontSizeSettings: string;
    readonly fontSize: string;
    readonly decreaseFontSize: string;
    readonly increaseFontSize: string;
    readonly fontAminus: string;
    readonly fontAplus: string;
    readonly jumpToSection: string;
    readonly jump: string;
    readonly reset: string;
    readonly snapToCentre: string;
    readonly snapError: string;
    readonly toggleControls: string;
    readonly close: string;
    readonly currentSection: string;
    readonly waitingForHeadings: string;
    readonly nextSection: (params: { readonly title: string }) => string;
    readonly remaining: string;
    readonly elapsed: string;
    readonly timerControlsAria: string;
    readonly timerModeAria: string;
    readonly restart: string;
    readonly pause: string;
    readonly play: string;
    readonly scrollSpeedAria: string;
    readonly inactiveToast: string;
    readonly sizeAria: string;
    readonly currentSpeedAria: string;
    readonly rulerIntensityAria: string;
    readonly dimLevelAria: (params: { readonly level: number }) => string;
    readonly mainAria: string;
    readonly timerDisplay: (params: { readonly mode: string; readonly time: string }) => string;
    readonly sectionCounter: (params: { readonly current: number; readonly total: number }) => string;
    readonly closeErrorToast: string;
  };
  readonly settingsView: {
    readonly title: string;
    readonly tabs: {
      readonly general: string;
      readonly shortcuts: string;
      readonly support: string;
    };
    readonly appearance: {
      readonly title: string;
      readonly themeTitle: string;
      readonly themeSubtitle: string;
      readonly themeLabels: {
        readonly system: string;
        readonly light: string;
        readonly dark: string;
      };
      readonly themeToast: (params: { readonly mode: string }) => string;
      readonly readingRulerTitle: string;
      readonly readingRulerSubtitle: string;
      readonly readingRulerAria: string;
      readonly readingRulerEnabledToast: string;
      readonly readingRulerDisabledToast: string;
    };
    readonly overlay: {
      readonly title: string;
      readonly alwaysOnTopTitle: string;
      readonly alwaysOnTopSubtitle: string;
      readonly alwaysOnTopAria: string;
      readonly speedStepTitle: string;
      readonly speedStepSubtitle: string;
      readonly speedStepLabels: {
        readonly fine: string;
        readonly normal: string;
        readonly large: string;
        readonly jump: string;
      };
      readonly appDisplayTitle: string;
      readonly appDisplaySubtitle: string;
      readonly singleMonitorWindows: string;
      readonly singleMonitorOther: string;
      readonly detectError: string;
      readonly unavailable: string;
      readonly primary: string;
      readonly pickerAria: string;
    };
    readonly shortcuts: {
      readonly playbackTitle: string;
      readonly editHint: string;
      readonly jumpToSection: string;
      readonly advancedJumpHint: string;
      readonly hideAdvanced: string;
      readonly showAdvanced: string;
      readonly builtinTitle: string;
      readonly closePrompter: string;
      readonly playPause: string;
      readonly restartScript: string;
      readonly fontSize: string;
      readonly changeSpeed: string;
      readonly togglePrompter: string;
      readonly snapToCenter: string;
      readonly toggleControls: string;
      readonly rewind: string;
      readonly speedUp: string;
      readonly speedDown: string;
      readonly jumpSection: (params: { readonly n: number }) => string;
      readonly restoreDefaults: string;
      readonly applyShortcuts: string;
      readonly placeholder: string;
      readonly captureHint: string;
      readonly updatedToast: string;
      readonly unavailableToast: string;
    };
    readonly diagnostics: {
      readonly title: string;
      readonly bundleTitle: string;
      readonly bundleSubtitle: string;
      readonly exportButton: string;
      readonly toastSuccess: string;
      readonly errorDesktopOnly: string;
      readonly errorExportFailed: string;
    };
    readonly feedback: {
      readonly title: string;
      readonly issuesTitle: string;
      readonly issuesSubtitle: string;
      readonly openButton: string;
    };
  };
  readonly settings: {
    readonly general: {
      readonly interfaceLanguageLabel: string;
      readonly interfaceLanguageHint: string;
      readonly interfaceLanguagePreferenceSaved: string;
    };
  };
}

type TranslationLeaf = string | number | boolean | null | undefined | ((...args: never[]) => unknown);
type JoinPath<Prefix extends string, Suffix extends string> = `${Prefix}.${Suffix}`;

type LeafPaths<T> = T extends TranslationLeaf
  ? never
  : {
    [K in Extract<keyof T, string>]: T[K] extends TranslationLeaf
    ? K
    : JoinPath<K, LeafPaths<T[K]>>
  }[Extract<keyof T, string>];

type PathValue<T, Path extends string> = Path extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
  ? PathValue<T[Head], Tail>
  : never
  : Path extends keyof T
  ? T[Path]
  : never;

export type TranslationKey = LeafPaths<TranslationCatalog>;
export type TranslationKeyParams<K extends TranslationKey> = PathValue<TranslationCatalog, K> extends (
  params: infer Params
) => string
  ? Params
  : never;
