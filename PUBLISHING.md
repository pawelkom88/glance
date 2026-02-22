# Publishing & Deployment Guide

This document outlines the end-to-end workflow for building Glance for production, preparing the installer files, and releasing Over-The-Air (OTA) updates via Netlify.

## 1. Prerequisites
To build the application, your environment must have:
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Rust](https://www.rust-lang.org/tools/install)
- The Tauri CLI (`npm add -D @tauri-apps/cli`)
- **For macOS builds:** A Mac with Xcode Command Line Tools installed (`xcode-select --install`).
- **For Windows builds:** A Windows PC or VM with Visual Studio C++ Build Tools installed.

### The Signing Key
Tauri's auto-updater relies on cryptographic signatures to verify that an update is legitimate.
You must have your private key (`glance.key`) located at `~/.tauri/glance.key` on the machine performing the build, and the `TAURI_SIGNING_PRIVATE_KEY` environment variable must be set to its path, or the build will prompt for a password.
**⚠️ NEVER commit `glance.key` to version control.**

---

## 2. Building the Application

When you are ready to cut a new release, first update the `"version"` field in `src-tauri/tauri.conf.json`.

### Building for macOS (Apple Silicon)
Run this command on your **Mac**:
```bash
npm run build:mac
```
**Outputs located in:** `src-tauri/target/aarch64-apple-darwin/release/bundle/`
- `dmg/Glance_X.X.X_aarch64.dmg` (The installer)
- `macos/Glance.app.tar.gz` (The update payload)
- `macos/Glance.app.tar.gz.sig` (The cryptographic signature for the update)

### Building for Windows (x64)
Run this command on your **Windows machine**:
```bash
npm run build:win
```
**Outputs located in:** `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`
- `msi/Glance_X.X.X_x64_en-US.msi` (The installer)
- `msi/Glance_X.X.X_x64_en-US.msi.zip` (The update payload)
- `msi/Glance_X.X.X_x64_en-US.msi.zip.sig` (The cryptographic signature for the update)

---

## 3. Staging Files on the Landing Page

Glance uses a static website hosted on Netlify as both its promotional landing page and its update server. 

Navigate to your `landing-page/` directory.

### Step 3a: Host the Installers
1. Ensure the `downloads/` directory exists inside `landing-page/`.
2. Copy the `.dmg` (from macOS) and the `.msi` (from Windows) into `landing-page/downloads/`.
3. Open `landing-page/index.html` and verify the download buttons (`<a href="...">`) point precisely to the new filenames.

### Step 3b: Host the Update Payloads
1. Copy the update payloads (`.tar.gz` for Mac, `.zip` for Windows) into `landing-page/downloads/`. 

Your `landing-page/downloads/` folder should now look like this:
```
downloads/
├── Glance_X.X.X_aarch64.dmg
├── Glance_X.X.X_aarch64.tar.gz
├── Glance_X.X.X_x64_en-US.msi
└── Glance_X.X.X_x64_en-US.msi.zip
```

---

## 4. Releasing the OTA Update
Open `landing-page/update.json`. This is the manifest file the installed apps check on startup.

1. **Update the Metadata**: Change `version`, `notes`, and `pub_date`.
2. **Update the Signatures**: Open the `.sig` files generated during the build process. Copy their exact text content and paste them into the "signature" fields.
3. **Update the URLs**: Ensure the URLs point to the newly named `.tar.gz` and `.zip` files hosted on your live Netlify domain.

**Example `update.json`:**
```json
{
  "version": "X.X.X",
  "notes": "Added cool new feature.",
  "pub_date": "2025-02-22T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "PASTE_CONTENTS_OF_MAC_SIG_FILE_HERE",
      "url": "https://YOUR_APP_DOMAIN.netlify.app/downloads/Glance_X.X.X_aarch64.tar.gz"
    },
    "windows-x86_64": {
      "signature": "PASTE_CONTENTS_OF_WIN_SIG_FILE_HERE",
      "url": "https://YOUR_APP_DOMAIN.netlify.app/downloads/Glance_X.X.X_x64_en-US.msi.zip"
    }
  }
}
```

---

## 5. Deploy to Netlify
Once the installer buttons are updated and the `update.json` is accurately pointing to the signed payloads, deploy the `landing-page/` directory to Netlify.

### User Flow
- **New Users:** Will click the buttons on the landing page and receive the direct `.dmg` or `.msi` installers.
- **Existing Users:** The next time they open the Glance app, it will silently fetch `update.json`, verify the cryptographic signatures against the public key hardcoded in `tauri.conf.json`, download the `.tar.gz` or `.zip`, and install the update in the background.
