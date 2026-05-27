const PLATFORM_CARDS = [
  {
    id: "linux-x64-appimage",
    title: "Linux",
    subtitle: "AppImage · x64",
    detect: () => /Linux/i.test(navigator.userAgent),
  },
  {
    id: "linux-x64-tar",
    title: "Linux",
    subtitle: "tar.gz · x64",
    detect: () => /Linux/i.test(navigator.userAgent),
  },
  {
    id: "win-x64",
    title: "Windows",
    subtitle: "Portable · x64",
    detect: () => /Win/i.test(navigator.userAgent),
  },
  {
    id: "mac-arm64",
    title: "macOS",
    subtitle: "zip · Apple Silicon",
    detect: () => /Mac/i.test(navigator.userAgent) && navigator.userAgent.includes("ARM"),
  },
  {
    id: "mac-x64",
    title: "macOS",
    subtitle: "zip · Intel",
    detect: () => /Mac/i.test(navigator.userAgent),
  },
];

/** @type {{ latest: string; releases: Array<{ version: string; tag?: string; published_at: string; notes: string; assets: Record<string, { url: string; name: string }> }> }} */
let manifest = { latest: "0.0.0", releases: [] };

async function loadManifest() {
  const base = import.meta.url.replace(/\/[^/]+$/, "/");
  const res = await fetch(new URL("releases.json", base));
  if (!res.ok) throw new Error(`releases.json: ${res.status}`);
  manifest = await res.json();
}

function getRelease(version) {
  return manifest.releases.find((r) => r.version === version);
}

function renderVersionSelect() {
  const sel = document.getElementById("version-select");
  sel.replaceChildren();
  const versions =
    manifest.releases.length > 0
      ? manifest.releases.map((r) => r.version)
      : [manifest.latest];

  for (const v of versions) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v === manifest.latest ? `${v} (последняя)` : v;
    sel.appendChild(opt);
  }
  sel.value = versions[0] || manifest.latest;
}

function renderCards(version) {
  const release = getRelease(version);
  const container = document.getElementById("download-cards");
  const notes = document.getElementById("release-notes");
  container.replaceChildren();

  if (!release || Object.keys(release.assets).length === 0) {
    notes.textContent =
      "Сборки для этой версии ещё не опубликованы. Следите за релизами на GitHub.";
    for (const card of PLATFORM_CARDS) {
      container.appendChild(buildCard(card, null, version));
    }
    return;
  }

  notes.textContent = release.notes
    ? release.notes.slice(0, 400) + (release.notes.length > 400 ? "…" : "")
    : `Опубликовано: ${release.published_at || "—"}`;

  const preferred = PLATFORM_CARDS.find((c) => c.detect() && release.assets[c.id]);
  for (const card of PLATFORM_CARDS) {
    const asset = release.assets[card.id];
    container.appendChild(buildCard(card, asset, version, card.id === preferred?.id));
  }
}

function buildCard(card, asset, version, highlight = false) {
  const el = document.createElement("article");
  el.className = "card" + (asset ? "" : " card--disabled");
  const title = document.createElement("h3");
  title.textContent = card.title;
  const sub = document.createElement("p");
  sub.textContent = asset ? asset.name || card.subtitle : `${card.subtitle} — нет в релизе`;
  const btn = document.createElement("a");
  btn.className = "btn btn--primary";
  if (asset) {
    btn.href = asset.url;
    btn.textContent = highlight ? "Скачать (ваша ОС)" : "Скачать";
    btn.setAttribute("download", "");
  } else {
    btn.href = `https://github.com/denkarz/pathawk/releases/tag/v${version}`;
    btn.textContent = "На GitHub";
  }
  el.append(title, sub, btn);
  return el;
}

function updatePrimaryButton(version) {
  const release = getRelease(version);
  const btn = document.getElementById("download-primary");
  const preferred = PLATFORM_CARDS.find((c) => c.detect());
  const asset = preferred && release?.assets[preferred.id];
  if (asset) {
    btn.href = asset.url;
    btn.textContent = `Скачать ${version}`;
  } else {
    btn.href = "https://github.com/denkarz/pathawk/releases";
    btn.textContent = "Релизы на GitHub";
  }
}

async function init() {
  try {
    await loadManifest();
  } catch (e) {
    console.warn(e);
  }
  renderVersionSelect();
  const sel = document.getElementById("version-select");
  const version = sel.value || manifest.latest;
  renderCards(version);
  updatePrimaryButton(version);
  sel.addEventListener("change", () => {
    renderCards(sel.value);
    updatePrimaryButton(sel.value);
  });
}

init();
