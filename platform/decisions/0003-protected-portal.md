# ADR-0003 : portail et fichiers authentifiés, source primaire D1

Statut : accepté et mis en œuvre le 19 octobre 2026.

## Contexte

L’ancien navigateur chargeait le document KV complet, vérifiait le mot de passe localement et sauvegardait sans version. Les mêmes anciennes routes exposaient les fichiers. La demande est de conserver comptes, données et fonctions, sans nouveau service payant.

## Décision

Déplacer le document à l’identique dans `app_portal_workspace`, avec version comparée atomiquement. D1 devient la source primaire des comptes et données du portail. L’adaptateur de compatibilité donne aux services existants cette même source ; le KV reste une archive, jamais un repli implicite.

La route `/api/v1/portal` filtre les lectures et valide les écritures selon l’identité. Les mots de passe restent inchangés ; leurs vérificateurs ne figurent plus dans les réponses usuelles. Créations et réinitialisations utilisent des invitations temporaires à usage unique. Une déconnexion inscrit l’empreinte du jeton dans `app_session_revocations` jusqu’à expiration.

Les accès R2 vérifient références accessibles et propriétaire. Une référence ajoutée ne peut pas accorder à elle seule l’accès à un fichier deviné. Les uploads n’écrasent pas une clé existante et les fichiers encore référencés ne sont pas supprimés. Le navigateur télécharge avec son en-tête d’autorisation et génère les aperçus temporaires localement.

## Options et compromis

- Garder KV comme source active aurait maintenu une cohérence éventuelle et les écrasements de documents concurrents.
- Normaliser tous les domaines simultanément aurait mêlé cette bascule de droits à une réécriture métier trop large.
- Une source D1 versionnée permet la fermeture des anciens accès dès maintenant, avec les services et comptes existants. Les écritures par entité restent à réaliser. La taille maximale acceptée est de 1,5 Mo ; les grosses pièces sont déposées dans R2.

Les sauvegardes complètes restent réservées aux administrateurs. La restauration métier conserve les accès actuels ; une restauration d’exploitation peut rétablir les comptes depuis le point de reprise privé, après vérification. Les liens directs vers les anciens fichiers nécessitent désormais de passer par le portail connecté.

## Migration et reprise

Sauvegarder code, configuration et données. Ajouter les deux tables. Fermer l’ancien écrivain, laisser passer la fenêtre de propagation KV, copier la dernière source, vérifier les octets et les comptes, puis retirer le point de migration temporaire. Ce point utilise un secret aléatoire de livraison, reste privé et n’existe pas dans le Worker final. Publier le frontend compatible et vérifier les fichiers servis.

Ne jamais revenir au Worker public ni recopier un ancien KV sur les nouvelles saisies. En cas de problème, conserver le contrôle d’accès et la source D1 ; corriger le frontend ou restaurer une copie vérifiée dans un environnement isolé avant toute reprise.

## Validation

Tests du Worker complet, droits direction/salarié/comptabilité, conflits, références de fichiers forgées, invitations et révocations ; navigateur avec véritable PBKDF2/HMAC, gestion des comptes et fichiers. Répétition privée sur copie des données réelles pour chaque compte. Aucun abonnement ajouté, aucun changement des secrets ou mots de passe existants.
