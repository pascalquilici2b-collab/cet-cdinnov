# Numéro dès la création et présentation des mentions

Cette livraison remplace le moment d'attribution décrit dans `billing-corrections-2026-10-22.md`.

- Un clic sur « Nouveau devis » ou « Nouvelle facture » crée le brouillon et réserve son numéro. Il est visible dans l'éditeur, la liste et le PDF de travail. La création depuis un devis accepté, la duplication et les versions révisées suivent le même parcours.
- Les brouillons existants obtiennent un numéro à leur ouverture ou à leur enregistrement dans l'interface. Aucun document existant n'est renuméroté par la migration.
- Devis : `AAAAMMJJ-001`, compteur quotidien. Factures : `F-AAAAMMJJ-001`, compteur continu indépendant. La date du numéro est celle de sa réservation ; le numéro ne change pas pendant l'édition. La facture conserve aussi la référence du devis accepté.
- La réservation est distincte de l'émission : elle ne produit aucun fichier définitif et ne bloque pas la modification du contenu. La finalisation réutilise le numéro réservé sans incrémenter une seconde fois le compteur. Les réservations sont conservées et ne sont jamais réutilisées ou supprimées.
- La date d'émission ne peut pas être future ; le contrôle de chronologie et les validations Factur-X restent actifs. Une réservation ne signifie pas qu'une facture est émise ni transmise.
- « Conditions de paiement » est directement accessible, au-dessus du sous-menu « Mentions de paiement ». Le titre PDF « Règlement et mentions » est retiré. Quatre hauteurs de ligne séparent le RIB des autres mentions ; les blocs longs passent sur la page suivante si nécessaire.
- AGIRIS : l'utilisateur retient le dépôt manuel si l'automatisation PC éteint nécessite un robot complexe. Le téléchargement du Factur-X définitif et l'accès AGIRIS sont conservés. Aucun robot, abonnement, identifiant AGIRIS ni envoi réel n'a été ajouté.

Vérifications : réservations concurrentes, reprise idempotente, édition du brouillon, recherche par numéro, conservation du numéro à l'émission, absence de double consommation et protection du registre. Tests du parcours navigateur et des PDF réels ; migration et Worker publiés en conservant les données et la configuration d'hébergement.

Le moteur PDF est publié au commit `2715832bd6d28977661ef85d38ba0d8981b929cd` (Render `dep-dbd8a9rl550s73b1dbtg`). Sauvegardes privées et preuves de publication : `platform/.private/drafts-20261022d/release/`.
