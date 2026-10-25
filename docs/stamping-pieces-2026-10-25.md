# Tamponnage : pièces, progression et modèles — 25 octobre 2026

## Interface

- Aperçu dans une fenêtre au clic sur une pièce, y compris pendant son analyse. Le PDF est rendu localement, avec navigation entre les pages, sans solliciter le moteur documentaire.
- Progression du lot par nombre de pièces terminées, durée et étape courante. Les cas à vérifier restent clairement signalés.
- Projets et montants présentés dans deux colonnes adjacentes, une ligne par imputation. « Salaire brut chargé » remplace « Base » ; « Montant imputé » remplace « Imputé ». Suppression de « Reliquat » dans les pièces et du pied de lot avec la date d’expiration.
- Mise en page des tampons inspirée des quatre modèles fournis : titre centré, bordure bleue, un ou deux blocs, ou lignes séparées pour quatre/huit projets, sans total ajouté. Les programmes explicitement reconnus restent respectés.

## Traitement

- Lecture et préparation réunies dans un appel au service documentaire. Qwen intervient lorsque l’identité reste ambiguë ; une identification directe n’attend plus une réponse du modèle.
- Extraction réutilisable pour les corrections, signée côté serveur et liée au fichier original et à la version de l’algorithme. Toute extraction modifiée ou provenant d’un autre fichier est rejetée et refaite.
- Contrôles des montants, de l’identité, de la géométrie et de la conservation du texte et de l’apparence d’origine maintenus.
- Aucun changement d’hébergement. Le démarrage à froid du service Render gratuit reste une limite indépendante de cette optimisation.

## Validation avant publication

- TypeScript et compilation de l’application réussis.
- 35 tests Python du tamponnage et de son API réussis.
- 8 scénarios API, test de recours à Qwen/correction manuelle et deux parcours navigateur réussis.
- Vérification visuelle des tampons à 1, 2, 4 et 8 imputations, des colonnes, de l’aperçu sombre et mobile.
- Les lots réels de l’utilisateur ne sont pas modifiés par les tests. Les résultats déjà produits restent inchangés ; un nouveau calcul utilise le nouveau modèle.

## Ordre de déploiement

Publier le moteur Python compatible avec l’action `analyze` avant le Worker. Conserver les paramètres, les liaisons et les données existants. Contrôler ensuite les fichiers publics et un lot fictif temporaire de bout en bout.
