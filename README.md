# Pathawk

Мета-репозиторий: **код** в каталогах `server/`, `web/`, `desktop/`, лендинг в `website/`.

| Раздел | Описание |
|--------|----------|
| [docs/](docs/) | PRD, ТЗ, [инструкция релиза](docs/RELEASING.md) |
| [website/](website/) | Лендинг и скачивание сборок (GitHub Pages) |
| [desktop/](desktop/) | Electron + local-agent |
| [web/](web/) | Vue 3 UI |
| [server/](server/) | Go API (облако / on-prem) |

**Сайт:** https://denkarz.github.io/pathawk/ (после включения GitHub Pages)

**Быстрый старт разработки:** `cd desktop && npm install && npm run dev` (поднимет `web` на :5173 и Electron).

**Сборка portable (Linux):** `cd desktop && npm run build:dist:linux` → `desktop/out/`
