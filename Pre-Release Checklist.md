# Glance Pre-Release Checklist

Use this as the single release gate. Do not mark an item done without evidence (screenshot, video, test log, or command output).

## Release Decision
- [ ] `Go / No-Go` meeting completed
- [ ] Version, changelog, and release notes prepared
- [ ] Rollback plan documented (previous stable build + restore steps)

## P0 - Must Pass Before Public Release

### 1) Platform Compatibility
- [ ] macOS compatibility matrix completed on real devices or reliable VMs
- [ ] Tested on Apple Silicon and Intel
- [ ] Older macOS versions verified (minimum supported version explicitly confirmed)
- [ ] Windows readiness status decided (`ship now` or `announce coming soon`)
- [ ] Supported OS versions documented in README and website copy

Done when:
- Every target OS row is marked pass/fail with notes.
- Minimum supported version is explicit and visible to users.

### 2) Packaging, Signing, Trust
- [ ] macOS code signing configured for release builds
- [ ] macOS notarization configured and verified end-to-end
- [ ] First-launch experience tested on a clean machine (no scary security prompts beyond expected)
- [ ] App icon, app name, bundle identifier, and metadata verified in installed app

Done when:
- A signed and notarized `.app` or installer is produced and installs cleanly.

### 3) Screen Share / Capture Behavior (Critical Promise)
- [ ] Zoom desktop tested: window share + full screen share
- [ ] Google Meet tested: browser share + app/window share (if available)
- [ ] Microsoft Teams tested: window share + full screen share
- [ ] Single-monitor and multi-monitor scenarios tested
- [ ] Behavior documented clearly in Help/FAQ (`what is hidden`, `what is visible`, `known limitations`)

Done when:
- Matrix exists with pass/fail per app + share mode + monitor mode.

### 4) Overlay Reliability
- [ ] Overlay opens on same monitor as main app
- [ ] Overlay opens top-centered by default
- [ ] Overlay remains draggable after fullscreen/maximize transitions
- [ ] Overlay min/max size constraints behave correctly
- [ ] Overlay close/open choreography works every time (no flashes/stuck states)
- [ ] Popovers always render above controls and stay in viewport

Done when:
- 20 consecutive open/close cycles pass without visual or interaction regression.

### 5) Shortcut Reliability Under Stress
- [ ] Play/Pause shortcut works only when overlay is active (no interference in editor/other apps)
- [ ] Rewind shortcut works only when overlay is active
- [ ] Speed shortcuts work consistently and update slider + bubble in sync
- [ ] Section jump shortcuts (`1..9`) always jump to correct section
- [ ] Shortcut conflicts are detected and clearly communicated
- [ ] Shortcut remapping UX is stable (focus ring, capture, apply, restore defaults)

Done when:
- 15-minute keyboard-only run passes with no dropped/misrouted shortcuts.

### 6) Session Data Integrity (Local-Only Promise)
- [ ] Autosave works reliably while editing
- [ ] Import markdown works with non-ASCII content
- [ ] Export markdown writes to selected user path
- [ ] Delete flow is safe (confirm and only delete on confirm)
- [ ] Crash recovery restores last session + scroll + overlay state
- [ ] Backup rotation policy implemented or explicitly deferred and documented

Done when:
- No data loss in forced-close test scenarios.

### 7) Stability and Performance
- [ ] 60-minute continuous prompter soak test
- [ ] CPU and memory measured at start/middle/end
- [ ] No drift in scroll timing, no stutter on section jumps
- [ ] No unhandled errors in console/logs during soak

Done when:
- Metrics are recorded and within acceptable thresholds.

## P1 - Should Pass Before Launch Week

### 8) UX and Accessibility Polish
- [ ] Focus states visible on all interactive controls
- [ ] Popover/modal escape hierarchy works (`Esc` closes topmost layer first)
- [ ] Hit targets and spacing are consistent in compact and desktop layouts
- [ ] Copy is consistent and actionable across Help, Settings, and toasts
- [ ] Reduced motion behavior reviewed (`prefers-reduced-motion`)

### 9) Onboarding and Product Messaging
- [ ] First-run flow includes sample session
- [ ] Help page reflects actual shortcuts and behavior
- [ ] Privacy message is explicit: local-only, no cloud, no account
- [ ] Clear statement for limitations and upcoming features

### 10) Release Operations
- [ ] Crash/error reporting strategy defined (or explicit local logging policy)
- [ ] Support channel + issue template prepared
- [ ] Known issues list published
- [ ] Post-release hotfix procedure documented

## Deferred / Post-Release Backlog (Not Blocking First Public Build)
- [ ] Voice-paced auto-scroll
- [ ] Auto-update system
- [ ] Windows production parity
- [ ] Advanced analytics (privacy-preserving, optional, local-first policy)

## Evidence Log (Fill As You Go)
- [ ] Compatibility matrix file created: `docs/release/compatibility-matrix.md`
- [ ] Screen-share matrix file created: `docs/release/screen-share-matrix.md`
- [ ] Soak test report created: `docs/release/soak-test-report.md`
- [ ] Signing/notarization runbook created: `docs/release/signing-notarization.md`

## Final Ship Gate
- [ ] All P0 items checked
- [ ] No open P0 bugs in tracker
- [ ] Signed/notarized artifact verified from clean install
- [ ] Team approves `Go`
