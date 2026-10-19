# Suivi commercial des devis

Ce jalon ajoute le suivi d’un devis finalisé, ses réponses client et les filtres de la liste. L’état commercial est distinct du traitement du PDF, de la transmission AGIRIS et du règlement d’une facture. Aucun envoi d’e-mail ni dépôt distant n’est effectué par ces actions.

## Parcours

Le devis finalisé est « À envoyer ». L’utilisateur peut déclarer un envoi déjà effectué ou enregistrer directement un accord ou un refus reçu hors de l’application. La date réelle et l’origine de la réponse sont conservées (par exemple, référence d’un e-mail ou d’un devis signé). Cette saisie constitue une déclaration interne, pas une signature électronique ni une pièce justificative téléversée.

L’accord permet de créer un unique brouillon de facture lié au devis émis. Le devis donne ensuite accès à cette facture ; il n’est pas présenté comme facturé dès la création du brouillon. La conversion d’un devis encore en brouillon reste disponible pour préparer une facture, comme dans le parcours antérieur.

Une réponse peut être corrigée avec un motif obligatoire tant qu’aucune facture n’est liée. La correction remet le devis en attente, conserve toutes les réponses précédentes et permet une nouvelle déclaration. Une facture liée verrouille ce suivi ; la gestion des corrections et avoirs de cette facture appartient au prochain lot.

La liste filtre les brouillons, les documents en finalisation ou à reprendre, et les devis à envoyer, en attente, acceptés, refusés ou expirés. Le nombre et les lignes proviennent d’une même lecture de la base. Un résultat vide propose de réinitialiser les filtres. Les badges restent lisibles sur mobile ; leur couleur ne porte pas seule l’information.

## Dates et expiration

L’expiration est dérivée à la lecture, sans modifier le document ni ajouter un faux événement. Un devis sans réponse acceptée/refusée devient expiré le lendemain de sa date de validité, dans le fuseau Europe/Paris (heure d’été comprise). Un accord ou refus enregistré reste visible après cette date.

La date déclarée doit être comprise entre la date du devis et le jour courant. Une réponse ne peut précéder l’envoi déclaré. L’accord doit avoir été donné au plus tard à la date de validité : il peut être saisi ultérieurement si l’utilisateur indique sa date réelle. Une correction indique sa propre date de déclaration ; la réponse suivante peut décrire un événement antérieur à cette correction. Les états se recalculent à chaque lecture de l’API ; l’interface ouverte ne dispose pas encore d’un rafraîchissement à minuit.

## API et stockage

- `GET /api/v1/billing/documents/:id/quote-events?before=N` : historique décroissant, 50 événements par page et curseur exclusif `nextBefore`.
- `POST /api/v1/billing/documents/:id/quote-events` : `{id, documentVersion, action, occurredOn, note}`. Actions : `sent`, `accepted`, `refused`, `reopened`.
- `If-Match` porte la version du **suivi**, initialement 0. `documentVersion` désigne la version figée du document. Chaque événement possède un UUID et une empreinte de requête permettant de reprendre une réponse perdue sans doublon.
- Les lectures de documents contiennent `quote` pour un devis : version, état dérivé, date de la dernière action et éventuelle facture liée avec son propre état d’émission. Les factures contiennent `quote: null`.
- `GET /documents` accepte `state`, combinable avec type, recherche et pagination. Les filtres commerciaux sont réservés aux devis.

L’accès reste réservé à la direction. Les événements exigent un devis dont le PDF est disponible. Les entrées JSON, tailles, dates et versions sont contrôlées. `billing_quote_events` possède des références vers le document et sa version, une séquence unique par devis, ainsi que des déclencheurs empêchant toute réécriture/suppression. Les règles de transition et de conversion sont également protégées dans la base pour arbitrer les écritures concurrentes.

Le schéma s’ajoute lors de `migrateBilling`, dans la transaction explicite des autres tables de facturation ; aucune migration HTTP. Aucun événement ne change `billing_documents`, l’enveloppe d’émission, ses empreintes ou les fichiers R2. La conversion d’un devis émis exige un accord, y compris lors d’une course avec une correction de réponse.

## UX et vérification

Le suivi se trouve dans le résumé à côté du PDF. Sur mobile, il occupe toute la largeur et reste dans l’onglet Résumé. L’ouverture du formulaire place le focus sur la date. Les champs ont des noms accessibles ; les boutons restent utilisables au toucher. Les modifications non enregistrées protègent la navigation. Une erreur conserve la saisie ; un conflit propose d’actualiser l’état pour vérifier la réponse avant un nouvel enregistrement. La reprise réseau conserve le même identifiant tant que la tentative ne change pas. Les réponses après démontage ne réaffichent pas les données.

`billing-quote-test.mjs` vérifie calendrier, droits, dates, séquences, immutabilité, reprises, concurrence, migration, pagination, filtres, lien vers la facture et course correction/conversion sur Worker et D1 réels. `billing-quote-browser-test.mjs` vérifie ces parcours dans Edge, avec panne réseau et conflit simulés, puis les thèmes et largeurs de 390 et 320 pixels. Ses documents et son PDF sont des fixtures synthétiques : il ne remplace pas le test natif Factur-X séparé.

## Suites

Les révisions commerciales liées entre plusieurs devis, les justificatifs attachés, la signature électronique, les relances/envoyés automatiques, les acomptes et factures partielles restent à réaliser. La duplication actuelle crée un nouveau brouillon indépendant ; elle ne constitue pas encore une révision commerciale liée. Le rapprochement des devis/factures historiques et la qualification de production restent dans le plan général.
