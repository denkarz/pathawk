const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

/** В dev: NODE_ENV=development (см. npm run dev). Локальная «сборка без упаковки»: NODE_ENV=production + dist/renderer. */
const isDev = process.env.NODE_ENV === "development";
const AGENT_PORT = process.env.LOCAL_AGENT_PORT || "38471";

let agentProc = null;

app.setName("Pathawk");

function agentExecutable() {
  const ext = process.platform === "win32" ? ".exe" : "";
  const name = "local-agent" + ext;
  const candidates = [
    path.join(process.resourcesPath, "resources", name),
    path.join(process.resourcesPath, name),
    path.join(__dirname, "..", "resources", name),
    path.join(__dirname, "..", "local-agent", name),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function startAgent() {
  const dataDir = path.join(app.getPath("userData"), "local-agent");
  const env = {
    ...process.env,
    LOCAL_AGENT_PORT: AGENT_PORT,
    LOCAL_AGENT_DATA_DIR: dataDir,
  };
  const bin = agentExecutable();
  if (bin) {
    agentProc = spawn(bin, [], { env, stdio: ["ignore", "pipe", "pipe"] });
  } else {
    const cwd = path.join(__dirname, "..", "local-agent");
    agentProc = spawn("go", ["run", "./cmd/agent"], {
      cwd,
      env,
      shell: process.platform === "win32",
    });
  }
  const log = (buf) => {
    const s = buf.toString().trim();
    if (s) console.log("[local-agent]", s);
  };
  agentProc.stdout?.on("data", log);
  agentProc.stderr?.on("data", log);
  agentProc.on("exit", (code, signal) => {
    console.log("[local-agent] exit", code, signal);
  });
}

function stopAgent() {
  if (agentProc && !agentProc.killed) {
    agentProc.kill();
    agentProc = null;
  }
}

async function waitForAgent() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${AGENT_PORT}/health`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("local-agent: нет ответа /health за 20s (соберите: npm run build:agent или установите Go)");
}

const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * @param {import("electron").IpcMainInvokeEvent} _e
 * @param {{ method?: string; url?: string; headers?: Record<string, string>; body?: string | null; bodyBase64?: string | null; timeoutMs?: number }} payload
 */
async function handleHttpRequest(_e, payload) {
  const method = String(payload.method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return {
      ok: false,
      error: `Method not allowed: ${method}`,
      durationMs: 0,
    };
  }
  const urlStr = String(payload.url || "").trim();
  if (!urlStr) {
    return { ok: false, error: "URL пустой", durationMs: 0 };
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { ok: false, error: "Некорректный URL", durationMs: 0 };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Разрешены только http и https", durationMs: 0 };
  }
  const headers =
    payload.headers && typeof payload.headers === "object"
      ? payload.headers
      : {};
  const timeoutMs = Math.min(
    Math.max(Number(payload.timeoutMs) || 120_000, 1_000),
    600_000
  );
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const b64 =
      payload.bodyBase64 != null && String(payload.bodyBase64).length
        ? String(payload.bodyBase64).replace(/\s/g, "")
        : "";
    let body;
    if (method === "GET" || method === "HEAD") {
      body = undefined;
    } else if (b64) {
      try {
        body = Buffer.from(b64, "base64");
      } catch {
        return { ok: false, error: "Некорректное тело (base64)", durationMs: 0 };
      }
    } else if (payload.body != null && String(payload.body).length) {
      body = String(payload.body);
    } else {
      body = undefined;
    }
    const r = await fetch(urlStr, {
      method,
      headers,
      body,
      signal: ctrl.signal,
    });
    const text = await r.text();
    /** @type {Record<string, string>} */
    const outHeaders = {};
    r.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });
    return {
      ok: true,
      status: r.status,
      statusText: r.statusText,
      headers: outHeaders,
      body: text,
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    const msg =
      err && err.name === "AbortError"
        ? `Таймаут ${timeoutMs} ms`
        : String(err && err.message ? err.message : err);
    return {
      ok: false,
      error: msg,
      durationMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function agentFetch(resourcePath, opts = {}) {
  const url = `http://127.0.0.1:${AGENT_PORT}${resourcePath}`;
  const r = await fetch(url, opts);
  if (r.status === 204) return null;
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return r.json();
  }
  return r.text();
}

function registerIpc() {
  ipcMain.handle("http:request", handleHttpRequest);
  ipcMain.handle("agent:listCollections", () =>
    agentFetch("/api/v1/collections")
  );
  ipcMain.handle("agent:getCollection", (_e, id) =>
    agentFetch(`/api/v1/collections/${encodeURIComponent(id)}`)
  );
  ipcMain.handle("agent:saveCollection", (_e, id, body) =>
    agentFetch(`/api/v1/collections/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  ipcMain.handle("agent:deleteCollection", (_e, id) =>
    agentFetch(`/api/v1/collections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  );
  ipcMain.handle("agent:listEnvironments", () =>
    agentFetch("/api/v1/environments")
  );
  ipcMain.handle("agent:getEnvironment", (_e, id) =>
    agentFetch(`/api/v1/environments/${encodeURIComponent(id)}`)
  );
  ipcMain.handle("agent:saveEnvironment", (_e, id, body) =>
    agentFetch(`/api/v1/environments/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  ipcMain.handle("agent:deleteEnvironment", (_e, id) =>
    agentFetch(`/api/v1/environments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  );
  ipcMain.handle("agent:getGitSettings", () => agentFetch("/api/v1/git/settings"));
  ipcMain.handle("agent:putGitSettings", (_e, body) =>
    agentFetch("/api/v1/git/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
  ipcMain.handle("agent:putGitCredentials", (_e, body) =>
    agentFetch("/api/v1/git/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
  ipcMain.handle("agent:gitListBranches", (_e, body) =>
    agentFetch("/api/v1/git/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
  ipcMain.handle("agent:gitSync", (_e, body) =>
    agentFetch("/api/v1/git/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    })
  );
}

function createWindow() {
  const win = new BrowserWindow({
    title: "Pathawk",
    width: 1280,
    height: 800,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  startAgent();
  try {
    await waitForAgent();
  } catch (e) {
    console.error(e);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopAgent();
    app.quit();
  }
});

app.on("before-quit", () => {
  stopAgent();
});
