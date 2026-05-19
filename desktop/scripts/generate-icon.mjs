import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.join(__dirname, "..");
const svgPath = path.join(desktopRoot, "..", "web", "src", "assets", "branding", "pathhawk-eagle.svg");
const outDir = path.join(desktopRoot, "electron");
const outPath = path.join(outDir, "icon.png");

fs.mkdirSync(outDir, { recursive: true });

const svg = fs.readFileSync(svgPath, "utf8");

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 512 },
  background: "rgba(0,0,0,0)",
});
const png = resvg.render().asPng();
fs.writeFileSync(outPath, png);
console.log("icon:", outPath);

