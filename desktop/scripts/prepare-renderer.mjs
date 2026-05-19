import { cpSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, "..");
const webDist = path.join(desktopRoot, "..", "web", "dist");
const target = path.join(desktopRoot, "dist", "renderer");

if (!existsSync(webDist)) {
  console.error("Нет web/dist. Сначала: npm run build --prefix ../web");
  process.exit(1);
}

mkdirSync(target, { recursive: true });
cpSync(webDist, target, { recursive: true });
console.log("renderer скопирован:", target);
