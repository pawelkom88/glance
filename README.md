<div align="center">
  <img src="landing-page/glance-new-icon-macos.svg" alt="Glance Logo" width="120" />
</div>

<h1 align="center">Glance Teleprompter</h1>

<p align="center">
  <strong>Read naturally. Present flawlessly.</strong><br>
  <em>The elegant, transparent teleprompter that stays out of your way.</em>
</p>

## Overview

Glance is a minimalist, local-only transparent teleprompter designed for macOS and Windows. Built specifically for professionals, creators, and public speakers, Glance allows you to maintain perfect eye contact during video calls and presentations by overlaying your script directly on top of your screen—without blocking your view of your audience.

**Privacy First:** Glance runs locally after activation. There are no subscriptions, no accounts, and absolutely no telemetry. Your scripts never leave your machine.

## Key Features

- 🎙️ **Real-Time Voice Sync:** Uses speech recognition to follow your voice and smoothly scroll your script word-by-word with fluid spring physics.
- 🫥 **Transparent Overlay:** Fluidly adjust the opacity of the prompter so you can read your script while still seeing your video feed or audience behind it.
- 🎯 **Reading Ruler & Eyeline Guides:** Built-in focus guides help you keep your place without losing your train of thought.
- ⏱️ **Adjustable Speed & Formatting:** Complete control over scroll speed, font size, and text alignment.
- 📝 **Markdown Support:** Load your scripts directly from `.md` files or paste text on the fly.
- 🔒 **Local-First:** No cloud sync. Scripts and settings stay on your device, and the app can launch offline after its first license activation on that machine.
- 🚀 **Auto-Updater:** Seamless over-the-air updates ensure you always have the latest improvements.

## Real-Time Voice Sync Setup

Glance features real-time voice-tracked scrolling powered by speech recognition via Speechmatics.

1. **Get an API Key:** Sign up at [portal.speechmatics.com](https://portal.speechmatics.com). Speechmatics provides free trial credits upon account creation with no credit card required upfront.
2. **Add to Glance:** Open Glance **Settings** (gear icon) and paste your key into the **Speechmatics API Key** field.
3. **Turn on Voice Sync:** In the overlay controls, toggle **Voice Sync** on. Read naturally—Glance follows your pacing, handling stumbles and pauses seamlessly.

> **Privacy & Non-Affiliation:** Glance connects directly from your local machine to Speechmatics over encrypted WebSockets using your own API key. No voice, audio, or script data ever passes through or is stored on Glance servers.  
> *Glance is an independent local-first application and is not affiliated with, sponsored by, or endorsed by Speechmatics in any way. Speechmatics is a registered trademark of Speechmatics Ltd.*

## Technology Stack

Glance is compiled as a lightweight desktop application utilizing the modern **Tauri v2** framework.

- **Frontend:** React, TypeScript, Vite
- **Backend:** Rust
- **Styling:** CSS
- **Icons:** Lucide React

## Local Development Execution

To run Glance locally, ensure you have [Node.js](https://nodejs.org/), [Rust](https://www.rust-lang.org/tools/install), and the platform-specific build tools installed (Xcode Command Line Tools for macOS; Visual Studio C++ Build Tools for Windows).

1. **Clone the repository:**
   ```bash
   git clone git@github.com-personal:pawelkom88/glance.git
   cd glance
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   Launch the Vite dev server and the Tauri Rust backend simultaneously:
   ```bash
   npm run tauri:dev
   ```

## Building for Production

Glance uses custom npm scripts to target specific platforms during the build process.

For offline post-activation licensing, build the desktop app with `GLANCE_LICENSE_PUBLIC_KEY` set to the Ed25519 public key that matches the Worker secret `LICENSE_ACTIVATION_PRIVATE_KEY`.

Local builds can load this automatically from `.env.local` or `.env.build` in the repo root:

```bash
GLANCE_LICENSE_PUBLIC_KEY=your_public_key_here
```

Then use `pnpm run tauri:build`, `pnpm run build:mac`, or `pnpm run build:win` normally.

For a release push flow, use:

```bash
pnpm run push:release
```

That script:
- bumps the patch version by default
- updates `package.json` and `src-tauri/Cargo.toml`
- refreshes landing-page release config files
- creates a Git commit and `vX.Y.Z` tag
- pushes branch + tag to GitHub

GitHub Actions then builds release artifacts from the pushed tag. To embed the public key in CI builds, add `GLANCE_LICENSE_PUBLIC_KEY` to your GitHub Actions repository secrets.

**To build the macOS App and DMG installer (Apple Silicon):**
```bash
npm run build:mac
```
*Outputs to: `src-tauri/target/aarch64-apple-darwin/release/bundle/`*

**To build the Windows MSI/EXE installer:**
```bash
npm run build:win
```
*(Note: Building for Windows generally requires running the command on a Windows machine or a configured cross-compilation environment).*

## Landing Page
The promotional landing page is located in the `landing-page/` directory. It is deployed as static files with Netlify Edge negotiation:

- `text/html` (default browser behavior) returns `*.html`
- `text/markdown` (LLM/agent-friendly) returns `*.md` when available for that route
- Edge function source: `netlify/edge-functions/accept-markdown.js`
- Netlify config: `netlify.toml`

To preview the landing page with Edge Functions locally:
```bash
npx netlify dev
```

Test HTML vs Markdown responses:
```bash
curl -i -H "Accept: text/html" http://127.0.0.1:8888/
curl -i -H "Accept: text/markdown, text/html;q=0.8" http://127.0.0.1:8888/
```

---

<div align="center">
  Built with ❤️ using <a href="https://v2.tauri.app/">Tauri</a>.
</div>
