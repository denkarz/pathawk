/**
 * Обновляет website/public/releases.json из GitHub Release API.
 * Запуск: TAG=v0.1.0 GH_TOKEN=... node website/scripts/update-releases.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "releases.json");

const repo = process.env.GITHUB_REPOSITORY || "denkarz/pathawk";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const tag = process.env.TAG || process.env.GITHUB_REF_NAME;

if (!token) {
  console.error("GH_TOKEN required");
  process.exit(1);
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

/** @param {string} name */
function assetKey(name) {
  const n = name.toLowerCase();
  if (n.includes("linux") && n.endsWith(".appimage")) return "linux-x64-appimage";
  if (n.includes("linux") && n.endsWith(".tar.gz")) return "linux-x64-tar";
  if (n.includes("win") && n.endsWith(".exe")) return "win-x64";
  if (n.includes("mac") && n.includes("arm64") && n.endsWith(".zip")) return "mac-arm64";
  if (n.includes("mac") && n.endsWith(".zip")) return "mac-x64";
  return null;
}

const releasesRes = await fetch(
  `https://api.github.com/repos/${repo}/releases?per_page=50`,
  { headers }
);
if (!releasesRes.ok) {
  console.error("releases fetch failed", releasesRes.status, await releasesRes.text());
  process.exit(1);
}

/** @type {Array<{ tag_name: string; published_at: string; body: string; assets: Array<{ name: string; browser_download_url: string }> }>} */
const releasesRaw = await releasesRes.json();

const releases = releasesRaw
  .filter((r) => !r.draft && !r.prerelease)
  .map((r) => {
    /** @type {Record<string, { url: string; name: string }>} */
    const assets = {};
    for (const a of r.assets || []) {
      const key = assetKey(a.name);
      if (key) assets[key] = { url: a.browser_download_url, name: a.name };
    }
    const version = r.tag_name.replace(/^v/, "");
    return {
      version,
      tag: r.tag_name,
      published_at: r.published_at?.slice(0, 10) || "",
      notes: (r.body || "").trim(),
      assets,
    };
  })
  .filter((r) => Object.keys(r.assets).length > 0);

const latest = releases[0]?.version || (tag ? tag.replace(/^v/, "") : "0.0.0");

const manifest = { latest, releases };
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("Wrote", outPath, "—", releases.length, "release(s), latest:", latest);
