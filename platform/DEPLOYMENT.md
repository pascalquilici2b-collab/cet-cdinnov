# Publication de app.cdinnov.eu

Depuis le 5 novembre 2026, le frontal de production est le projet Cloudflare Pages **cdinnov-app**, et non GitHub Pages. Le dépôt GitHub reste la source versionnée. Un push sur `main` ne met donc pas à jour le frontal de l'application.

## Services

- Domaine : `app.cdinnov.eu`, CNAME Hostinger vers `cdinnov-app.pages.dev` (TTL 300). Ne pas modifier les enregistrements du site public ou de messagerie.
- Frontal : projet Pages `cdinnov-app`, liaison de service `CET_API` vers le Worker `cet-data`, mode de défaillance fermé.
- API et bases : Worker `cet-data`, bindings D1/R2/secrets existants conservés.
- Moteur PDF/OCR : service Render `cdinnov-facturx`, publication manuelle du commit validé. Les vérifications du Dockerfile sont obligatoires.

## Construire et vérifier

1. Appliquer les instructions `AGENTS.md`, utiliser des données fictives et vérifier les parcours concernés avec plusieurs agents.
2. Construire les modules modifiés (`platform/build.mjs`, `apps/build.mjs`, `apps/build-sheets.mjs` selon le périmètre). Vérifier TypeScript et les tests concernés.
3. Exécuter `node platform/build-frontend.mjs`. Ce script crée un dossier neuf, le manifeste `.build/frontend-manifest.json` et `.build/cdinnov-frontend.zip`. Il exclut les sources serveur, rapports et dossiers privés.
4. Vérifier le livrable avec `node platform/frontend-artifact-test.mjs`. Pour la connexion compilée, exécuter le test navigateur d'identité avec `FRONTEND_ARTIFACT` pointant vers le dossier neuf et `SESSION_WORKER_ARTIFACT` vers `.build/entry.mjs`.
5. Geler le code testé, faire relire puis versionner uniquement les fichiers du périmètre. Garder les modifications préexistantes non concernées.

## Publier

1. Publier le Worker si modifié, en préservant bindings, secrets, date de compatibilité et paramètres existants. Sauvegarder la version précédente en privé et contrôler son empreinte avant remplacement. Les anciennes sessions Bearer sont volontairement refusées.
2. Dans Cloudflare Pages, projet `cdinnov-app`, créer un déploiement **Production** à partir du ZIP vérifié. Attendre la fin du décompactage et de l'import de tous les fichiers, puis publier. Le ZIP compressé dépasse 25 Mo ; la limite concerne chaque fichier décompressé, pas la taille de cette archive d'import.
3. Si le moteur PDF est modifié, pousser le commit puis choisir **Deploy a specific commit** dans Render. Attendre les contrôles natifs et l'état **Live**, sans désactiver de test pour forcer la publication.
4. Contrôler en HTTPS les pages, ressources, en-têtes, API non authentifiées, refus des origines étrangères et santé du moteur. Comparer les fichiers publics avec le livrable. Si nécessaire, comparer les empreintes des données métier avant/après sans les publier.

Le frontal doit rester sur la même origine que l'API pour le cookie `__Host-cdi_session`. Le sous-domaine technique Pages n'est pas une autre origine de connexion autorisée. Les conversions du navigateur passent par `/api/v1/facturx/`, jamais par un ancien jeton Render.

## Retour arrière

Conserver les identifiants des déploiements Pages et Render et la sauvegarde privée du Worker. Revenir uniquement à une combinaison frontend/API compatible avec les cookies. Ne pas restaurer isolément une ancienne interface Bearer et ne pas réactiver cette authentification pour masquer un échec de publication. Les documents enregistrés et bases de production sont indépendants du déploiement des fichiers statiques.
