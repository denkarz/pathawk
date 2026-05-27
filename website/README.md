# Pathawk — лендинг

Статический сайт для [GitHub Pages](https://docs.github.com/en/pages): скачивание portable-сборок по версиям.

- **Локально:** любой статический сервер из `public/`, например `npx serve public`.
- **Деплой:** push в `master` (папка `website/public/`) → workflow [deploy-pages.yml](../.github/workflows/deploy-pages.yml).
- **Манифест версий:** `public/releases.json` — обновляется автоматически при релизе desktop (тег `v*`).

URL после включения Pages: `https://denkarz.github.io/pathawk/`
