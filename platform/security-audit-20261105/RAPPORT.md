# Sécurité et reconnexion — 5 novembre 2026

## Correctifs

- Deux correctifs officiels Artifex appliqués à Ghostscript, avec reconstruction Debian contrôlée et vérification des sources, paquets et binaires réellement installés.
- Sessions communes en cookies Secure/HttpOnly/SameSite=Strict, révocation serveur à la déconnexion, refus des anciens Bearer, contrôle des origines et protection des écritures contre les requêtes externes.
- Convertisseur Factur-X raccordé à la session du portail par un relais serveur borné ; suppression des accès de conversion autonomes du navigateur.
- Frontal de même origine, en-têtes HTTP de sécurité effectifs et blocage des intégrations dans des sites tiers, tout en conservant les iframes internes.
- Fenêtre de session expirée commune : câble débranché, message demandé, reconnexion conservant la saisie du même compte, effacement des vues privées lors d'un changement de compte.

## Vérifications

Trois agents ont séparé les correctifs natifs, la sécurité des sessions et l'interface. Les rapports détaillés ci-dessous distinguent les tests courants réussis, les anciennes attentes métier et les contrôles natifs.

- [Moteur natif](native-review.md) : 13 tests ciblés et revue croisée.
- [Sessions et frontal](session-review.md) : identité, révocation, CSRF, accès, relais, navigateur réel et bundle final. 646 fichiers, imports résolus, vrai PDF.js et OCR français/anglais sous CSP.
- [Interface](session-ui-review.md) : 35 contrôles navigateur, mode clair/sombre/mobile, reconnexion, brouillon, convertisseur embarqué et liens historiques.
- [Flux métier](backend-cookie-review.md) : 39 suites réussies. Sept suites anciennes présentent encore des attentes incompatibles avec les parcours actuels ; elles ne sont pas déclarées réussies.

## Publication native vérifiée

Render a publié `e53cf3599faa44be0de75b5f65bc4b5fed78ff7f`, déploiement `dep-dbm57prm8hqs73ep3chg`, le 5 novembre, état « Deploy succeeded | Live ». La construction Linux et ses tests obligatoires ont réussi :

- intégrité des paquets Ghostscript corrigés ;
- refus des PDF actifs et limites des sous-processus ;
- Factur-X, XML, XSD, Schematron, PDF/A-3b et conservation des montants ;
- trois pages, deux polices TrueType incorporées, accents et comparaison visuelle ;
- annotations, transparence, remise et progression ;
- OCR Tesseract réel, scans multipages, scan gris et document de paiement dense.

La santé publique du moteur retourne HTTP 200, `ready: true`. Ces essais utilisent uniquement des pièces fictives. Aucun courriel ni document métier de production n'a été créé.

## Publication complète vérifiée

- **Frontal** : Cloudflare Pages `cdinnov-app`, déploiement `216814c1-9930-4b6d-bc9e-294c2193454d`, 646 fichiers. Liaison `CET_API` vers le service existant, mode de défaillance fermé. Le domaine `app.cdinnov.eu` est affiché **Active — SSL enabled** dans Cloudflare. Seul son CNAME Hostinger a changé, vers `cdinnov-app.pages.dev`, TTL 300 ; ni les serveurs de noms, ni le site public, ni la messagerie n'ont été déplacés.
- **API** : publiée le 5 novembre à 10:15:28 UTC. Empreinte `324dd4f1580a7868d9be44e8cd3f9b7ca6fd8645cb5ffc5187a3d00735706e4d`, comparée au bundle testé. Bindings conservés, aucune migration. Une sauvegarde privée de la version et des paramètres précédents est conservée.
- **Moteur final** : commit `cd83c26af996ec37614425260cc2364f8565e28f`, déploiement Render `dep-dbm5f4e1egvs73bdd5s0`, **Deploy succeeded | Live**, durée 1 min 17 s. Les tests natifs de PDF/Factur-X/OCR décrits plus haut ont de nouveau réussi avec cette version des sessions. La santé retourne `ready: true`, et l'ancienne connexion indépendante retourne désormais 410.
- **Contrôle HTTPS après publication** à 10:21:37 UTC : 12 ressources essentielles comparées octet pour octet avec le livrable (portail, Sheets, Budgets, callback Outlook, lecteur PDF, police et OCR). En-têtes HSTS, nosniff, SAMEORIGIN et CSP `frame-ancestors 'self'` effectifs. Six routes privées retournent 401 sans session ; origine étrangère et écriture sans marqueur CSRF retournent 403.
- **Données** : empreintes avant/après identiques pour les documents, fiches clients, marchés, factures historiques et engagements. Aucun courriel, document métier de test ou modification de donnée métier en production.
- **Navigateur public** : écran de connexion ouvert sur `https://app.cdinnov.eu/`, affichage correct et aucun avertissement ou erreur de console observé. Aucun mot de passe utilisateur n'a été extrait ou utilisé pour improviser une connexion. Les parcours authentifiés complets restent les essais locaux multiagents sur le livrable compilé.

Les contrôles HTTPS du nouveau frontal ont résolu la destination du CNAME directement tout en validant normalement le certificat `app.cdinnov.eu`. Certains résolveurs conservaient encore l'ancien CNAME GitHub (ancien TTL 4 heures) pendant la propagation. Une reconnexion est nécessaire après migration des anciennes sessions.

La procédure de publication future est dans [DEPLOYMENT.md](../DEPLOYMENT.md). Les résultats bruts, empreintes et sauvegardes restent dans `platform/.private/security-audit-20261105/`.

## Limites restantes

- Les sept anciennes suites métier mentionnées plus haut ne sont pas déclarées réussies ; les essais actuels de sessions et parcours concernés ont été exécutés séparément. Leur remise à jour reste à faire.
- La session conserve sa durée maximale existante de huit heures. La fenêtre demandée intervient à l'expiration ou au refus d'une session, pas sur un nouveau compteur d'inactivité distinct.
- Le portail historique possède encore des gestionnaires JavaScript inline : la CSP ne peut donc pas encore interdire tout script inline. Les cookies HttpOnly évitent la lecture du secret de session par JavaScript, sans constituer à eux seuls une protection contre toute action XSS.
- Les correctifs Ghostscript sont des rétroportages officiels contrôlés ; un scanner fondé uniquement sur le numéro amont peut continuer à signaler la version de base. Les patches et empreintes prouvent les corrections appliquées. Les limites de processus ne constituent pas un confinement OS complet. Les avis Tesseract impliquant un modèle hostile ne sont pas déclarés corrigés ; seuls les modèles fixes de l'image sont utilisés.
- Les réserves de l'audit précédent sur d'éventuelles captures antérieures de challenges, la confidentialité des sauvegardes administrateur et le périmètre externe restent valables. Aucun incident de compromission n'est établi et aucun mot de passe n'a été modifié.

Ce rapport ne garantit pas l'absence de toute vulnérabilité et ne constitue pas une certification de sécurité.
