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

## Raccordement de l'application

Le frontal Cloudflare Pages `cdinnov-app` est préparé avec liaison `CET_API` au service existant et mode de défaillance fermé. Le raccordement `app.cdinnov.eu`, la publication des sessions et le contrôle après publication doivent être complétés avant d'annoncer la livraison globale.

Ce rapport ne garantit pas l'absence de toute vulnérabilité. Le correctif Ghostscript est un rétroportage des patches officiels, pas une déclaration de conformité fournie par un scanner de version. Le confinement natif existant reste celui documenté dans la revue.
