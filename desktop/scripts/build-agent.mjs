import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, "..");
const agentDir = path.join(desktopRoot, "local-agent");
const outDir = path.join(desktopRoot, "resources");
mkdirSync(outDir, { recursive: true });

const outName = process.platform === "win32" ? "local-agent.exe" : "local-agent";
const outPath = path.join(outDir, outName);

const r = spawnSync(
  "go",
  ["build", "-o", outPath, "./cmd/agent"],
  { cwd: agentDir, stdio: "inherit", shell: process.platform === "win32" }
);

if (r.status !== 0) process.exit(r.status ?? 1);
console.log("local-agent:", outPath);
