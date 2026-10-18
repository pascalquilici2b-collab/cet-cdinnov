# Migration progressive de l’application CDInnov

Statut : première tranche technique, octobre 2026. La migration de l’ensemble de l’application reste en cours.

## Entrée de production et commandes

`platform/worker.ts` est désormais l’unique entrée à construire pour le serveur complet : portail/CET/congés/frais/facturier, budgets, agenda, Smartsheet et marchés. `server/legacy-runtime.mjs` reprend le serveur réellement en ligne avant la migration, avec son authentification et ses extensions ; seul son import Marchés est redirigé vers les sources maintenues. Ne pas publier `cloudflare-worker.js` ni `server/budget-service.mjs` seuls : ils ne contiennent pas tous les modules actifs.

Depuis la racine, avec Node >=24 et pnpm :

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test:platform
pnpm test:agenda
```

Le Worker complet sort dans `.build/entry.mjs`. Le transport navigateur compilé dans `platform/workspace-client.js` est publié avec `index.html`. Les autres écrans, dont les applications React Budgets et Smartsheet, conservent leurs ressources actuelles. Le socle ne réécrit pas leur interface.

Pour les suites Marchés/IA sur le serveur complet, définir `MARCHES_TEST_WORKER` sur le chemin absolu de `.build/entry.mjs` et `MARCHES_TEST_COMPATIBILITY_DATE=2026-06-09`. Les tests navigateur demandent un répertoire privé `PORTAL_QA` et un Playwright installé (`PLAYWRIGHT_PACKAGE` peut désigner son package.json). `CDI_BUDGET_BACKUP`, facultatif, permet de tester localement une sauvegarde réelle ; toutes les sorties restent hors du dépôt.

## Données et compatibilité

`0001-budget-records.sql` est additive et rejouable. Elle crée une **projection de lecture** des clients, projets, lignes budgétaires, dépenses, DR, imports et rapports partenaires, indexée par collection et position. Chaque objet conserve ses champs d’origine. Les autres champs et tableaux, y compris ceux sans identifiant, restent dans le document source.

Pendant cette tranche, `budgets_workspace` reste l’unique source d’écriture. Ses contrôles de version sont conservés. Des triggers SQL mettent à jour la projection dans la même transaction, uniquement pour les objets modifiés ou déplacés. Un échec de projection annule également l’écriture source. Il n’y a ni tâche périodique, ni second écrivain indépendant, ni copie en retard à réconcilier.

Les listes de clients des Marchés lisent la projection sans charger les projets et leurs logos. L’ajout automatique de noms de clients ne charge que la liste utile et utilise une mise à jour SQL conditionnée par la version. Le document complet reste disponible pour l’interface React existante.

Le nouveau `GET /api/v1/budget-records` est authentifié avec la même session et les mêmes droits que Budgets. Paramètres : `collection` (liste autorisée), `limit` (1 à 100), puis `after` et `version` fournis dans `next`. Un changement de version entre pages répond 409. Les requêtes utilisent des paramètres SQL.

`GET /budgets/workspace` renvoie un ETag. Une version inchangée répond 304 après contrôle de session, sans charger le document en SQL. Le cache navigateur reste en mémoire, attaché à la session signée ; il est vidé lors d’une déconnexion, d’un changement de session ou d’une écriture. Aucun cache partagé de données financières n’est ajouté. Le serveur ne parse plus le gros JSON lors d’une simple lecture.

## Publication et retour arrière

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
| Réunir les sources React Budgets et Smartsheet dans le dépôt de référence | Reproduire les écrans actuellement déployés avant leur prochaine modification |
| Identité, habilitations et fichiers communs | Remplacer les anciens accès au portail/fichiers par des contrôles serveur, sans bloquer les sessions et liens existants |
| Écritures unitaires Budgets et référentiel clients | Édition par enregistrement, opérations atomiques et exports compatibles ; supprimer le gros document seulement après validation et retour arrière éprouvé |
| Commandes, interventions, factures et règlements | Parcours CCIC testé, règles déterministes, soldes et plafonds cohérents |
| Congés/CET, frais, facturier historique puis Smartsheet | Reprise exhaustive, calculs comparés, écrans React remplacés progressivement |
| Factur-X et contrôle de pièces | Conserver les capacités Python/OCR ; revoir leur intégration après mesure, sans migration imposée vers un hébergement payant |

L’identité historique et les anciens accès KV/R2 restent une dette connue de compatibilité ; la normalisation des budgets ne constitue pas une refonte de leurs autorisations. Aucun abonnement ni fournisseur supplémentaire n’est activé. Les quotas IA existants restent inchangés. Cette tranche réduit des lectures et transferts précis ; elle ne démontre pas encore que toutes les requêtes de l’application respectent la limite CPU de l’offre gratuite.

Références : [D1 et transactions batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [SQL/JSON D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [limites D1](https://developers.cloudflare.com/d1/platform/limits/).
