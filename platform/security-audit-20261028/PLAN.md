# Audit de sécurité — app.cdinnov.eu

Objectif : audit complet de l'application réellement déployée, correction des failles vérifiées, tests des protections et des parcours conservés, publication et contrôle de la version finale. Aucun envoi de document réel ni test destructif sur les données de production.

Point de départ : commit `531ea21`. Infrastructure observée : GitHub Pages (interfaces), Cloudflare Workers/D1/R2 (API, identité et données), service Python Render (PDF/Factur-X/OCR), Workers AI, Microsoft Graph. Les pièces et rapports détaillés d'exploitation restent dans `platform/.private/security-audit-20261028/`.

## Couverture et preuves attendues

| Domaine | Travail et preuve nécessaires | Responsable | État |
|---|---|---|---|
| Inventaire et modèle de menace | Routes, composants déployés, rôles, données sensibles, frontières de confiance | Coordination | En cours |
| Authentification et sessions | Connexion, limitation, challenge/rejeu, expiration, révocation, mots de passe, récupération et changement de compte | Reviewer accès | En cours |
| Autorisations | Matrice par rôle/application/action, accès directs, élévation et modifications concurrentes, pièces et exports | Reviewer accès + documents | En cours |
| Entrées et injections | SQL, DOM/HTML/SVG, CSV, URL, XML, chemins, en-têtes, appels externes | Reviewers | En cours |
| Documents et disponibilité | ZIP/PDF/OCR, tailles et limites, confinement, fichiers temporaires, traitement et accès privé | Solver documents | En cours |
| Intégrations | Microsoft Graph/OAuth, destinataires et pièces jointes, API PDF, IA, secrets côté serveur | Tests frontend + documents | En cours |
| Métier et intégrité | Écritures atomiques/versionnées, numérotation et facturation, paiement, sauvegarde/import/export | Coordination + accès | En cours |
| Dépendances et livraison | Versions/verrouillage, vulnérabilités, images et outils système, dépendances téléchargées, scripts/CDN | Coordination | En cours |
| Surface publique et infrastructure | HTTPS, CORS, CSP, cache, framing, secrets/archives publiques, séparation environnements et configuration effective | Coordination | En cours |
| Vérification finale | Tests de sécurité et non-régression, revue indépendante des correctifs, preuves de déploiement et contrôles publics | Ensemble | À faire |

## Règles de clôture

Chaque constat doit indiquer sa portée, sa preuve, sa gravité, son correctif et le test qui le couvre. Les écarts non reproduits restent des points à vérifier, pas des failles affirmées. Les tests emploient des comptes et documents fictifs dans une base isolée. Les vérifications de production sont en lecture seule et bornées ; les modifications de sécurité sont déployées après vérification et sauvegarde de l'état concerné.

La clôture exige une matrice de couverture terminée, les correctifs requis publiés et vérifiés, une revue indépendante, et une liste claire des limites résiduelles. Une suite verte ne remplace pas la vérification des surfaces qu'elle ne couvre pas. Aucun statut « terminé » sur la seule base de l'absence d'erreur visible.
