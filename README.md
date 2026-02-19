# Glance

Local-only, camera-adjacent teleprompter overlay for live calls, built with Tauri + React.

## Current status

This scaffold implements **Phase 0** and the core **Phase 1 MVP flow**:

- Two-window model (`main` + `overlay`)
- Local session storage (`content.md` + `meta.json` + `index.json`)
- Tauri commands for session CRUD + duplicate/delete + export
- Markdown import into local sessions
- Global shortcuts (`Cmd/Ctrl+Shift+S`, `Cmd/Ctrl+1..9`, `Cmd/Ctrl+Up/Down`)
- Overlay controls (always-on-top, monitor targeting, bounds persistence, reset)
- Playback state machine + smooth scroll + speed micro-toasts
- Parse warnings (missing headings, duplicate headings, hotkey-limit warning)

## Prerequisites

- Node.js 20+
- Rust toolchain (`rustup`, `cargo`)
- Platform requirements for Tauri:
  - macOS: Xcode Command Line Tools
  - Windows: MSVC Build Tools + WebView2

## Install

```bash
npm install
```

## Run (dev)

```bash
npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

## Data location

Sessions are stored under the app data directory:

- `sessions/index.json`
- `sessions/<session-id>/content.md`
- `sessions/<session-id>/meta.json`

## Notes

- The project is local-only by design.
- If global shortcut registration conflicts with another app, the app returns a conflict error and falls back to click navigation.
