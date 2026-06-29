# MCITY ERP — Windows Desktop App (Electron)

The web ERP is wrapped in a native Electron shell that loads the **deployed**
ERP URL at runtime. UI updates roll out automatically — no reinstall required.

## What's in this folder

```
electron/
  main.cjs        # main process: window, splash, navigation guard, state
  preload.cjs     # isolated bridge exposed as window.mcityDesktop
  splash.html     # native splash screen
electron-builder.yml   # Windows installer + portable build config
build/icon.ico         # ← add your 256x256 .ico here before building
```

## One-time setup (on your Windows machine)

After `git pull`:

```powershell
npm install
npm i -D electron@^31 electron-builder@^24
```

Place a Windows icon at `build/icon.ico` (256×256, multi-resolution).
Convert from `public/icon-512.png` with https://icoconvert.com or:

```powershell
magick public/icon-512.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico
```

Add these scripts to `package.json` (kept out of source so Lovable's web build
isn't affected — edit locally):

```json
"main": "electron/main.cjs",
"scripts": {
  "electron:dev": "set MCITY_ERP_URL=http://localhost:8080&& electron .",
  "electron:build": "electron-builder --win --config electron-builder.yml"
}
```

## Build the Windows installer

```powershell
npm run electron:build
```

Outputs in `electron-release/`:

- `MCITY-ERP-Setup-<version>.exe` — NSIS installer (Desktop + Start Menu shortcuts, change install dir, uninstaller)
- `MCITY-ERP-Portable-<version>.exe` — single-file portable build

## Point the shell at a different ERP URL

The shell defaults to `https://my-ishlab-chiqarish.vercel.app/`. Override per-environment:

```powershell
set MCITY_ERP_URL=https://erp.mcity.uz
npm run electron:build
```

Or hard-code production in `electron/main.cjs` (`APP_URL` constant).

## Features delivered

- Native window, taskbar icon, custom title, hidden menu bar
- Splash screen during startup, error screen if the server is unreachable
- First launch opens full screen; later launches restore size/position/maximize state
- Single-instance lock (re-launching focuses the existing window)
- External links open in the OS browser; navigation outside the allow-list is blocked
- Context menu disabled in production builds
- Context isolation + sandbox enabled, no Node in the renderer
- Always loads the deployed ERP, so UI updates require no reinstall

## Future: auto-updates

`electron-builder` already produces `latest.yml` artifacts. To enable
auto-updates later:

1. Add a `publish:` block to `electron-builder.yml` (e.g. `generic` with an
   HTTPS URL, or `github`).
2. `npm i electron-updater`.
3. In `electron/main.cjs` after `app.whenReady()`:
   ```js
   const { autoUpdater } = require("electron-updater");
   autoUpdater.checkForUpdatesAndNotify();
   ```

No other code changes required.
