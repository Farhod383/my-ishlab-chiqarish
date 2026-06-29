// Preload runs in an isolated world. Kept intentionally minimal —
// the web app already talks to its backend directly via fetch.
// Future native bridges (auto-update notifications, file pickers) can be
// exposed here through contextBridge.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("mcityDesktop", {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
});
