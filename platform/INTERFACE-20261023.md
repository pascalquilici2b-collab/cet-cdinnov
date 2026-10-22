# Facturation et marchés — 23 octobre 2026

## Changements

- Statut du document : menu Radix suivant le modèle DropdownMenu de shadcn/ui ; confirmation intégrée à l’app. Les champs bloquants sont affichés sans perdre les modifications. La sauvegarde précède la finalisation ; la reprise conserve le numéro réservé.
- Brouillons : suppression depuis la liste ou l’éditeur, confirmation, filtre Corbeille et restauration. Le document, ses versions et son numéro sont conservés. Les documents engagés dans une émission ne peuvent pas être supprimés ainsi.
- Icônes : feuille avec crayon pour Brouillon, billet pour Réglée, crayon et corbeille rouge dans les actions. Suppression du pictogramme bleu à gauche des lignes de documents.
- Activité : indicateurs compacts verts ou gris, avec icône et libellé, dans les sélecteurs de projets, les marchés, les notes de frais et l’agenda. Les dates manquantes restent signalées plutôt que considérées comme actives.
- Factures importées : contraste du dépôt PDF et du sélecteur de fichier corrigé en mode nuit.
- Marchés : client avec logo, recherche et filtre client, validité, devis envoyés et plafond dans la liste. La fiche s’ouvre sur son résumé. Rubriques principales visibles ; assistant, plafonds, points à confirmer et historique dans Plus. Aides spécifiques en infobulles, navigation et actions harmonisées, affichage mobile et mode nuit.
- Client EPCI Corse : nouvelle dénomination et logo fourni ; identité historique conservée. Anciennes dénominations reconnues par la correspondance client. Mise à jour en place de la fiche client, du répertoire partagé et du marché associé ; conservation des anciennes dénominations comme alias pour éviter leur réimport en doublon. Les factures historiques ne sont pas réécrites.

## Références de composants

Les composants utilisent les dépendances déjà présentes (`radix-ui`, `lucide-react`). Inspiration : [shadcn/ui DropdownMenu](https://ui.shadcn.com/docs/components/dropdown-menu), [ButtonGroup](https://ui.shadcn.com/docs/components/button-group), [21st.dev — Button group with icons](https://21st.dev/Codehagen/button-group-with-icons). Le MCP 21st répond au contrôle de quota, mais sa recherche retourne une erreur de catalogue ; les exemples publics ont servi de référence. Aucun forfait ni dépendance supplémentaire.

## Vérifications

- TypeScript, compilation, contrôle des diffs.
- `billing-trash-test.mjs` : droits, versions, masquage, recherche, protection de l’émission, restauration, absence de recyclage des numéros.
- `billing-workflow-ui-test.mjs` : finalisation, sauvegarde automatique, échec puis reprise, accord du devis, conversion et téléchargements PDF/Factur-X sur données fictives.
- `refinement-ui-test.mjs` : menu, erreurs, suppression/restauration, icônes, import PDF de nuit, marchés clair/nuit, filtres, rubriques, aides, mobile.
- `modules-interface-test.mjs` : projets, édition dans le PDF A4, notes de frais, agenda.
- `modules-markets-test.mjs` : dates, durée, commandes, frais et BPU.
- `billing-draft-number-test.mjs`, `billing-issuance-test.mjs` (12 tests), correspondance client ADEC/EPCI.

## Publication et reprise

Migration additive : `billingTrashSchema` (table de corbeille et protections). Appliquer avant le Worker. Aucun changement de forfait, région ou ressources. Sauvegardes et vérifications de publication privées dans `platform/.private/refinement-20261023b/release/` ; ne pas les publier.

Les tests n’émettent ni ne suppriment de facture réelle. Les seuls changements métier autorisés sont la dénomination/logo de l’EPCI Corse et le rattachement de son marché à cette même fiche.
