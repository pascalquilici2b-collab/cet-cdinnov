# Documents RH — revue locale du 5 novembre 2026

État : implémentation et contrôles locaux. Cette note ne certifie pas une publication. La vérification finale du portail et le déploiement sont suivis séparément.

## Connexions vérifiées

- Le module RH lit les clients de `billing_directory`, les projets de `commercial_projects` et les agents de `client_employee_spaces`. Les liens mémorisés agent/projet utilisent `rh_agent_projects`. Aucun référentiel concurrent de facturation n’est créé.
- Une version RH figée fournit au tamponnage les montants calculés côté serveur, les taux, l’agent, le mois, les projets et les PDF archivés. Les lignes de toutes les périodes/feuilles sont reprises.
- Le serveur vérifie l’empreinte SHA-256 de chaque PDF et copie les sources dans l’espace du lot natif. Supprimer un lot ne supprime pas les bulletins RH d’origine.
- Le moteur PDF existant relit les bulletins. Le pont ne fabrique ni reçu d’extraction signé ni approbation humaine. Même un rapprochement manuel RH retourne un nouvel aperçu à valider.
- Les montants, groupes et pièces d’une version RH ne sont pas modifiables depuis le lot. Le positionnement du tampon reste ajustable.
- Le menu des versions RH ouvre le lot natif. Le pont `openRhStampingBatch(batchId)` permet aussi la navigation directe depuis Documents RH.
- Aucun paiement financier n’est créé ou complété par ce pont. Les fichiers de retour et leur validation relèvent du module RH.

## Tests exécutés

`node platform/rh-stamping-test.mjs` : **9 scénarios passés**, deux bulletins fictifs générés avec ReportLab, moteur Python réel, D1/R2/Queue locaux isolés :

1. Frozen lines from different worksheet periods retain exact provenance and rounding.
2. Version selector and authorization use the existing shared identity.
3. Concurrent preparation creates one native batch and uses immutable server amounts.
4. Real payroll PDFs flow through the existing queue and stop for preview approval.
5. RH references, payroll association and monetary allocations cannot be replaced in stamping.
6. Manual payroll reconciliation also requires the newly generated preview to be approved.
7. Explicit preview approval produces verified ZIP and preserves every original.
8. Missing or changed archived PDF fails before any batch or copied source is created.
9. Deleting a native lot keeps RH payroll archives and lets the same version be prepared again.

`node platform/rh-stamping-capacity-test.mjs` : **passé**. 17 agents × 6 mois = 102 bulletins ; 300 acceptés ; 301 rejeté ; messages par paquets de 100 maximum ; quota natif inchangé à 100 ; plafond de 200 Mio conservé. Ce test emploie une vraie D1 isolée et des adaptateurs R2/Queue fictifs : il vérifie la capacité, pas l’analyse de 300 PDF réels.

`node platform/stamping-test.mjs` : **8 scénarios natifs passés**, moteur PDF réel : droits/origine, import CSV, intégrité/doublons PDF, file persistante, approbation liée à l’empreinte, ZIP, accès partagés et suppression privée.

`node platform/rh-stamping-ui-test.mjs` : **passé** dans Edge headless, module et pont JavaScript réels, API locale simulée : sélection de version, POST de préparation, ouverture du lot, navigation directe depuis RH, absence des actions de modification interdites, affichage 390 px, aucune erreur JavaScript. Ce contrôle a détecté puis corrigé des boutons `hidden` que le CSS rendait visibles. Captures privées : `.private/rh-stamping-ui/version-to-stamping.png` et `bridge-mobile.png`.

`tsc -p platform/tsconfig.json` : **passé** après les modifications d’interface. Les contrôles des classeurs, du service RH et le parcours manuel complet du portail font l’objet des vérifications des autres agents.

Tous les enregistrements et PDF de ces tests sont fictifs. Aucun courrier n’a été envoyé et aucun document métier de production n’a été créé par ces tests. Les données des tests et le runtime Python restent sous `.private`.

## Migration et limites

- Exécuter **`migrateStamping` et `migrateRh`**. La première remplace atomiquement le trigger de quota : 300 uniquement pour les lots issus d’une version RH, 100 pour l’import natif. Les appels HTTP ne lancent pas les migrations.
- Maximum RH : 300 bulletins, 200 Mio de sources et 1,2 Mo de références JSON par lot. Les PDF sont vérifiés et copiés un à un pour limiter la mémoire.
- Chaque source RH représente un agent et un mois. Un même PDF utilisé pour plusieurs bulletins est refusé ; il faut disposer de bulletins séparés.
- Rétention native des copies de tamponnage : 30 jours. Les archives RH d’origine ne sont pas supprimées par cette purge.
- Export ZIP natif : 30 Mio. Au-delà, les PDF validés peuvent être téléchargés séparément.
- Les contrôles de signature/concordance du retour financier et de lisibilité des aperçus restent de vraies actions humaines.

Références techniques consultées : [limites Cloudflare Queues](https://developers.cloudflare.com/queues/platform/limits/) et [limites mémoire Workers](https://developers.cloudflare.com/workers/platform/limits/). L’envoi est limité à 100 messages par appel et la préparation évite de conserver simultanément tous les PDF en mémoire.

## Lecture de production avant publication

Contrôle en lecture seule à **10:01:15 UTC** : Worker et paramètres identiques au relevé de 09:53:05 UTC ; `origin/main` reste `91726ce979769962bf006914d914eb768da1a4fa`. SHA-256 Worker : `7c60519517274ca4022557bbdc5640c279db2513c2653b898396d4e9ca93d4a4`.

Les sauvegardes de comparaison restent privées sous `.private/rh-release-baseline`. Ce relevé doit être refait immédiatement avant publication afin de préserver les évolutions d’authentification menées dans un autre chantier. Aucune écriture de production n’a été effectuée par l’agent chargé de cette revue.
