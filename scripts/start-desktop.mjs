// Runs the desktop shell from source (after desktop:build). Drops ELECTRON_RUN_AS_NODE,
// which VS Code's extension host exports and which makes Electron start as plain Node.
import { spawn } from "node:child_process";
import path from "node:path";
import electron from "electron";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.join(import.meta.dirname, "..", "desktop", "app")], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
