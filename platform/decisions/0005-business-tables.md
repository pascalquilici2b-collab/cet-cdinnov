# ADR-0005 — Tables métier et compatibilité des trois modules

Date : 19 octobre 2026. Statut : implémenté ; succède au stockage transitoire d’ADR-0004.

## Décision

Le portail, les budgets et Smartsheet utilisent 56 tables d’entités et de métadonnées dans la base D1 existante. Aucun service, abonnement, secret ou branchement supplémentaire n’est nécessaire. Le schéma et le codec sont définis dans `platform/business-schema.mjs` ; la migration est enregistrée sous `0003-business-tables`.

Les entités connues sont séparées : salarié, congé, mouvement CET, note et ligne de frais, code affaire, facture, compte, client et compte client, projet et période, poste et sous-dépense, paiement, DR, import, rapport et ligne, lien JEMS, espace, dossier, feuille, colonne, ligne, cellule, commentaire, formulaire et champ, automatisation, tableau de bord et widget, activité. Les champs inconnus, historiques, facultatifs et objets de configuration restent dans le JSON de leur enregistrement propriétaire. Les colonnes SQL générées exposent les identifiants, noms, statuts, dates, montants et liens usuels ; les identifiants et relations de contenance sont indexés. Ce compromis conserve exactement les anciens formats sans prétendre à un schéma relationnel intégralement typé.

Les clés internes utilisent l’identifiant métier et un rang d’occurrence. Les éléments sans identifiant utilisent leur position. Les doublons historiques ne sont ni fusionnés ni supprimés. L’ordre, la distinction entre champ absent, `null`, objet vide et tableau vide, les propriétés arbitraires et les formules restent conservés. Les clés de contenance sont étrangères et différables ; les liens métier préexistants ne sont pas réparés silencieusement.

Les trois noms historiques de documents deviennent des vues SQL en lecture seule. `app_budget_records` devient aussi une vue, utilisée par la pagination et le répertoire Marchés. Les archives `archive_*` restent figées par des triggers et ne sont pas des sources de secours automatiques. Les mots de passe et fichiers ne sont pas déplacés vers un fournisseur tiers.

## Écritures et cohérence

Le serveur conserve les validations et contrôles d’accès, applique les changements au dernier état et compare les enregistrements normalisés. Seuls les enregistrements différents sont envoyés en base. Un changement de cellule n’entraîne pas une réécriture de sa feuille ou des autres cellules.

Une transaction D1 contient : précondition de révision, commandes par table modifiée, métadonnées de version et retrait de la garde. Les commandes sont des vues SQL avec triggers, pas des documents stockés. Un échec de validation SQL ou de clé étrangère annule toutes les écritures. Une version périmée déclenche la reprise bornée déjà utilisée par `PATCH` ; les anciens `PUT` conservent leur conflit global. Les horodatages de feuille ne provoquent pas de faux conflit entre deux lignes indépendantes.

Les lots sont regroupés par table pour rester sous la limite gratuite de requêtes par invocation, y compris lors d’imports multi-enregistrements. L’authentification lit directement les comptes indexés. Les lectures complètes des écrans restent des vues de compatibilité ; les réduire davantage demeure une optimisation distincte. Les garanties transactionnelles sont celles de [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), et les plafonds sont documentés par [Cloudflare](https://developers.cloudflare.com/d1/platform/limits/).

## Bascule et conservation

1. Sauvegarder en privé le Worker, ses paramètres et les tables existantes.
2. Créer le schéma de destination sans toucher aux anciennes sources actives.
3. Suspendre brièvement les sauvegardes et bloquer les anciens écrivains en base, y compris ceux déjà en vol ; conserver les lectures.
4. Copier la source finale, reconstituer les vues et comparer tous les champs, les révisions, auteurs, dates, nombres de lignes et clés étrangères.
5. Renommer les tables sources en archives, installer les vues compatibles et publier le Worker complet depuis `platform/worker.ts`.
6. Contrôler les données, comptes, routes, fichiers et empreintes après publication. Ne pas effectuer de saisie métier fictive en production.

Avant le renommage, un échec permet de rouvrir l’ancien écrivain, dont les données sont encore à jour. Après le renommage, il faut corriger en conservant les tables actives et leurs nouvelles saisies ; republier l’ancien Worker ou restaurer les archives par-dessus les données courantes n’est pas un retour arrière sûr.

## Validation et limites

`platform/business-test.mjs` couvre la conservation des valeurs et doublons, les archives immuables, la reprise rejouable, les écritures de cellule, les conflits, l’annulation sur erreur de clé étrangère, les suppressions/restaurations complètes, le nombre de requêtes et les gros textes échappés. Les suites Portail, Identité, Plateforme, Marchés, IA et écritures ciblées complètent les contrôles. La recette privée reprend les données réelles et vérifie tous les comptes sans modifier leurs vérificateurs ; les parcours navigateur conservent les vues, imports, exports, formulaires et sauvegardes.

La taille maximale des échanges complets reste 1,5 Mo afin de conserver les contrats actuels. Des JSON par enregistrement subsistent volontairement. Les instantanés historiques d’import restent attachés à leur import. Les durées locales ne mesurent pas le CPU facturé en production ; les quotas et le CPU par route restent à surveiller. Le cycle métier CCIC et les rôles configurables ne sont pas livrés par cette migration de stockage.
