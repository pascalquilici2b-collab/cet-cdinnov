# Tamponnage : identification, contrôle et aperçu

## Corrections

- Le champ d'identité ne reconnaît plus les en-têtes « Part salarié / Part employeur » comme un nom. Le rapprochement reste exact sur salarié et mois ; les montants ambigus ou différents restent bloquants.
- Les six originaux du lot de test utilisateur sont identifiés localement sans Qwen (environ 20–30 ms d'extraction native par bulletin). Aucune modification des originaux ni des pièces déjà validées.
- Rapprochement manuel accessible dès « À analyser », confirmation de l'identité et du montant obligatoire, note de rapprochement préremplie et éditable. Erreurs visibles dans la fenêtre ; saisie conservée après refus ; coche verte après acceptation de la demande, puis état de traitement visible.
- États avec icônes, « Prêt » en vert, titres de sections avec icônes. La section de preuves techniques est retirée de l'interface ; les contrôles et journaux internes sont conservés.
- Aperçu PDF multipage par défilement, un chargement de fichier, rendu local des pages visibles. Le déplacement du tampon reste disponible sur l'original et doit être recalculé avant validation.
- Montserrat intégrée : en-tête gras 5,60 pt, projets 5 pt, montants en €. Phrase Maritime exacte demandée par l'utilisateur. Polices distribuées avec licence OFL.
- Recherche d'emplacement libre à plusieurs largeurs sans descendre sous 5 pt. Annexe prioritaire si autorisée. À défaut, superposition transparente sur la zone la moins occupée, signalée dans l'aperçu et soumise à validation. Débordement interdit, texte source et pixels extérieurs au tampon contrôlés.

## Vérifications

- 73 tests Python : rapprochement, coût employeur mensuel, montants, police réellement incorporée, tailles, euro, collisions, superposition explicite, annexe et conservation de l'original.
- 8 scénarios Worker/D1/R2/file de traitement avec moteur PDF réel ; test supplémentaire de rapprochement manuel et recours Qwen.
- Interface testée en mode sombre et mobile : défilement de plusieurs pages, erreur dans la fenêtre, conservation de saisie, confirmation verte et état Prêt.
- Navigation du portail, droits, persistance des lots et déconnexion vérifiés.
- OCR natif Windows indisponible sur cette machine ; le test de construction Render exécute le contrôle OCR avec Tesseract dans le conteneur Linux.

## Publication

Moteur PDF Render, Worker et interface Pages. Sauvegarde privée avant publication et comparaison des données métier après. Aucune modification de forfait ni de ressources d'hébergement.

Les copies déjà validées/tamponnées conservent leur apparence. Le nouveau tampon s'applique à une nouvelle analyse ou au recalcul d'un aperçu non validé.
