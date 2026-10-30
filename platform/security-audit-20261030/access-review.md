# Revue des sessions et des droits — 30 octobre 2026

Périmètre : authentification, sessions, rôles, droits par application, accès directs aux objets, exports, révocation et mises à jour des comptes. Base examinée : `493f91b`, puis correctif local décrit ci-dessous. Revue du code actuel et des changements intervenus depuis l'audit du 28 octobre. Les documents de cet ancien audit sont conservés en l'état.

Les reproductions utilisent uniquement le Worker réel compilé depuis les sources, avec D1/R2 temporaires et des données fictives. Aucun compte, document, courriel ou paramètre d'hébergement réel n'a été modifié. Ce rapport ne vaut pas certification de sécurité exhaustive.

## Défaut confirmé et corrigé : empreinte de mot de passe dans les sessions

**Sévérité : moyenne (P2).** Prérequis : disposer d'une copie d'un jeton de session d'un utilisateur. Le défaut n'est pas accessible anonymement avec le seul point d'entrée public de connexion. Il peut toutefois persister dans une copie du jeton après déconnexion, révocation ou expiration.

Le champ lisible `fingerprint` du jeton contenait `SHA256(JSON([salt, iter, hash PBKDF2]))`. Avec les paramètres publics de dérivation du compte, cette valeur permettait de comparer des hypothèses de mot de passe hors ligne, sans requêtes de vérification soumises à la limitation de tentatives. La signature du jeton protégeait son intégrité, mais pas la confidentialité de son contenu. Le correctif des challenges publics du 28 octobre ne couvrait pas encore ce second emplacement.

Preuve synthétique : une session est créée puis déconnectée ; l'accès avec cette session renvoie bien `401`. Sa copie permet pourtant d'identifier l'unique bon mot de passe parmi trois candidats fictifs, sans aucun appel de vérification de connexion. Après correction, aucun candidat ne correspond à la valeur exposée.

| Mesure locale | Avant | Après |
|---|---:|---:|
| Session déconnectée refusée par l'API | Oui | Oui |
| Candidats fictifs testés hors ligne | 3 | 3 |
| Correspondances avec l'empreinte exposée | 1 | 0 |
| Appels de vérification de connexion | 0 | 0 |

Correctif dans `platform/identity.ts` : l'empreinte de session est désormais un HMAC avec le secret serveur existant, le domaine distinct `session-binding:`, l'identité du compte et l'empreinte du vérificateur. Ce domaine diffère de celui des challenges de connexion. Deux comptes possédant les mêmes identifiants cryptographiques fictifs ne reçoivent pas la même empreinte. La lecture du compte et de ses droits reste effectuée à chaque requête ; les changements de mot de passe et les révocations continuent d'invalider les sessions.

**Les anciens jetons sont refusés, sans mécanisme de compatibilité : une reconnexion sera nécessaire après publication.** Aucun changement de mot de passe, de droits, de données ou de configuration d'hébergement n'est effectué par ce correctif. Un nouveau secret n'est pas nécessaire.

Limite résiduelle : le correctif ne peut pas effacer une ancienne empreinte qui aurait déjà été copiée. En cas de soupçon étayé de capture d'anciens jetons, une rotation des mots de passe concernés empêcherait l'utilisation de cette ancienne valeur contre leur mot de passe actuel. La revue n'a pas constaté d'intrusion et ne prétend pas qu'une capture a eu lieu.

Preuves locales privées, sans jeton ni mot de passe :

- `platform/.private/security-audit-20261030/session-binding-before.json`
- `platform/.private/security-audit-20261030/session-binding-after.json`

## Contrôles d'accès vérifiés

Le nouveau test parcourt 20 routes de collections et d'objets, couvrant facturation, clients, engagements, PDF/relevé, projets, marchés, agenda, budgets, CDInnovSheets, tableau de bord et tamponnage. Il vérifie successivement l'absence de connexion, un accès autorisé, la révocation des applications avec le même jeton encore actif, puis la déconnexion. Les réponses attendues sont respectivement `401`, accès permis selon le périmètre, `403`, puis `401`.

Contrôles complémentaires reproduits :

- lectures commerciales et lots partagés autorisées selon les droits ; suppression du lot ou du déplacement d'un collègue refusée ;
- six chemins d'export/récupération de données réservés aux administrateurs ;
- autopromotion administrateur et modification de données salariales d'autrui refusées ; données salariales non autorisées masquées ;
- huit tentatives de mutation de routes protégées refusées après révocation avec le jeton existant ;
- origines étrangères rejetées, anciennes variantes de routes encodées fermées ;
- refus des anciens jetons même correctement signés avec le secret de test ; invalidation des sessions après changement du vérificateur de mot de passe.

Le partage des documents commerciaux, des budgets, des feuilles et de la lecture des lots entre utilisateurs autorisés correspond au fonctionnement demandé. Il n'est pas qualifié d'accès indu entre utilisateurs. Les écritures de lots et les données personnelles continuent d'avoir leurs contrôles propres.

La revue n'a pas reproduit d'accès anonyme ou d'accès conservé après révocation sur ces parcours. Cela ne prouve pas l'absence de toute faille dans toutes les routes.

Preuve synthétique : `platform/.private/security-audit-20261030/access-matrix.json`.

## Validation et maintenance des tests

- `node --test platform/security-audit-20261030/access-test.mjs` : 2 tests réussis, preuve corrigée et matrice de 20 routes.
- `node platform/identity-test.mjs` : 11 groupes réussis. Le test compile maintenant les sources actuelles au lieu de dépendre d'un ancien bundle de publication. Son ancienne attente d'acceptation des jetons à empreinte brute a été remplacée par leur refus explicite.
- `node platform/identity-browser-test.mjs` : réussi avec le véritable formulaire de connexion, PBKDF2 et preuve HMAC dans Edge local ; mot de passe incorrect, connexion, invitation/réinitialisation, rechargement, rôles, droits fichiers, déconnexion multi-onglets et réponse tardive de connexion. Le serveur est compilé depuis les sources actuelles ; les services externes sont isolés. Preuve privée : `platform/.private/security-audit-20261030/identity-browser/identity-browser-checks.json`.
- `node platform/security-access-test.mjs` : réussi ; challenges publics, paramètres fictifs, contrôles d'entrée, révocation, routes historiques et déconnexion.
- `node platform/security-access-regressions.mjs` : réussi ; 9 contrôles portail et 4 groupes de rôles/comptes, dont révocation immédiate, concurrence sur les changements de rôle, conservation d'un administrateur et préservation des données.
- `node node_modules/typescript/bin/tsc -p platform/tsconfig.json` : réussi.
- `git diff --check` sur les fichiers de cette correction : réussi.

L'ancien `platform/security-audit-20261028/access-peer-test.mjs` attend explicitement l'acceptation des jetons à empreinte brute. Il est conservé comme artefact historique et n'est pas compté parmi les tests actuels réussis : cette attente devient volontairement obsolète avec le correctif. Les parcours de sécurité correspondants sont testés par les suites courantes ci-dessus.

## Limites de la revue

Cette intervention ne modifie pas le stockage navigateur des jetons et ne migre pas vers des cookies HttpOnly. Elle n'examine pas les configurations d'hébergeur, les comptes Microsoft/Cloudflare/Render, ni un historique réel d'intrusion. Les échanges externes et pièces jointes relèvent d'une autre revue parallèle. Les scénarios de concurrence existants sont exécutés, mais aucune preuve formelle de toutes les courses possibles n'est revendiquée. Les vérifications sont locales ; l'activation du correctif et le contrôle après publication restent à valider par le responsable de l'intégration.

## Revue croisée du correctif de session Factur-X

Le correctif parallèle de `facturx-service/cdi_facturx/server_auth.py` a été relu sans modifier ce fichier : HMAC de compte incluant l'adresse, domaine distinct de la signature de session, version 2 obligatoire et aucun repli vers l'empreinte brute. Les changements de mot de passe, suppression du compte, expiration et rotation de clé continuent de refuser les anciennes sessions. Les 4 tests de `tests/test_server_auth_security.py` et la preuve `render-session-proof.py` ont aussi été exécutés indépendamment : réussis, oracle synthétique 1/3 avant et 0/3 après. Ce second cas suppose de connaître le sel et les itérations du compte ; leur exposition réelle côté service n'a pas été inspectée en production.

Le portail utilise le jeton Factur-X comme une valeur opaque. Le nom historique de stockage `cdi_facturx_session_v1` n'impose pas des claims version 1. Le test `facturx-session-ui-test.mjs` exécute les fonctions réelles du portail avec transport fictif : session v2 conservée et transmise, ancien jeton refusé par le serveur puis purgé, reconnexion possible, réponse tardive de connexion refusée après déconnexion. Ce test réussit sans modification de l'interface.

**Réserve préexistante : sessions indépendantes entre application et moteur Factur-X.** Le moteur utilise son propre registre `FACTURX_USERS_JSON` et n'a pas de déconnexion serveur dans le code examiné. `facturxForgetAuth()` efface le jeton du navigateur ; une copie reste utilisable jusqu'à son expiration (8 heures) ou jusqu'à modification de la clé/du compte côté service. La révocation des modules ou du compte dans le Worker n'est donc pas une révocation de ce second jeton autonome. Les tests de révocation immédiate des 20 routes décrits plus haut concernent le Worker, pas ce moteur externe. La revue n'a pas vérifié le registre réel du service et ne présume pas d'une synchronisation entre les deux registres.
