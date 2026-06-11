# MCITY ERP — Desktop & Mobile Deployment

The same Supabase backend is shared across Web, Windows, Android and iOS.
Users log in with the same account everywhere.

---

## 1. PWA (Installable Web App) — already done

- `public/manifest.webmanifest` + `theme-color` + Apple icons added to `index.html`.
- After publishing, users can install from:
  - **Chrome/Edge desktop**: install icon in the address bar → "Install MCITY ERP".
  - **Android Chrome**: menu → "Install app".
  - **iOS Safari**: Share → "Add to Home Screen".

> Per Lovable guidance, no service worker is added unless you explicitly need
> full offline support. Ask if you want offline caching enabled.

---

## 2. Android & iOS (Capacitor)

Capacitor is configured (`capacitor.config.ts`). Native projects are **not**
checked into Lovable — generate them on your machine:

1. **Export to GitHub** (top-right of Lovable editor) and `git pull` locally.
2. `npm install`
3. `npx cap add android` and/or `npx cap add ios`
4. `npm run build`
5. `npx cap sync`
6. Run:
   - Android: `npx cap run android` (requires Android Studio)
   - iOS: `npx cap run ios` (requires macOS + Xcode)

After every `git pull`, run `npx cap sync` to refresh native assets.

### Generate icons & splash
```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor "#0f172a" \
  --iconBackgroundColorDark "#0f172a" \
  --splashBackgroundColor "#0f172a"
```
Place a 1024×1024 source at `resources/icon.png` and `resources/splash.png`.

### Build release artifacts
- **Android APK / AAB**: open `android/` in Android Studio → Build → Generate Signed Bundle/APK.
- **iOS IPA**: open `ios/App/App.xcworkspace` in Xcode → Product → Archive.

### Plugins already installed
- `@capacitor/splash-screen`
- `@capacitor/push-notifications`
- `@capacitor/camera`

For push notifications on Android, add `google-services.json` (Firebase) into
`android/app/`. For iOS, enable Push Notifications capability in Xcode and
upload an APNs key to Firebase.

---

## 3. Windows Desktop (Electron)

Electron isn't bundled by default — add it locally after `git pull`:

```bash
npm i -D electron @electron/packager
```

Set Vite base for Electron (`vite.config.ts`):
```ts
base: process.env.ELECTRON ? './' : '/',
```

Create `electron/main.cjs`:
```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    icon: path.join(__dirname, '..', 'public', 'icon-512.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

Add to `package.json`:
```json
"main": "electron/main.cjs",
"scripts": {
  "electron:build": "ELECTRON=1 vite build && npx @electron/packager . \"MCITY ERP\" --platform=win32 --arch=x64 --icon=public/icon.ico --out=electron-release --overwrite"
}
```

Convert `public/icon-512.png` → `public/icon.ico` (use https://icoconvert.com or `imagemagick`).

Run `npm run electron:build` on Windows (or with Wine) to produce
`electron-release/MCITY ERP-win32-x64/MCITY ERP.exe`. Wrap with
[Inno Setup](https://jrsoftware.org/isinfo.php) for a proper installer with
Desktop + Start Menu shortcuts.

---

## 4. Shared backend

All platforms use the same Supabase project via `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in `.env`. No code changes needed — login,
orders, OTK, warehouse, kassa, notifications all sync in realtime.
