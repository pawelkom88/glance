# Glance Safe Release & Deployment Playbook

A step-by-step guide for publishing updates to Glance, staging releases safely, and executing instant rollbacks if needed.

---

## 1. Core Architecture: How Releases & Downloads Work

Glance has **three completely independent release channels**. Understanding how they connect prevents accidental production breakages.

```
                  ┌──────────────────────────────────────────────────┐
                  │              GitHub Releases (vX.Y.Z)            │
                  │   Stores compiled .dmg, .exe, .tar.gz, .msi.zip  │
                  └───────────────┬──────────────────┬───────────────┘
                                  │                  │
                Referenced by URL │                  │ Referenced by URL
                                  ▼                  ▼
┌────────────────────────────────────────┐  ┌────────────────────────────────────────┐
│      Landing Page & Buy Downloads      │  │        Tauri Silent Auto-Updater       │
│  File: landing-page/assets/            │  │  File: landing-page/update.json        │
│        release-config.js               │  │  Endpoint: https://atglance.app/       │
│  Deploy: pnpm run deploy:landing       │  │            update.json                 │
│                                        │  │                                        │
│  Controls:                             │  │  Controls:                             │
│  - New buyers on checkout (docs.html)  │  │  - Existing users who downloaded        │
│  - Trial download buttons (index.html) │  │    weeks or months ago                  │
└────────────────────────────────────────┘  └────────────────────────────────────────┘
```

### Does the GitHub link update automatically when a user clicks "Buy"?

**No, it does NOT update automatically.**

Here is the exact lifecycle:
1. When a user clicks **"Buy"**, they are routed through Stripe via the Cloudflare payment worker (`glance-payments`).
2. Once the payment succeeds, Stripe redirects the buyer to `https://atglance.app/docs.html` (the setup & thank-you page).
3. The download button on `docs.html` (and on `index.html` for trials) reads the download URLs directly from [`landing-page/assets/release-config.js`](./landing-page/assets/release-config.js):
   ```js
   window.__GLANCE_RELEASE__ = {
     version: 'v0.3.9',
     downloads: {
       windows: 'https://github.com/pawelkom88/glance/releases/download/v0.3.9/Glance_0.3.9_x64-setup.exe',
       macArm: 'https://github.com/pawelkom88/glance/releases/download/v0.3.9/Glance_0.3.9_aarch64.dmg',
       macIntel: 'https://github.com/pawelkom88/glance/releases/download/v0.3.9/Glance_0.3.9_x64.dmg',
     },
   };
   ```
4. GitHub and Stripe do **not** communicate with each other.
5. **You control what version buyers receive** by updating `release-config.js` and deploying the site via `pnpm run deploy:landing`. If you release `v0.4.0` on GitHub but do not update `release-config.js`, buyers will simply continue receiving the proven, stable `v0.3.9`.

---

## 2. Will Users Who Downloaded 5 Months Ago Get New Features?

**Yes, 100%.**

- **License Preservation**: A user's license key and activation token are stored locally on their computer (in macOS Application Support / LocalStorage under `com.glance.desktop`).
- **Data Preservation**: Saved markdown scripts, custom presets, and shortcuts are stored separately in the user's application data directory.
- When an existing user's app updates (or if they install a new DMG over their existing app):
  - Their license remains active.
  - Their scripts and settings remain untouched.
  - New features (like Voice-Synced Scrolling) will appear immediately in the interface.

---

## 3. Safe Staged Rollout Strategy (Zero-Risk Process)

Never deploy a release simultaneously to new buyers and existing users. Follow this staged strategy:

```
[Stage 1: Internal Testing] ──> [Stage 2: New Buyers Only] ──> [Stage 3: Full Fleet Auto-Update]
  Build & test signed DMG         Update release-config.js         Update update.json
  Nobody else receives it         Existing users untouched         All users get update
```

---

### Stage 1: Build & Verify (Zero Risk)

1. **Verify your working branch**:
   Ensure all tests pass and your branch is clean:
   ```bash
   pnpm run test:critical
   pnpm exec tsc --noEmit
   pnpm run build
   ```

2. **Decide the version number**:
   For example, bumping from `0.3.9` to `0.4.0`.

3. **Build the signed macOS app locally**:
   ```bash
   pnpm run build:mac
   ```
   *Artifacts created in:* `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`

4. **Verify Local App Signature & Smoke Test the Binary**:
   - For local builds, macOS signs with your local identity (`Apple Development: Pawel Komorkiewicz (S394JGWXJZ)`) or ad-hoc:
     ```bash
     codesign -dv --verbose=4 src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Glance.app
     ```
   - Open the app locally to smoke test:
     - Test Voice Sync with a microphone.
     - Verify license status stays active.
     - Resize window to smallest height and verify text remains centered.
   *(Note: The official **Developer ID Application** signature and Apple Notarization that passes Gatekeeper `spctl -a -vvv -t install` are applied automatically by GitHub Actions in Stage 2 during the tag release build).*

---

### Stage 2: Publish GitHub Assets & Soft Launch to Website (New Buyers Only)

At this stage, you provide the new version to **new website visitors and buyers only**. Existing users will **not** be updated yet.

1. **Tag and Push to GitHub** (Triggers GitHub Actions CI to build official multi-platform release assets):
   ```bash
   git tag -a v0.4.0 -m "release: v0.4.0"
   git push origin v0.4.0
   ```
   *GitHub Actions will automatically build Apple Silicon Mac, Intel Mac, and Windows binaries, create the GitHub Release, and attach the files.*

2. **Update the Website Release Config**:
   Edit [`landing-page/assets/release-config.js`](./landing-page/assets/release-config.js):
   ```js
   window.__GLANCE_RELEASE__ = {
     version: 'v0.4.0',
     windowsLabel: 'v0.4.0 · 64-bit',
     artifactBaseName: 'Glance_0.4.0',
     workerBaseUrl: 'https://glance-payments.paulus-react.workers.dev',
     downloads: {
       windows: 'https://github.com/pawelkom88/glance/releases/download/v0.4.0/Glance_0.4.0_x64-setup.exe',
       macArm: 'https://github.com/pawelkom88/glance/releases/download/v0.4.0/Glance_0.4.0_aarch64.dmg',
       macIntel: 'https://github.com/pawelkom88/glance/releases/download/v0.4.0/Glance_0.4.0_x64.dmg',
     },
   };
   ```
   *(Or run: `node scripts/update-release-config.mjs --version v0.4.0`)*

3. **Deploy the Landing Page**:
   ```bash
   pnpm run deploy:landing
   ```
   *At this point: Anyone buying or downloading the trial from `atglance.app` gets `v0.4.0`.*
   *Existing users from 5 months ago are STILL on `v0.3.9` and untouched.*

4. **Monitor for 24–48 hours**:
   Check support emails (`hello@atglance.app`) or feedback to ensure no unexpected crashes.

---

### Stage 3: Rollout Auto-Update to Existing Users (Full Fleet)

Once you are confident `v0.4.0` is rock-solid in the wild, release the update to existing users:

1. **Obtain Updater Signatures**:
   In the GitHub Actions release build artifacts for `v0.4.0`, find the `.sig` files:
   - `Glance_0.4.0_aarch64.tar.gz.sig`
   - `Glance_0.4.0_x64_en-US.msi.zip.sig`

2. **Update [`landing-page/update.json`](./landing-page/update.json)**:
   ```json
   {
     "version": "0.4.0",
     "notes": "Added Voice-Synced Scrolling, dynamic font controls, and stability improvements.",
     "pub_date": "2026-09-06T12:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "<PASTE_CONTENT_FROM_aarch64_sig>",
         "url": "https://atglance.app/downloads/Glance_0.4.0_aarch64.tar.gz"
       },
       "windows-x86_64": {
         "signature": "<PASTE_CONTENT_FROM_windows_sig>",
         "url": "https://atglance.app/downloads/Glance_0.4.0_x64_en-US.msi.zip"
       }
     }
   }
   ```

3. **Deploy the updated updater manifest**:
   ```bash
   pnpm run deploy:landing
   ```

4. **Result**:
   When existing users open Glance, the app will check `https://atglance.app/update.json`, see `0.4.0 > 0.3.9`, silently download the verified package, and update.

---

## 4. Emergency Revocation & Rollback Playbook

If a critical bug is discovered, follow these exact procedures depending on who is affected:

### Scenario A: A bug is found during Stage 2 (Only new buyers/downloaders have it)

*Existing users are unaffected.*

1. Edit [`landing-page/assets/release-config.js`](./landing-page/assets/release-config.js):
   Change `version: 'v0.4.0'` back to `version: 'v0.3.9'` and point the download URLs back to `v0.3.9`.
2. Deploy to Netlify:
   ```bash
   pnpm run deploy:landing
   ```
   **Recovery time**: Under 30 seconds. All new buyers instantly receive stable `v0.3.9` again.

---

### Scenario B: A bug is found during Stage 3 (Existing users are auto-updating)

Tauri's updater uses SemVer comparison (`target_version > installed_version`). It will **not** downgrade if you simply change `update.json` back to `0.3.9`.

Follow this two-step emergency resolution:

1. **Step 1 — Stop the Bleeding (Halt further updates)**:
   Revert [`landing-page/update.json`](./landing-page/update.json) back to `0.3.9` and deploy immediately:
   ```bash
   pnpm run deploy:landing
   ```
   *This immediately stops any remaining users from downloading the buggy `0.4.0` update.*

2. **Step 2 — Roll Back Users Who Already Updated**:
   To automatically fix users whose apps already updated to `0.4.0`:
   - Create a hotfix version `v0.4.1` with the problem resolved (or reverting to the `0.3.9` code).
   - Tag and push `v0.4.1` to GitHub to generate signed release assets.
   - Update `landing-page/update.json` with `version: "0.4.1"`.
   - Deploy: `pnpm run deploy:landing`.
   - *Result*: Because `0.4.1 > 0.4.0`, all affected machines will automatically update to the clean `0.4.1` build on next launch.

---

## 5. Strict Payment & Security Guardrails

To protect customer billing and license activation integrity, **NEVER** edit or alter the following files during a release:

| Protected Area | Files / Configs | Why It Must NOT Be Changed |
| :--- | :--- | :--- |
| **Payment Worker** | `cloudflare-worker/` | Handles Stripe webhooks and customer checkout sessions. |
| **Cloudflare Config** | `wrangler.toml` | Manages DNS, allowed origins, and Stripe API secrets. |
| **Payment Worker URL** | `workerBaseUrl` in `release-config.js` | Must always remain `https://glance-payments.paulus-react.workers.dev`. |
| **License Verification** | `src/lib/license-api.ts` | Validates ECDSA cryptographic signatures for customer keys. |
| **Minisign Public Key** | `src-tauri/tauri.conf.json` (`pubkey`) | Must never change; changing this will permanently break auto-updates for all existing users. |

---

## 6. Pre-Release Checklist (Quick Reference)

Print or copy this checklist whenever preparing a release:

- [ ] `pnpm run test:critical` passes with 0 failures.
- [ ] `pnpm exec tsc --noEmit` exits with 0 errors.
- [ ] Local build (`pnpm run build:mac`) launches and operates cleanly.
- [ ] Code signature verified with `codesign -dv --verbose=4`.
- [ ] Payments & Stripe code were NOT touched (`git status` clean on payment files).
- [ ] Stage 1: Pushed tag to GitHub and verified GitHub Release assets.
- [ ] Stage 2: Updated `release-config.js` and deployed to landing page.
- [ ] Monitored for 24 hours.
- [ ] Stage 3: Updated `update.json` and deployed to landing page.
