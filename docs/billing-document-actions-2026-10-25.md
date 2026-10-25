# Actions des documents — 25 octobre 2026

- Confirmation verte animée au niveau du bouton après une sauvegarde ou validation réussie, partagée par la facturation, les répertoires, les projets, les marchés et les formulaires du portail. Le bouton retrouve son contenu après 2,5 secondes. Les erreurs restent visibles, sans confirmation de réussite. Animation désactivée avec `prefers-reduced-motion`.
- Ouverture des lignes de devis et factures par clic sur une cellule ou par Entrée/Espace. Les menus, suppressions, téléchargements, fenêtres et sélections de texte restent indépendants de la navigation. Les documents placés dans la corbeille doivent d’abord être restaurés.
- Le formulaire de modification rapide d’une facture importée n’affiche plus le dépôt de PDF. Le dépôt reste disponible lors d’un nouvel import et via l’action dédiée pour joindre un original manquant. Les PDF historiques ne sont pas remplacés par la modification de leurs métadonnées.
- Origine de l’accord structurée : devis signé, bon de commande, e-mail, courrier, autre accord écrit. Date et origine sont conservées dans l’historique du devis.
- Sélecteur Radix des versions du devis, coche verte sur la version en cours. Les versions abandonnées restent consultables ; les versions en corbeille sont identifiées et non sélectionnables jusqu’à restauration. Le détail historique conserve les motifs et la pagination.
- Suppression réversible des devis brouillons ou finalisés depuis leur liste et leur consultation. Les PDF, numéros, versions, factures liées et engagements transmis sont conservés. Un document en cours de finalisation ne peut pas être supprimé. Le contrôle de version et les droits existants s’appliquent.

## Vérifications

- TypeScript et compilation complète.
- Tests de corbeille, versions, engagements et plafonds de bons de commande ; restauration sans changement des archives ni des montants consommés.
- Parcours navigateur : navigation par ligne et au clavier, isolation des boutons, origine d’accord, sélection des versions, suppression/restauration, refus de sauvegarde sans coche, contraste sombre et mobile.
- Parcours PDF réel : devis finalisé, accord, engagement joint, conversion en facture, PDF, relevé et préparation Outlook avec copie cachée, sans envoi de mail.

Migration : rejouer `billingTrashSchema` pour actualiser le déclencheur `billing_trash_guard`. Aucune donnée métier n’est réécrite. Le Worker et les ressources statiques utilisent la version `document-actions-20261025` ; le moteur PDF ne change pas.
