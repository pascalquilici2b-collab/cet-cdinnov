# Relevés et numérotation — 28 octobre 2026

- Le relevé enregistré s'ouvre dans un aperçu PDF pleine largeur. Il reste accessible par « Voir le relevé » après fermeture, navigation ou rechargement. Modification, impression et téléchargement restent disponibles.
- Deux compteurs continus et indépendants pour l'émetteur CDINNOV : FAC-2610067 et DEV-2610067. Les numéros sont attribués à la création, ne sont pas réutilisés et ne changent plus à la finalisation.
- Les anciennes séries sont retirées des nouvelles réservations. Les documents et numéros existants restent intacts ; les anciennes réservations peuvent encore être finalisées.
- Sur confirmation explicite de l'utilisateur, DEVELOPP semestre 5 non transmise (F-20261028-015) est rectifiée en brouillon FAC-2610067. L'original reste intact et la référence du devis est reprise.

## Vérifications

- Vérification TypeScript et compilation de l'application.
- Test navigateur avec le moteur PDF réel : génération, enregistrement, rechargement, réouverture et modification du relevé ; PDF original de facture inchangé.
- Test des compteurs : démarrage FAC/DEV, concurrence sans doublons, réservation idempotente, finalisation des anciennes réservations et blocage des nouvelles réservations sur les séries retirées.
- Huit tests de régression sur engagements, relevés et conservation des historiques.

## Publication

- Sauvegarde privée des données et du serveur avant intervention.
- Migration additive et serveur publiés sans changement des paramètres d'hébergement.
- Aucun envoi de facture ou de courriel effectué.
