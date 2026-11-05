# Connexion — 5 novembre 2026

## Cause constatée

Le Chrome de l'utilisateur envoyait encore ses requêtes à l'ancien hébergement GitHub (`185.199.109.153`), après le changement de CNAME vers Cloudflare Pages. L'interface déjà actualisée y appelait l'API du même domaine : POST `/budgets/session` retournait HTML 405 ; GET `/api/v1/session` retournait HTML 404. Le message JSON provenait du décodage de cette page d'erreur. Après un redémarrage de Chrome, la requête GET contactait encore cette ancienne adresse.

Les résolveurs public Cloudflare, Google et système retournaient déjà `cdinnov-app.pages.dev`. Aucun mot de passe incorrect ni perte de données n'est démontré par cet incident. L'utilisateur a été invité à nettoyer manuellement le cache DNS et les connexions persistantes de Chrome ; les pages internes nécessaires sont interdites au contrôle navigateur. La validation de son accès après cette étape reste en attente.

## Correctifs publiés

- Les réponses d'authentification inattendues donnent un message français ; statut HTTP conservé, corps HTML jamais affiché. Les erreurs JSON 401/403/429 sont préservées.
- Les requêtes demandent explicitement JSON et désactivent le cache. Aucun nouvel essai automatique de validation, ancienne authentification ou domaine alternatif n'est ajouté.
- Le générateur d'interface insère désormais les sources littéralement. Les scripts intégrés au livrable sont analysés avant publication ; un paquet local invalide a été écarté.
- La mise à jour RH de `origin/main` (`407bcc3`) est fusionnée et conservée. Le moteur API, les bases et le moteur PDF/Factur-X n'ont pas été republiés pour ce correctif.

## Vérification et publication

Source `9687a27` ; Cloudflare Pages affiche « Success! », 679 fichiers importés depuis `.build/frontend-tjruVG`. Vérification publique HTTPS à **12:36:59 UTC** : index identique au livrable (SHA-256 `c1182bf1a02cea8515ecc406117c0d5a69666549e9add72b6d0a2e2f10c25500`), en-têtes de protection présents, routes privées JSON 401 sans session et requête de connexion vide JSON 400.

15 tests ciblés, 4 tests du frontal et parcours navigateur complet d'identité réussis. Le livrable final a également passé les vérifications de syntaxe/imports, le rendu PDF et l'OCR français/anglais. Deux agents ont participé à l'implémentation et à la revue indépendante ; données fictives et services locaux pour les parcours authentifiés. Aucun courrier ou document métier de test créé en production.

Preuves privées : `platform/.private/login-fix-20261105` et `platform/.private/security-audit-20261105/login-response-rh-artifact`.
