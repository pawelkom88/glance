import type { TranslationCatalog } from '../types';

const pluralizeSłowo = (count: number) => {
    if (count === 1) return 'słowo';
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
        return 'słowa';
    }
    return 'słów';
};

export const plCatalog: TranslationCatalog = {
    editor: {
        headerLabel: 'Edytor sesji',
        createFirstSessionTitle: 'Utwórz pierwszą sesję',
        importMarkdown: 'Importuj Markdown',
        newSession: 'Nowa sesja',
        noSessionsYetTitle: 'Brak sesji',
        noSessionsYetCopy: 'Kliknij "Nowa sesja", aby rozpocząć.',
        selectSessionTitle: 'Wybierz sesję',
        goToSessions: 'Przejdź do sesji',
        noSessionSelectedTitle: 'Nie wybrano żadnej sesji',
        noSessionSelectedCopy: 'Wybierz sesję z listy, aby zacząć edycję.',
        breadcrumbSessions: 'Sesje',
        autosaveSaving: 'Zapisywanie…',
        uncommittedChangesToast: 'Masz niezapisane zmiany.',
        exportSessionTitle: 'Eksportuj sesję',
        exportMarkdownFilter: 'Markdown',
        exportSuccessToast: 'Wyeksportowano pomyślnie',
        exportErrorNoSessionToast: 'Otwórz sesję przed eksportem',
        exportErrorDesktopOnlyToast: 'Eksport jest dostępny tylko w aplikacji desktopowej',
        launchErrorToast: 'Nie udało się uruchomić promptera',
        autosaveSaved: 'Zapisano',
        launch: 'Uruchom',
        export: 'Eksportuj',
        infoSections: 'Sekcje',
        infoWords: 'Słowa',
        infoEstimatedRead: 'Przewidywany czas  czytania',
        estimateReadSeconds: ({ seconds }) => `~${seconds}s`,
        estimateReadMinutes: ({ minutes, seconds }) => `~${minutes}m ${seconds}s`,
        wordCountApprox: ({ count }) => `~${count}`,
        statusMarkdown: 'Markdown',
        statusEncoding: 'UTF-8',
        statusWordCount: ({ count }) => `${count} ${pluralizeSłowo(count)}`,
        actions: 'Akcje',
        launchPrompter: 'Uruchom prompter',
        exportMarkdown: 'Eksportuj',
        scriptInfo: 'Informacje o skrypcie'
    },
    help: {
        fallbackRestoredSessionName: 'Przywrócona sesja',
        restoreDialogTitle: 'Wybierz plik sesji',
        restoreDialogFilterName: 'Markdown / Kopia zapasowa',
        restoreDialogPrompt: 'Zastąpi to bieżącą zawartość edytora wybranym plikiem.',
        restoreConfirmTitle: 'Przywrócić sesję?',
        restoreConfirmOk: 'Przywróć',
        restoreConfirmCancel: 'Anuluj',
        restoreSuccess: 'Sesja została pomyślnie przywrócona',
        restoreFailure: 'Nie udało się przywrócić sesji',
        heading: 'Pomoc',
        keyboardShortcutsCurrent: 'Skróty klawiszowe (aktualne)',
        shortcutsDefaultsNote: 'Ustawienia domyślne można przywrócić w Ustawienia > Skróty.',
        keyboardShortcutsAria: 'Skróty klawiszowe',
        shortcutPlayPause: 'Odtwórz / Pauza',
        shortcutRestart: 'Zacznij od nowa',
        shortcutJumpToSection: 'Skocz do sekcji',
        shortcutAdjustSpeed: 'Dostosuj prędkość',
        shortcutAdjustOpacity: 'Dostosuj przezroczystość',
        shortcutFontSize: 'Wielkość czcionki',
        shortcutSnapToCenter: 'Wyrównaj do środka',
        shortcutTogglePrompter: 'Przełącz prompter',
        shortcutClosePrompter: 'Zamknij prompter',
        callFlowTitle: '5-etapowy proces rozmowy',
        callFlowAria: '5-etapowy proces rozmowy',
        callFlowStep1: 'Utwórz sesję w module Sesje.',
        callFlowStep2: 'Użyj jednego nagłówka # dla każdej części rozmowy.',
        callFlowStep3: 'Uruchom Prompter.',
        callFlowStep4: 'Naciśnij Odtwórz i ustaw odpowiednie tempo.',
        callFlowStep5: 'Przełączaj sekcje w trakcie rozmowy.',
        localStorageTitle: 'Pamięć lokalna',
        localStorageAria: 'Informacje o pamięci lokalnej',
        sessionRecoveryTitle: 'Odzyskiwanie sesji',
        sessionRecoveryDescription: 'Wczytaj zawartość skryptu z pliku Markdown lub kopii zapasowej do edytora.',
        restoreSession: 'Przywróć sesję',
        manualStorageTitle: 'Dostęp ręczny',
        manualStorageDescriptionMac: 'Uzyskaj dostęp do plików danych bezpośrednio w Finderze.',
        manualStorageDescriptionOther: 'Uzyskaj dostęp do plików danych bezpośrednio na dysku.',
        showInFinder: 'Pokaż w Finderze',
        openLocalFolder: 'Otwórz lokalny folder',
        privacyNoteAria: 'Informacja o prywatności',
        privacyNoteLead: 'Domyślnie lokalnie.',
        privacyNoteTail: 'Bez konta, bez synchronizacji w chmurze.',
        buyMeACoffee: 'Postaw mi kawę'
    },
    splash: {
        wordmark: 'GLANCE',
        logoAlt: 'Logo Glance'
    },
    app: {
        loading: 'Wczytywanie…',
        dismissBanner: 'Zamknij',
        tabLibrary: 'Biblioteka sesji',
        tabEditor: 'Edytor sesji',
        tabSettings: 'Ustawienia',
        tabHelp: 'Pomoc',
        sidebarSessionsTitle: 'Sesje',
        sidebarScriptsTitle: 'Skrypty',
        sidebarFoldersTitle: 'Foldery',
        closeOverlay: 'Zamknij prompter',
        primaryNavigation: 'Nawigacja główna'
    },
    privacy: {
        logoAlt: 'Logo Glance',
        wordmark: 'Glance',
        heroLead: 'Czytaj skrypt.',
        heroSub: 'Patrz w kamerę.',
        body: 'Lokalny prompter dla prezenterów, którym zależy na kontakcie wzrokowym.',
        noticeTitle: '100% lokalnie. Zero telemetrii.',
        noticeBody: 'Twoje skrypty nigdy nie opuszczają tego urządzenia. Jeśli napotkasz błąd, raporty o awariach są całkowicie ręczne i opcjonalne (Ustawienia → Eksportuj logi).',
        getStarted: 'Zacznij teraz',
        footer: 'Bez konta. Bez subskrypcji. Internet nie jest wymagany.'
    },
    library: {
        headerSessions: 'Sesje',
        importButton: 'Importuj',
        newSessionButton: 'Nowa sesja',
        importMarkdownAria: 'Importuj sesję z pliku',
        searchSessionsAria: 'Szukaj sesji',
        sortFilterSessionsAria: 'Sortuj i filtruj sesje',
        createNewFolderAria: 'Utwórz nowy folder',
        sessionListControlsAria: 'Elementy sterujące listą sesji',
        sortLabel: 'Sortuj',
        folderLabel: 'Folder',
        recentlyEditedOnly: 'Tylko ostatnio edytowane',
        recentlyEditedOnlyWindow: '(Zaktualizowane w ciągu ostatnich 7 dni)',
        sortUpdatedNewest: 'Zaktualizowane (Najnowsze)',
        sortUpdatedOldest: 'Zaktualizowane (Najstarsze)',
        sortNameAz: 'Nazwa (A-Z)',
        sortNameZa: 'Nazwa (Z-A)',
        sortWordHighLow: 'Słowa (malejąco)',
        sortWordLowHigh: 'Słowa (rosnąco)',
        allFolders: 'Wszystkie foldery',
        sortSessionsAria: 'Sortuj sesje według',
        filterFoldersAria: 'Filtruj według folderu',
        select: 'Wybierz',
        cancel: 'Anuluj',
        searchSessionsLabel: 'Szukaj sesji',
        searchPlaceholder: 'Szukaj w tytułach i treści…',
        deselectAll: 'Odznacz wszystko',
        selectAll: 'Zaznacz wszystko',
        newSessionFolderSelectionAria: 'Wybór folderu dla nowej sesji',
        whereSessionLiveTitle: 'W jakim folderze zapisać tę sesję?',
        chooseFolderBeforeNaming: 'Najpierw wybierz folder, a następnie nadaj nazwę nowej sesji.',
        sessionFolderAria: 'Folder sesji',
        continue: 'Kontynuuj',
        newSessionTitle: 'Nowa sesja',
        newSessionSubtitle: 'Aby rozpocząć, nadaj nazwę swojemu skryptowi.',
        newSessionPlaceholder: 'np. Cotygodniowe spotkanie',
        sessionNameAria: 'Nazwa sesji',
        create: 'Utwórz',
        newFolderTitle: 'Nowy folder',
        newFolderSubtitle: 'Uporządkuj sesje, grupując je według projektu lub klienta.',
        newFolderPlaceholder: 'np. Spotkania sprzedażowe',
        folderNameAria: 'Nazwa folderu',
        renameFolderTitle: 'Zmień nazwę folderu',
        renameFolderAria: 'Zmień nazwę folderu',
        save: 'Zapisz',
        folderRenamedToast: 'Pomyślnie zmieniono nazwę folderu',
        folderDeletedToast: 'Pomyślnie usunięto folder',
        folderGroupAria: ({ label }) => `Grupa folderów: ${label}`,
        coachmarkTip: 'Wskazówka: Możesz organizować swoje sesje, przeciągając je do folderów.',
        gotIt: 'Rozumiem',
        dropHere: 'Upuść tutaj',
        rename: 'Zmień nazwę',
        delete: 'Usuń',
        noSessionsInFolder: 'Brak sesji w tym folderze.',
        deleteSessionAria: ({ title }) => `Usuń "${title}"`,
        noSessionsMatchSearch: 'Brak sesji pasujących do wyszukiwania.',
        noSessionsYetGetStarted: 'Brak sesji. Kliknij "Nowa sesja", aby zacząć!',
        moveTo: ({ label }) => `Przenieś do: ${label}`,
        noDestinationFolders: 'Brak folderów docelowych',
        deleteSessionTitle: ({ title }) => `Usunąć "${title}"?`,
        deleteConfirmationSub: 'Tej operacji nie można cofnąć.',
        deleteFolderTitle: ({ name }) => `Usunąć folder "${name}"?`,
        deleteFolderConfirmationUnfiled: 'Folder "Nieprzypisane" można usunąć tylko wtedy, gdy jest pusty. Pojawi się on automatycznie, jeśli sesja nie będzie miała folderu.',
        deleteFolderConfirmationWithSessions: ({ folder }) => `Sesje z tego folderu zostaną przeniesione do: ${folder}.`,
        deleteFolderConfirmationEmpty: 'Ten folder jest pusty i zostanie usunięty.',
        sessionsSelected: ({ count }) => {
            if (count === 1) return 'Wybrano 1 sesję';
            const lastDigit = count % 10;
            const lastTwoDigits = count % 100;
            if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
                return `Wybrano ${count} sesje`;
            }
            return `Wybrano ${count} sesji`;
        },
        bulkDeleteTitle: ({ count }) => {
            if (count === 1) return 'Usunąć 1 sesję?';
            const lastDigit = count % 10;
            const lastTwoDigits = count % 100;
            if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
                return `Usunąć ${count} sesje?`;
            }
            return `Usunąć ${count} sesji?`;
        },
        bulkDeleteConfirmation: 'Tej operacji nie można cofnąć. Wszystkie wybrane nagrania i skrypty zostaną trwale usunięte.',
        bulkMoveTitle: ({ count }) => {
            if (count === 1) return 'Przenieś 1 sesję';
            const lastDigit = count % 10;
            const lastTwoDigits = count % 100;
            if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
                return `Przenieś ${count} sesje`;
            }
            return `Przenieś ${count} sesji`;
        },
        bulkMoveSelectFolder: 'Wybierz folder docelowy.',
        moveCount: ({ count }) => `Przenieś ${count}`,
        deleteCount: ({ count }) => `Usuń ${count}`,
        updatedRecently: 'Ostatnio zaktualizowane',
        updatedTodayAt: ({ time }) => `Zaktualizowano dzisiaj o ${time}`,
        updatedYesterdayAt: ({ time }) => `Zaktualizowano wczoraj o ${time}`,
        updatedWeekdayAt: ({ weekday, time }) => `Zaktualizowano w: ${weekday} o ${time}`,
        updatedOn: ({ date }) => `Zaktualizowano ${date}`,
        defaultSessionName: ({ day, month, year }) => `Sesja ${day} ${month} ${year}`,
        sessionMovedToast: ({ title, folder }) => `Przeniesiono "${title}" do: ${folder}`,
        sessionMoveFailedToast: 'Nie udało się przenieść sesji',
        sessionsDeletedToast: ({ count }) => {
            if (count === 1) return 'Usunięto 1 sesję';
            const lastDigit = count % 10;
            const lastTwoDigits = count % 100;
            if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
                return `Usunięto ${count} sesje`;
            }
            return `Usunięto ${count} sesji`;
        },
        sessionsMovedToast: ({ count, folder }) => {
            let countStr = '';
            if (count === 1) countStr = 'Przeniesiono 1 sesję';
            else {
                const lastDigit = count % 10;
                const lastTwoDigits = count % 100;
                if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
                    countStr = `Przeniesiono ${count} sesje`;
                } else {
                    countStr = `Przeniesiono ${count} sesji`;
                }
            }
            return `${countStr} do: ${folder}`;
        },
        selectedMoveFailedToast: 'Nie udało się przenieść wybranych sesji',
        defaultFolderFallback: 'Nieprzypisane',
        importedSessionName: 'Zaimportowana sesja',
        exportFilenameFallback: 'sesja'
    },
    overlay: {
        unnamedMonitor: 'Nienazwany monitor',
        minutes: 'Minuty',
        seconds: 'Sekundy',
        resetTimer: 'Resetuj czasomierz',
        done: 'Gotowe',
        countUp: 'Licz w górę',
        countDown: 'Licz w dół',
        opacityAria: 'Przezroczystość promptera',
        pressToToggle: ({ key }) => `Naciśnij ${key}, aby przełączyć prompter`,
        fontSizeSettings: 'Ustawienia wielkości czcionki',
        fontSize: 'Wielkość czcionki',
        decreaseFontSize: 'Zmniejsz wielkość czcionki',
        increaseFontSize: 'Zwiększ wielkość czcionki',
        fontAminus: 'A−',
        fontAplus: 'A+',
        jumpToSection: 'Idź do sekcji',
        jump: 'Menu sekcji',
        reset: 'Resetuj',
        snapToCentre: 'Wyśrodkuj na ekranie',
        snapError: 'Nie udało się wyśrodkować nakładki na ekranie.',
        toggleControls: 'Przełącz sterowanie',
        close: 'Zamknij',
        currentSection: 'Aktualna sekcja',
        waitingForHeadings: 'Ładowanie nagłówków…',
        nextSection: ({ title }) => `Następnie: ${title}`,
        remaining: 'Pozostało',
        elapsed: 'Upłynęło',
        timerControlsAria: 'Elementy sterujące czasem prezentacji',
        timerModeAria: 'Tryb działania timera',
        restart: 'Zacznij od nowa',
        pause: 'Pauza',
        play: 'Odtwórz',
        scrollSpeedAria: 'Prędkość przewijania',
        inactiveToast: 'Nakładka nieaktywna. Kliknij ją, aby włączyć skróty.',
        sizeAria: 'Wielkość nakładki',
        currentSpeedAria: 'Aktualna prędkość',
        controlSpeedLabel: 'Tempo',
        controlContrastLabel: 'Kontrast',
        controlTextSizeLabel: 'Rozmiar tekstu',
        rulerIntensityAria: 'Intensywność podświetlenia linijki',
        mainAria: 'Nakładka Glance',
        timerDisplay: ({ mode, time }) => `Timer: ${mode === 'Count Up' ? 'wszerz' : 'w dół'}, czas: ${time}`,
        sectionCounter: ({ current, total }) => `Sekcja ${current} z ${total}`,
        closeErrorToast: 'Nie udało się zamknąć promptera',
        autoPauseToggleAria: 'Automatyczna pauza głosem',
        autoPauseDelayAria: 'Opóźnienie pauzy po ciszy',
        autoPauseDelayOneSecond: '1 s',
        autoPauseDelayTwoSeconds: '2 s',
        autoPauseDelayThreeSeconds: '3 s',
        autoPausePermissionError: 'Odmowa dostępu do mikrofonu',
        autoPauseStatusLabel: 'Głos',
        autoPauseStatusListening: 'Automatyczna pauza głosowa nasłuchuje',
        autoPauseStatusSilent: 'Automatyczna pauza głosowa czeka, aż znów zaczniesz mówić',
        autoPauseStatusStarting: 'Automatyczna pauza głosowa uruchamia się'
    },
    settingsView: {
        title: 'Ustawienia',
        tabs: {
            general: 'Ogólne',
            shortcuts: 'Skróty',
            support: 'Wsparcie'
        },
        vad: {
            title: 'Auto-pauza głosem',
            enabledTitle: 'Auto-pauza głosem',
            enabledSubtitle: 'Automatycznie zatrzymuj prompter, gdy przestaniesz mówić.',
            enabledAria: 'Włącz wykrywanie aktywności głosowej',
            pauseDelayTitle: 'Pauza po ciszy',
            pauseDelaySubtitle: 'Jak długo Glance czeka przed zatrzymaniem po tym, jak przestaniesz mówić.',
        },
        appearance: {
            title: 'Wygląd',
            themeTitle: 'Motyw',
            themeSubtitle: 'Używaj ustawień systemu lub wybierz ręcznie.',
            themeLabels: {
                system: 'Systemowy',
                light: 'Jasny',
                dark: 'Ciemny'
            },
            themeToast: ({ mode }) => `Ustawiono motyw: ${mode === 'light' ? 'jasny' : mode === 'dark' ? 'ciemny' : 'systemowy'}`,
            readingRulerTitle: 'Linijka czytania',
            readingRulerSubtitle: 'Pokaż pasek skupienia na nakładce promptera.',
            readingRulerAria: 'Pokaż linijkę czytania',
            readingRulerEnabledToast: 'Włączono linijkę czytania',
            readingRulerDisabledToast: 'Wyłączono linijkę czytania'
        },
        overlay: {
            title: 'Nakładka',
            alwaysOnTopTitle: 'Zawsze na wierzchu',
            alwaysOnTopSubtitle: 'Utrzymuje prompter nad innymi oknami na ekranie.',
            alwaysOnTopAria: 'Zawsze na wierzchu',
            speedStepTitle: 'Krok prędkości',
            speedStepSubtitle: 'O ile zmienia się prędkość przy każdym naciśnięciu klawisza lub przewinięciu.',
            speedStepLabels: {
                fine: 'Precyzyjny (0.05×)',
                normal: 'Normalny (0.1×)',
                large: 'Duży (0.2×)',
                jump: 'Skok (0.5×)'
            },
            appDisplayTitle: 'Ekran aplikacji',
            appDisplaySubtitle: 'Gdzie otwiera się aplikacja.',
            singleMonitorWindows: 'Zostanie użyty ekran główny.',
            singleMonitorOther: 'Otwieranie na ekranie głównym.',
            detectError: 'Nie udało się wykryć ekranów. Uruchom aplikację ponownie.',
            unavailable: 'Ekran niedostępny',
            primary: 'Główny',
            pickerAria: 'Opcje ekranu aplikacji'
        },
        shortcuts: {
            playbackTitle: 'Skróty odtwarzania',
            editHint: 'Kliknij pole skrótu, naciśnij wybrane klawisze, aby go zapisać. Naciśnij Delete, aby usunąć skrót.',
            jumpToSection: 'Przejdź do sekcji',
            advancedJumpHint: 'Zaawansowane klawisze przejścia do sekcji można edytować w ten sam sposób.',
            hideAdvanced: 'Ukryj zaawansowane klawisze przejścia do sekcji',
            showAdvanced: 'Dostosuj klawisze przejścia do sekcji',
            builtinTitle: 'Wbudowane elementy sterujące',
            closePrompter: 'Zamknij prompter',
            playPause: 'Odtwórz / Pauza',
            restartScript: 'Zacznij skrypt od nowa',
            fontSize: 'Wielkość czcionki',
            changeSpeed: 'Zmień prędkość',
            adjustOpacity: 'Dostosuj przezroczystość',
            hidePrompter: 'Ukryj prompter',
            snapToCenter: 'Przyciągnij do środka',
            toggleControls: 'Pokaż/Ukryj elementy sterujące',
            rewind: 'Przewiń',
            speedUp: 'Zwiększ prędkość',
            speedDown: 'Zmniejsz prędkość',
            jumpSection: ({ n }) => `Skocz do sekcji ${n}`,
            restoreDefaults: 'Przywróć domyślne',
            applyShortcuts: 'Zastosuj skróty',
            placeholder: 'Naciśnij skrót',
            captureHint: 'Kliknij i naciśnij klawisze, aby zapisać',
            updatedToast: 'Zaktualizowano skróty',
            unavailableToast: 'Skróty globalne są niedostępne.'
        },
        diagnostics: {
            title: 'Diagnostyka',
            bundleTitle: 'Paczka diagnostyczna',
            bundleSubtitle: 'Tworzy paczkę lokalnych logów na Pulpicie. Nic nie jest wysyłane automatycznie.',
            exportButton: 'Eksportuj logi',
            toastSuccess: 'Logi wyeksportowano pomyślnie.',
            errorDesktopOnly: 'Eksport diagnostyki jest dostępny tylko w aplikacji desktopowej.',
            errorExportFailed: 'Eksport nie powiódł się'
        },
        feedback: {
            title: 'Opinie',
            issuesTitle: 'Znane problemy i sugestie',
            issuesSubtitle: 'Przeglądaj problemy lub zgłoś nowe na GitHubie.',
            openButton: 'Otwórz GitHub'
        }
    },
    settings: {
        general: {
            interfaceLanguageLabel: 'Język interfejsu',
            interfaceLanguageHint: 'Wybierz język interfejsu aplikacji.',
            interfaceLanguagePreferenceSaved: 'Zapisano preferencję języka interfejsu.'
        }
    }
};
