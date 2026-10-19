# Facturation CDInnov — état du chantier

Cette branche introduit l’édition de factures et devis dans le portail existant, l’aperçu PDF paginé, la numérotation explicite, l’émission immuable et le Factur-X des nouveaux documents. Elle est vérifiée localement et n’est pas déployée. Les clients/catalogues complets, cycles de paiement/correction, qualification AGIRIS et reprise de production restent à réaliser.

Le registre `billing-issuance.ts` et son schéma attribuent le numéro dans une transaction et conservent un instantané immuable. L’interface appelle le précontrôle, la réservation, la génération et la reprise sur ce même instantané. [BILLING-ISSUANCE.md](BILLING-ISSUANCE.md) décrit les contrôles et les fichiers privés.

## Parcours disponible

La rubrique Facturation ouvre les factures puis les devis. L'éditeur conserve un aperçu du document à côté de la saisie ; sur petit écran, les boutons Saisie et Aperçu choisissent la vue. Les données sont enregistrées par l'API authentifiée, avec un numéro de version. Un conflit conserve la saisie et propose un nouveau brouillon ou le rechargement du serveur.

La conversion d'un devis crée une seule facture brouillon liée à sa source. Le client conserve l'identifiant de la tentative : une réponse perdue peut être récupérée sans doublon. Le devis reste inchangé.

Les paramètres de facturation enregistrent les coordonnées de l'émetteur, ses adresses de facturation électronique, le mode de facturation, les conditions et mentions de paiement. Chaque nouveau document en reçoit une copie. Modifier ces paramètres ne réécrit jamais un document existant. Les paramètres sont eux-mêmes versionnés, avec historique et protection contre les modifications concurrentes.

Le téléchargement PDF est proposé pour une version enregistrée. Les modifications non sauvegardées le désactivent. La route vérifie la version puis transmet au moteur Python uniquement l'instantané du document ; le moteur recalcule ses montants avant le rendu ReportLab. Aucun total ni numéro fourni par le navigateur n'est accepté. Le PDF porte la mention brouillon, même lorsque les informations sont complètes. Les caractères non représentables sont refusés explicitement.

L’aperçu « En direct » suit la saisie. « PDF paginé » affiche le vrai PDF enregistré, avec navigation par page et zoom, à l’aide du PDF.js déjà embarqué. Modifier le brouillon ramène à l’aperçu en direct. Après émission, la fiche présente montant, client et PDF archivé ; aucun long formulaire désactivé. Les coordonnées de l’émetteur remplies, les mentions et les rapports techniques sont repliables. Les critères de design sont dans [BILLING-UX.md](BILLING-UX.md).

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

Les routes privées du moteur sont aussi `POST /api/billing/preflight` et `POST /api/billing/generate-issued`. La seconde exige l’enveloppe immuable et ses empreintes, et refuse l’authentification utilisateur historique. Les outils natifs sont fournis par la configuration d’exécution existante ; aucun chemin local ni secret n’est livré dans les sources. Le Worker utilise le bucket privé `CET_FILES` pour les fichiers d’émission.

Sans configuration, l'application conserve le brouillon et présente une erreur explicite. Cette branche n'a configuré aucun secret et n'a modifié aucun service en ligne.

## Limites Factur-X vérifiées

L'adaptateur produit les mêmes totaux que le modèle Python. Les remises sont des remises de ligne BG-27 et le prix unitaire reste inchangé. Les calculs de brouillons acceptent six décimales ; l'export France refuse les quantités ayant plus de quatre décimales significatives, sans les arrondir. Les zéros finaux sont retirés de la représentation XML. Le mode de facturation et les deux adresses électroniques sont obligatoires avant export.

Les tests exécutent les XSD et Schematrons de factur-x 6.8, dont les règles France ; les cas de rejet sont vérifiés explicitement. BASICWL refuse les remises de ligne puisqu'il ne conserve pas ces lignes. Les règles et fixtures sont documentées dans `facturx-service/tests/fixtures/README.md`. Le pipeline structuré réutilise les fonctions existantes de génération XML, conversion PDF/A, incorporation et veraPDF à partir de l’instantané émis. Le test natif complet vérifie un vrai PDF/A-3b avec XML incorporé. Cela ne prouve pas l’acceptation AGIRIS, qui reste à qualifier.

## Vérification locale

```powershell
node platform/build.mjs
node platform/node_modules/typescript/bin/tsc -p platform/tsconfig.json
node --test platform/billing-domain-test.mjs platform/facturx-integrity-test.mjs platform/billing-test.mjs platform/billing-pdf-test.mjs
node --test platform/billing-issuance-test.mjs platform/billing-generation-test.mjs
$env:BILLING_TEST_PYTHON = '<interpréteur avec requirements-lock.txt installé>'
node --test platform/billing-contract-test.mjs
$env:PYTHONPATH = 'facturx-service'
& $env:BILLING_TEST_PYTHON -m pytest facturx-service/tests -q
$env:PORTAL_QA = '<dossier privé de captures>'
node platform/billing-browser-test.mjs
node platform/finance-browser-test.mjs
node platform/billing-pdf-integration-test.mjs
# Avec les variables FACTURX_JAVA, FACTURX_GHOSTSCRIPT, FACTURX_ICC et FACTURX_VERAPDF_JAR :
$env:BILLING_FULL_RUNTIME = '1'
node platform/billing-issue-integration-test.mjs
```

Sur cette machine, le worktree réutilise les dépendances déjà installées. Les scripts qui chargent les outils depuis la racine utilisent `MARCHES_BUILD_PACKAGE` pointant vers le `package.json` du dépôt source, dans son chemin canonique. Le lien `platform/node_modules` est utilisable ; le lien de dépendances à la racine ne doit pas être utilisé.

`node platform/billing-preview.mjs` ouvre un serveur sur une adresse locale aléatoire, avec une base Miniflare temporaire, des comptes de test et des données fictives. Le convertisseur externe et les notifications sont remplacés dans cet aperçu. Arrêter ce processus supprime cette base temporaire ; il ne migre ni ne modifie la production.

Le test `billing-pdf-integration-test.mjs` démarre son propre moteur FastAPI local, télécharge un vrai PDF depuis le navigateur à travers le Worker et D1, puis vérifie son contenu avec pypdf. Il ferme ses processus à la fin. Les captures et preuves privées sont exclues du dépôt.

## Prochains lots

1. Répertoire clients complet et catalogue de prestations, validation guidée des champs et navigation de suivi.
2. Cycle des devis (acceptation, refus, expiration), avoirs, acomptes, règlements et allocations.
3. Qualification AGIRIS : profil, destinataire, annexes, dépôt et résultat réel d’un document de test autorisé.
4. Vérification source/déploiement, reprise des archives, séries réelles, migration et sauvegarde restaurable.
5. Recette finale, déploiement coordonné Worker, moteur Python et ressources statiques, puis vérification du service publié.

Le plan complet et le journal d’audit sont conservés dans `LOGICIEL DEVIS FACTURATION/conception/refonte-2026-10-19` du dossier de gestion interne.
