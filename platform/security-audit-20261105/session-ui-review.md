# Revue de la reconnexion commune — 5 novembre 2026

La fenêtre affiche exactement « Vous êtes resté inactif trop longtemps. Veuillez vous reconnecter », une icône de câble débranché et une action « Se reconnecter ». Le formulaire reste dans le même dialogue. Couleurs, surfaces, bordures, typographie et états de focus sont adaptés aux modes clair et sombre, sur ordinateur et téléphone.

## Comportement livré

- Un seul dialogue natif accessible : nom et description annoncés, focus à l’ouverture, clavier contenu dans le dialogue, Échap ne rend pas accessibles les données privées, focus restitué après reconnexion.
- Les écrans sont conservés en mémoire et masqués pendant l’expiration. Une reconnexion avec le même compte préserve leur état ; un autre compte réinitialise les contrôleurs, les données affichées et les raccourcis privés. Les copies de travail du précédent compte sont supprimées au changement de compte ou à la déconnexion volontaire.
- Minuterie jusqu’à la date d’expiration fournie par le serveur ; contrôle supplémentaire au retour sur l’onglet et après une réponse HTTP 401. La durée de session absolue de huit heures reste inchangée. Le texte demandé n’introduit pas un nouveau délai d’inactivité.
- Aucun dialogue à la première connexion, pour une déconnexion volontaire ou pour un refus de droits HTTP 403. Les réponses portant l’identifiant d’une ancienne session sont ignorées.
- Même interface dans le portail, Feuilles et Budgets ouverts directement. Le Budget embarqué laisse le portail gérer l’expiration pour éviter deux dialogues.
- Aucun bearer ni secret d’authentification conservé par ce code navigateur. Seuls `email`, `expiresAt` et `sessionId` servent à l’affichage et à la protection contre les réponses tardives. Les anciennes données bearer sont nettoyées. Les requêtes utilisent le cookie HttpOnly et l’en-tête `X-CDInnov-Request: 1` pour les mutations.
- Les fichiers historiques de l’ancien domaine Worker passent désormais par l’adresse de l’application ; les nouvelles adresses de fichiers utilisent aussi cette origine.

## Validation locale

`node platform/session-ui-browser-test.mjs` : **35 contrôles réussis**, dans Microsoft Edge réel sans interface, avec le Worker actuel et une base temporaire remplie de données fictives. Aucune notification ni écriture dans les données de production.

- Onze rubriques × deux thèmes : tableau de bord, mouvements, salariés, CET, notes de frais, agenda, tamponnage, facturier, marchés, budgets, paramètres.
- Portail mobile clair et sombre à 390 pixels ; absence de débordement du dialogue et présence du focus et de l’icône.
- Feuilles et Budgets autonomes, en clair/sombre sur mobile.
- Reconnexion par mot de passe et preuve HMAC réelle dans les trois applications ; expiration automatique ; saisie locale préservée pour le même compte.
- HTTP 403 sans dialogue, HTTP 401 avec dialogue, événement tardif de l’ancienne session ignoré.
- Corps de réponse Feuilles délibérément retardé : rejet après changement d’identifiant de session, sans expiration de la nouvelle session.
- Changement de compte : ancien élément privé retiré. Déconnexion volontaire : aucune fenêtre d’expiration.
- Aucune erreur JavaScript non interceptée observée.

Les contrôles des rubriques portent sur l’ouverture effective de chaque écran et la protection de la session ; ils ne prétendent pas refaire tous les parcours métier de chaque module. Le convertisseur Factur-X et ses ponts sont traités dans la revue du parent.

`npx tsc -p apps/sheets/tsconfig.json --noEmit` et `npx tsc -p apps/budgets/tsconfig.json --noEmit` : réussis.

`node --test apps/sheets/test/*.test.mjs` : **11 tests réussis**, comprenant les requêtes de session migrées, les files de sauvegarde, les conflits, la conservation des champs et 284 comparaisons avec le moteur de feuille existant.

`node --check platform/client/session-ui.js` et `node --check platform/client/portal-compat.js` : réussis.

Les nouveaux tests compilent les sources en mémoire grâce à `platform/session-test-assets.mjs`. Ils ne modifient pas les livrables générés. Les suites historiques navigateur de facturation autres que la suite identité ne sont pas incluses dans cette validation et peuvent nécessiter une adaptation de leurs anciens montages bearer.

## Preuves

- [Résultats détaillés](session-ui/checks.json)
- [Mobile sombre](session-ui/portal-mobile-dark-390.png)
- [Mobile clair](session-ui/portal-mobile-light-390.png)
- [Tableau de bord sombre](session-ui/dashboard-dark-1440.png)
- [Feuilles sombre](session-ui/sheets-dark-390.png)
- [Budget sombre](session-ui/budgets-dark-390.png)

Inspection visuelle du mobile sombre effectuée : message entièrement lisible, bouton et bordure de focus visibles, aucun chevauchement.

## Complément Factur-X embarqué

`node platform/facturx-session-browser-test.mjs` : **réussi**. Le navigateur utilise le véritable document embarqué, `parent.facturxApi` et le parseur NDJSON actuel. La connexion et la reconnexion passent par le Worker local réel ; seul le moteur PDF est remplacé par des réponses synthétiques locales pour isoler le parcours de session.

- Réponse 401 : un unique dialogue commun au niveau du portail ; aucun dialogue concurrent dans l’iframe.
- Fichier PDF source, empreinte et nom client saisi conservés après expiration et reconnexion par mot de passe ; iframe conservée.
- Le flux NDJSON transmet un événement de progression puis un résultat complet au parseur après reconnexion.
- Requêtes du convertisseur sur la même origine, avec cookie et marqueur anti-CSRF, sans en-tête Authorization.
- PDF historique du domaine Worker et PDF de la nouvelle origine tous deux lus via la même origine avec cookie. Une adresse PDF sur un domaine étranger est refusée avant tout appel réseau.

Une incompatibilité historique a été détectée pendant cette vérification : `facturxReadFile` refusait les anciennes adresses R2 après changement de `filesBase`. Le parent a corrigé la validation vers `isRemoteFileURL` ; le contrôle ci-dessus est passé après correction.

Preuves : [résultats Factur-X](facturx-embed/checks.json), [dialogue Factur-X](facturx-embed/facturx-401-session-modal.png).
