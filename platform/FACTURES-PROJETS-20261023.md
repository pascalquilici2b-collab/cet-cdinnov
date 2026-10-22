# Factures, catalogue et projets — 23 octobre 2026

## Livraison

- Factures historiques et documents natifs dans une liste unique, recherche et filtres conservés. Les imports utilisent toujours leur fiche, PDF, conversion Factur-X et identifiant d’origine ; aucune duplication en base. Les 14 factures de septembre/octobre 2026 y figurent.
- Actions PDF rouge, Factur-X bleu, crayon et corbeille rouge. L’ancien onglet redondant des imports est retiré ; l’import PDF et le convertisseur restent accessibles.
- Statut Brouillon / Finalisé dans la barre d’actions, suppression du panneau « Finaliser le document ». Enregistrement avant finalisation, reprise idempotente si la génération échoue. Sur un devis finalisé, « Facturer » demande les éléments de l’accord réel du client si cet accord n’est pas encore enregistré.
- PDF et Factur-X distincts dans les actions. Le PDF définitif de facture reste le PDF hybride produit par le moteur existant. Aucun dépôt automatique AGIRIS ; l’utilisateur dépose le Factur-X téléchargé.
- Contraste du dialogue d’édition de l’aperçu corrigé dans les deux thèmes. A4 et zones éditables vérifiés à plusieurs zooms.
- Champ « Référence catalogue » retiré de la fiche prestation. Les anciennes valeurs internes sont conservées pour compatibilité.
- Projets : dates de début et de fin éditables dans Projets et Marchés et contrats. État calculé inclusivement entre ces dates, avant/après inactif, archivage inactif. Sans dates complètes : pastille neutre « Dates à renseigner ».
- Marchés : client + numéro/intitulé et pastille à droite dans les menus. Validité calculée sur le démarrage/durée initiale et les périodes explicitement validées ; aucune reconduction hypothétique.
- Pastilles projets dans les sélecteurs des devis/factures, références, notes de frais, filtre de liste et déplacements. Les déplacements conservent leurs libellés historiques ; une correspondance ambiguë ou absente reste neutre.
- Correction SQL : les devis gardent leur réservation lorsque leur date est modifiée avant finalisation. Les contraintes chronologiques des factures sont conservées.

## Vérifications

Compilation TypeScript et build. Tests de liste fusionnée/pagination/filtres, workflow local complet de finalisation/reprise/accord/facturation/téléchargements, numérotation, 12 tests d’émission, API des projets (dates invalides, conflit, compatibilité des anciens clients), calcul des bornes et périodes, interface marchés/BPU, édition A4 réelle, contraste, frais et menu des déplacements.

Le test du workflow utilise un service de génération synthétique ; il valide l’orchestration, pas la conformité du fichier synthétique. Le moteur réel Factur-X et sa validation restent inchangés. Le test A4 utilise le vrai moteur PDF local.

## Publication et reprise

Sauvegardes privées et scripts dans `platform/.private/unified-20261023a/release/` et `platform/.private/unified-release.mjs`. Deux triggers D1 remplacés ; sauvegarde des sources Worker, paramètres et données avant modification. Vérifier la préservation des données avec la commande `node platform/.private/unified-release.mjs verify-data`. Les paramètres d’hébergement et liaisons restent inchangés.

À compléter côté métier : dates des projets/marchés existants lorsque manquantes ; PDF original de la facture **26 10 058**, Office des transports de la Corse, **09/10/2026**. Son enregistrement reste visible, avec l’action pour joindre le PDF. Aucun document réel n’est émis ou supprimé pendant la recette.
