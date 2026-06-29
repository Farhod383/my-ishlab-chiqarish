/* MCITY ERP — Electron main process (Windows desktop shell)
 *
 * Loads the deployed ERP web app inside a native window so the desktop
 * client always runs the latest version without reinstalling.
 *
 * Override the URL at build time or runtime:
 *   MCITY_ERP_URL=https://erp.example.com  npm run electron:dev
 */
const { app, BrowserWindow, Menu, shell, dialog, session } = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");

// ---------- single instance ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ---------- config ----------
const APP_URL =
  process.env.MCITY_ERP_URL ||
  "https://my-ishlab-chiqarish.vercel.app/";
const IS_DEV = !app.isPackaged;
const STATE_FILE = path.join(app.getPath("userData"), "window-state.json");
const ICON_PATH = path.join(__dirname, "..", "build", "icon.ico");

let mainWindow = null;
let splashWindow = null;

// ---------- window state persistence ----------
function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}
function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
  const state = {
    ...bounds,
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch {}
}

// ---------- splash ----------
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 300,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    show: true,
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    backgroundColor: "#0f172a",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.on("closed", () => (splashWindow = null));
}

// ---------- error screen ----------
function showErrorScreen(message) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
  <title>MCITY ERP — Ulanish xatosi</title>
  <style>
    html,body{margin:0;height:100%;font-family:Segoe UI,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center}
    .card{max-width:480px;padding:32px;text-align:center}
    h1{font-size:20px;margin:0 0 12px}
    p{color:#94a3b8;font-size:14px;line-height:1.5}
    button{margin-top:20px;background:#1e3a8a;color:#fff;border:0;padding:10px 22px;border-radius:8px;font-size:14px;cursor:pointer}
    button:hover{background:#1d4ed8}
    code{display:block;margin-top:14px;font-size:12px;color:#64748b;word-break:break-all}
  </style></head><body>
  <div class="card">
    <h1>Serverga ulanib bo'lmadi</h1>
    <p>Internet aloqasi yoki ERP serverga ulanishni tekshiring va qayta urinib ko'ring.</p>
    <button onclick="location.reload()">Qayta urinib ko'rish</button>
    <code>${String(message || "").replace(/[<>&]/g, "")}</code>
  </div>
  <script>
    const { ipcRenderer } = require ? {} : {};
  </script>
  </body></html>`;
  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

// ---------- main window ----------
function createMainWindow() {
  const saved = loadWindowState();
  const isFirstLaunch = !saved;

  mainWindow = new BrowserWindow({
    width: saved?.width || 1400,
    height: saved?.height || 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: "#0f172a",
    title: "MCITY ERP",
    icon: fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
      spellcheck: false,
    },
  });

  // hide default menu bar in production
  Menu.setApplicationMenu(IS_DEV ? Menu.getApplicationMenu() : null);

  // restore maximize / fullscreen
  if (isFirstLaunch) {
    mainWindow.setFullScreen(true);
  } else {
    if (saved.isMaximized) mainWindow.maximize();
    if (saved.isFullScreen) mainWindow.setFullScreen(true);
  }

  // persist state
  ["resize", "move", "close", "maximize", "unmaximize"].forEach((ev) =>
    mainWindow.on(ev, () => saveWindowState(mainWindow))
  );

  // show when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  });

  // disable context menu in production
  if (!IS_DEV) {
    mainWindow.webContents.on("context-menu", (e) => e.preventDefault());
  }

  // block navigation to external origins; open them in OS browser
  const allowedOrigin = new URL(APP_URL).origin;
  const allowOrigin = (target) => {
    try {
      const o = new URL(target).origin;
      // allow the ERP host + its Supabase API + Vercel deployment previews
      return (
        o === allowedOrigin ||
        o.endsWith(".vercel.app") ||
        o.endsWith(".supabase.co")
      );
    } catch {
      return false;
    }
  };

  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!allowOrigin(target)) {
      event.preventDefault();
      shell.openExternal(target).catch(() => {});
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (allowOrigin(target)) return { action: "allow" };
    shell.openExternal(target).catch(() => {});
    return { action: "deny" };
  });

  // handle load failures with error screen
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    if (code === -3) return; // aborted (navigation replaced)
    showErrorScreen(`${desc} (${code}) — ${validatedURL}`);
  });

  // load ERP
  mainWindow.loadURL(APP_URL).catch((err) => showErrorScreen(err.message));

  mainWindow.on("closed", () => (mainWindow = null));
}

// ---------- second instance focuses existing window ----------
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  // tighten default session a bit
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: details.responseHeaders });
  });

  createSplash();
  // give the splash a moment, then build the main window
  setTimeout(createMainWindow, 600);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
