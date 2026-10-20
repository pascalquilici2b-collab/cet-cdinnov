# Première publication de facturation

Le propriétaire a demandé le 20 octobre 2026 de publier une première version utilisable avant épuisement de son quota, puis de reprendre les fonctions avancées ultérieurement. La publication est autorisée. Le périmètre complet reste décrit dans les documents `BILLING-*.md` et dans le dossier privé de conception.

## Fonctionnement disponible sans moteur raccordé

- Créer, enregistrer et retrouver des devis et factures en **brouillon**, avec aperçu et totaux en direct.
- Réutiliser des clients et prestations, gérer les paramètres et convertir un devis en brouillon de facture lié.
- Conserver les versions, les conflits et les saisies incomplètes.
- Retrouver les factures importées et leur convertisseur Factur-X par « Historique & dossiers ».
- Consulter l’interface sur ordinateur et mobile, avec les explications spécifiques derrière les boutons « ? ».

## Activation du moteur documentaire

Le contexte authentifié expose uniquement `documentService.configured`, calculé depuis une origine HTTPS valide et une clé serveur d’au moins 32 caractères. Aucune valeur de configuration ni aucun secret ne sont envoyés au navigateur. Sans raccordement, la production PDF et la finalisation sont indiquées « à activer » ; l’interface ne propose pas d’action vouée à échouer. Les téléchargements des documents déjà archivés restent accessibles.

Le moteur distant existant répond à son contrôle de santé, mais l’accès au compte Render n’est pas disponible dans la session de publication. La version serveur ajoutant les routes `/api/billing/*` doit être déployée et qualifiée, puis raccordée avec `BILLING_PDF_SERVICE_URL` et `BILLING_PDF_SERVICE_KEY` correspondant à `FACTURX_API_KEY` côté moteur. Le simple contrôle de santé ne qualifie pas ces nouvelles routes. Les comptes et le convertisseur existants doivent être conservés.

Après raccordement, vérifier le PDF brouillon et la chaîne native complète avec un document fictif, puis confirmer la série réelle et les paramètres d’émetteur avant toute émission. Les fonctions locales d’émission immuable, suivi/révisions de devis et règlements restent implémentées et testées. Elles nécessitent des documents émis pour être utilisées. Aucun numéro réel n’est préconfiguré par cette publication.

## Suites

Les avoirs liés, acomptes, allocations et engagements contractuels restent différés. La transmission automatique AGIRIS n’est pas disponible ; le téléchargement et le dépôt manuel restent distincts.

La publication doit sauvegarder le Worker, ses paramètres et les tables, tester restauration et migration additive, publier le Worker complet avant l’interface, puis contrôler les routes authentifiées et les ressources effectivement servies. Le retour arrière rétablit le logiciel précédent sans supprimer les nouvelles tables ni les nouveaux brouillons. Les sauvegardes, accès, captures réelles et preuves détaillées demeurent dans `platform/.private/release-v1/`, hors Git.
