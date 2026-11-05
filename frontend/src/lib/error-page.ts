// Page de repli rendue par le serveur quand le rendu échoue : HTML autonome, sans dépendance au bundle.
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Cette page n’a pas pu se charger — MILLENIUM</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: #050505; color: #eeeae4; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      .mark { font-size: 1.1rem; letter-spacing: .42em; color: #c4c7cb; margin: 0 0 1.5rem; text-indent: .42em; }
      h1 { font-size: 1.2rem; font-weight: 600; margin: 0 0 .5rem; }
      p { color: #858a91; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: .75rem 1.25rem; border-radius: 4px; font: inherit; font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #d6be8a; color: #050505; }
      .secondary { background: transparent; color: #eeeae4; border-color: #3a3a3d; }
      a:focus-visible, button:focus-visible { outline: 1px solid #c4c7cb; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="mark">MILLENIUM</p>
      <h1>Cette page n’a pas pu se charger.</h1>
      <p>Un problème est survenu de notre côté. Vous pouvez réessayer ou revenir à l’accueil.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Réessayer</button>
        <a class="secondary" href="/">Retour à l’accueil</a>
      </div>
    </div>
  </body>
</html>`;
}
