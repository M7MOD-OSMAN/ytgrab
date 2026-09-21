// Launches a packaged StreamPull and checks it works: window, bundled binaries, locked API.
//   node scripts/smoke-desktop.mjs <path-to-executable> [extra app args...]
import { spawn } from "node:child_process";
import http from "node:http";

const [exe, ...extra] = process.argv.slice(2);
if (!exe) {
  console.error("usage: node scripts/smoke-desktop.mjs <executable> [args...]");
  process.exit(2);
}
const PORT = 9300 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures.push(label);
};

// VS Code's extension host exports this, and it makes Electron start as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(exe, [`--remote-debugging-port=${PORT}`, ...extra], { stdio: "ignore", env });
let exited = false;
app.on("exit", () => (exited = true));

let target;
for (let i = 0; i < 240 && !target && !exited; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page" && t.url.startsWith("http://127.0.0.1:"));
  } catch {
    // DevTools not up yet
  }
  if (!target) await sleep(250);
}
check("app window loaded its local server", !!target, target?.url ?? (exited ? "app exited" : "timed out"));
if (!target) {
  app.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 1;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = id++;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;

for (let i = 0; i < 120 && !(await evaluate("!!document.querySelector('input[dir=auto]')")); i++) await sleep(250);
const setup = await evaluate("fetch('/api/setup').then((r) => r.json())");
check("ready with no installs", setup?.ready === true);
check("uses its own yt-dlp copy", /StreamPull[\\/]bin[\\/]yt-dlp(\.exe)?$/i.test(setup?.ytDlp?.binPath ?? ""), setup?.ytDlp?.binPath);
check("uses the bundled ffmpeg", /resources[\\/]bin[\\/]ffmpeg[\\/]/.test(setup?.ffmpeg?.binPath ?? ""), setup?.ffmpeg?.binPath);
check("ffmpeg runs", /^ffmpeg version/.test(setup?.ffmpeg?.version ?? ""), setup?.ffmpeg?.version);

const serverPort = Number(new URL(target.url).port);
const outsideStatus = await new Promise((resolve) => {
  const req = http.get({ host: "127.0.0.1", port: serverPort, path: "/api/jobs" }, (res) => {
    res.resume();
    resolve(res.statusCode);
  });
  req.on("error", () => resolve(-1));
});
check("API refuses requests from outside the app", outsideStatus === 403, `HTTP ${outsideStatus}`);

// With a DevTools port open the main process lingers after close (a real close exits in
// under a second), so check what matters: the server and its downloads stop.
send("Runtime.evaluate", { expression: "window.close()" });
await sleep(300);
ws.close();
const serverUp = () =>
  new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: serverPort, path: "/", timeout: 1000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => (req.destroy(), resolve(false)));
  });
let up = true;
for (let i = 0; i < 30 && up; i++) {
  await sleep(500);
  up = await serverUp();
}
check("server stops when the window closes", !up);
if (!exited) app.kill();

console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
