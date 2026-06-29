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
    .card{max-width:520px;padding:36px;text-align:center}
    .icon{width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;color:#ef4444;font-size:30px}
    h1{font-size:20px;margin:0 0 12px;font-weight:600}
    p{color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 8px;white-space:pre-line}
    .spinner{margin:18px auto 0;width:22px;height:22px;border:3px solid rgba(148,163,184,.25);border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    button{margin-top:22px;background:#1e3a8a;color:#fff;border:0;padding:10px 22px;border-radius:8px;font-size:14px;cursor:pointer}
    button:hover{background:#1d4ed8}
    code{display:block;margin-top:14px;font-size:11px;color:#475569;word-break:break-all;opacity:.7}
  </style></head><body>
  <div class="card">
    <div class="icon">⚠</div>
    <h1>Internet aloqasi mavjud emas</h1>
    <p>Server bilan qayta bog'lanishga urinilmoqda...</p>
    <div class="spinner"></div>
    <button onclick="location.reload()">Qayta urinib ko'rish</button>
    <code>${String(message || "").replace(/[<>&]/g, "")}</code>
  </div>
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

  // disable context menu + devtools in production
  if (!IS_DEV) {
    mainWindow.webContents.on("context-menu", (e) => e.preventDefault());
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
    mainWindow.webContents.on("before-input-event", (event, input) => {
      const key = (input.key || "").toLowerCase();
      // Block F12, Ctrl/Cmd+Shift+I/J/C, Ctrl+U
      if (
        key === "f12" ||
        ((input.control || input.meta) && input.shift && ["i", "j", "c"].includes(key)) ||
        ((input.control || input.meta) && key === "u")
      ) {
        event.preventDefault();
      }
    });
  }

  // auto-reconnect when network returns after a load failure
  let reconnectTimer = null;
  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
        return;
      }
      mainWindow.webContents
        .executeJavaScript("navigator.onLine")
        .then((isOnline) => {
          if (isOnline) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
            mainWindow.loadURL(APP_URL).catch(() => {});
          }
        })
        .catch(() => {});
    }, 3000);
  };

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

  // handle load failures with error screen + auto-reconnect
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    if (code === -3) return; // aborted (navigation replaced)
    showErrorScreen(`${desc} (${code}) — ${validatedURL}`);
    scheduleReconnect();
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
