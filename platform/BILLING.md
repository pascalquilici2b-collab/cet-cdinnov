# Facturation CDInnov — état du chantier

Cette branche introduit les brouillons de factures et devis dans le portail existant. Elle n'est pas déployée. L'émission, la numérotation définitive et le raccordement des nouveaux documents au service Factur-X restent à réaliser.

## Parcours disponible

La rubrique Facturation ouvre les factures puis les devis. L'éditeur conserve un aperçu du document à côté de la saisie ; sur petit écran, les boutons Saisie et Aperçu choisissent la vue. Les données sont enregistrées par l'API authentifiée, avec un numéro de version. Un conflit conserve la saisie et propose un nouveau brouillon ou le rechargement du serveur.

La conversion d'un devis crée une seule facture brouillon liée à sa source. Le client conserve l'identifiant de la tentative : une réponse perdue peut être récupérée sans doublon. Le devis reste inchangé.

Historique & dossiers donne accès aux factures importées et à leur convertisseur Factur-X, aux codes affaires et aux marchés. La date de règlement n'entre plus dans la signature d'un export. La lecture des anciennes signatures exclut seulement ce champ et vérifie toujours les autres champs et l'empreinte du PDF source.

## Sources et frontières

- `billing-contracts.ts` : modèle de document, réponses API et contrat de transport.
- `billing-domain.ts` : validation structurelle, brouillons incomplets et calculs décimaux entiers ; les montants JSON sont des centimes sous forme de chaînes.
- `billing.ts` : API `/api/v1/billing`, identité du portail et accès direction. Totaux recalculés sur le serveur.
- `billing-schema.mjs` : tables et déclencheurs D1, création explicite via `migrateBilling(db)` ; aucune migration lancée par une requête HTTP.
- `client/billing.tsx`, `billing.css`, `billing-api.ts` : interface, transport annulable et conservation des saisies.
- `client/billing-bridge.js` : montage dans le portail, protection de navigation, nettoyage à la déconnexion. Le premier rendu du portail se fait après l'initialisation des bridges.
- `client/facturx-integrity.js` : signatures de contenu des factures historiques, intégrées au shell par le build.

Les documents nouveaux ne sont pas ajoutés au tableau historique `portal_invoices`. Leur identité et leur historique restent dans `billing_documents` et `billing_document_versions`. Les clients, affaires et marchés sont lus dans les tables existantes. Le répertoire fournit actuellement le nom du client, pas des coordonnées de facturation certifiées. Aucun émetteur n'est déduit silencieusement d'un ancien PDF.

## Vérification locale

```powershell
node platform/build.mjs
node platform/node_modules/typescript/bin/tsc -p platform/tsconfig.json
node --test platform/billing-domain-test.mjs platform/facturx-integrity-test.mjs
node --test platform/billing-test.mjs
$env:PORTAL_QA = '<dossier privé de captures>'
node platform/billing-browser-test.mjs
node platform/finance-browser-test.mjs
```

Sur cette machine, le worktree réutilise les dépendances déjà installées. Les scripts qui chargent les outils depuis la racine utilisent `MARCHES_BUILD_PACKAGE` pointant vers le `package.json` du dépôt source, dans son chemin canonique. Le lien `platform/node_modules` est utilisable ; le lien de dépendances à la racine ne doit pas être utilisé.

`node platform/billing-preview.mjs` ouvre un serveur sur une adresse locale aléatoire, avec une base Miniflare temporaire, des comptes de test et des données fictives. Le convertisseur externe et les notifications sont remplacés dans cet aperçu. Arrêter ce processus supprime cette base temporaire ; il ne migre ni ne modifie la production.

## Prochains lots

1. Paramètres d'émetteur et conditions commerciales, adressage et données nécessaires à Factur-X. Conserver les brouillons existants par évolution explicite du schéma.
2. Rendu PDF paginé utilisant le même document que l'aperçu, avec polices couvrant les caractères saisis ; cas longs et multi-TVA.
3. Numérotation configurable après contrôle des séquences existantes, émission atomique et instantané immuable, stockage privé des fichiers et empreintes.
4. Adaptateur vers le convertisseur Python existant. Réconcilier les arrondis et les remises par ligne avant toute émission ; le service actuel ne prend pas encore ces remises en charge.
5. Cycle des devis, avoirs, acomptes, règlements, puis rattachements aux engagements.
6. Observation authentifiée du portail AGIRIS/Cecurity, validation du dépôt et du suivi réel. L'export local ne prouve pas la réception par AGIRIS.
7. Reprise des archives et migration de production, vérifications finales et déploiement coordonné du Worker et des ressources statiques.

Le plan complet et le journal d'audit sont conservés dans `LOGICIEL DEVIS FACTURATION/conception/refonte-2026-10-19` du dossier de gestion interne.
