const PLATFORMS = [
  {
    id: "linux-x64-appimage",
    label: "Linux (AppImage · x64)",
    os: "linux",
  },
  {
    id: "linux-x64-tar",
    label: "Linux (tar.gz · x64)",
    os: "linux",
  },
  {
    id: "win-x64",
    label: "Windows (Portable · x64)",
    os: "win",
  },
  {
    id: "mac-arm64",
    label: "macOS Apple Silicon (arm64)",
    os: "mac",
  },
  {
    id: "mac-x64",
    label: "macOS Intel (x64)",
    os: "mac",
  },
];

/** @type {{ latest: string; releases: Array<{ version: string; tag?: string; published_at: string; notes: string; assets: Record<string, { url: string; name: string }> }> }} */
let manifest = { latest: "0.0.0", releases: [] };

function detectPreferredPlatform() {
  const ua = navigator.userAgent;

  if (/Win/i.test(ua)) {
    return "win-x64";
  }
  if (/Linux/i.test(ua)) {
    return "linux-x64-appimage";
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    // Apple Silicon vs Intel — грубая эвристика
    if (/ARM/i.test(ua) || /AppleWebKit.*ARM/i.test(ua)) {
      return "mac-arm64";
    }
    return "mac-arm64"; // по умолчанию предлагаем arm64 (большинство новых Mac)
  }
  // fallback
  return "linux-x64-appimage";
}

async function loadManifest() {
  const base = import.meta.url.replace(/\/[^/]+$/, "/");
  const res = await fetch(new URL("releases.json", base));
  if (!res.ok) throw new Error(`releases.json: ${res.status}`);
  manifest = await res.json();
}

function getRelease(version) {
  return manifest.releases.find((r) => r.version === version);
}

function populatePlatformSelect(release, currentId) {
  const sel = document.getElementById("platform-select");
  sel.replaceChildren();

  for (const p of PLATFORMS) {
    const asset = release?.assets?.[p.id];
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = asset ? p.label : `${p.label} — нет в релизе`;
    opt.disabled = !asset;
    if (p.id === currentId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function updateDownloadButton(release, platformId) {
  const btn = document.getElementById("download-btn");
  const asset = release?.assets?.[platformId];
  const platform = PLATFORMS.find((p) => p.id === platformId);

  if (asset && platform) {
    btn.href = asset.url;
    btn.textContent = `Скачать ${platform.label.split(" (")[0]}`;
    btn.classList.remove("btn--ghost");
    btn.classList.add("btn--primary");
    btn.removeAttribute("data-fallback");
  } else {
    btn.href = `https://github.com/denkarz/pathawk/releases/tag/v${release?.version || manifest.latest}`;
    btn.textContent = "Открыть на GitHub";
    btn.classList.remove("btn--primary");
    btn.classList.add("btn--ghost");
    btn.setAttribute("data-fallback", "true");
  }
}

async function init() {
  try {
    await loadManifest();
  } catch (e) {
    console.warn(e);
  }

  const release = getRelease(manifest.latest) || manifest.releases[0];
  const preferredId = detectPreferredPlatform();
  const hasPreferred = release?.assets?.[preferredId];

  // select
  populatePlatformSelect(release, hasPreferred ? preferredId : PLATFORMS.find((p) => release?.assets?.[p.id])?.id);

  // главная кнопка
  const initialId = document.getElementById("platform-select").value;
  updateDownloadButton(release, initialId);

  // смена платформы
  document.getElementById("platform-select").addEventListener("change", (e) => {
    updateDownloadButton(release, e.target.value);
  });

  // версия в заголовке (опционально)
  const verEl = document.getElementById("version-badge");
  if (verEl && release) {
    verEl.textContent = `v${release.version}`;
  }
}

init();
