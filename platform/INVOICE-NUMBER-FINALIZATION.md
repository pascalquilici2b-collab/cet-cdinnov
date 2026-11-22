# Numéro de facture à la finalisation

Les factures nouvelles restent sans numéro pendant la création, les sauvegardes et les aperçus. L’ancien `POST /documents/:id/number` répond toujours 200 pour compatibilité, mais ne réserve rien pour une facture. Les devis conservent leur réservation et leur parcours d’envoi/acceptation. La référence du devis reste dans `data.references.quoteNumber` ; elle ne détermine pas le compteur des factures. Une référence externe peut être renseignée sans créer de lien vers un document inexistant ; celle d’un devis natif lié reste conservée et non modifiable dans ce champ.

Le bouton de finalisation conserve deux étapes serveur : `/issue` contrôle le document avec le moteur PDF, puis attribue atomiquement le prochain numéro et fige l’instantané ; `/finalize` génère et archive le PDF de cette émission. Une interruption de rendu conserve le même numéro et le même instantané pour la reprise. Les dates et échéances saisies ne sont pas réécrites. Une date de facture future ou antérieure à la dernière émission de sa série reste refusée.

## Anciennes réservations

`billing_draft_numbers` reste un registre historique immuable. Aucun numéro ni compteur n’est supprimé ou réinitialisé. Une ancienne facture non émise expose `numberingReview:true` et `numberingReviewNumber`, avec `reservedNumber:null`. Ce numéro d’audit ne doit jamais servir de numéro courant, d’aperçu ou de pièce jointe.

La régularisation est explicite : `POST /api/v1/billing/documents/:id/retire-draft-number`, avec `If-Match`, `X-CDInnov-Request: 1` et `{notTransmitted:true,reason:"…"}`. La raison doit contenir 10 à 2 000 caractères après retrait des espaces extérieurs. La route refuse toute émission déjà commencée et tout envoi `sending`, `sent` ou `unknown`. Elle conserve la réservation complète, la version du document, la raison, l’auteur, l’horodatage et l’attestation dans `billing_invoice_number_retirements`, sans modifier les données financières.

L’historique est ensuite exposé dans `retiredNumber`; le prochain `/issue` utilise le compteur courant, jamais l’ancien numéro. La recherche conserve les anciens numéros. L’unicité vérifie aussi les réservations historiques d’autres séries, même retirées. Le contrôle doit inclure les anciens PDF éventuellement téléchargés : leurs exports n’ont pas tous été journalisés. Il n’existe aucune migration automatique de masse des réservations.

Les relations de rectification existantes sont conservées. Aucun nouveau brouillon de remplacement n’est créé par cette migration. Le garde-fou SQL des envois interdit aussi l’insertion d’une transmission sur un original ayant un remplacement actif.

## Publication en deux phases

Les listes exactes sont exportées par `billing-invoice-finalization-number-schema.mjs` :

- `billingInvoiceFinalizationNumberPrepareSchema` : sept instructions additives, tables d’audit et de politique plus leurs protections.
- `billingInvoiceFinalizationNumberActivateSchema` : dix instructions de remplacement des gardes et activation du marqueur.
- `billingInvoiceFinalizationNumberSchema` : les deux phases, utilisées par les migrations locales ordinaires.

Ordre de publication :

1. Sauvegarder le schéma et les empreintes des documents/émissions, des réservations et des compteurs. Vérifier les envois, règlements, dates et relations des dossiers concernés en lecture seule.
2. Appliquer **prepare** explicitement. L’ancien Worker continue de fonctionner ; aucune politique de numérotation ni donnée financière n’a changé. Le marqueur `billing_invoice_number_policy` reste vide.
3. Publier le nouveau Worker avec ses bindings et secrets conservés. Ses lectures disposent des tables requises ; `/number` facture ne consomme plus de numéro. Tant que le marqueur est absent, les nouvelles émissions de factures et régularisations répondent 503 avant le préflight. Les devis et la consultation/reprise des émissions existantes restent disponibles.
4. Appliquer **activate en un seul batch D1 transactionnel** : `db.batch(billingInvoiceFinalizationNumberActivateSchema.map(sql=>db.prepare(sql)))`. Le marqueur est inséré par la dernière instruction, dans la même transaction que les nouveaux gardes. Ne pas exécuter cette liste comme dix requêtes indépendantes. Une défaillance doit annuler tout le batch, marqueur compris. Aucun appel HTTP de l’application ne crée ni ne modifie le schéma.
5. Contrôler les lectures, le refus des origines étrangères et les empreintes des anciens documents sans créer de document métier de test en production. Publier le frontal vérifié et le commit validé du moteur PDF dans Render selon `DEPLOYMENT.md`. Le moteur PDF refuse aussi d’afficher un numéro définitif sur une facture non émise si un ancien appel le fournit.
6. Régulariser seulement les dossiers explicitement autorisés, avec leurs versions attendues et l’attestation de non-transmission. Vérifier que le compteur et les données financières restent inchangés. Une émission de facture est une opération distincte, toujours explicite.

Le nouveau Worker ne doit pas précéder **prepare**, car ses SELECT lisent les nouvelles tables. Après activation, un ancien Worker qui tente encore une réservation de facture au stade brouillon est refusé par SQL, sans consommation du compteur. Les anciens clients utilisant le nouveau Worker reçoivent le résultat 200 sans effet.

Un retour de code doit conserver les nouveaux gardes et le registre d’audit. Ne jamais rétablir une numérotation anticipée, réutiliser un numéro retiré ou restaurer une base ancienne par-dessus des opérations intervenues depuis la publication. Aucun traitement de cette livraison ne modifie les émissions et fichiers déjà figés.

## Validation locale

```sh
node platform/billing-invoice-finalization-number-test.mjs
node platform/billing-issuance-test.mjs
node platform/billing-draft-number-test.mjs
node platform/billing-monthly-number-test.mjs
node platform/billing-numbering-test.mjs
node platform/billing-series-policy-test.mjs
node platform/billing-quote-number-correction-test.mjs
CHROMIUM_PATH=/chemin/chromium node platform/billing-finalization-number-ui-test.mjs
BILLING_TEST_PYTHON=/chemin/venv/bin/python node platform/billing-finalization-pdf-integration-test.mjs
node node_modules/typescript/bin/tsc -p platform/tsconfig.json --noEmit
```

Le parcours navigateur accepte aussi `PLAYWRIGHT_PACKAGE`. Le parcours PDF utilise un vrai moteur FastAPI local, D1/R2 locaux et des documents fictifs. Il vérifie le numéro définitif, les références du devis, les relevés, l’échec de rendu, la détection d’un objet corrompu et la reprise sans nouveau numéro. Les contrôles indépendants de migration couvrent aussi les compteurs historiques, les courses et l’activation transactionnelle. Depuis `facturx-service`, `python -m pytest tests/test_invoice_number_finalization.py` vérifie les brouillons simples et multipages, les devis et les documents émis.
