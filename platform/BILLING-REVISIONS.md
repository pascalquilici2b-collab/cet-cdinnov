# Révisions commerciales des devis

Une révision est un nouveau devis lié à une proposition existante. Elle conserve les documents et réponses antérieurs. Les sauvegardes successives d’un même brouillon restent un historique technique distinct de ces versions commerciales.

## Parcours disponible

1. Depuis le devis finalisé en cours, « Préparer une nouvelle version » demande un motif. La création produit un nouveau brouillon et le sélectionne comme version en cours.
2. Le brouillon reprend les coordonnées, références, prestations, prix et conditions de son parent. Ses lignes reçoivent leurs propres identifiants. La date est celle du jour à Paris ; validité et échéance sont à préciser. Une mention de révision du numéro parent est ajoutée aux notes si elle tient dans la limite du champ ; les notes originales ne sont jamais tronquées.
3. Le nouveau brouillon bloque le suivi et la conversion des versions précédentes. Leurs fichiers, montants et réponses restent consultables. L’interface propose d’ouvrir la version en cours et un historique des versions avec leurs montants et motifs.
4. Avant réservation d’un numéro ou création d’une facture liée, « Abandonner cette révision » conserve le brouillon en lecture seule et réactive son parent. L’abandon exige un motif. La numérotation des versions n’est pas réutilisée : après une V2 abandonnée, la prochaine révision sera V3.
5. La finalisation d’une révision utilise la série des devis et attribue un nouveau numéro. Aucun accord de l’ancienne version n’est recopié. Pour convertir cette révision émise, son propre accord doit être enregistré.

La liste des devis présente par défaut les versions en cours. Une recherche avec « Tous les statuts » retrouve aussi les anciennes versions et les révisions abandonnées, notamment par numéro. Les filtres « Versions précédentes » et « Révisions abandonnées » donnent accès aux autres. Une duplication ordinaire reste un brouillon indépendant ; son action est distincte de la révision liée.

## Intégrité et concurrence

Les tables `billing_quote_families`, `billing_quote_revisions` et `billing_quote_family_history` sélectionnent et tracent la version courante. Le groupe est créé à la première révision ; les devis antérieurs sans révision n’ont pas besoin de reprise ni de réécriture. Tous les ajouts de schéma sont effectués par la migration explicite de facturation.

Créer une révision insère le brouillon et sa relation, puis avance le groupe, dans une seule transaction D1. Une collision annule aussi le brouillon, évitant les documents orphelins. La relation parent, la version source et le motif initial sont immuables. Le seul changement permis sur la relation est l’abandon d’un brouillon courant ; il est horodaté, attribué et historisé. Les historiques ne peuvent être supprimés ou réécrits.

La version du document et celle du groupe sont vérifiées séparément. Les requêtes possèdent un identifiant et une empreinte d’intention : une réponse perdue peut être reprise sans réinitialiser le brouillon ni produire de deuxième révision. Rejouer une création ensuite abandonnée retourne cette même révision abandonnée.

Le groupe entier ne peut produire qu’une facture complète liée. Le contrôle porte sur le devis initial et toutes ses révisions. Une création de révision concurrente avec la conversion en facture laisse réussir une seule action. Une réservation de numéro concurrente avec l’abandon laisse soit le document figé, soit le brouillon abandonné ; aucun numéro n’est consommé dans ce second cas. Ces frontières sont contrôlées dans la base, y compris pour un écrivain SQL autre que l’API.

Les PDF, XML, rapports et enveloppes déjà émis restent inchangés. Un abandon ne supprime aucun document et ne restitue aucun numéro : il est uniquement possible avant réservation. La gestion d’une correction d’un devis déjà finalisé passe par une nouvelle révision.

## API

- `POST /documents/:id/revise`, avec `If-Match` égal à la version du document et `{id, familyVersion, reason}`. Le résultat est le nouveau devis (201), ou la même révision lors d’une reprise (200).
- `POST /documents/:id/abandon-revision`, avec les mêmes contrôles et une nouvelle intention d’abandon. Le résultat est le brouillon conservé en lecture seule.
- `GET /documents/:id/quote-versions?before=N` retourne 50 versions commerciales par page, en ordre décroissant, avec un curseur exclusif `nextBefore`.
- `quote.revision` décrit la version affichée, son parent, la version en cours, le compteur de versions et un éventuel abandon. `quote.invoice` retrouve la facture complète liée depuis chacune des versions du groupe.

Ces routes restent réservées à la direction et utilisent les contrôles d’origine du portail. Les motifs sont des informations internes. Ils ne sont pas transmis automatiquement au client.

## UX et vérifications

Le panneau des versions se trouve avant l’édition et la consultation du document ; l’historique est replié par défaut. Le motif reçoit le focus à l’ouverture du formulaire. Une navigation protège la saisie non enregistrée. Les erreurs réseau et conflits conservent le motif. L’actualisation d’un brouillon contenant d’autres modifications locales demande de les abandonner explicitement avant de recharger. Les formulaires utilisent toute la largeur sur mobile et des boutons adaptés au toucher.

Les tests D1 couvrent notamment droits, copies indépendantes, concurrence, absence de brouillon orphelin, abandon, reprise idempotente, conservation de l’émission d’origine, nouvel accord, facture unique dans le groupe et pagination au-delà de 50 versions. Les notes de longueur maximale sont conservées intégralement.

Le test navigateur utilise les API réelles avec des PDF synthétiques. Il vérifie une réponse de création perdue, un conflit avant abandon, les versions précédentes, la réactivation du parent, la finalisation simulée d’une nouvelle version, l’accord propre à cette version et sa conversion. Les thèmes et largeurs 390/320 px sont contrôlés. Le moteur natif possède sa qualification locale séparée ; ce test ne remplace pas une génération réelle.

## Suites du cycle commercial

La facture complète, même encore en brouillon, bloque une nouvelle révision du groupe. Les annulations de facture brouillon, avoirs, acomptes et factures partielles nécessitent le prochain modèle d’allocations ; ils ne doivent pas être ajoutés en contournant l’unicité actuelle. Les justificatifs de réponse attachés et la signature électronique restent à réaliser. Aucun message client, déploiement ou dépôt AGIRIS n’est effectué dans ce jalon.
