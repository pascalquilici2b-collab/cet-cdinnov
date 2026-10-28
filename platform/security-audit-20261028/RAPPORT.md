# Audit de sécurité de app.cdinnov.eu — 28 octobre 2026

## Résultat

L'audit porte sur le code et les services de l'application, avec revue croisée des accès, du navigateur, des documents et des intégrations. Les défauts reproduits ont été corrigés. Les corrections de l'interface, de l'API et du moteur PDF sont publiées et vérifiées. L'audit est terminé dans le périmètre décrit ci-dessous ; les limites et renforcements architecturaux restants sont explicités.

Il s'agit d'un audit technique avec tests locaux isolés et contrôles de production en lecture seule. Ce rapport ne constitue ni une certification ni une garantie d'absence de vulnérabilité. Aucun message réel, aucune facture réelle et aucun enregistrement métier de test n'ont été envoyés ou créés en production.

## Principales corrections

| Domaine | Défaut ou exposition | Correction et résultat |
|---|---|---|
| Connexion — élevé | Un challenge public contenait une empreinte permettant de vérifier hors ligne des candidats de mot de passe. | Empreinte remplacée par un HMAC protégé par le secret serveur. Preuve synthétique avant/après, rejeu refusé, sessions existantes conservées. |
| Pièces et interface — élevé | L'adresse d'un justificatif pouvait contenir un schéma JavaScript, exécuté lors du clic dans le navigateur. | Contrôle des URL à l'enregistrement et à la lecture, avec protection des anciennes données. La reproduction locale ne s'exécute plus. |
| Champs et exports — moyen | Des arguments de boutons classiques et des cellules CSV acceptaient du contenu interprétable. | Sérialisation adaptée aux gestionnaires HTML, validation des nouveaux champs côté serveur et neutralisation des formules CSV, y compris les en-têtes. Les données historiques inchangées restent utilisables. |
| PDF, ZIP, OCR — moyen | Actions PDF actives insuffisamment filtrées, décompression ZIP insuffisamment progressive et lecture PDF dans le processus du serveur. | Refus des actions actives, limites progressives, lecteur dans un sous-processus avec délai et plafonds Linux. Les liens ordinaires et ressources PDF légitimes sont conservés. |
| Confidentialité IA — moyen | Certains IBAN et identifiants sociaux échappaient au filtrage des extraits. | Double filtrage local et à la sortie vers l'IA, couvrant aussi les anciennes lectures mises en cache. Les noms utiles au rapprochement ne sont pas présentés comme anonymisés. |
| Dépendances | Avis connus dans JavaScript, Python et le moteur natif PDF. | Versions corrigées et verrouillées ; retrait des anciens lecteurs chargés depuis un CDN. Contrôle bloquant des révisions Debian du moteur lors du build. |
| Navigateur et messagerie | Protection de contenu incomplète et contrôle de chemin Graph trop large. | CSP adaptée à chaque application, garde contre l'intégration par un site étranger, en-têtes API renforcés et chemins Graph limités à la boîte du compte connecté. |

Les priorités correspondent aux chemins effectivement examinés. Un avis de dépendance n'est pas présenté comme une exploitation démontrée de l'application.

## Couverture

Les revues couvrent l'identité et les sessions, les rôles et droits par application, les routes historiques, les fichiers privés, les exports et sauvegardes, les écritures versionnées, la numérotation et les limites d'engagement, les imports ZIP/Office/PDF, l'OCR, les extraits IA, les signatures et pièces Outlook, les parcours du navigateur, les dépendances et la livraison.

Les contrôles d'accès locaux vérifient notamment qu'un collaborateur ne peut pas devenir administrateur, modifier les droits d'autrui, lire une pièce privée en devinant son adresse, écraser un fichier existant ou continuer à utiliser un module révoqué. Les espaces partagés Budgets, Sheets et lots de tamponnage sont examinés selon leurs règles de partage voulues, sans leur inventer une confidentialité individuelle.

Les neuf routes privées contrôlées publiquement renvoient `401` sans authentification ; une origine étrangère reçoit `403`. Le service PDF annonce une authentification obligatoire. Les paramètres de plan, DNS, région et droits Microsoft n'ont pas été modifiés.

## Validation

| Contrôle | Résultat constaté |
|---|---|
| Python, suite documentaire complète | 261 tests et 52 sous-tests réussis ; 2 tests nécessitant le runtime natif ignorés sur Windows. Après le dernier ajustement PDF, 56 tests et 26 sous-tests concernés réussis. |
| Nouveau contrôle des paquets natifs et sécurité PDF | 35 tests locaux réussis. La comparaison réelle des versions Debian est imposée au build Linux. |
| Dernier build Linux réel | Versions Debian corrigées confirmées ; limites du lecteur actives ; conversion PDF/A-3b et Factur-X, annotations, remises, OCR réel, scans multipages/partiels et document de paiement à 28 lignes réussis. |
| Facturation, Graph, numérotation, intégrité et imports partagés | 41 tests réunis réussis, dont émission concurrente et conservation des liens devis/factures. |
| Accès et identité | Tests dédiés, 9 scénarios portail, 4 groupes de rôles et revue croisée de 2 groupes réussis ; 11 tests identité et 14 tests plateforme réussis. |
| Données et métier | 13 tests d'écritures, 7 contrôles métier couvrant 56 tables, contrôle de 1 216 enregistrements de fixture finance et tests personnel réussis. |
| Interfaces et CSP | Connexion locale réelle PBKDF2/HMAC, budgets intégrés, Sheets, PDF multipage, Factur-X et callback Outlook vérifiés dans Chromium. Services externes simulés ; aucune erreur CSP inattendue. |
| Dépendances JavaScript / Python | Aucun avis connu dans le contrôle pnpm des 496 dépendances verrouillées ni dans le contrôle OSV des 37 versions Python verrouillées. Ce résultat ne couvre pas à lui seul les paquets système. |
| Secrets et modèles publics | Aucun secret correspondant aux motifs examinés dans le contenu courant et 2 021 objets texte historiques. Métadonnée nominative retirée d'un modèle Excel, sans modification de ses cellules ni formules. |
| Livraison de l'interface | 62 actifs modifiés servis publiquement, comparés par empreinte avec Git : 62 correspondances, aucune divergence. |

Un ancien test visuel de contacts Outlook attend encore un contrôle d'éditeur remplacé et n'est pas comptabilisé comme réussi. Les suites actuelles de brouillon, envoi, pièces et destinataires passent. La session personnelle de production ayant expiré, aucune nouvelle authentification utilisateur réelle n'a été improvisée ; le protocole a été testé avec des comptes fictifs et la version serveur publiée a été vérifiée.

## Livraison

- Correctifs applicatifs : `bc4a9fea9546f6a82aaf9c6511fb1a6a8f8403aa`, publié sur GitHub Pages ; workflow `40719462346` réussi.
- API Cloudflare : version corrigée publiée le 28/10/2026 à 15:48:39 UTC. Empreinte du script : `0baf8a85f35d968ebe6e2c1ab05a95a9a2445cacd1417ab04d6f6b8276e3f271`. Configuration et liaisons conservées, aucune migration de données ; sauvegarde privée de la version précédente.
- Premier moteur PDF corrigé : déploiement Render `dep-dbh1i6om7kps73f18gk0`, réussi. Conversion PDF/A-3b, Factur-X, OCR, scans multipages et limites Linux réellement validés lors du build.
- Mise à jour native complémentaire : `10718c1804d30c86b1f97684bdc81b006fe418af`, reconstruction `dep-dbh1n94s728c73cjofc0` réussie et en ligne le 28/10/2026 à 16:00:08 UTC. Debian trixie, Ghostscript/libgs10 `10.05.1~dfsg-1+deb13u3`, OpenJDK 21 `21.0.13+9-1~deb13u2`, Tesseract `5.5.0-1+b1`. Tous les tests de build précités réussissent. Le contrôle public après publication retourne `200`, `ready: true` et `authentication_required: true`.
- GitHub Pages a également publié `10718c1` sans modification des actifs précédemment vérifiés ; workflow `40721254944` réussi.

Les preuves privées de publication, sauvegardes de configuration et résultats bruts restent dans `platform/.private/security-audit-20261028/` et ne sont pas ajoutées au dépôt public.

## Limites résiduelles et suites recommandées

1. **Anciens challenges de connexion :** une capture faite avant correction reste exploitable pour des essais de mots de passe hors ligne. La mise à jour n'efface pas ces éventuelles captures ; renouveler les mots de passe invalide leur utilité pour une connexion future. L'audit n'établit pas qu'une capture ou intrusion a eu lieu. Certains anciens paramètres de dérivation peuvent encore distinguer l'existence d'un compte.
2. **Pages statiques :** GitHub Pages ne permet pas ici les en-têtes HTTP personnalisés HSTS, `frame-ancestors`, `nosniff` et Permissions-Policy. Le garde d'iframe et la CSP meta sont appliqués mais ne sont pas équivalents à tous ces en-têtes. Une évolution de l'hébergement ou d'un proxy HTTPS permettrait ce renforcement ; elle n'a pas été imposée pendant l'audit.
3. **Sessions et ancien JavaScript :** le jeton reste accessible au JavaScript du même domaine ; une partie du portail utilise encore des gestionnaires inline. Une migration vers une session HttpOnly avec protection CSRF et des scripts sans inline constitue un chantier architectural distinct. Les défauts XSS reproduits ont été corrigés maintenant.
4. **Sauvegardes administrateur :** la sauvegarde privée de reprise contient volontairement les vérificateurs des comptes. Elle doit rester privée et protégée. Les exports ordinaires les excluent, et les collaborateurs n'ont pas accès à cette sauvegarde.
5. **Traitement natif :** les sous-processus et limites ne constituent pas un sandbox système complet. Les avis Tesseract nécessitant un modèle hostile sont analysés séparément ; seuls les modèles de langues fixes de l'image sont utilisés. Les détails de versions et de portée sont dans les rapports natifs associés.
6. **Périmètre externe :** pas de test de charge destructif, d'audit forensique, de certification antivirus ni d'audit exhaustif des politiques des comptes Microsoft/Cloudflare/Render. Les contrôles de motifs ne prouvent pas l'absence de tout secret possible. Les dépendances devront être surveillées dans la durée.

## Détails techniques

- [Accès et identité](access-review.md)
- [Navigateur, CSV et Outlook](frontend-outlook-review.md)
- [Revue croisée des correctifs frontend](access-peer-frontend-review.md)
- [Documents, IA et archives](documents-review.md)
- [Infrastructure et dépendances](infrastructure-review.md)
- [Mise à jour du moteur natif](ghostscript-runtime-update.md)
- [Portée des avis natifs](native-runtime-review.md)
- [Matrice de couverture](PLAN.md)
