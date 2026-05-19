# pathawk-desktop

Документация продукта: при мета-репозитории — [../docs/README.md](../docs/README.md).

**Electron + Vue 3** + вложенный **`local-agent/`** (Go, bbolt) — локальное хранилище поставляется вместе с десктопом.

- **Отдельный git-репозиторий:** `git init` здесь. UI: соседний каталог **`../web`** (при другом расположении поправьте скрипты в `package.json`).
- **Разработка:** из `desktop/` выполнить `npm install`, затем `npm run dev` — поднимется Vite (`web`, порт 5173) и откроется Electron.
- **Linux:** в скриптах задано `ELECTRON_DISABLE_SANDBOX=1` (иначе часто падает `chrome-sandbox`). Для прод-сборки при необходимости настройте настоящий SUID sandbox или политику запуска.
- **Сборка артефактов без установщика:** `npm run build:pack` — собирает `local-agent` в `resources/` и копирует `web/dist` → `dist/renderer/`. Проверка UI: `npm run start:prod` (нужен предварительно `build:pack`).
- **local-agent (E1):** слушает `127.0.0.1:38471` (или `LOCAL_AGENT_PORT`). Данные: `app.getPath('userData')/local-agent/store.bolt`. REST: `GET /health`, `GET/PUT/DELETE /api/v1/collections/...`. В renderer: `window.agent` через preload.
- **Окружения (E4):** те же хост/порт — `GET/PUT/DELETE /api/v1/environments/{id}`, список `GET /api/v1/environments`. Документ: `{ id, name, variables: { "key": "value" } }`.
- **HTTP из UI (E2):** `window.desktop.httpRequest({ method, url, headers, body })` — выполняется в main process (`ipcMain` → `fetch`).
