# Objets complets, régularisation et finalisation — 26 novembre 2026

Les objets des devis et factures sont inclus intégralement dans l'aperçu et le PDF. Le moteur Python était limité aux titres de devis ; le titre des factures est maintenant rendu aussi. Les objets du document et du marché occupent la largeur disponible et peuvent passer à la ligne ou sur une autre page.

Les anciens brouillons numérotés disposent d'une régularisation par sélection d'un devis du même client. Cette action conserve la référence du devis et prévoit son numéro avec le préfixe FAC, sans attestation de non-transmission. Un historique distinct et immuable conserve le rapprochement, le numéro et la série choisis. Les montants et les prestations ne sont pas copiés du devis. La réservation active du même document peut être conservée si elle correspond exactement ; les numéros retirés ou détenus par d'autres documents restent indisponibles. Les contrôles de dates, de concurrence et de compteur restent applicables, sans saut en avant du compteur. Les factures déjà finalisées et les règles ordinaires des nouvelles factures ne sont pas modifiées.

La finalisation affiche ses étapes, explique les délais et libère le chargement après succès ou échec. Une réponse interrompue déclenche une lecture du résultat avant de proposer une reprise. Les appels de rendu identiques sont réessayés plus longtemps lors d'une indisponibilité temporaire, avec une seule requête de réveil sur le service configuré et respect du délai Retry-After. Aucun appel d'émission métier n'est répété par ce mécanisme.

## Validation

- Revue indépendante du schéma, des réservations, des liens partagés et des appels au moteur PDF.
- Parcours navigateur local avec données fictives : finalisation ordinaire, préparation lente, erreur/reprise, réponse perdue après succès, régularisation et conservation de sa propre réservation jusqu'au PDF.
- Régularisation, collisions, numéros retirés et concurrence SQL ; régressions devis, révisions, engagements, budgets et factures partielles.
- Intégration réelle locale Worker/D1/R2 vers FastAPI/ReportLab : objets longs complets dans l'aperçu et le document final, reprise sans nouveau numéro.
- TypeScript et compilation ; contrôle du livrable neuf (771 fichiers et imports compilés), PDF/OCR et connexion avec session HttpOnly.
- Moteur Python : 44 tests et 52 sous-tests ; revue visuelle des objets longs.

## Diagnostic et publication

Les journaux de production ont montré des échecs temporaires 503 avant émission après environ 58,7 secondes. La connexion au service configuré et sa clé ont été vérifiées sans document métier. La cause exacte des anciens échecs n'est pas établie ; un démarrage lent du service reste compatible avec ces observations. Aucune facture client réelle n'a été finalisée pour les tests.

Le correctif Python a été publié séparément dans le commit 6fba91d et le déploiement Render dep-dc401beq1p3s73cgtmi0, confirmé Live. Appliquer les 5 instructions de préparation puis les 23 instructions d'activation de billing-invoice-regularization-schema.mjs avant de publier le Worker et le frontal compatibles. Conserver les sauvegardes privées des paramètres, du Worker et du schéma et comparer les empreintes des données métier avant/après. Les identifiants de la publication finale sont enregistrés dans le rapport privé de livraison.
