# Filtres clients et relevés — 30 octobre 2026

Les filtres Factures et Devis regroupent les anciennes dénominations sous le nom actuel de la fiche client. La projection utilise les identifiants explicites, SIRET/SIREN non ambigus, anciens noms conservés dans l'historique et alias vérifiés. Les alias Budgets sont lus dans leur table normalisée. Un nom proche ou un logo commun ne suffit pas à fusionner des clients.

Les factures importées utilisent la même correspondance que les documents créés dans l'application. La recherche accepte aussi le nom actuel. Les cartes de Marchés et contrats sont regroupées par identité client, avec conservation des intitulés historiques dans les fiches.

Aucun identifiant métier, document, PDF finalisé, relation devis/facture, engagement ou marché n'est réécrit. Aucune migration de base n'est nécessaire. Les homonymes et identifiants contradictoires restent séparés.

Le bouton affiche « Générer le relevé » avant enregistrement, puis « Voir le relevé » avec un œil. Le statut reste cohérent à la réouverture, au rafraîchissement et en changeant de facture.

## Vérifications

- Résolveur : identités exactes, anciens noms prouvés, homonymes, établissements distincts, valeurs historiques nulles.
- API locale réelle : renommage, pagination, lien devis/facture/marché, imports et absence de mutation des données.
- Imports : résolution serveur, recherche et pagination de la liste unifiée.
- Marchés : rendu des cartes et navigation par identité stable, recherche actuelle/historique.
- Relevés : test navigateur avec transport, Worker et base locale réels ; création, réouverture, modification, téléchargement, factures natives et importées. Le moteur PDF interne est remplacé dans ce test ciblé sur l'état du bouton.
- Compilation TypeScript et build de production.
- Lecture de la projection sur la base réelle : 1 218 imports conservés ; 231 options clients dans les factures, aucune option vide.

Résultat : 21 tests ciblés réussis. Le jeu historique `billing-test.mjs` conserve cinq assertions obsolètes (conversion sans engagement accepté, anciens champs de contexte, suppression supposée indisponible). Les mêmes échecs sont reproduits sur le Worker déjà publié avant cette modification ; ils ne proviennent pas de cette livraison et restent à moderniser.

Les traces privées de publication et de comparaison des données restent dans `.private/client-filters-20261030/`.
