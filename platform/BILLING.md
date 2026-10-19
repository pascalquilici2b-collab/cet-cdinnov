# Facturation CDInnov — état du chantier

Cette branche introduit l'édition et les PDF de brouillons de factures et devis dans le portail existant. Elle n'est pas déployée. L'émission, la numérotation définitive, les fichiers immuables et l'export Factur-X des nouveaux documents restent à raccorder.

## Parcours disponible

La rubrique Facturation ouvre les factures puis les devis. L'éditeur conserve un aperçu du document à côté de la saisie ; sur petit écran, les boutons Saisie et Aperçu choisissent la vue. Les données sont enregistrées par l'API authentifiée, avec un numéro de version. Un conflit conserve la saisie et propose un nouveau brouillon ou le rechargement du serveur.

La conversion d'un devis crée une seule facture brouillon liée à sa source. Le client conserve l'identifiant de la tentative : une réponse perdue peut être récupérée sans doublon. Le devis reste inchangé.

Les paramètres de facturation enregistrent les coordonnées de l'émetteur, ses adresses de facturation électronique, le mode de facturation, les conditions et mentions de paiement. Chaque nouveau document en reçoit une copie. Modifier ces paramètres ne réécrit jamais un document existant. Les paramètres sont eux-mêmes versionnés, avec historique et protection contre les modifications concurrentes.

Le téléchargement PDF est proposé pour une version enregistrée. Les modifications non sauvegardées le désactivent. La route vérifie la version puis transmet au moteur Python uniquement l'instantané du document ; le moteur recalcule ses montants avant le rendu ReportLab. Aucun total ni numéro fourni par le navigateur n'est accepté. Le PDF porte la mention brouillon, même lorsque les informations sont complètes. Les caractères non représentables sont refusés explicitement.

Historique & dossiers donne accès aux factures importées et à leur convertisseur Factur-X, aux codes affaires et aux marchés. La date de règlement n'entre plus dans la signature d'un export. La lecture des anciennes signatures exclut seulement ce champ et vérifie toujours les autres champs et l'empreinte du PDF source.

## Sources et frontières

- `billing-contracts.ts` : modèle de document, réponses API et contrat de transport.
- `billing-domain.ts` : validation structurelle, brouillons incomplets et calculs décimaux entiers ; les montants JSON sont des centimes sous forme de chaînes.
- `billing.ts` : API `/api/v1/billing`, identité du portail et accès direction. Totaux recalculés sur le serveur.
- `billing-schema.mjs` : tables et déclencheurs D1, création explicite via `migrateBilling(db)` ; aucune migration lancée par une requête HTTP.
- `client/billing.tsx`, `billing.css`, `billing-api.ts` : interface, transport annulable et conservation des saisies.
- `client/billing-bridge.js` : montage dans le portail, protection de navigation, nettoyage à la déconnexion. Le premier rendu du portail se fait après l'initialisation des bridges.
- `client/facturx-integrity.js` : signatures de contenu des factures historiques, intégrées au shell par le build.
- `billing-pdf.ts` : accès serveur au moteur PDF, clé privée, délai et taille bornés, redirections refusées.
- `billing-facturx.ts` : adaptateur du document structuré vers le modèle Invoice existant, sans changement de prix ni arrondi caché.
- `facturx-service/cdi_facturx/billing_document.py` : contrat strict des brouillons et calculs entiers équivalents au Worker.
- `facturx-service/cdi_facturx/document_pdf.py` : rendu paginé, police embarquée, échappement des textes et rejet des caractères non couverts.

Les documents nouveaux ne sont pas ajoutés au tableau historique `portal_invoices`. Leur identité et leur historique restent dans `billing_documents` et `billing_document_versions`. Les clients, affaires et marchés sont lus dans les tables existantes. Le répertoire fournit actuellement le nom du client, pas des coordonnées de facturation certifiées. Aucun émetteur n'est déduit silencieusement d'un ancien PDF.

Le document v2 ajoute les informations commerciales et électroniques. La lecture d'un brouillon v1 le normalise sans réécrire son historique. Un nouvel enregistrement produit une nouvelle version v2 ; les reprises d'une création ancienne restent idempotentes.

## Configuration du moteur PDF

Le Worker nécessite `BILLING_PDF_SERVICE_URL` (origine HTTPS du service Python, sans chemin) et le secret `BILLING_PDF_SERVICE_KEY` (au moins 32 caractères), correspondant à `FACTURX_API_KEY` sur le moteur. Ce secret reste côté serveur. Le moteur conserve son contrôle d'hôte et d'authentification. La nouvelle route est `POST /api/billing/preview-pdf` avec `{document}` ; l'accès portail est `GET /api/v1/billing/documents/:id/preview.pdf`, avec la version dans `If-Match`.

Sans configuration, l'application conserve le brouillon et présente une erreur explicite. Cette branche n'a configuré aucun secret et n'a modifié aucun service en ligne.

## Limites Factur-X vérifiées

L'adaptateur produit les mêmes totaux que le modèle Python. Les remises sont des remises de ligne BG-27 et le prix unitaire reste inchangé. Les calculs de brouillons acceptent six décimales ; l'export France refuse les quantités ayant plus de quatre décimales significatives, sans les arrondir. Les zéros finaux sont retirés de la représentation XML. Le mode de facturation et les deux adresses électroniques sont obligatoires avant export.

Les tests exécutent les XSD et Schematrons de factur-x 6.8, dont les règles France ; les cas de rejet sont vérifiés explicitement. BASICWL refuse les remises de ligne puisqu'il ne conserve pas ces lignes. Les règles et fixtures sont documentées dans `facturx-service/tests/fixtures/README.md`. La validation XML ne prouve ni PDF/A-3 ni l'acceptation AGIRIS : le pipeline complet existant devra encore être appelé à partir d'un document émis immuable.

## Vérification locale

```powershell
node platform/build.mjs
node platform/node_modules/typescript/bin/tsc -p platform/tsconfig.json
node --test platform/billing-domain-test.mjs platform/facturx-integrity-test.mjs platform/billing-test.mjs platform/billing-pdf-test.mjs
$env:BILLING_TEST_PYTHON = '<interpréteur avec requirements-lock.txt installé>'
node --test platform/billing-contract-test.mjs
$env:PYTHONPATH = 'facturx-service'
& $env:BILLING_TEST_PYTHON -m pytest facturx-service/tests -q
$env:PORTAL_QA = '<dossier privé de captures>'
node platform/billing-browser-test.mjs
node platform/finance-browser-test.mjs
node platform/billing-pdf-integration-test.mjs
```

Sur cette machine, le worktree réutilise les dépendances déjà installées. Les scripts qui chargent les outils depuis la racine utilisent `MARCHES_BUILD_PACKAGE` pointant vers le `package.json` du dépôt source, dans son chemin canonique. Le lien `platform/node_modules` est utilisable ; le lien de dépendances à la racine ne doit pas être utilisé.

`node platform/billing-preview.mjs` ouvre un serveur sur une adresse locale aléatoire, avec une base Miniflare temporaire, des comptes de test et des données fictives. Le convertisseur externe et les notifications sont remplacés dans cet aperçu. Arrêter ce processus supprime cette base temporaire ; il ne migre ni ne modifie la production.

Le test `billing-pdf-integration-test.mjs` démarre son propre moteur FastAPI local, télécharge un vrai PDF depuis le navigateur à travers le Worker et D1, puis vérifie son contenu avec pypdf. Il ferme ses processus à la fin. Les captures et preuves privées sont exclues du dépôt.

## Prochains lots

1. Prévisualisation paginée du PDF dans l'éditeur, modèles et identité visuelle définitive.
2. Numérotation configurable après contrôle des séquences existantes, émission atomique et instantané immuable, stockage privé des fichiers et empreintes.
3. Appeler le pipeline complet Factur-X existant à partir du PDF émis, conserver ses rapports et gérer les reprises sans modifier le document.
4. Cycle des devis, avoirs, acomptes, règlements, puis rattachements aux engagements.
5. Exploiter l'observation authentifiée AGIRIS/Cecurity, puis valider le dépôt et le suivi d'un document autorisé. L'export local ne prouve pas la réception par AGIRIS.
6. Reprise des archives et migration de production, vérifications finales et déploiement coordonné du Worker, du moteur Python et des ressources statiques.

Le plan complet et le journal d'audit sont conservés dans `LOGICIEL DEVIS FACTURATION/conception/refonte-2026-10-19` du dossier de gestion interne.
