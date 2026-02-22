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

**Privacy First:** Glance operates entirely locally. There are no subscriptions, no accounts, and absolutely no telemetry. Your scripts never leave your machine.

## Key Features

- 🫥 **Transparent Overlay:** Fluidly adjust the opacity of the prompter so you can read your script while still seeing your video feed or audience behind it.
- 🎯 **Reading Ruler:** A built-in focus guide helps you keep your place without losing your train of thought.
- ⏱️ **Adjustable Speed & Formatting:** Complete control over scroll speed, font size, and text alignment.
- 📝 **Markdown Support:** Load your scripts directly from `.md` files or paste text on the fly.
- 🔒 **100% Local:** No cloud sync. Everything is stored locally on your device for absolute privacy.
- 🚀 **Auto-Updater:** Seamless over-the-air updates ensure you always have the latest improvements.

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
The promotional landing page is located in the `landing-page/` directory. It is a static, zero-build vanilla HTML/CSS site designed for immediate hosting on platforms like Netlify or GitHub Pages.

To preview the landing page locally:
```bash
cd landing-page
npx live-server .
```

---

<div align="center">
  Built with ❤️ using <a href="https://v2.tauri.app/">Tauri</a>.
</div>
