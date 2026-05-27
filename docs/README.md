# Документация продукта Pathawk

| Документ | Описание |
|----------|----------|
| [PRD.md](./PRD.md) | Продуктовые требования |
| [TECH_SPEC.md](./TECH_SPEC.md) | Инженерное ТЗ, архитектура, эпики |
| [RELEASING.md](./RELEASING.md) | Выпуск desktop-сборок и обновление сайта |

## Сайт и код

| Ресурс | Ссылка |
|--------|--------|
| Мета-репозиторий | [github.com/denkarz/pathawk](https://github.com/denkarz/pathawk) |
| Скачать сборки | [denkarz.github.io/pathawk](https://denkarz.github.io/pathawk/) |
| Релизы | [GitHub Releases](https://github.com/denkarz/pathawk/releases) |

## Структура мета-репозитория

| Каталог | Содержимое |
|---------|------------|
| [server](../server) | Go API, PostgreSQL |
| [web](../web) | Vue 3, общий UI |
| [desktop](../desktop) | Electron + `local-agent/` (Go, bbolt) |
| [website](../website) | Лендинг (GitHub Pages) |
