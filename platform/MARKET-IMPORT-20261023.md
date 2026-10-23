# Clients, devis, factures et import des marchés — 23 octobre 2026

## Livré

- Statuts sans pastille dans les listes, icônes et couleurs conservées. Le menu des factures propose Brouillon, Finalisé, À régler et Réglée. Le changement de règlement passe par le registre des paiements et conserve son historique.
- Logos importables sur les fiches clients (PNG, JPEG, WebP, 256 Ko). Le préremplissage des coordonnées conserve le logo personnalisé ou sélectionné. Identification explicite de la CCI du Var par son SIREN.
- Factures : colonne Libellé, présentation des références en FAC-… sans renuméroter les documents comptables.
- Devis : semestres 1 à 8, validité initiale de 3 mois, date de fin calculée sans champ redondant dans l’éditeur. Portraits des consultants et logos des programmes dans les sélecteurs.
- Marchés : bouton Importer vert avant Exporter ; ZIP ou pièces ajoutées progressivement ; classement par nature dans Pièces ; icônes PDF, XLS, DOC et images.
- Import puis lecture PDF, OCR, DOCX, XLSX, CSV et texte. Regroupement des lignes visuelles des PDF pour conserver les associations libellé/prix des BPU. Les originaux restent conservés, avec détection des doublons par empreinte.
- Le bouton Analyser des pièces appelle maintenant Qwen, à la place de l’ancienne recherche de plafonds par expression régulière. La lecture complète et enregistre les données reconnues dans la fiche : identité, démarrage, durée, maximum, tarifs, conditions, périodes, projets et commandes explicitement rattachés.
- Aucune règle importée n’est automatiquement marquée vérifiée. Les champs déjà renseignés sont conservés, les contradictions sont signalées et chaque tarif/condition conserve sa citation source. La reprise d’analyse conserve les passages terminés.
- Contraste, encarts et actions des pièces et résultats de lecture harmonisés en mode nuit et sur mobile.

## Vérifications

- TypeScript et construction du Worker et des modules React.
- Tests du carnet clients, rapprochement et conservation des logos ; registre des paiements ; parcours des statuts et Factur-X.
- Test navigateur de la facturation : logo importé et conservé après enrichissement, même identifiant client, validité et semestre 8, portraits, programmes, libellé et référence FAC.
- Tests IA : citations, montants et dates sourcés, conflits, autorisations, concurrence, quota, reprise et réponse tronquée.
- Tests de ZIP : chemins, taille décompressée, nombre de fichiers, formats ; tableaux PDF et fusion de projets/commandes.
- Parcours navigateur isolé avec le vrai Worker/D1 et une réponse Qwen simulée : ZIP PDF + Excel, ajout Word, remplissage sauvegardé, réimport sans doublon, conservation des ajustements manuels et relance par pièce. OCR réel d’une image de BPU synthétique, ressources locales. Captures jour/nuit/mobile dans le dossier privé de contrôle.
- Moteur PDF Render publié séparément au commit 8f758f2, état Live confirmé pour les huit semestres.

## Limites conservées

- 5 Mo par pièce ; 50 pièces et 50 Mo au total par marché. Les ZIP imbriqués, anciens formats DOC/XLS et autres formats non pris en charge sont signalés.
- Qwen reste soumis au budget quotidien déjà configuré. Les pièces et passages terminés sont conservés en cas d’arrêt ou de quota atteint.
- Les scans illisibles et clauses ambiguës nécessitent une vérification. Un bon sans projet identifiable est conservé dans les conditions de commande pour rattachement manuel.
- Le modèle Qwen existant et son activation en production sont vérifiés. Le nouveau parcours est testé de bout en bout en base isolée avec réponse modèle simulée ; les marchés réels ne sont pas réécrits pour les besoins des tests.
- Aucun changement de forfait, de région ou de ressources d’hébergement. Aucune migration de schéma nécessaire.
