# Phase 1 Checklist

## A) Sessions & Storage

- [x] Session schema in index + metadata
- [x] Store markdown as `content.md`
- [x] Store meta as `meta.json`
- [x] Autosave debounce (700ms)
- [x] Duplicate session
- [x] Delete session with confirmation
- [x] Import markdown file to create session
- [x] Export active session markdown

## B) Markdown Parsing → Sections

- [x] Parse `#` headers into sections (H1)
- [x] Generate ordered section list
- [x] Generate hotkey map for first 9 sections
- [x] Parse warnings (missing H1, duplicates, hotkey limit)
- [x] Render markdown in overlay with consistent heading/list styling

## C) Overlay Window

- [x] Open/close overlay from main app
- [x] Always-on-top toggle
- [x] Drag-to-move via drag region + edge resize
- [x] Persist overlay bounds per OS (local)
- [x] Launch overlay on last used monitor
- [x] Reset overlay position

## D) Playback & Scrolling

- [x] Playback state machine (`paused | running`)
- [x] Play/Pause with status indicator
- [x] Smooth pixel-per-second RAF loop
- [x] Resume from exact position
- [x] Speed slider with bounds
- [x] Speed hotkeys (global + local fallback)
- [x] Micro-toast on speed change

## E) Navigation & Hint Bar

- [x] Hint bar with visible section hotkeys
- [x] Click-to-jump sections
- [x] Jump-to-anchor by section line index
- [x] Jump while running without stutter
- [x] Global shortcuts for toggle + 1..9 jumps
- [x] Conflict warning with graceful fallback

## F) Packaging

- [ ] macOS signing + notarization
- [ ] Windows signing / SmartScreen messaging
- [ ] Installer release pipeline
- [x] Local-only privacy copy in Help

## G) QA

- [ ] Full OS test matrix execution
- [ ] 60-minute run stability validation
