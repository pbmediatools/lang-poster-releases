// Electron main process — wraps the Next.js app as a desktop app.
//
// Dev:  reuses an existing `next dev` server on port 3030
// Prod: spawns the Next standalone server (.next/standalone/server.js)
//       using ELECTRON_RUN_AS_NODE so we don't need a separate node binary.

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

// Auto-updater — only active in packaged builds
let autoUpdater = null;
if (app.isPackaged) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
    autoUpdater.autoDownload = true;       // download silently in background
    autoUpdater.autoInstallOnAppQuit = true; // install when user next quits
    autoUpdater.logger = null;             // suppress noisy logs
  } catch {
    // electron-updater not available — updates disabled
    autoUpdater = null;
  }
}

const isDev = !app.isPackaged;
const PORT = isDev ? 3030 : 3031;

let serverProcess = null;
let mainWindow = null;

app.setName("Lang Property Poster");

// --- Config (API key) -----------------------------------------------------

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function promptForApiKey() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 280,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Lang Property Poster — Setup",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
      },
    });
    win.loadFile(path.join(__dirname, "prompt.html"));

    const onSubmit = (_evt, key) => {
      ipcMain.removeListener("api-key:submit", onSubmit);
      ipcMain.removeListener("api-key:cancel", onCancel);
      win.close();
      resolve(key);
    };
    const onCancel = () => {
      ipcMain.removeListener("api-key:submit", onSubmit);
      ipcMain.removeListener("api-key:cancel", onCancel);
      win.close();
      resolve(null);
    };
    ipcMain.on("api-key:submit", onSubmit);
    ipcMain.on("api-key:cancel", onCancel);
    win.on("closed", () => {
      ipcMain.removeListener("api-key:submit", onSubmit);
      ipcMain.removeListener("api-key:cancel", onCancel);
      resolve(null);
    });
  });
}

async function ensureApiKey() {
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
    return process.env.ANTHROPIC_API_KEY.trim();
  }
  const cfg = loadConfig();
  if (cfg.anthropicApiKey) return cfg.anthropicApiKey;

  const key = await promptForApiKey();
  if (!key) return null;
  saveConfig({ ...cfg, anthropicApiKey: key.trim() });
  return key.trim();
}

// --- Server lifecycle -----------------------------------------------------

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server did not respond within ${timeoutMs}ms`));
        } else {
          setTimeout(tick, 250);
        }
      });
    };
    tick();
  });
}

function startServer(apiKey) {
  if (isDev) return; // user runs `next dev` themselves

  // Packaged layout (electron-builder): app contents at process.resourcesPath/app
  const standaloneDir = path.join(
    process.resourcesPath,
    "app",
    ".next",
    "standalone",
  );
  const serverScript = path.join(standaloneDir, "server.js");

  // Write server logs to a file so we can diagnose crashes on any platform
  const logPath = path.join(app.getPath("userData"), "server.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  logStream.write(`\n--- Server start ${new Date().toISOString()} ---\n`);
  logStream.write(`standaloneDir: ${standaloneDir}\n`);
  logStream.write(`serverScript: ${serverScript}\n`);
  logStream.write(`exists: ${fs.existsSync(serverScript)}\n`);

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      ANTHROPIC_API_KEY: apiKey,
      NODE_ENV: "production",
      USERDATA_PATH: app.getPath("userData"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.pipe(logStream);
  serverProcess.stderr.pipe(logStream);

  serverProcess.on("exit", (code, signal) => {
    logStream.write(`Server exited code=${code} signal=${signal}\n`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "Server stopped",
        `Next.js server exited (code=${code}, signal=${signal}).\n\nLog file: ${logPath}`,
      );
    }
    serverProcess = null;
  });
}

function killServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

// --- Main window ----------------------------------------------------------

async function createWindow(apiKey) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    title: "Lang Property Poster",
    webPreferences: { contextIsolation: true },
  });

  // Open external links in the user's browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    await waitForServer(`http://127.0.0.1:${PORT}`);
  } catch (e) {
    dialog.showErrorBox(
      "Could not start server",
      `${e.message}\n\nIf in dev mode, make sure 'next dev' is running on port ${PORT}.`,
    );
    app.quit();
    return;
  }

  await mainWindow.loadURL(`http://127.0.0.1:${PORT}/post`);

  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
}

// --- App lifecycle --------------------------------------------------------

app.whenReady().then(async () => {
  const apiKey = await ensureApiKey();
  if (!apiKey) {
    app.quit();
    return;
  }
  startServer(apiKey);
  await createWindow(apiKey);

  // Check for updates quietly — download happens in background
  if (autoUpdater) {
    autoUpdater.on("update-downloaded", () => {
      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update ready",
        message: "A new version of Lang Poster has been downloaded.",
        detail: "It will be installed the next time you quit and reopen the app.",
        buttons: ["OK"],
      });
    });
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore — no internet, no releases yet, etc.
    });
  }
});

app.on("window-all-closed", () => {
  killServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  killServer();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    ensureApiKey().then((apiKey) => {
      if (apiKey) createWindow(apiKey);
    });
  }
});
