# Smartsheet — application React/TypeScript

L’application complète est construite depuis `src/`, avec les dépendances React et Lucide du dépôt. L’index publié ne charge plus l’ancien bundle applicatif comme une bibliothèque opaque.

Les sources originales n’étant pas disponibles dans les archives retrouvées, les 105 déclarations applicatives du bundle en service ont été reprises par analyse syntaxique, séparées en modules et remises en JSX. `recovery-manifest.json` documente cette provenance. L’ancien asset est conservé pour les onglets déjà ouverts et les tests différentiels. Les noms locaux encore courts et les composants issus de cette reprise pourront être refactorisés progressivement.

## Organisation

- `app.tsx`, `browse.tsx`, `navigation.tsx`, `dialogs.tsx` : espaces, dossiers, recherche, favoris, partage, profils et sauvegardes.
- `sheet-view.tsx`, `sheet-domain.tsx` : grille, hiérarchie, formules, copier/coller, annuler/rétablir, colonnes, couleurs, conversations, Gantt, cartes et agenda.
- `forms.tsx`, `dashboard-view.tsx`, `dashboard-domain.tsx` : formulaires, réponses, widgets, indicateurs et présentation.
- `contracts.ts`, `api.ts`, `workspace-store.ts`, `use-workspace.ts` : données persistées, session existante et file de sauvegarde contrôlée par révision.
- `workspace-domain.tsx` : création, duplication et imports/exports CSV.

Le contrôle TypeScript couvre tous les composants. Le moteur, les données, le transport et la sauvegarde ont en plus un contrôle `strict` séparé (`tsconfig.core.json`). Les composants repris gardent temporairement l’inférence permissive ; leur conversion intégrale au mode strict reste une dette explicite, sans `ts-ignore` ni désactivation de vérification de fichier.

## Données et connexion

Les endpoints `/sheets/session`, `/sheets/state` et `/budgets/session`, les clés de navigateur, la révision serveur et la structure des sauvegardes restent compatibles. Les mises à jour conservent les propriétés inconnues. Aucun script de migration ou remplacement de données de production n’est nécessaire.

Les sauvegardes sont sérialisées et différées de 400 ms. Le navigateur envoie désormais un `PATCH` contenant seulement les modifications depuis sa copie confirmée. Le serveur compare les anciennes valeurs visées, autorise les modifications indépendantes et conserve une transaction atomique. Une modification pendant un enregistrement attend sa confirmation. Un conflit conserve la copie locale et bloque tout écrasement automatique : l’utilisateur peut exporter puis recharger. Une panne conserve les modifications en attente. Un changement de compte remonte un espace distinct ; les réponses tardives et les écritures d’un autre compte sont rejetées. La fermeture de page prévient lorsque des modifications attendent encore leur sauvegarde.

## Vérification et publication

Depuis la racine :

```sh
pnpm typecheck:sheets
pnpm test:sheets
pnpm build:sheets
pnpm test:applications:browser
```

Le test navigateur demande `PORTAL_QA` vers un dossier privé et une installation Playwright (`PLAYWRIGHT_PACKAGE` si nécessaire). Toutes ses données et requêtes métier sont simulées localement. Il couvre les vues, la modification et le rechargement, formulaires, validation, import/export CSV, sauvegarde/restauration JSON, largeur de 320 à 2560 px et modes clair/nuit. Les tests du moteur comparent 284 cas à l’ancienne implémentation ; la file de sauvegarde a des tests dédiés de concurrence et de panne.

L’interface est publiée statiquement. Pour le lot d’écritures ciblées, publier d’abord le Worker compatible `PATCH` ; conserver les anciens assets et les anciens `PUT` versionnés. Aucun service payant, nouveau stockage, abonnement ou appel IA n’est requis. Vérifier les données avant/après publication. Le retour arrière du frontend ne restaure jamais une ancienne base par-dessus les nouvelles saisies. Voir `platform/decisions/0004-record-writes.md` pour les limites du stockage JSON transitoire.

Le thème partagé est décrit dans `design/README-apple.md`. Les couleurs personnalisées des cellules et des widgets restent des données utilisateur.
