# Как собирается сайт

Сайт выкладывается из `site.zip` (см. `.github/workflows/deploy.yml`). Архив собирается из исходника гайда — одного HTML-файла черновика.

```
unzip -q site.zip -d old                     # текущий сайт
node tools/build.mjs черновик.html old out   # собрать новый в out/
node tools/og_missing.mjs out                # картинки превью для новых страниц
node tools/check.mjs old out --visual        # ссылки, canonical, sitemap, поведение, снимки «до/после»
(cd out && zip -q -r -X -9 ../site.zip .)
```

Нужны Node.js, Playwright с Chromium и шрифт Inter (для картинок превью). Путь к Playwright можно задать в `PLAYWRIGHT_PATH`.

Правила для поисковиков живут в `build.mjs` (функция `canon`): адреса, которые открывают главу целиком — фильтры `/dishes/cat…/`, разделы «Вкуса», якоря приложений, `/author/` — указывают canonical на главу и не попадают в `sitemap.xml`.
