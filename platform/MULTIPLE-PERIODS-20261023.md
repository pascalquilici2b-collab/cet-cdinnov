# Plusieurs semestres sur un document

Le champ « Période concernée » des devis et factures propose huit cases à cocher dans un menu compact. Les périodes non consécutives sont autorisées, triées de S1 à S8 et affichées explicitement, par exemple « Semestres 1, 3 et 8 ». Décocher toutes les cases retire la mention.

La sélection est conservée à l’enregistrement, à la duplication, à la conversion devis → facture et à la rectification. L’aperçu A4, le PDF définitif et le message Outlook reprennent la liste complète.

Le champ facultatif `details.periods` complète le champ historique `details.period`. Les anciens documents sans tableau conservent exactement leur structure et leur semestre. Aucun document ni PDF archivé n’est réécrit ; aucune migration de données n’est nécessaire.

Contrôles : TypeScript ; API de sauvegarde et conversion ; normalisation et liste vide ; rendu Python des devis/factures avec semestres non consécutifs ; sélection et désélection dans le navigateur, modes clair/sombre/mobile ; finalisation réelle du PDF et pièce jointe Outlook sur données fictives. Le moteur Render a passé ses contrôles de conversion Factur-X/PDF-A à la publication du commit `d451461`.

Publication : moteur PDF d’abord, Worker ensuite, puis interface. Preuves et sauvegardes privées : `.private/multiple-periods-20261023/release/`. Pas de changement d’offre ni de configuration d’hébergement.
