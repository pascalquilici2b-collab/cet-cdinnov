# Règlements des factures émises

Jalon local du 20 octobre 2026. Les mouvements déclarés dans CDInnov suivent les sommes effectivement reçues et remboursées. Ils ne déclenchent aucune opération bancaire et ne modifient ni le contenu ni les fichiers de la facture.

## Parcours

La fiche d’une facture finalisée présente son total, puis le reste à encaisser, les paiements reçus et les éventuels remboursements. Un trop-perçu apparaît séparément. L’échéance dépassée est signalée uniquement lorsqu’un montant reste dû. Une facture à zéro est soldée sans paiement fictif.

« Enregistrer un paiement » préremplit le reste à encaisser. « Enregistrer un remboursement » préremplit le trop-perçu, lorsqu’il existe. Le montant peut être saisi au format français avec espaces et virgule ; aucune fraction de centime n’est arrondie. Le mode, la date réelle, une référence et une note interne complètent le mouvement. Une date antérieure à la facture est possible ; une date future est refusée.

L’historique conserve les saisies originales. « Corriger » remplace une saisie avec un motif, tandis qu’« Annuler la saisie » la neutralise sans supprimer sa trace. Ces actions corrigent le registre ; un remboursement réel se déclare avec l’action dédiée. Un remboursement ne peut excéder le net encaissé. Une correction qui rendrait ce net négatif est refusée intégralement.

Les filtres de liste proposent À régler, Partiellement réglées, En retard, Réglées et Trop-perçus. Chaque ligne distingue le total TTC du montant restant ou versé en trop. Les devis et brouillons n’ont pas de solde de règlement.

## Intégrité du registre

La migration explicite ajoute trois tables : `billing_payment_operations` (intentions), `billing_payment_entries` (écritures immuables) et `billing_payment_accounts` (projection du solde/version). Aucun schéma n’est créé depuis une requête HTTP.

Une insertion d’intention déclenche l’ensemble de ses écritures et la mise à jour du compte dans la même transaction SQLite. Une erreur, même sur la seconde écriture d’une correction, annule toute l’opération. Les compteurs de version, la facture émise, la cible active et le solde sont contrôlés dans la base. Modifier/supprimer l’historique ou forger le compte directement est refusé.

Une correction produit deux écritures. Pour un reçu, la nouvelle entrée précède la neutralisation de l’ancienne ; pour un remboursement, la neutralisation précède la nouvelle entrée. Ce séquencement permet de corriger un reçu déjà partiellement remboursé sans passer temporairement sous zéro. Le résultat final est vérifié avant application. Une cible neutralisée ne peut être corrigée à nouveau ; on corrige sa nouvelle entrée.

Les montants individuels sont limités à 99 999 999 999 999 centimes. Les soldes sont des entiers SQLite et ne transitent jamais comme nombres JavaScript : projection et historique exposent des chaînes de centimes. Les contraintes refusent un dépassement de capacité entière. Les calculs front utilisent BigInt. Le test dépasse volontairement `Number.MAX_SAFE_INTEGER` avec plusieurs mouvements et vérifie la valeur exacte.

Chaque intention possède un UUID et une empreinte du contenu normalisé et des versions attendues. Rejouer la même demande renvoie le même effet ; un contenu différent avec le même identifiant est refusé. Deux intentions concurrentes sur le même solde ne peuvent réussir ensemble. Une correction avance la version du compte de deux écritures.

## API

- `POST /api/v1/billing/documents/:id/payments` exige `If-Match` égal à `settlement.version`, un UUID `id` et `documentVersion`.
- `kind: receipt | refund` utilise `amount` (euros texte), `occurredOn`, `method`, `reference`, `note`.
- `kind: void` utilise uniquement `targetId` et `reason`, en plus des champs communs.
- `kind: replace` reprend les champs du mouvement et ajoute `targetId` et `reason`. Le type reçu/remboursement est celui de la cible, jamais changé implicitement.
- `GET …/payments?before=N` fournit 50 écritures par page, avec curseur exclusif `nextBefore`, liens de neutralisation/remplacement et auteur/date d’enregistrement.
- `BillingDocument.settlement` expose version, reçus, remboursements, net encaissé, reste dû, trop-perçu, état et retard. `status` reste l’état documentaire. L’échéance est évaluée selon la date de Paris.

Ces routes sont réservées à la direction, avec contrôles d’identité et d’origine. Les réponses erronées ne révèlent pas d’informations sur les comptes du portail.

## Conservation de la saisie et tests

L’ouverture du formulaire place le focus sur le montant ou le motif. La navigation et la fermeture de page protègent la saisie. Un conflit conserve les valeurs et permet d’actualiser le solde. Après une réponse réseau perdue, l’intention reste inchangée : les champs sont temporairement protégés jusqu’au réessai ou à la vérification de l’historique. Cette vérification peut constater l’enregistrement déjà effectué sans envoyer une seconde opération.

Le panneau occupe toute la largeur du résumé sur mobile ; champs à 16 px et boutons de 44 px minimum. Les détails d’audit sont secondaires. Les thèmes clair/sombre et les largeurs 390/320 px sont vérifiés en navigateur.

Validation du jalon :

- `billing-payments-test.mjs` : 13 tests, dont concurrence, reprise, trop-perçu, remboursements, corrections des deux types, retour transactionnel après panne, protection SQL, grandes valeurs, pagination, filtres, droits et conservation des fichiers synthétiques.
- `billing-payments-browser-test.mjs` : API/Worker/D1 réels, 35 requêtes, aucune erreur JavaScript/React ; saisies, erreurs, focus, conflits, réessai et vérification après réponse perdue, correction, mobile et filtres. PDF synthétique utilisé pour ce parcours.
- `billing-issue-integration-test.mjs` : chaîne native complète, PDF/A–Factur-X de deux pages avec XML incorporé, quatre fichiers archivés. Après reçu, remboursement et correction, les quatre fichiers sont comparés octet par octet ; numéro, instantané, version documentaire et compteur restent identiques.

## Suite

La vue d’ensemble des encaissements reste à construire. Un rapprochement bancaire automatique serait une extension distincte. Le présent registre concerne les nouvelles factures structurées. Il n’importe ni n’invente les règlements d’archives historiques ; leur reprise devra distinguer un solde connu d’un solde à rapprocher.

Les avoirs, acomptes, factures partielles et allocations constituent le prochain chantier. Ils devront faire évoluer les montants exigibles et les liens commerciaux explicitement, sans utiliser une annulation de saisie pour représenter un avoir. Aucun déploiement ni transfert à AGIRIS n’a été effectué dans ce jalon.
