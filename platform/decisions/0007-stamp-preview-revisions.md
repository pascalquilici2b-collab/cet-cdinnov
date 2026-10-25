# Révisions du tampon dans l’aperçu PDF

Le bouton « Modifier le tampon » affiche l’original et un calque PNG transparent produit par le même moteur ReportLab que le PDF final. Les poignées modifient les coordonnées en points PDF et une échelle proportionnelle (50 à 300 %), bornées par la page. Le bouton d’enregistrement régénère le PDF puis exige une nouvelle validation. Le téléchargement de l’original reste indépendant.

`POST /api/v1/stamping/batches/:batch/documents/:document/revise` utilise exclusivement le résultat contrôlé conservé côté serveur. Le navigateur ne fournit que la disposition, les corrections et les projets ajoutés. La lecture, la base et les preuves ne proviennent jamais de la requête. Le moteur `revise` n’appelle ni extraction, ni OCR, ni Qwen ; il conserve la lecture déjà obtenue et vérifie à nouveau la géométrie, les montants et la préservation de l’original.

La publication d’une révision utilise `If-Match` et une mise à jour conditionnelle sur la version et le statut. Chaque PDF candidat a une clé distincte. Un conflit conserve la version existante et élimine uniquement le candidat de la requête perdante. Les modifications d’une pièce prête ou tamponnée annulent sa validation précédente ; l’ancien SHA ne peut pas être approuvé à nouveau. Aucun schéma ni droit d’accès n’est modifié.

Les projets ajoutés sont marqués MANUAL dans les données privées et l’audit. Ils peuvent être ajoutés avant confirmation du document de paiement ou dans la fiche d’une pièce déjà rapprochée. Les doublons et dépassements du coût employeur restent bloqués. Les coordonnées de cellules restent conservées en base mais ne sont plus exposées dans les encarts de saisie.

L’import conserve les fichiers sélectionnés avant de réinitialiser le champ natif, traite les fichiers indépendamment, actualise le lot et efface les filtres qui masqueraient les nouvelles pièces. Les doublons et erreurs ont un retour explicite ; les pièces déjà tamponnées restent inchangées.

Vérifications : tests Python du rendu et des allocations ; tests Worker avec le vrai moteur Python ; tests navigateur du glisser/redimensionner, des corrections, de l’ajout de projet, du sélecteur natif de fichiers, des doublons, des filtres, du mode nuit et de la vue mobile. Des PDF fictifs ont été téléchargés et rendus pour contrôle visuel.
