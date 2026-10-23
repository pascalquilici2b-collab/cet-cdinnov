# Bons historiques et aperçu des relevés

- Les commandes globales sont stockées une seule fois dans `market.orders` et proposées à chaque projet rattaché au marché. Le suivi agrège les factures de ces projets sans dupliquer l'engagement.
- Les commandes historiques peuvent conserver `historyPending` tant que les anciennes factures ne sont pas rapprochées. Le suivi affiche alors le montant facturé connu et n'annonce pas un solde disponible définitif. Cette option peut être décochée dans « Projets liés » après rapprochement.
- La pièce originale d'une commande est téléchargeable depuis « Suivi engagement » avec les mêmes droits que les autres pièces du marché.
- Le relevé dispose d'un aperçu PDF automatique à côté de sa saisie. `POST intervention-report.pdf` n'enregistre rien ; `PUT intervention-report` conserve la sauvegarde versionnée et `GET intervention-report.pdf` produit le relevé sauvegardé.
- Les textes des prestations et travaux du relevé passent de 8 à 6 points, avec un en-tête compact. Un relevé courant tient sur une page ; les relevés longs conservent leurs pages supplémentaires et leurs lignes intégrales.
- Le titre interne de la facture n'est plus imprimé. Il reste dans la liste de factures et sert d'objet initial au relevé. Les PDF archivés restent immuables.
- Les boutons de statut et de relevé sont arrondis et leurs icônes disposent de davantage d'espace.

## Vérification

TypeScript et compilation ; tests de suivi d'engagement, de téléchargement des pièces et d'un bon global utilisé par deux projets ; tests Python de PDF sur une et plusieurs pages ; parcours navigateur devis → engagement → facture → aperçu du relevé, en clair, sombre et mobile. Le test vérifie que l'aperçu n'enregistre pas le relevé et que le PDF archivé de la facture reste inchangé.

Les inventaires, pièces sources, montants et sauvegardes de production restent dans le répertoire privé de reprise, hors Git.
