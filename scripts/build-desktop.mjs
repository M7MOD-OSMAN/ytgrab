// Builds the desktop installer for the current (or given) platform:
//   node scripts/build-desktop.mjs [win|linux] [--dir]   (--dir: unpacked app, no installer)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const target = args.find((a) => a === "win" || a === "linux") ?? (process.platform === "win32" ? "win" : "linux");
const unpackedOnly = args.includes("--dir");

const root = path.resolve(import.meta.dirname, "..");
const at = (...p) => path.join(root, ...p);

function run(label, cmd, cmdArgs, env = {}) {
  console.log(`\n▸ ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(at("desktop", "bin", target, target === "win" ? "yt-dlp.exe" : "yt-dlp"))) {
  console.error(`No bundled binaries for ${target}. Run: node scripts/fetch-binaries.mjs ${target}`);
  process.exit(1);
}

// The installer's version comes from the root package.json.
const { version } = JSON.parse(fs.readFileSync(at("package.json"), "utf8"));
const appPkgPath = at("desktop", "app", "package.json");
const appPkg = JSON.parse(fs.readFileSync(appPkgPath, "utf8"));
if (appPkg.version !== version) {
  appPkg.version = version;
  fs.writeFileSync(appPkgPath, JSON.stringify(appPkg, null, 2) + "\n");
}

run("next build (standalone)", process.execPath, [at("node_modules", "next", "dist", "bin", "next"), "build"], {
  STREAMPULL_DESKTOP: "1",
});

// Real package dirs under a pnpm node_modules folder, skipping its symlinks.
function packageDirs(nm) {
  const found = [];
  for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
    if (e.isSymbolicLink() || !e.isDirectory()) continue;
    const p = path.join(nm, e.name);
    if (!e.name.startsWith("@")) found.push(p);
    else for (const s of fs.readdirSync(p, { withFileTypes: true })) if (s.isDirectory() && !s.isSymbolicLink()) found.push(path.join(p, s.name));
  }
  return found;
}

// Under pnpm, standalone keeps the traced packages in node_modules/.pnpm but links them with
// absolute symlinks back into this repo. Hoist each traced package once into a flat folder.
function hoistTracedPackages(standalone, dest) {
  const store = path.join(standalone, "node_modules", ".pnpm");
  const versions = new Map();
  for (const entry of fs.readdirSync(store)) {
    const nm = path.join(store, entry, "node_modules");
    if (entry === "node_modules" || !fs.existsSync(nm)) continue;
    for (const pkg of packageDirs(nm)) {
      const name = path.relative(nm, pkg).split(path.sep).join("/");
      const { version } = JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8"));
      if (versions.has(name) && versions.get(name) !== version) {
        throw new Error(`Two versions of ${name} (${versions.get(name)}, ${version}) can't share a flat node_modules.`);
      }
      if (versions.has(name)) continue;
      versions.set(name, version);
      fs.cpSync(pkg, path.join(dest, name), { recursive: true, dereference: true });
    }
  }
  return versions;
}

console.log("\n▸ assembling desktop/server");
const standalone = at(".next", "standalone");
const serverOut = at("desktop", "server");
fs.rmSync(serverOut, { recursive: true, force: true });
fs.mkdirSync(serverOut, { recursive: true });
for (const f of ["server.js", "package.json"]) fs.copyFileSync(path.join(standalone, f), path.join(serverOut, f));
fs.cpSync(path.join(standalone, ".next"), path.join(serverOut, ".next"), { recursive: true });
fs.cpSync(at(".next", "static"), path.join(serverOut, ".next", "static"), { recursive: true });
if (fs.existsSync(at("public"))) fs.cpSync(at("public"), path.join(serverOut, "public"), { recursive: true });
const hoisted = hoistTracedPackages(standalone, path.join(serverOut, "node_modules"));
console.log(`  ${hoisted.size} packages: ${[...hoisted.keys()].join(", ")}`);

// Nothing from this machine may ride along: no symlinks back into the repo, no download archive.
const leftovers = fs
  .readdirSync(serverOut, { recursive: true, withFileTypes: true })
  .filter((e) => e.isSymbolicLink() || e.name === ".ytgrab-archive.txt");
if (leftovers.length) {
  throw new Error("Refusing to package: " + leftovers.map((e) => path.join(e.parentPath, e.name)).join(", "));
}

const builderArgs = [at("node_modules", "electron-builder", "cli.js"), `--${target}`, "--publish", "never"];
if (unpackedOnly) builderArgs.push("--dir");
run(`electron-builder --${target}${unpackedOnly ? " --dir" : ""}`, process.execPath, builderArgs);

console.log(`\nDone → ${at("dist-desktop")}`);
