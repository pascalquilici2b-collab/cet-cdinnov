# Revue sécurité — identité, accès et stockage portail

Date : 28 octobre 2026. Base examinée : `531ea21`, puis modifications locales de cet audit. Aucun test d’écriture, aucune session forgée ni aucune donnée réelle utilisés en production. Tous les essais ci-dessous utilisent les fixtures synthétiques et des bases Miniflare/D1/R2 temporaires.

## Périmètre

Lecture de `platform/identity.ts`, `access.ts`, `portal.ts`, `worker.ts`, `record-writes.ts`, `record-changes.ts`, `workspace-records.ts`, `http.ts`, `dashboard.ts`, `data-export.ts`, `server/legacy-runtime.mjs`, des décisions d’architecture et des tests de rôles/accès. Vérification des anciennes routes session/workspace/files/notify et des gardes Budgets/Sheets/Agenda/Marchés.

## Défauts confirmés et corrections

### ACCESS-01 — P1 — vérification hors ligne des mots de passe depuis un challenge public

Avant correction, POST `/api/v1/session` avec l’action `challenge` renvoyait `salt`, `iter` et un challenge décodable contenant `SHA256(JSON([salt, iter, hashPBKDF2]))`. Cette dernière valeur permettait de vérifier tout candidat de mot de passe sans appeler `verify`, donc sans la limite de tentatives. La signature du challenge empêchait sa modification mais pas sa lecture.

Preuve synthétique exécutée avant correction : parmi trois candidats, le vrai mot de passe a été identifié après un seul challenge public et zéro requête de vérification. Aucune valeur de mot de passe, de vérificateur ou de jeton n’a été affichée.

Correction : `identity.ts:31`, `129`, `135` emploient un HMAC lié au compte et protégé par le secret du serveur pour l’empreinte du challenge. Le navigateur utilise toujours le même protocole HMAC et les mots de passe enregistrés restent inchangés. Les anciennes sessions de huit heures restent compatibles. Un challenge émis juste avant la mise à jour devra être redemandé (validité maximale : une minute).

Limite : un challenge vulnérable déjà collecté reste un vérificateur hors ligne. Une mise à jour ne supprime pas d’éventuelles captures historiques ; un renouvellement de mot de passe permet d’en invalider l’utilité pour une connexion future.

### ACCESS-02 — P2 — énumération par comparaison des challenges

Avant correction, le sel d’un compte existant était stable et celui d’un compte absent renouvelé à chaque demande. Deux demandes suffisaient à distinguer les deux cas. L’empreinte exposée présentait la même différence.

Correction : les paramètres fictifs des comptes inconnus sont maintenant déterministes, dérivés d’un HMAC secret, avec des domaines distincts pour le sel et l’empreinte. Test : deux challenges pour une adresse absente renvoient désormais le même sel. Limite : d’anciens comptes configurés avec un nombre d’itérations différent de la valeur courante peuvent encore se distinguer par ce paramètre. Aucune promesse d’indistinguabilité cryptographique complète n’est faite.

### ACCESS-03 — P1 en chaîne avec les rendus client — valeurs exécutables persistables

Le serveur acceptait des valeurs contenant une séquence JavaScript dans `notesFrais[].statut`, `notesFrais[].id` et `conges[].date`. Preuve : un collaborateur a enregistré chacune par PUT, reçu 200, puis le compte administrateur a retrouvé la valeur dans sa lecture du portail. Il acceptait également un justificatif `javascript:` ou `data:text/html`. L’exécution dans un navigateur sur clic d’un justificatif est démontrée séparément dans la revue frontend ; l’accessibilité actuelle des anciens sélecteurs HTML de statut est plus limitée et ne doit pas être présentée comme une exécution automatique.

Correction serveur : `validatePortalFields` dans `portal.ts` contrôle les nouveaux identifiants, matricules/codes, dates réelles ISO, statuts métier et lignes de notes de frais dans le résultat commun aux PUT, PATCH et restaurations métier. La même fonction vérifie les nouvelles références de pièces : URL HTTP(S) ou données PDF/PNG/JPEG/WebP/GIF ; les liens `javascript:`, HTML/SVG actifs et autres schémas sont refusés. Les textes descriptifs restent libres. Une collection de lignes de frais qui n’est pas un tableau est refusée en 400.

Le contrôle de sortie client reste indispensable : les anciens champs importés inchangés sont préservés pour ne pas altérer silencieusement les données existantes. La revue croisée a confirmé puis corrigé un problème de compatibilité : une ancienne date non ISO ou un statut personnalisé d’un autre salarié ne doit pas bloquer toutes les nouvelles saisies. Les contrôles de champs s’appliquent donc aux nouveautés et modifications, avec comparaison par identité de record. La correction frontend valide également les liens à la lecture et échappe les arguments de gestionnaires HTML, y compris pour les données historiques.

## Contrôles d’accès vérifiés

- Les requêtes anonymes du portail, de fichiers, des budgets et de Sheets échouent ; les routes historiques arbitraires et encodées sont fermées par l’entrée actuelle.
- Un collaborateur ne peut pas changer les droits, les autres salariés, valider un congé ou marquer une note payée.
- Le changement de rôle/droits est pris en compte par les sessions existantes ; la révocation de tous les modules ferme les routes directes et filtre les collections du portail.
- Une réinitialisation supprime immédiatement l’ancien compte ; une invitation est utilisable une seule fois ; une déconnexion révoque le porteur sur les services historiques et actuels.
- Les lectures de fichiers tiennent compte des références visibles et de la propriété. Une URL devinée ne permet pas de s’accorder l’accès. L’écrasement d’un fichier et la suppression d’une pièce encore référencée sont refusés.
- Les domaines de fichiers facturation, tamponnage et salariés clients sont exclus de la route générique `/files/`.
- Le contrôle Origin est centralisé avant les anciennes routes. L’authentification utilise un porteur explicite et aucune session cookie implicite : pas de contournement CSRF confirmé.
- Budgets et Sheets constituent des espaces partagés par les comptes ayant le module ; aucune permission par document n’est promise par la conception actuelle.

## Risques résiduels et limites

- `/api/v1/portal/backup` renvoie volontairement les vérificateurs de tous les comptes aux administrateurs pour la reprise privée (ADR-0003). Les lectures ordinaires et l’export de données les retirent. Un vérificateur est équivalent au secret de connexion dans ce protocole ; une sauvegarde privée divulguée est donc sensible. Aucun accès collaborateur à cette sauvegarde n’a été trouvé.
- Le handler historique conserve du code public dangereux, mais l’entrée déployable actuelle ferme ces chemins. Ne pas republier directement `legacy-runtime.mjs` ou l’ancien worker public.
- Aucun test de charge, aucune preuve d’absence universelle de course de révocation, aucun audit des données réelles et aucune écriture externe effectués.

## Validation exécutée

1. `node platform/security-access-test.mjs --prove-before-fix` sur les sources initiales : défauts d’empreinte publique, de sel et de persistance `id/statut/date` reproduits. Ce mode échoue volontairement après correction.
2. `node platform/security-access-test.mjs` : succès, attaques précédentes refusées ; liens actifs refusés ; PUT/PATCH/restore contrôlés ; pièce PNG inline conservée ; droits révoqués, routes fermées et déconnexion vérifiés.
3. `node platform/security-access-regressions.mjs` : 9 scénarios du test portail existant et 4 groupes de contrôles du test des rôles réussis sur les sources actuelles. Le lanceur adapte uniquement le choix du bundle de test et réutilise les scénarios originaux ; il ne remplace pas `.build/entry.mjs`.
4. `node node_modules/typescript/bin/tsc -p platform/tsconfig.json` : succès.
5. `git diff --check -- platform/identity.ts platform/portal.ts platform/security-access-test.mjs platform/security-access-regressions.mjs` : succès.
6. `node platform/security-audit-20261028/access-peer-test.mjs` (revue indépendante frontend) : empreintes publiques opaques, sels fictifs distincts par adresse, nonces frais, rejet des anciens challenges et rejeux, préservation des anciennes sessions ; ancien dossier privé non standard préservé sans bloquer l’écriture d’un autre compte ; lignes de frais non tableau refusées. Deux groupes réussis.

Aucun build global, commit ou déploiement exécuté par ce reviewer. Fichiers modifiés dans ce périmètre : `identity.ts`, `portal.ts`, les deux tests `security-access*` et ce rapport.

## Validation complémentaire du registre de facturation

À la demande de l’agent principal, la fixture de `billing-issuance-test.mjs` a été actualisée : le test désactive un éventuel chemin de bundle imposé pour utiliser le Worker source courant et exécute `migrateBilling` avant de créer un brouillon. L’ancien montage ne créait que `billingSchema` alors que l’API actuelle utilise aussi les tables de numérotation, d’engagements et d’émission. Aucune assertion et aucun code métier n’ont été modifiés.

`node platform/billing-issuance-test.mjs` : **12/12 réussis**, dont dix numéros concurrents consécutifs, conflits de version, annulation transactionnelle, immutabilité, reprise avec jeton de traitement et limite du compteur. Aucune attente métier n’a dû être affaiblie.
