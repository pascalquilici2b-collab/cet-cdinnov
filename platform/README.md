# Migration progressive de l’application CDInnov

Statut : socle technique, principaux écrans du portail, Budgets, Smartsheet et les neuf rubriques Marchés en React/TypeScript, octobre 2026. La migration de l’ensemble des services reste en cours. Le document [ARCHITECTURE.md](ARCHITECTURE.md) décrit l’architecture de référence, les limites et les étapes restantes ; les sections ci-dessous conservent le détail des différentes tranches.

## Entrée de production et commandes

`platform/worker.ts` est désormais l’unique entrée à construire pour le serveur complet : portail/CET/congés/frais/facturier, budgets, agenda, Smartsheet et marchés. `server/legacy-runtime.mjs` reprend le serveur réellement en ligne avant la migration, avec son authentification et ses extensions ; seul son import Marchés est redirigé vers les sources maintenues. Ne pas publier `cloudflare-worker.js` ni `server/budget-service.mjs` seuls : ils ne contiennent pas tous les modules actifs.

Depuis la racine, avec Node >=24 et pnpm :

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test:platform
pnpm test:dashboard
pnpm test:finance
pnpm test:personnel
pnpm test:agenda
```

Le Worker complet sort dans `.build/entry.mjs`. Le transport navigateur et les modules React du portail sont publiés avec `index.html` et les imports partagés de `platform/chunks/`. Conserver les anciens chunks pour les onglets déjà ouverts. `pnpm build` reconstruit aussi le contrôleur Marchés intégré au portail et son écran `platform/markets.js`. Budgets et Smartsheet sont construits séparément depuis leurs sources réunies : `pnpm build:budgets` et `pnpm build:sheets`.

Pour les suites Marchés/IA sur le serveur complet, définir `MARCHES_TEST_WORKER` sur le chemin absolu de `.build/entry.mjs` et `MARCHES_TEST_COMPATIBILITY_DATE=2026-06-09`. Les tests navigateur demandent un répertoire privé `PORTAL_QA` et un Playwright installé (`PLAYWRIGHT_PACKAGE` peut désigner son package.json). `CDI_BUDGET_BACKUP`, facultatif, permet de tester localement une sauvegarde réelle ; toutes les sorties restent hors du dépôt.

## Données et compatibilité

`0001-budget-records.sql` est additive et rejouable. Elle crée une **projection de lecture** des clients, projets, lignes budgétaires, dépenses, DR, imports et rapports partenaires, indexée par collection et position. Chaque objet conserve ses champs d’origine. Les autres champs et tableaux, y compris ceux sans identifiant, restent dans le document source.

Pendant cette tranche, `budgets_workspace` reste l’unique source d’écriture. Ses contrôles de version sont conservés. Des triggers SQL mettent à jour la projection dans la même transaction, uniquement pour les objets modifiés ou déplacés. Un échec de projection annule également l’écriture source. Il n’y a ni tâche périodique, ni second écrivain indépendant, ni copie en retard à réconcilier.

Les listes de clients des Marchés lisent la projection sans charger les projets et leurs logos. L’ajout automatique de noms de clients ne charge que la liste utile et utilise une mise à jour SQL conditionnée par la version. Le document complet reste disponible pour l’interface React existante.

Le nouveau `GET /api/v1/budget-records` est authentifié avec la même session et les mêmes droits que Budgets. Paramètres : `collection` (liste autorisée), `limit` (1 à 100), puis `after` et `version` fournis dans `next`. Un changement de version entre pages répond 409. Les requêtes utilisent des paramètres SQL.

`GET /budgets/workspace` renvoie un ETag. Une version inchangée répond 304 après contrôle de session, sans charger le document en SQL. Le cache navigateur reste en mémoire, attaché à la session signée ; il est vidé lors d’une déconnexion, d’un changement de session ou d’une écriture. Aucun cache partagé de données financières n’est ajouté. Le serveur ne parse plus le gros JSON lors d’une simple lecture.

## Publication et retour arrière

### Interface responsive et agenda

La référence actuelle est le guide Apple fourni : `design/tokens.css`, `design/apple.css` et les adaptations par application. Elle remplace les choix graphiques antérieurs ; le détail figure dans `design/README-apple.md`. Les thèmes clair/nuit, portraits et dimensions responsives sont partagés.

Le contenu n’est plus plafonné à 1 180 px. La barre latérale reste lisible sur ordinateur et devient un tiroir avec focus clavier et contenu arrière inerte sur mobile. Le tableau de bord utilise des requêtes de conteneur ; son planning devient une liste par collaborateur sur petit écran. Finance et Personnel conservent leurs tables et toutes leurs actions, avec les intitulés de colonnes répétés en fiches sur téléphone. Les tableaux de comparaison mensuels restent défilables dans leur propre panneau.

`client/agenda.tsx`, `agenda-editor.tsx` et `agenda-domain.ts` reprennent le calendrier, la liste, les soldes/validations et les formulaires congés/déplacements. Les fenêtres de détail par journée/période et le contrôleur des listes de projets restent historiques. Les calculs CP/CET, notifications, écritures avec version et API restent raccordés aux services existants. Les modules React partagent leur runtime et ne sont importés qu’après connexion. Les recherches sont locales ; aucun appel IA ou polling supplémentaire n’est ajouté. Les sessions et montages sont invalidés à la sortie ou à la déconnexion.

Contrôles : `node platform/agenda-browser-test.mjs` avec `PORTAL_QA` privé, puis les suites navigateur dashboard, finance, personnel, agenda et budgets. Sept largeurs sont contrôlées : 320, 390, 768, 1024, 1440, 1920 et 2560 px. Le test agenda utilise un transport local simulé, contrôle les en-têtes de version et les conflits, et neutralise toutes les notifications externes. Les suites plateforme et de calcul vérifient séparément les services conservés. Aucun schéma ou abonnement n’est modifié dans ce lot.

La migration globale reste progressive : les écrans Marchés, Budgets et Smartsheet sont désormais repris, tandis que leurs intégrations et plusieurs services historiques restent à moderniser. Le retour arrière restaure le frontend précédent, en conservant les données et les chunks déjà publiés pour les onglets encore ouverts.

### Marchés et contrats

`client/markets.tsx` et `markets-contracts.ts` portent les neuf rubriques en React/TypeScript strict. `marches/ui.js` conserve le contrôleur, les API et les validations existantes. Il charge le module après connexion et habilitation, le démonte à la sortie et ignore les réponses d’une session révolue. Les mises à jour de messages et de progression gardent les champs et le focus ; les recherches restent locales. Les propositions de lecture sont rendues en JSX, sans insertion de HTML documentaire.

`pnpm test:markets:browser` utilise le serveur complet dans Miniflare, une base fictive et un modèle simulé. Il vérifie les tarifs, les sources, les décisions, les fichiers, les propositions IA, la conservation des conditions manuelles, les versions, les conflits, les exports, les thèmes et les profils. Le test couvre aussi le symbole de connexion à 320, 390 et 1440 pixels. Cette tranche ne change aucun schéma ni document en production.

### CET, salariés et paramètres

`platform/client/personnel.tsx` reprend la synthèse CET, les mouvements, les salariés et les paramètres (y compris les comptes). `personnel-editor.tsx` reprend les formulaires de mouvement, salarié et type, ainsi que l’historique individuel. `personnel-domain.ts` définit les contrats et les filtres/tris des mouvements. Le module est chargé après connexion et partage React avec la finance et le tableau de bord.

Les calculs CET, transformations CP→CET, coûts journaliers, imports de suivi Excel et extractions de fiches de paie restent raccordés aux services historiques. Les fenêtres de confirmation, calcul après import et aperçu de bulletin restent dans ces services. Les formulaires conservent les références de fichiers et les champs inconnus lors des modifications. La recherche ne déclenche aucun appel serveur et conserve le focus. Les callbacks des formulaires sont invalidés à leur fermeture et à la déconnexion ; les réponses tardives de photo, bulletin et suivi ne doivent pas ouvrir un écran dans une autre session. Les données React des collaborateurs sont limitées à leur propre dossier ; la gestion des comptes ne reçoit que des résumés, sans mots de passe ni empreintes.

L’import JSON conserve désormais toutes les rubriques du fichier ainsi que les rubriques existantes absentes d’une ancienne sauvegarde. L’ancienne reconstruction limitée au CET pouvait effacer le facturier et les comptes. L’import exige une confirmation avant remplacement, vérifie le format des collections connues et garde les champs supplémentaires. L’import de suivi CET recalcule les jours restant à créditer à la confirmation, pour éviter un double crédit.

Vérification : `node platform/personnel-browser-test.mjs`, avec `PORTAL_QA` privé. Cette suite couvre les transformations et leur annulation, le coût journalier à temps partiel, les créations/modifications/suppressions, l’import incrémental (décodeur Excel simulé, parseur métier réel), le bulletin PDF (transport/extraction simulés), les comptes, les sauvegardes récentes et anciennes, les profils et les écrans mobiles. Les données sont synthétiques et les notifications neutralisées. Une comparaison privée supplémentaire porte sur les résultats des filtres et tris de l’ancien écran avec la copie de production ; aucune donnée réelle n’est commise au dépôt.

Ce lot frontend ne change ni le schéma, ni le Worker, ni les abonnements. Sauvegarder et comparer les données avant/après publication ; le retour arrière restaure seulement les fichiers frontend. La tranche suivante reprend l’agenda (voir ci-dessus) ; les marchés et les services historiques restent à poursuivre. Les calculs, imports et autorisations serveur ne sont pas présentés comme intégralement migrés.

### Gestion financière quotidienne

`platform/client/finance.tsx` reprend les listes Codes affaires, Factures et Notes de frais ; `finance-editor.tsx` reprend les trois formulaires. `finance-domain.ts` porte leurs contrats, normalisation, recherches, tris, pagination, totaux et validation des saisies de facturation. Le tableau de bord et ce module utilisent un même chunk React, sans chargement avant connexion.

Les recherches et changements de page sont locaux. Le répertoire clients n’est demandé qu’à l’entrée du facturier ou après une modification utile ; il n’est plus relu à chaque frappe. Les notes de frais sont paginées. Les noms, photos et logos restent affichés selon les données disponibles.

Le raccordement aux services existants reste volontairement explicite dans `index.html` : stockage, import SQL avec confirmation, exports CSV/PDF, upload et lecture des pièces, calcul kilométrique, signature et Factur-X. Les calculs et barèmes existants ne sont pas modifiés par cette migration. Les enregistrements complets restent la source d’écriture ; une modification conserve les champs inconnus, dates et références de pièces non concernées. Le contrat d’authentification historique n’est pas remplacé par ce lot.

Les montages React sont détruits à la déconnexion et à la sortie des vues. Les réponses tardives de lecture de PDF, d’itinéraire et d’upload de justificatif ne doivent pas rouvrir une fiche fermée ni modifier la note d’un autre contexte. Un retrait de justificatif dans un brouillon ne supprime plus le fichier de la note enregistrée. La suppression d’une note ne supprime pas une pièce encore référencée par une autre note ; les pièces détachées d’un brouillon restent conservées, sans purge automatique dans cette tranche.

Vérification : `node platform/finance-browser-test.mjs`, avec `PORTAL_QA` privé. Le test couvre les créations/modifications, extensions de données, filtres et pagination, exports filtrés, import SQL confirmé, préremplissage PDF respectant les saisies, frais kilométriques et électriques, avance, durée, signature, duplication, annulation d’un retrait de pièce, profil comptabilité, restriction des collaborateurs et mobile. Les notifications et services externes sont remplacés uniquement dans le serveur local de test ; aucun e-mail de test n’est envoyé.

Ce lot frontend ne nécessite aucune migration SQL ni republication du Worker. Conserver une sauvegarde privée de la version et des données, vérifier l’identité des données avant/après, publier tous les fichiers/chunks ensemble. Le retour arrière restaure le précédent frontend, sans restaurer la base par-dessus les nouvelles saisies. Le lot Personnel décrit ci-dessus reprend ensuite le CET, les salariés et les paramètres ; les intégrations existantes continuent de fonctionner entre-temps.

### Tableau de bord commun

Le tableau de bord est un composant React/TypeScript chargé après connexion et démonté à la sortie de l’écran. Son endpoint `GET /api/v1/dashboard?week=YYYY-MM-DD` utilise la session signée existante. L’identité et la synthèse partagent **une seule lecture KV par requête** ; il n’y a pas de cache entre utilisateurs. La sélection des déplacements est limitée à la semaine affichée et au jour courant. Aucun polling ni appel IA n’est ajouté.

La réponse contient uniquement les noms, périodes, déplacements et cinq derniers documents utiles. Les factures sont réservées à la direction, et les notes de frais sont filtrées côté serveur pour chaque collaborateur. Les correspondances matricule/email historiques sont conservées ; un compte sans correspondance ne reçoit aucune note. Aucun bulletin, salaire, justificatif, signature ou donnée d’authentification n’est renvoyé.

Le regroupement des congés réutilise `agenda/leave-periods.mjs`, sans changer les demandes ou les soldes. Le planning montre des périodes continues ; les demandes en attente sont comptées par période. La synthèse CET reste accessible dans Mouvements CET. Les fiches et validations existantes restent utilisées.

Les nouvelles factures et notes de frais enregistrent `createdAt`. Les archives conservent leur date d’origine, utilisée comme date de repli dans le classement et signalée dans l’interface. Aucune date de création historique n’est inventée.

Vérification locale complémentaire : `node platform/dashboard-browser-test.mjs` (répertoire privé `PORTAL_QA` requis). Elle couvre les profils, navigation, regroupement, alignement des badges, mobile, échec d’actualisation et réponse retardée après déconnexion. Ce lot ne modifie aucun schéma ni enregistrement en production : sauvegarder le Worker et les réglages courants, comparer les données avant/après, puis publier le serveur complet avant les fichiers frontend. Le retour arrière remet les précédents fichiers, sans restaurer la base par-dessus les nouvelles saisies.

### Première migration SQL (déjà appliquée)

1. Exporter le Worker réel, ses réglages et bindings, la base D1 et le portail KV dans un dossier privé. Conserver les fichiers R2 existants ; ne pas modifier leur stockage dans cette tranche.
2. Restaurer l’export SQL localement : `python platform/restore-check.py <dossier-prive>`. Ce contrôle compare toutes les tables aux exports JSON du même dossier, vérifie l’intégrité et la migration répétée.
3. Appliquer les instructions SQL de la migration dans l’ordre, en base de test puis en production ; vérifier les objets et versions contre la source actuelle. La projection doit être complète avant de publier le nouveau Worker.
4. Publier le bundle complet en conservant les bindings et réglages de production. Publier ensuite le transport navigateur et l’index. Refuser de publier si le Worker actif a changé depuis sa sauvegarde.
5. En cas de régression, republier les modules Worker sauvegardés avec les mêmes bindings. **Ne pas restaurer une ancienne base par-dessus les nouvelles saisies.** L’ancien Worker continue à écrire le document source et les triggers conservent la projection ; le transport accepte aussi une réponse 200 sans ETag. Les nouvelles tables peuvent donc rester en place pendant le retour arrière.

Une sauvegarde est un point de récupération, pas une synchronisation future. L’export D1 peut bloquer brièvement les requêtes pendant sa génération ; le terminer par polling, sans le lancer à chaque déploiement de simple interface.

## Étapes restantes pour l’ensemble de l’application

| Étape | Critère de passage |
|---|---|
| Socle TS, build complet, premières lectures indexées | Livré dans cette tranche ; anciennes écritures encore compatibles |
| Réunir les sources React Budgets et Smartsheet dans le dépôt de référence | Livré : Budgets repris depuis les sources existantes ; Smartsheet reconstruit depuis le bundle en service, avec tests différentiels et contrôle TypeScript. Voir `apps/budgets/README.md` et `apps/sheets/README.md`. |
| Identité, habilitations et fichiers communs | Remplacer les anciens accès au portail/fichiers par des contrôles serveur, sans bloquer les sessions et liens existants |
| Écritures unitaires Budgets et référentiel clients | Édition par enregistrement, opérations atomiques et exports compatibles ; supprimer le gros document seulement après validation et retour arrière éprouvé |
| Commandes, interventions, factures et règlements | Parcours CCIC testé, règles déterministes, soldes et plafonds cohérents |
| Congés/CET, frais, facturier historique puis Smartsheet | Écrans React repris ; intégrations historiques de fichiers, identité et écritures unitaires encore à poursuivre. |
| Factur-X et contrôle de pièces | Conserver les capacités Python/OCR ; revoir leur intégration après mesure, sans migration imposée vers un hébergement payant |

L’identité historique et les anciens accès KV/R2 restent une dette connue de compatibilité ; la normalisation des budgets ne constitue pas une refonte de leurs autorisations. Aucun abonnement ni fournisseur supplémentaire n’est activé. Les quotas IA existants restent inchangés. Cette tranche réduit des lectures et transferts précis ; elle ne démontre pas encore que toutes les requêtes de l’application respectent la limite CPU de l’offre gratuite.

Références : [D1 et transactions batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [SQL/JSON D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [limites D1](https://developers.cloudflare.com/d1/platform/limits/).
