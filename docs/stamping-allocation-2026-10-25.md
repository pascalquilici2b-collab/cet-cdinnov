# Tamponnage et tableau de bord — 25 octobre 2026

## Comportement
- Date du tableau de bord sous forme de calendrier, heure de Paris et mise à jour au passage de minuit. Animation discrète, désactivée si les mouvements sont réduits.
- Assistance Qwen toujours demandée pour identifier les pièces. Plus de case de désactivation ; explication dans une infobulle. En cas de quota ou indisponibilité, la lecture déterministe et la vérification manuelle restent disponibles.
- Import Excel/CSV existant conservé. Reconnaissance automatique des attestations de paie avec cellules fusionnées, en-tête décalé et libellé « montant rendu compte » ou équivalent.
- PDF natifs et scannés lus page par page dans des processus bornés. Les cellules sont isolées avant OCR. Les montants sont associés au salarié, mois et projet de leur cellule, sans reprendre les mandats de paiement.
- Montants Excel repris au centime selon le format enregistré, sans recalculer les formules externes. Valeurs/formules absentes restent à corriger.
- Écran de répartition prérempli : recherche, salarié, mois, projets et montants éditables ; assiette en option repliée ; exclusion explicite et réversible d’une ligne avant confirmation.
- Corrections et exclusions tracées ; source conservée. Les dépassements, doublons et pages non reconnues empêchent la validation. Les fichiers originaux restent inchangés.
- Rapprochement du bulletin par nom complet et mois, en complément du matricule. Le modèle ne fournit aucun montant d’imputation.

## Vérification
- Cas de référence du tableau DR3 vérifié localement : quatre montants rendus compte, distincts du coût employeur et du mandat.
- Deux classeurs réels lus sans erreur d’import. Les anomalies restantes des PDF scannés sont présentées pour correction, pas corrigées par supposition.
- Tests synthétiques Python : montants prioritaires, arrondis d’affichage, cellules fusionnées, PDF paginé, modifications/exclusions, garde de l’assiette, rapprochement nom/mois et citations IA.
- Tests Worker : isolation des lots, concurrence, contrôle des corrections, conservation des sources et activation imposée de Qwen.
- Parcours navigateur : import, correction, dépassement refusé, aperçu, validation et PDF tamponné ; modes clair/sombre et mobile. Horloge testée au passage de minuit à Paris.

## Limites
Une lecture OCR imparfaite reste soumise à correction. Les pièces signées ne sont pas modifiées. Les tableaux atypiques conservent le parcours de correspondance manuelle. Aucun compte, tarif, ressource ni configuration d’hébergement n’est modifié. Aucune donnée personnelle des exemples n’est ajoutée au dépôt.
