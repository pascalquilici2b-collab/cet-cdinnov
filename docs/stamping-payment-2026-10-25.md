# Document de paiement — 25 octobre 2026

## Interface
- « Document de paiement » remplace le nom du document de répartition dans le parcours d’import et de contrôle.
- Aperçu à côté des répartitions : PDF local avec pages et zoom ; Excel/CSV avec feuilles, cellules fusionnées, valeurs enregistrées et pagination. Un clic sur la référence d’une imputation ouvre la cellule ou page source. Les corrections en cours restent présentes quand l’aperçu est ouvert ou fermé.
- Icônes PDF rouges et XLS/CSV vertes. Bloc salarié violet, distinct des projets. Libellé « Salaire brut chargé identifié ».
- Corbeille par pièce et pour le document de paiement, chacune avec une confirmation précisant sa portée.

## Suppression et confidentialité
- Les pièces et documents de paiement restent accessibles uniquement au propriétaire du lot, selon les droits existants. Contrôle de l’empreinte avant téléchargement. Aucun visualiseur externe.
- La suppression d’une pièce retire son original et ses résultats, libère son rapprochement et conserve les autres pièces. Une suppression interrompue peut être relancée.
- La suppression du document de paiement conserve les bulletins/factures joints, mais réinitialise toutes les répartitions, validations et aperçus dérivés. Les anciennes tâches en file sont invalidées par leur version.
- Une analyse active empêche la suppression de la pièce concernée ou du document de paiement. Comparaison des versions pour empêcher les suppressions depuis une vue périmée.
- Les suppressions individuelles sont tracées dans l’historique privé du lot. Aucun changement de schéma ou de configuration d’hébergement.

## Vérifications
- TypeScript et construction de l’application.
- Six scénarios API dédiés : accès au source, empreinte, isolation, concurrence, suppression ciblée, remise à zéro atomique, invalidation des tâches précédentes, reprise de suppression et remplacement.
- Huit scénarios de régression avec moteur PDF réel : import, rapprochement, validation, tamponnage, export et suppression complète d’un lot.
- Parcours navigateur : Excel, PDF, CSV avec texte HTML neutralisé, conservation des modifications, annulation et confirmation des suppressions, mode nuit et mobile.
- Parcours existants de navigation par salarié/mois et correction puis tamponnage vérifiés.

## Limites
L’aperçu Excel présente les valeurs et cellules du classeur, sans reproduire sa mise en page d’impression ni recalculer ses formules. Les corrections des montants se font dans la répartition reconnue ; l’original reste inchangé. La suppression du document de paiement nécessite ensuite un nouvel import et une nouvelle validation des répartitions.
