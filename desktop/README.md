# pathawk-desktop

**Electron + Vue 3** + **`local-agent/`** (Go, bbolt). UI — соседний каталог [`../web`](../web).

## Разработка

```bash
npm install          # в desktop/
npm run dev          # Vite :5173 + Electron
```

На Linux в dev задано `ELECTRON_DISABLE_SANDBOX=1` (см. `package.json`).

## Локальная prod-сборка (без упаковки)

```bash
npm run build:pack
npm run start:prod
```

## Portable-дистрибутив (electron-builder)

```bash
# из корня мета-репо: сначала web
cd ../web && npm ci && cd ../desktop && npm ci

npm run build:dist:linux   # AppImage + tar.gz → out/
npm run build:dist:win     # portable .exe
npm run build:dist:mac     # .zip (на macOS)
```

Артефакты: `out/Pathawk-<version>-<platform>.<ext>`

Публикация: тег `v*` → [release-desktop.yml](../.github/workflows/release-desktop.yml). Подробнее: [docs/RELEASING.md](../docs/RELEASING.md).

## local-agent

- Порт: `127.0.0.1:38471` (`LOCAL_AGENT_PORT`)
- Данные: `app.getPath('userData')/local-agent/`
- В packaged-сборке бинарь: `resources/local-agent` (см. `electron/main.cjs`)

## Примечания

- Подпись кода (Windows/macOS) в MVP не настроена — пользователи могут видеть предупреждение ОС.
- Документация продукта: [docs/](../docs/)
