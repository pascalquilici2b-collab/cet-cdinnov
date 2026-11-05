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


## Revue finale et intégration des sessions

La version de sécurité publiée `cd83c26` est fusionnée : cookies HttpOnly, en-tête anti-CSRF, événement commun de session expirée et nettoyage RH au changement de compte. Les 9 scénarios backend RH, 9 scénarios de tamponnage réel, capacité 300, navigateur tamponnage et TypeScript ont été revalidés après fusion.

Contrôle manuel CUA avec API Miniflare et moteur d’extraction fictif : création du document, choix client/projet/période, création d’un agent commun, deux bulletins, vérification, taux 25 % et 10 %, total 1 512,59 €, gel de version, téléchargement Excel, réimport du classeur complété et PDF signé fictif, puis validation du retour. Un second document retrouve les deux agents et réutilise les deux PDF sans téléversement. Les vues claires/sombres et les largeurs 390/320 px ont été inspectées sans débordement du module. Captures sous `.private/rh-visual-qa`.

Ce serveur de test manuel n’active pas la file de tamponnage : son message de configuration est attendu. Le raccordement complet à la file et au moteur PDF réel est vérifié séparément par les 9 scénarios d’intégration et le test navigateur du pont.

Le lecteur de bulletins utilise désormais PDF.js local, sans iframe. `node platform/rh-pdf-preview-test.mjs` vérifie un PDF de deux pages, les pixels de texte effectivement dessinés, pagination, zoom, reprise après erreur et mobile. Le rendu a aussi été inspecté en CUA dans la fenêtre de rapprochement.

Les 8 tests Excel couvrent retours, intégrité, versements multiples et limites ZIP. La migration reste explicite, sans écriture de documents métier de production.


## Publication RH vérifiée — 5 novembre 2026

- Source publiée sur `main` et `codex/rh-documents-20261105`, intégrant les commits de sécurité `cd83c26` et de procédure `4567f31` (release RH `a4d0526`).
- Migrations explicites : 27 instructions, 10 tables RH ; quota de tamponnage RH 300, quota natif 100. Les 44 tables métier contrôlées conservent les mêmes empreintes avant/après.
- Worker publié et relu : SHA-256 `924535b1e68253e81490aa75e01b535944ab64401854fea5f861492b2bf489b9`. Les 14 bindings et la planification restent identiques.
- Frontal Pages `cdinnov-app` : interface Cloudflare « Success! », 668/668 fichiers importés ; dossier exact `.build/frontend-lqxK2t`. Les contrôles de livrable et de connexion compilée ont réussi. SHA-256 ZIP : `b7ef79f36e51499933e345674d66da04a1d01d93fa4dfabdc54d6a784a545e3c`.
- Vérification HTTPS à 10:26 UTC : portail, RH JS/CSS, tamponnage, facturation, sessions CSS et transport identiques octet pour octet au livrable. Quatre routes privées retournent 401 sans session ; origine étrangère 403. CSP et nosniff sont présents.
- Le DNS public 1.1.1.1 pointe `app.cdinnov.eu` vers `cdinnov-app.pages.dev`. Le résolveur local conserve encore temporairement l’ancien CNAME GitHub. Le contrôle HTTPS a utilisé la destination publique actuelle avec validation normale du certificat `app.cdinnov.eu` ; aucune vérification TLS désactivée.

Aucun bulletin réel, document RH de test, paiement ou courriel n’a été créé en production pour ces essais. Les résultats détaillés et sauvegardes restent dans `.private/rh-release` et `.private/rh-publication-exact-20261105`.
