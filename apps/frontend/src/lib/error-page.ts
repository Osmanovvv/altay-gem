export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Страница не загрузилась — Жемчужина Алтая</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fdfbf5; color: #1f1a0e; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; color: #1f1a0e; }
      p { color: rgba(31, 26, 14, 0.72); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.625rem 1.25rem; border-radius: 9999px; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #c8963e; color: #fff; font-weight: 600; }
      .secondary { background: #fffdf7; color: #1f1a0e; border-color: rgba(31, 26, 14, 0.16); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Страница не загрузилась</h1>
      <p>Что-то пошло не так на нашей стороне. Попробуйте обновить страницу или вернуться на главную.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Попробовать ещё раз</button>
        <a class="secondary" href="/">На главную</a>
      </div>
    </div>
  </body>
</html>`;
}
