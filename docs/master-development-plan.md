# Glance Master Development Plan

## Product promise

Glance is a local-only, camera-adjacent teleprompter overlay for live calls. Sessions are Markdown-first and stored entirely on-device.

## Phase 0: Cross-platform foundations

### Goal

Lock the core substrate on macOS and Windows.

### Required outputs

- Two-window model (`main`, `overlay`)
- Session storage + index
- Shortcut registration baseline + conflict errors
- Overlay monitor controls + always-on-top
- Smooth scroll engine with pause/resume

### Exit criteria

- User can prepare content in main window, launch overlay, and recover to the same position after pause.
- Shortcut conflicts do not crash the app.

## Phase 1: Universal teleprompter MVP

### Goal

A user can run real calls end-to-end with reliable section jumps.

### Scope

- Session CRUD + import/export
- Markdown H1 parsing to sections
- Hint bar with hotkeys 1..9
- Play/Pause + speed controls
- Overlay move/resize persistence
- Packaging and privacy copy

## Phase 2: Stress-proof V1

### Goal

Remove under-stress failure modes.

### Scope

- Command palette (Cmd/Ctrl+K)
- Hotkey customization + conflict UX
- Transition behavior for section jumps
- Reading ruler accessibility controls
- Better multi-monitor pinning and recovery
- First-run onboarding and shortcuts cheat sheet

## Phase 3: V1.1 polish and power

### Goal

Refinement for heavy daily usage.

### Scope

- Per-section speed
- Templates
- Keyboard-only completeness
- Crash recovery + backup rotation
- Extended soak and hot-plug QA
