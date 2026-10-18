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
Télécharger la configuration et les modules du Worker cet-data réellement actifs et conserver tous les bindings et secrets. Le 18 octobre, le service actif est un bundle entry.mjs incluant aussi SMARTSHEET. Ne pas le remplacer par le seul service Budgets/Agenda ni par cloudflare-worker.js.

1. Sauvegarder les modules actifs et la configuration dans un répertoire privé ; vérifier la base D1 associée.
2. Appliquer marches/schema.sql, de manière additive et idempotente.
3. Pour une première installation sur le bundle du 17 octobre : exécuter integrate-live-worker.mjs avec le fichier entry.mjs téléchargé et un dossier de sortie privé. Cet outil exige les ancres exactes et vérifie la conservation du code existant hors un import et deux ajouts de routage. Tester combined-test.mjs via MARCHES_TEST_WORKER, puis publier entry.mjs et markets-service.mjs ensemble. Pour une mise à jour ultérieure, repartir des modules actifs et mettre à jour uniquement markets-service.mjs après comparaison. server/budget-service-source.mjs reste le banc de développement, pas un remplacement complet du Worker de production.
4. Vérifier les refus anonymes et les routes historiques.
5. Importer le cas CCIC dans les tables privées. Conserver les règles en préparation.
6. Publier index.html et les ressources marches/vendor depuis le dernier état du dépôt, après contrôle des modifications concurrentes.
7. Vérifier la publication du portail et la navigation. Les parcours authentifiés peuvent être testés dans une base locale isolée ; ne jamais fabriquer une session de production pour ces vérifications.

Le moteur d’engagements, les BC, les alertes de consommation, l’émission et le paiement des factures ne font pas partie de cette tranche. Le logiciel ne présente aucun « disponible » avant reprise et rapprochement de ces données.

Références techniques : [limites D1](https://developers.cloudflare.com/d1/platform/limits/) et [SQL D1](https://developers.cloudflare.com/d1/sql-api/sql-statements/).

## Contrôle de la publication du 18 octobre 2026
Le serveur est publié, avec les dix bindings existants conservés. Le pilote CCIC et ses quatre pièces sont enregistrés dans D1 ; chaque pièce a été relue et son SHA-256 comparé à l’original. Les 35 contrôles ont été exécutés contre le bundle réellement destiné à la publication, avec Miniflare 4.20260730.0 et MARCHES_TEST_COMPATIBILITY_DATE=2026-06-09. Définir MARCHES_BUILD_PACKAGE vers ce runtime et MARCHES_TEST_WORKER vers combined-test.mjs pour reproduire ce contrôle. Les vérifications publiques confirment les refus anonymes et les en-têtes CORS des routes Marchés, Budgets, Agenda et SMARTSHEET. Les identifiants de déploiement et preuves détaillées sont conservés hors du dépôt public.


## Assistant de paramétrage des marchés

L’onglet initial propose : ajouter les pièces, analyser le dossier, puis appliquer et ajuster les propositions. L’identification initiale est facultative. Les rubriques de saisie restent utilisables sans IA. Chaque point à confirmer comporte un bouton **Valider ce point**, avec une décision obligatoire, une sauvegarde immédiate et une possibilité de réouverture.

L’analyse utilise `@cf/mistralai/mistral-small-3.1-24b-instruct` via le binding Workers AI `MARKETS_AI`. Modèle ouvert Apache 2.0 ; aucun appel à Claude ou OpenAI et aucune clé de fournisseur dans le navigateur. Le texte sélectionné est envoyé à Cloudflare. Les fichiers restent dans le stockage privé déjà utilisé par le module. PDF.js, Tesseract et fflate lisent localement PDF, scans, images, DOCX et XLSX ; les ressources OCR françaises et anglaises sont servies depuis le portail. Les images et objets Office non lus sont signalés, de même que les lectures incertaines. Un résultat de formule Excel absent n’est pas remplacé par une valeur inventée.

L’analyse découpe chaque texte intégralement, conserve les passages terminés et reprend après interruption. Une réponse trop longue déclenche un découpage supplémentaire. Chaque proposition doit fournir une citation présente dans la pièce ; les montants sont également rapprochés des chiffres de cette citation. Un total estimatif ne constitue pas un plafond. Les résultats sont des propositions : les erreurs OCR, associations de lignes et interprétations restent à contrôler dans les originaux. La vérification automatique de la citation ne constitue pas une validation contractuelle.

Le budget du module est commun à ses administrateurs : 8 000 neurones réservés par jour UTC, avec restitution de la réserve inutilisée uniquement après un décompte retourné par le fournisseur. Les erreurs conservent leur réserve. Cloudflare propose une allocation gratuite de 10 000 neurones/jour pour le compte, partagée avec les autres usages ; ce garde-fou du module n’est pas une garantie de gratuité illimitée du compte. Il ne change pas le forfait Cloudflare. Une limite ou une erreur suspend l’analyse, jamais la saisie manuelle.

Les règles proposées couvrent identité, tarifs et unités, plafonds, périodes, ainsi que paiement, commandes, échéances, révision, frais, TVA, justificatifs et relevés. Les conditions sont à ce stade des règles textuelles ajustables, pas encore un moteur d’émission des factures. L’application des résultats préserve par défaut les valeurs saisies ; le remplacement d’une rubrique doit être explicite. Une analyse devenue périmée après modification de la fiche ou des pièces ne peut pas être appliquée silencieusement.

Publication de cette extension : appliquer aussi `marches/ai-schema.sql` (additif), ajouter le binding AI et transmettre `env` à l’appel existant de `handleMarkets` dans le bundle actif. Préserver les autres modules et bindings. `node marches/ai-test.mjs` vérifie les droits, sources, montants, concurrence, reprise, quota et conservation des saisies ; les appels réels au modèle et les scans CCIC se testent dans l’aperçu privé. `node marches/build-reader.mjs` construit le lecteur et copie ses ressources/licences avant `node marches/install.mjs`.

Sources : [modèle Mistral](https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503), [modèle sur Cloudflare](https://developers.cloudflare.com/workers-ai/models/mistral-small-3.1-24b-instruct/), [tarifs et allocation](https://developers.cloudflare.com/workers-ai/platform/pricing/), [traitement des données](https://developers.cloudflare.com/workers-ai/platform/data-usage/).
