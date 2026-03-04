---
title: "Windows Installation Help — Glance"
slug: "/help/windows-install/"
meta_title: "Windows Installation Help — Glance"
meta_description: "Explanations of common install outcomes and error codes for installing Glance on Windows."
---

# Windows installation help

This page explains common install outcomes and error codes for installing **Glance** on Windows (including installs initiated via Microsoft Store / Partner Center).

---

## Installer return codes

### Code `0` — Success
The app installed successfully.

### Code `1` — Cancelled by user
The installation was cancelled before completion.

### Code `2` — Installation failed
A generic installer failure. Common causes include:
- the app (or related process) was running and files were locked
- security software blocked the installer
- missing system components (for example, WebView2 Runtime)
- insufficient permissions or a system policy preventing the install

---

## What to do if installation fails (especially code `2`)
Try these in order:
1. **Restart Windows**, then install again.
2. **Close Glance if it’s running**, then retry the installer.
3. **Check Windows Security / antivirus**
   - If “Controlled folder access” (Ransomware protection) is enabled, it may block installers.
   - Temporarily disable it or allow the installer, then retry.
4. **Ensure Microsoft Edge WebView2 Runtime is installed**
   - Many Tauri-based apps require WebView2 on Windows.
   - Install WebView2 Runtime (Evergreen) and retry.
5. If it still fails, contact support and include:
   - the **error code** (0 / 1 / 2)
   - your Windows version (e.g., Windows 11 23H2)
   - the installer filename (e.g., `Glance_0.2.0_x64-setup.exe`)
   - a screenshot of the error (if available)

---

## How to verify the return code on your PC (advanced)
If you’re testing locally, you can run the installer from Command Prompt and read the exit code.

### Verify success (`0`)
```
Glance_0.2.0_x64-setup.exe /S
echo %ERRORLEVEL%
```

### Verify cancel (`1`)
Run the installer **without** `/S`, click **Cancel**, then:
```
echo %ERRORLEVEL%
```

### Verify failure (`2`)
To intentionally trigger a failure, try installing while the app is running:
1. Start Glance.
2. Run:
```
Glance_0.2.0_x64-setup.exe /S
echo %ERRORLEVEL%
```
If the installer aborts, you may see code `2`.

---

## Need help?
Email support with the details listed above and we’ll help you get installed.

---
© 2026 Glance. Not affiliated with Zoom, Microsoft, or Google.
