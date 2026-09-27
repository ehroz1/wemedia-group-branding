# Бренд-кит WE media group — заметки для Claude

- Владелец не программист: сообщения ему — на русском, простыми словами.
  Английский — только в коде, коммитах и PR.
- Чистые HTML/CSS/JS без сборки. Дизайн повторяет picta.cc (репозиторий
  ehroz1/toptop-photo), но шрифты фирменные: Inter (текст) и Non Bureau
  Extended (заголовки), см. tools/webfonts.py; токены цветов в `:root`,
  тёмная тема через `data-theme` и `prefers-color-scheme`.
- `assets/`, `downloads/`, `js/data.js` генерирует `tools/build.py` из
  `source/` — руками не править, после изменения исходников пересобрать.
- Новая платформа или логотип — добавить в `BRANDS` в `tools/build.py`;
  свои версии цвета/фоны — ключи `fg`, `bg`, `variants` (пример — edubridge),
  (растровый исходник — ещё и в `TRACE`).
- Franklin Gothic, Bravo RG и Gotham Pro — коммерческие шрифты, остальные — OFL.
