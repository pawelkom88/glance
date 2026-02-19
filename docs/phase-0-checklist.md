# Phase 0 Checklist

## Program / Product

- [ ] Define success criteria for MVP (prep → run → navigate without losing place)
- [ ] Lock keyboard map baseline (Cmd/Ctrl variants)
- [ ] Create risk register for cross-platform behaviors

## Engineering

- [x] Create Tauri app skeleton with two windows: `main` and `overlay`
- [x] Implement Rust command: `list_sessions()`
- [x] Implement Rust command: `create_session(name)`
- [x] Implement Rust command: `load_session(id)`
- [x] Implement Rust command: `save_session(id, markdown, meta)`
- [x] Implement session folder structure and index file
- [x] Implement global shortcut registration baseline (`Cmd/Ctrl+Shift+S`, `Cmd/Ctrl+1..9`)
- [x] Implement shortcut conflict error surface
- [x] Implement overlay always-on-top toggle
- [x] Implement monitor enumeration + move overlay to monitor
- [x] Build scroll engine spike (`requestAnimationFrame`)
- [x] Persist scroll state (position, speed, running/paused)

## Design

- [x] Base overlay layout spec implemented (hint bar, text, controls, speed)
- [x] Readability tokens scaffolded (type + spacing + contrast)
- [ ] Final accessible highlight spec for V1

## QA

- [ ] Validate global shortcuts register/unregister without crashes on macOS + Windows
- [ ] Validate session save/load with non-ASCII characters
