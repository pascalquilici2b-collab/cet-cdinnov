# Marchés et contrats — premier socle
Cible : https://app.cdinnov.eu. Implémentation du 18 octobre 2026.

## Périmètre livré
- Entrée « Marchés et contrats » dans le portail, accessible aux administrateurs déjà habilités ; même contrôle côté serveur.
- Création et sauvegarde de fiches avec client, référence, type, mode de rémunération, notification et reconduction.
- Tarifs HT par prestation, profil, lieu/modalité, unité et dates de validité ; montants en centimes.
- Plafonds HT/TTC par contrat, période annuelle ou période spécifique ; base de consommation explicite.
- Périodes définies par leurs dates effectives, leur source et leur justification ; aucun renouvellement déduit automatiquement.
- Import de PDF, DOCX, XLSX, PNG, JPG, TXT et CSV : originaux conservés, contrôle de format, SHA-256, détection des doublons.
- Lecture locale des PDF texte et propositions de plafonds avec extrait. Les PDF scannés, Word et Excel sont rattachés pour lecture/saisie manuelle. Aucun OCR ni extraction générale des tarifs n’est annoncé.
- Pièce et page/article associés aux règles ; contrôle humain explicite avant validation. Points contradictoires et décisions conservés.
- Sauvegarde par version conditionnelle, historique atomique, rechargement et export de la fiche.
- Contrôle des dates impossibles, chevauchements de périodes validées, tarifs ambigus, pièces étrangères au marché et montants invalides.

## Données
Tables dédiées dans la D1 existante BUDGETS_DB : markets, market_versions, market_documents, market_document_chunks. Les pièces sont privées, découpées en blocs de 128 Kio puis stockées en base64 pour respecter la taille maximale d’une ligne. Maximum 5 Mio par pièce, 50 pièces et 50 Mio par marché ; quotas vérifiés aussi par déclencheur SQL, y compris lors d’envois concurrents.

L’import du fichier et de tous ses blocs constitue une transaction. Le téléchargement vérifie longueur et empreinte. Le texte extrait est une aide de lecture, jamais une règle validée. Les PDF sont traités localement par PDF.js ; aucune transmission à une IA ou à un service tiers.

Le module utilise la session signée existante des Budgets. Les routes /budgets/markets sont vérifiées avant toute lecture ou écriture. Les autres routes Budgets/Agenda restent déléguées à leurs handlers existants.

## Cas CCIC
Le jeu de données et les pièces réelles sont préparés dans un dossier privé extérieur au dépôt. Ils ne sont pas embarqués dans le HTML, les tests publics ou les ressources statiques. L’initialisation se fait après authentification ou via un outil de migration privé.

Le cas pilote reste « En préparation » : tarifs et plafond proposés avec sources ; dates de réception et de période non inventées ; contradiction de reconduction bloquante ; conditions de paiement et alias de référence signalés. Aucune facture ni commande n’est créée par cette initialisation.

## Vérification
- node test.mjs : tests métier et API dans le runtime Cloudflare Miniflare, avec comptes et base fictifs.
- node browser-test.mjs : parcours navigateur sur aperçu isolé, avec MARCHES_PILOT pointant vers le jeu privé et MARCHES_QA vers un dossier privé de résultats.
- node install.mjs : intégration idempotente de l’interface et copie de PDF.js.
- node preview.mjs : aperçu sur 127.0.0.1:5196 ; mémoire isolée, réinitialisée au redémarrage. L’auto-connexion appartient au seul serveur d’aperçu et n’est jamais écrite dans index.html.

Définir MARCHES_BUILD_PACKAGE si les dépendances de construction sont installées ailleurs. Les chemins de repli actuellement configurés correspondent au poste de travail utilisé. Une installation locale des dépendances de package.json peut être choisie via cette variable.

## Publication
Avant publication : connexion Cloudflare requise ; télécharger la configuration et les modules du Worker cet-data réellement actifs, conserver tous les bindings et secrets et comparer le service Budgets/Agenda à la référence utilisée. Ne pas publier le cloudflare-worker.js historique isolément.

1. Sauvegarder les modules actifs et la configuration dans un répertoire privé ; vérifier la base D1 associée.
2. Appliquer marches/schema.sql, de manière additive et idempotente.
3. Compiler server/budget-service-source.mjs en ESM avec esbuild et remplacer uniquement le module de service correspondant dans le Worker combiné, en préservant ses autres modules et paramètres.
4. Vérifier les refus anonymes et les routes historiques.
5. Importer le cas CCIC dans les tables privées. Conserver les règles en préparation.
6. Publier index.html et les ressources marches/vendor depuis le dernier état du dépôt, après contrôle des modifications concurrentes.
7. Vérifier la publication du portail et la navigation authentifiée.

Le moteur d’engagements, les BC, les alertes de consommation, l’émission et le paiement des factures ne font pas partie de cette tranche. Le logiciel ne présente aucun « disponible » avant reprise et rapprochement de ces données.

Références techniques : [limites D1](https://developers.cloudflare.com/d1/platform/limits/) et [SQL D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/).
