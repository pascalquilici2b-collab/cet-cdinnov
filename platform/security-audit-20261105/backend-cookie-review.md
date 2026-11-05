# Régressions métier avec sessions par cookie — 5 novembre 2026

Les tests backend utilisant les sessions de connexion du portail transmettent
désormais `Cookie: session.cookie` dans leur harnais Node et le marqueur
`X-CDInnov-Request: 1` pour les requêtes applicatives. Les jetons d'invitation
restent des jetons d'invitation et n'ont pas été remplacés. Les règles métier et
les réponses attendues ne sont pas assouplies pour faire passer d'anciens tests.

Les helpers de devis et paiement reçoivent le cookie. Le test de concurrence des
budgets simule deux magasins de cookies distincts côté transport ; le composant
navigateur reçoit uniquement `email` et `sessionId`, demande
`credentials: same-origin` et n'émet pas d'en-tête bearer. Le helper
`billing-preview.mjs` retire le cookie des métadonnées injectées dans le JavaScript,
le pose côté serveur avec `HttpOnly; Secure; SameSite=Strict`, et relaie les cookies
et le marqueur de requête vers le Worker local. Il compile le Worker source par
défaut au lieu de forcer un ancien fichier `.build`.

## Résultats observés

**39 fichiers de suites réussis**, **7 fichiers avec au moins une attente métier
incompatible avec le comportement courant**, et **1 parcours natif non exécutable
faute de runtime local**. Ce décompte porte sur les fichiers, pas sur les assertions
ni sur l'ensemble de la base de tests. Le relevé par fichier et les sorties sont
dans `platform/.private/security-audit-20261105/backend-cookie/` ;
`final-results.json` regroupe les résultats finaux. Les essais n'utilisent que les
données fictives, les bases Miniflare locales et les services simulés/prévus par
chaque suite.

Les 39 suites vertes couvrent :

- accès et rôles (`account-access`, `account-roles`, `security-access`, `portal`) ;
- conservation et concurrence des données (`business`, `record`, `dashboard`) ;
- clients et liens (`billing-client-enrollment-api`, `billing-directory`,
  `billing-client-filter-audit`, `billing-engagement-groups`,
  `billing-engagement-inheritance`) ;
- clients → marchés → projets → commandes → prix, devis → engagements et factures
  (`billing-flow-market-audit`, `billing-flow-engagement-audit`,
  `billing-flow-invoice-audit`, `billing-order-budget`, `project-activity`) ;
- numérotation actuelle et reprises (`billing-draft-number`,
  `billing-monthly-number`, `billing-quote-number-correction`,
  `billing-series-policy`, `billing-followup`, `billing-revision`) ;
- génération et validation de contrat (`billing-generation`, `billing-issuance`,
  `billing-pdf`, `billing-credit-contract`) ;
- paiements, factures partielles, périodes, envoi, recouvrement et corbeille
  (`billing-payments`, `billing-partial-invoices`, `billing-periods`,
  `billing-sent`, `billing-receivables`, `billing-trash`) ;
- parcours documentaires et exports (`evolutions-20261026`, `stamping`,
  `stamping-layout`, `stamping-shared-import`, `stamping-reinspect`, `marches/ai`).

`record-test` réussit ses 13 scénarios après adaptation correcte du transport de
test au cookie HttpOnly. `dashboard-test` réussit ses six contrôles ; son import
TypeScript transitif sans extension a été rendu exécutable sous Node par un
bundle en mémoire limité au test. `billing-credit-contract` passe avec le venv
Python explicite. L'échec initial de configuration de ces deux harnais et celui
de `record-test` sont remplacés par leurs résultats de relance, sans changement
des assertions métier.

Le test `stamping-test` réussit huit scénarios Worker/D1/R2/Queue et appelle le
vrai moteur Python PDF sur pièces fictives. L'IA reste simulée.
`stamping-shared-import` vérifie le découpage multipage, les originaux, le partage
en lecture et les refus de modification d'un collaborateur. Ces essais n'appellent
pas le nouveau Ghostscript Linux : sa preuve relève du build décrit dans
[native-review.md](native-review.md).

## Attentes anciennes non masquées

| Suite | Échec observé et limite |
|---|---|
| `billing-test.mjs` | 11 sous-tests passent ; cinq échouent : conversions de devis sans accord/preuve renvoient 409 ; le contexte marché contient maintenant activité/consommation/commandes ; DELETE existe désormais et demande une version (428 au lieu de l'ancien 405). |
| `billing-numbering-test.mjs` | Conversion attendue 201 après acceptation seule, sans pièce d'engagement ; le serveur renvoie 409. Les séries mensuelles, corrections et règles de séries actuelles passent. |
| `billing-quote-test.mjs` | Huit sous-tests passent ; la conversion attendue sans pièce d'engagement est refusée 409. Les tests actuels de flux avec engagement passent. |
| `modules-documents-test.mjs` | Même conversion de devis insuffisamment justifiée : 409 au lieu de 201. |
| `billing-support-test.mjs` | Sept tests passent ; un ancien scénario exige qu'une seconde facture d'un devis soit toujours interdite (409), alors que le parcours courant de facturation partielle renvoie 201. `billing-partial-invoices-test` passe. |
| `billing-filter-test.mjs` | Un filtre de devis par libellé brut attend un résultat et en reçoit zéro. Les cinq tests actuels d'identité client/homonymes/établissements de `billing-client-filter-audit` passent. Cet échec n'a pas été masqué ni attribué à une faille d'accès. |
| `stamping-payment-test.mjs` | L'ancien test attend 404 entre deux administrateurs sur la lecture d'une source ; le partage courant autorise cette lecture (200). Le parcours actuel `stamping-shared-import` vérifie les droits de lecture et l'interdiction des écritures aux collaborateurs. |

Cette sous-revue n'a pas rejoué ces sept suites sur un checkout historique complet ;
leur qualification repose sur les assertions détaillées, les règles métier
actuelles et les parcours actuels réussis. Aucun des échecs n'est annoncé vert.
Les autres suites navigateur historiques contenant encore un accès à `.token`
n'ont pas été migrées ni déclarées réussies dans ce volet ; le parcours de session
navigateur courant est traité par l'agent UI.

## Conversion native de bout en bout

`billing-issue-integration-test.mjs` refuse de démarrer sans
`BILLING_FULL_RUNTIME=1`, Python/Ghostscript/Java/veraPDF et répertoire de preuve.
Ce prérequis n'est pas présent sur ce poste : **aucun succès natif local n'est
revendiqué**. Les essais HTTP `billing-generation`, `billing-issuance` et
`billing-pdf` passent avec des réponses documentaires simulées : validation avant
réservation, refus d'artefacts incohérents, compteur stable, permissions et
conservation des instantanés. Le build Linux doit compléter cette preuve avec
les validations réelles PDF/A-3b/Factur-X, TrueType, multipage et OCR.

Les fichiers de preuve des audits d'octobre ont été laissés intacts. Aucun mail,
document métier ou accès à une base de production n'a été créé par ces tests.
