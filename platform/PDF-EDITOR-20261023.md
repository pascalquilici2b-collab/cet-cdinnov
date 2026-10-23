# Édition de l’aperçu PDF — 23 octobre 2026

## Fonctionnement

Barre compacte au-dessus de l’aperçu A4 des devis et factures en brouillon :

- Encart texte libre : clic ou tracé sur la page, texte, taille et couleur.
- Surlignage jaune, bleu ou vert par tracé d’un rectangle translucide.
- Déplacement à la souris ou au clavier, redimensionnement par la poignée.
- Liste des ajouts par page, modification, suppression, annuler et rétablir.
- Les champs habituels restent modifiables au crayon dans l’aperçu.

Les ajouts sont enregistrés avec le document, repris dans la conversion devis → facture et dessinés par le moteur PDF utilisé pour l’aperçu et l’archive. Les montants et données structurées restent inchangés. Les documents déjà émis conservent leur archive et n’affichent pas ces outils.

## Données et limites

Champ facultatif `annotations` dans le brouillon existant, sans migration SQL. Les anciens documents conservent leur forme sérialisée. Positions et dimensions entières de 0 à 10000, relatives à une page A4, indépendantes du zoom. Limites : 80 ajouts, 2000 caractères par texte, 20000 au total ; police embarquée DejaVu Sans, 8 à 24 points.

Les ajouts restent à leur position sur la page quand le contenu principal change. Une page supprimée ou un texte dépassant son encart bloque le rendu avec un message précis ; la liste des ajouts permet de déplacer ou retirer l’élément. Aucun texte n’est tronqué silencieusement. Aucun accès réseau ni contenu HTML n’est accepté dans les ajouts.

## Vérification

- `node platform/billing-annotations-test.mjs` : navigateur réel, Worker/D1 temporaire, moteur Python réel ; texte, surlignage, édition, annulation/rétablissement, déplacement et redimensionnement, zoom, sauvegarde/rechargement, clair/sombre/mobile, rejet des entrées invalides, archive avec positions identiques, plusieurs pages, récupération d’un encart orphelin, conversion devis → facture.
- `node platform/billing-pdf-test.mjs` : contrôle des accès et versions, isolation des erreurs amont, message de page supprimée, aucune mutation du document.
- Python : `test_document_annotations.py`, `test_document_pdf.py`, `test_billing_issuance.py`, `test_pdf_then_facturx.py` ; 25 tests réussis, 26 sous-tests, un test du moteur natif complet réservé à son environnement.
- TypeScript et build réussis. Captures et PDF fictifs dans `.private/pdf-editor-20261023/` (non publiés).
- Le contrôle Docker `deployment.verify_runtime` vérifie également le texte et le surlignage via la véritable conversion PDF/A-3b et Factur-X avant mise en service.

## Publication

Version de cache : `pdf-editor-20261023`. Interface GitHub Pages, Worker existant, moteur Render existant. Aucun changement d’offre, de ressources ni de configuration d’hébergement. Sauvegarde et preuves privées dans `.private/pdf-editor-20261023/release/` ; scripts `pdf-editor-release.mjs`, `verify-pdf-editor-release.mjs`, `verify-pdf-editor-pdf.mjs` dans `.private/`.

Contrôler après déploiement les ressources publiques, un PDF fictif de chaque type via le Worker authentifié et la conservation des factures/devis existants. Aucune facture réelle n’est créée ou finalisée pour ces vérifications.
