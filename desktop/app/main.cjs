// StreamPull desktop shell: runs the bundled Next.js server on a private
// localhost port and shows it in a window, with yt-dlp and ffmpeg built in.
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { spawn, spawnSync, execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const isWin = process.platform === "win32";
const exe = isWin ? ".exe" : "";

// Packaged, everything sits in resources/. Run from source, use the repo's
// desktop/ build output (see scripts/build-desktop.mjs).
const repo = path.join(__dirname, "..", "..");
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(repo, "desktop", "server");
const binDir = app.isPackaged
  ? path.join(process.resourcesPath, "bin")
  : path.join(repo, "desktop", "bin", isWin ? "win" : "linux");
// Point at a running `pnpm dev` instead of the bundled server, for UI work.
const devUrl = process.env.STREAMPULL_DEV_URL;

let server = null;
let mainWindow = null;
let origin = null;
let token = null;
let quitting = false;
let logStream = null;

const STRINGS = {
  en: {
    stillRunning: (n) => (n === 1 ? "1 download is still running." : `${n} downloads are still running.`),
    stillRunningDetail: "Quitting stops them. Start the same download again later and it picks up where it left off.",
    quit: "Quit",
    keep: "Keep downloading",
    startFailed: "StreamPull couldn't start",
    crashed: "StreamPull stopped unexpectedly",
    seeLog: (file) => `Details were written to:\n${file}`,
  },
  ar: {
    stillRunning: (n) => (n === 1 ? "لا يزال تنزيل واحد قيد التشغيل." : `لا تزال ${n} تنزيلات قيد التشغيل.`),
    stillRunningDetail: "سيؤدي الخروج إلى إيقافها. ابدأ التنزيل نفسه لاحقًا وسيُكمل من حيث توقف.",
    quit: "خروج",
    keep: "متابعة التنزيل",
    startFailed: "تعذّر تشغيل StreamPull",
    crashed: "توقف StreamPull بشكل غير متوقع",
    seeLog: (file) => `كُتبت التفاصيل في:\n${file}`,
  },
};

// Follows the language the user picked in the app; Arabic is the app's default.
async function strings() {
  try {
    const [c] = await session.defaultSession.cookies.get({ url: origin, name: "NEXT_LOCALE" });
    return STRINGS[c?.value === "en" ? "en" : "ar"];
  } catch {
    return STRINGS.ar;
  }
}

const logFile = () => path.join(app.getPath("logs"), "server.log");
function log(chunk) {
  if (!logStream) {
    fs.mkdirSync(app.getPath("logs"), { recursive: true });
    logStream = fs.createWriteStream(logFile(), { flags: "w" });
  }
  logStream.write(chunk);
}

const readText = (file) => {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
};

// yt-dlp has to be updated every few weeks as YouTube changes, but the install
// folder (and an AppImage) is read-only, so run a copy from the user's data.
function prepareYtDlp() {
  const shipped = path.join(binDir, `yt-dlp${exe}`);
  const dir = path.join(app.getPath("userData"), "bin");
  const copy = path.join(dir, `yt-dlp${exe}`);
  const shippedVersion = readText(path.join(binDir, "yt-dlp.version"));
  const copyVersion = readText(path.join(dir, "yt-dlp.version"));
  // Versions are dates (2026.08.19), so they compare as strings.
  if (!fs.existsSync(copy) || (shippedVersion && shippedVersion > copyVersion)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(shipped, copy);
    fs.chmodSync(copy, 0o755);
    fs.writeFileSync(path.join(dir, "yt-dlp.version"), shippedVersion);
  }
  return copy;
}

function updateYtDlpInBackground(ytdlp) {
  const dir = path.dirname(ytdlp);
  const stamp = path.join(dir, "last-update-check");
  if (Date.now() - (Number(readText(stamp)) || 0) < 24 * 60 * 60 * 1000) return;
  fs.writeFileSync(stamp, String(Date.now()));
  execFile(ytdlp, ["-U"], { windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => {
    log(`[yt-dlp -U] ${err ? "failed: " + err.message : ""}\n${stdout}${stderr}\n`);
    execFile(ytdlp, ["--version"], { windowsHide: true }, (vErr, version) => {
      if (!vErr && version.trim()) fs.writeFileSync(path.join(dir, "yt-dlp.version"), version.trim());
    });
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!server) throw new Error("The server exited during startup.");
    try {
      const res = await fetch(`${url}/favicon.ico`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`The server didn't answer within ${timeoutMs / 1000}s.`);
}

async function startServer(ytdlp) {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  token = crypto.randomBytes(32).toString("hex");
  const ffmpeg = isWin ? path.join(binDir, "ffmpeg", "ffmpeg.exe") : path.join(binDir, "ffmpeg", "bin", "ffmpeg");

  // Electron's own binary doubles as Node, so no separate runtime is shipped.
  server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1", // loopback only, never the local network
      STREAMPULL_TOKEN: token,
      STREAMPULL_HOST: `127.0.0.1:${port}`,
      STREAMPULL_YTDLP: ytdlp,
      STREAMPULL_FFMPEG: ffmpeg,
      STREAMPULL_DOWNLOADS_DIR: app.getPath("downloads"),
    },
    windowsHide: true,
    // Its own process group on Linux, so quitting can stop yt-dlp and ffmpeg too.
    detached: !isWin,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", log);
  server.stderr.on("data", log);
  server.on("exit", async (code) => {
    log(`\n[server exited with code ${code}]\n`);
    server = null;
    if (quitting) return;
    const s = await strings();
    dialog.showErrorBox(s.crashed, s.seeLog(logFile()));
    quitting = true;
    app.quit();
  });

  await waitForServer(origin);
  // The API refuses requests without this, so only this window can drive it.
  await session.defaultSession.cookies.set({
    url: origin,
    name: "sp_token",
    value: token,
    httpOnly: true,
    sameSite: "strict",
  });
}

// yt-dlp and ffmpeg are children of the server; killing only the server would
// leave them downloading after the app has gone.
function stopServer() {
  if (!server) return;
  const pid = server.pid;
  server = null;
  try {
    if (isWin) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    else process.kill(-pid, "SIGTERM");
  } catch {
    // already gone
  }
}

async function activeDownloads() {
  try {
    const res = await fetch(`${origin}/api/jobs`, { headers: { cookie: `sp_token=${token}` } });
    const { jobs } = await res.json();
    return jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  } catch {
    return 0;
  }
}

const isAppUrl = (url) => url === origin || url.startsWith(origin + "/");
const openInBrowser = (url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#09090b", // the app's background, so there's no white flash
    title: "StreamPull",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Anything that isn't the app itself opens in the user's browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openInBrowser(url);
    }
  });

  mainWindow.on("close", async (event) => {
    if (quitting) return;
    event.preventDefault();
    const running = devUrl ? 0 : await activeDownloads();
    if (running > 0) {
      const s = await strings();
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: "question",
        buttons: [s.quit, s.keep],
        defaultId: 1,
        cancelId: 1,
        message: s.stillRunning(running),
        detail: s.stillRunningDetail,
      });
      if (response !== 0) return;
    }
    quitting = true;
    app.quit();
  });

  mainWindow.loadURL(origin);
}

// Only the app's own page may use the bridge.
const fromApp = (event) => isAppUrl(event.senderFrame?.url ?? "");

ipcMain.handle("pick-folder", async (event, current) => {
  if (!fromApp(event)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: typeof current === "string" && current ? current : app.getPath("downloads"),
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || !result.filePaths[0] ? null : result.filePaths[0];
});

ipcMain.handle("open-folder", async (event, dir) => {
  if (!fromApp(event)) return "Not allowed.";
  if (typeof dir !== "string" || !dir) return "No folder given.";
  if (!fs.existsSync(dir)) return "That folder doesn't exist yet.";
  return shell.openPath(dir);
});

async function start() {
  try {
    if (devUrl) {
      origin = devUrl.replace(/\/+$/, "");
    } else {
      const ytdlp = prepareYtDlp();
      await startServer(ytdlp);
      updateYtDlpInBackground(ytdlp);
    }
    createWindow();
  } catch (err) {
    log(`\n[startup failed] ${err && err.stack ? err.stack : err}\n`);
    const s = await strings();
    dialog.showErrorBox(s.startFailed, `${err && err.message ? err.message : err}\n\n${s.seeLog(logFile())}`);
    quitting = true;
    stopServer();
    app.quit();
  }
}

// A second copy would start a second server — and a second, competing
// download of whatever the first one is fetching.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", stopServer);
  app.whenReady().then(start);
}
