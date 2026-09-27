# Бренд-кит WE media group — заметки для Claude

- Владелец не программист: сообщения ему — на русском, простыми словами.
  Английский — только в коде, коммитах и PR.
- Чистые HTML/CSS/JS без сборки. Дизайн повторяет picta.cc (репозиторий
  ehroz1/toptop-photo): Manrope + Unbounded Black, токены цветов в `:root`,
  тёмная тема через `data-theme` и `prefers-color-scheme`.
- `assets/`, `downloads/`, `js/data.js` генерирует `tools/build.py` из
  `source/` — руками не править, после изменения исходников пересобрать.
- Новая платформа или логотип — добавить в `BRANDS` в `tools/build.py`
  (растровый исходник — ещё и в `TRACE`).
- Franklin Gothic, Bravo RG и Gotham Pro — коммерческие шрифты, остальные — OFL.
