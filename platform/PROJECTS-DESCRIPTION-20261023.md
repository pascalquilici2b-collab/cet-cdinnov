# Documents et projets — 23 octobre 2026

## Changements

- Destinataire des devis/factures : les SIREN, SIRET, TVA, code pays ISO et adresses de routage électronique sont masqués dans le PDF et l’aperçu HTML. Les données client et Factur-X restent intactes.
- Description de mission facultative, repliée par défaut dans Prestations, placée avant le tableau PDF et modifiable dans l’aperçu. Champ facultatif dans les deux schémas TypeScript/Python ; les anciens documents conservent leur forme de sérialisation et leur empreinte.
- Flèches monter/descendre sur chaque prestation. Les identifiants, tarifs et quantités sont conservés ; l’ordre est enregistré et repris par la conversion devis → facture.
- Marchés : compteur renommé « Bons de commande reçus ».
- Projets : logo PNG/JPEG/WebP, redimensionné dans le navigateur ; rattachement à plusieurs marchés et clients. Les clients contractants sont aussi affichés automatiquement.
- Une fiche projet reste stockée dans son marché d’origine. `marketIds` et `clientIds` portent les rattachements supplémentaires, `logoData` le logo. Aucune migration SQL ni duplication de projet. Le marché d’origine reste conservé pour son historique et ses commandes.
- Les sélecteurs devis/facture proposent les projets liés au marché choisi. Un changement de marché conserve le projet si le nouveau marché lui est lié ; les commandes sont toujours propres à leur marché. Sur un marché supplémentaire sans commande enregistrée, la référence libre de commande reste disponible.
- Les anciennes fiches marché sauvegardées sans connaître les nouveaux champs conservent logos et rattachements. Contrôle de version et droits administrateur conservés.

## Vérifications

- TypeScript : `node node_modules/typescript/bin/tsc -p platform/tsconfig.json`.
- API/projets/commandes/devis : `node platform/modules-documents-test.mjs`.
- Parcours réel local, données fictives : `node platform/projects-description-test.mjs` (rattachements, versions concurrentes, droits, logos, ancien onglet, isolation des BC, choix du marché, description, réorganisation, conversion après accord ; captures clair/sombre/mobile).
- Catalogue BPU/DQE : `node platform/billing-bpu-ui-test.mjs`.
- Python : `tests/test_document_pdf.py`, `tests/test_modules_documents.py`, `tests/test_document_description.py` (rendu A4, pagination, zones éditables, identifiants masqués et ancienne sérialisation).
- Intégration Worker → Python → archivage privé : `platform/.private/projects-description-native-pdf.mjs` ; description conservée dans le PDF définitif.
- Sauvegarde privée avant publication : `platform/.private/projects-description-20261023/release/`. État initial : 4 documents natifs, aucune émission native, 1 217 factures importées. Aucun document réel créé par les essais.

## Publication et limites

Tag des ressources : `projects-description-20261023`. Publication par GitHub Pages, Worker Cloudflare `cet-data` et service Render `cdinnov-facturx`. Vérifications de production et captures dans le dossier privé de la version.

Les PDF importés ou déjà émis ne sont pas réécrits : ce sont des fichiers conservés tels quels. Les changements de présentation concernent les documents générés avec le moteur actualisé.
