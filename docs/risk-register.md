# Cross-Platform Risk Register

| ID | Risk | Platform | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R1 | Global shortcut conflicts with conferencing apps | macOS/Windows | High | Return explicit conflict errors and keep click navigation active | Open |
| R2 | Overlay off-screen after monitor changes | macOS/Windows | High | Monitor enumeration + recovery move to primary display | Open |
| R3 | Always-on-top behaves differently by desktop env | macOS/Windows | Medium | Add explicit toggle and runtime verification | Open |
| R4 | Per-OS key mapping drift | macOS/Windows | Medium | Use normalized hotkey model and per-OS defaults | Open |
| R5 | Long-session scroll jitter | macOS/Windows | Medium | RAF + time-based delta + soak tests | Open |
