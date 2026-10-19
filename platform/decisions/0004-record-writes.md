# ADR-0004 : écritures ciblées et préconditions par enregistrement

Statut : accepté et mis en œuvre le 19 octobre 2026.

## Contexte

Le portail, les budgets et Smartsheet sauvegardaient un document complet avec une version globale. Une modification de ligne pouvait bloquer celle d’un collègue sur une autre ligne et renvoyer de gros logos inchangés. Les données existantes comprennent des extensions, des collections ordonnées et parfois des collections facultatives sans identifiant unique. Elles doivent être conservées, avec les comptes et les anciens onglets, sans service payant supplémentaire.

## Décision

Ajouter `PATCH` aux trois endpoints existants. Le navigateur calcule les différences depuis sa dernière copie confirmée et envoie seulement les valeurs modifiées avec leurs préconditions. Les chemins désignent les enregistrements par identifiant, matricule ou code ; les indices d’un ancien tableau ne sont jamais acceptés comme identité.

Le serveur applique les modifications à sa version actuelle, contrôle les droits et valide le résultat complet. Une précondition incompatible produit un conflit sans écriture partielle. Des modifications indépendantes peuvent aboutir depuis la même ancienne lecture. Les insertions sont ancrées sur un voisin ; un réordonnancement ambigu est refusé. Les extensions sans identité fiable sont traitées comme un bloc et ne sont jamais supprimées par normalisation implicite.

Une seule instruction SQLite applique les `json_set` et `json_remove`, avec une comparaison atomique de la version lue par le serveur. Si une autre requête gagne entre lecture et écriture, le serveur relit et vérifie à nouveau les préconditions, au plus six fois. Les triggers de projection Budgets font partie de la même transaction. Répéter une affectation déjà appliquée ou une suppression déjà faite est sans effet métier supplémentaire.

Les permissions du portail, les fichiers privés, le verrouillage des notes payées, les contrôles Smartsheet et les relations Budgets restent contrôlés côté serveur. Une suppression de projet ne peut pas laisser orpheline une ligne ajoutée entre-temps. Les horodatages d’affichage des feuilles et lignes ne provoquent pas de conflit artificiel entre deux lignes différentes.

Les files de sauvegarde gardent leur référence locale confirmée et les modifications en attente. Elles ne remplacent jamais la référence après un échec. Les changements des collègues deviennent visibles au rechargement ; cette livraison n’ajoute pas de collaboration en temps réel. Les anciens `PUT` restent protégés par leur version globale et ne peuvent écraser une nouvelle sauvegarde.

## Options et compromis

- Maintenir seulement les sauvegardes intégrales n’aurait résolu ni les conflits indépendants ni les transferts inutiles.
- Basculer simultanément tous les domaines vers de nouvelles tables aurait demandé une reprise des lectures, exports, liens et extensions, avec un risque de régression plus élevé.
- Les écritures JSON ciblées livrent les nouvelles garanties sans déplacer les données. **Les documents D1 restent les sources de vérité ; ce lot ne constitue pas encore une normalisation SQL complète.** Les changements de structure ou d’ordre peuvent remplacer une collection, et les imports restent atomiques.

La taille maximale du document reste 1,5 Mo. Une requête de changements peut atteindre 4 Mo, car elle contient les anciennes valeurs comparées et les nouvelles valeurs, notamment lors du remplacement d’un logo intégré. Les lectures et validations complètes, la limite de taille par ligne et les scans des triggers restent à traiter dans un lot de normalisation. La réduction des octets envoyés ne constitue pas une mesure du CPU de production.

## Publication et reprise

Sauvegarder les tables et le Worker, exécuter les tests, publier le serveur compatible avant les nouveaux clients, conserver les anciens assets puis vérifier les fichiers servis et les empreintes des tables métier. Aucune migration de schéma ni réécriture des données existantes n’est requise à la publication. Aucun abonnement, nouvelle base ou fournisseur n’est ajouté.

En cas de retour du frontend précédent, les `PUT` restent utilisables avec contrôle global. Ne pas retirer les routes `PATCH` tant que des clients de cette version peuvent être ouverts. Ne pas restaurer un ancien instantané sur les nouvelles saisies et ne pas rouvrir l’ancien accès KV.

## Vérification

`platform/record-test.mjs` couvre les différences, 400 cas de conservation et d’ordre, les éditions indépendantes, les conflits atomiques, les droits, les fichiers, les reprises, les gros logos, les imports, les relations et l’échec d’un trigger. Les suites antérieures et les essais navigateur vérifient les parcours conservés. Une recette privée charge les trois documents réels dans Miniflare, vérifie les cinq comptes, modifie puis restaure les documents et compare tous les champs, sans écriture métier ni notification en production.

## Suite

Normaliser les tables par entité avec une reprise vérifiée des identifiants, ordres, extensions, références et montants ; conserver une seule source modifiable ; construire les lectures et exports compatibles depuis ces tables. Mesurer les lignes lues/écrites et le CPU réel avant d’estimer la marge dans les allocations gratuites.
