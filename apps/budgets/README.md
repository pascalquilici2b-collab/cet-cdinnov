# Sources de l'Outil budgets

Application React/TypeScript récupérée depuis la source CDInnov existante. Seuls les modules atteignables depuis `integration/main.tsx` sont repris, avec leur style, leurs assets et leurs composants. Les configurations de déploiement historiques, secrets, bases locales et fichiers clients ne font pas partie de cette copie.

Depuis la racine du dépôt : `pnpm build:budgets` et `pnpm typecheck:budgets`.

`integration/main.tsx` conserve le protocole `postMessage` avec le portail, limité à la même origine et à la fenêtre parente. Le portail assure l'authentification, les lectures conditionnelles et les sauvegardes avec contrôle de version. Ne pas remplacer cette liaison par une clé statique ou un accès direct à la base.

La compilation conserve les anciens assets et ne touche ni au Worker ni aux données. `design/budgets.css` s'applique après la feuille générée. Les calculs et formats d'import/export restent dans `lib/` ; la largeur du chronogramme s'adapte au conteneur dans `app/chronogram-canvas.tsx`.
