# Facturations partielles et numérotation — 28 octobre 2026

Un devis accepté avec son engagement joint peut donner lieu à plusieurs factures. Le bouton « Créer une autre facture » reste disponible après la première. La fenêtre permet de sélectionner les périodes et les quantités ; une quantité nulle écarte la ligne. Les prix, le devis d’origine et les références de l’engagement sont repris. Les champs restent modifiables dans le nouvel éditeur.

Le suivi du devis liste toutes ses factures, en suivant pour chacune la dernière rectification. Le contrôle atomique du plafond du bon de commande additionne les factures et les brouillons, sans compter deux fois une facture rectifiée. Le devis accepté et son PDF restent inchangés. Une nouvelle requête de création reçoit un identifiant distinct ; une reprise après erreur conserve celui de sa tentative.

Format confirmé : `FAC-AAAAMMNNN` et `DEV-AAAAMMNNN`, par exemple `FAC-202610068`, puis `FAC-202611069`. Compteurs continus et indépendants, sans remise à zéro mensuelle ni annuelle. Le numéro est réservé à la création ; le mois correspond à cette réservation, dans le fuseau Europe/Paris. Le compteur comporte au minimum trois chiffres. Les documents et réservations déjà existants conservent leur numéro, notamment `DEV-2610067` et `FAC-2610067`.

Migrations : `billing-partial-invoices-schema.mjs` retire l’unicité du lien devis → facture, tout en conservant les gardes d’accord et de version. `billing-monthly-number-schema.mjs` ajoute le format mensuel et adapte les contrôles de numérotation. La politique CDI bascule vers deux séries continues démarrant au prochain compteur, sans changer les anciennes séries ni les documents. Les anciens numéros réservés restent finalisables.

Validation : tests de deux factures S5/S6, références communes, rectification, limite cumulée concurrente, requêtes répétées, changement de mois et d’année, numéros historiques ; parcours visuel en modes clair/sombre et mobile. Aucun second document réel ni envoi client créé pendant la recette.
