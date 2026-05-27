# Выпуск релиза Pathawk Desktop

## Подготовка

1. Убедитесь, что версия в [desktop/package.json](../desktop/package.json) совпадает с будущим тегом (`0.1.0` → тег `v0.1.0`).
2. Закоммитьте изменения в `web/` и `desktop/` в ветку `master` на GitHub.

## Локальная проверка (Linux)

```bash
cd web && npm ci && cd ../desktop && npm ci
cd desktop && npm run build:dist:linux
# Артефакты: desktop/out/Pathawk-*.{AppImage,tar.gz}
```

## Публикация

```bash
git tag v0.1.0
git push origin v0.1.0
```

Workflow [release-desktop.yml](../.github/workflows/release-desktop.yml):

1. Собирает portable для Linux, Windows, macOS.
2. Создаёт [GitHub Release](https://github.com/denkarz/pathawk/releases) с артефактами.
3. Обновляет `website/public/releases.json` и деплоит Pages.

## GitHub Pages (один раз)

В репозитории **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Первый деплой сайта без релиза

Actions → **Deploy Pages** → Run workflow, либо push изменений в `website/public/`.
