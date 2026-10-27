# Tamponnage — mise à jour du 27 octobre 2026

- Consultation de tous les lots non expirés par les comptes ayant accès au module ; modifications réservées au créateur et aux administrateurs. Originaux et résultats restent servis par les routes authentifiées, sans URL publique de stockage.
- Import de PDF et ZIP dans les deux catégories. Extraction des PDF en mémoire dans le navigateur, contrôle des tailles réelles, des chemins, du nombre de fichiers et des archives incomplètes. Les fichiers hors PDF sont ignorés et signalés.
- À l’import, les PDF regroupés (100 pages au maximum) sont découpés selon l’identité, le mois ou le numéro de facture. Les pages d’un même document restent ensemble ; les scans illisibles sont isolés pour vérification. Chaque pièce résultante reste limitée à 30 pages. Le PDF regroupé original est conservé avec le lot. Le découpage concerne les nouveaux imports : réimporter un ancien PDF regroupé dans un nouveau lot si nécessaire.
- OCR des pages scannées par appels bornés de trois pages au maximum. Qwen n’intervient pas dans le découpage.
- « Confirmer les corrections » utilise la répartition choisie et le montant explicitement vérifié, sans OCR, Qwen ou remise en file d’analyse. La pièce passe à « Prêt » après génération et contrôle du PDF. Les dépassements d’imputation, doublons de rapprochement et modifications concurrentes restent bloqués.
- Les originaux, contrôles géométriques, limites de 100 pièces / 200 Mio par lot et conservation de 30 jours sont maintenus. ZIP/PDF entrants : 20 Mio par fichier. Une archive ZIP contient les PDF à tamponner ; le document de paiement est toujours importé séparément.

Tests : `tests/test_stamping_intake_manual.py`, `platform/stamping-shared-import-test.mjs`, `platform/stamping-zip-test.mjs`, `platform/stamping-shared-ui-test.mjs`. Le contrôle Docker `deployment/verify_stamping.py` vérifie aussi les bulletins multi-pages avec le vrai Tesseract.

Les sections ci-dessous décrivent la livraison initiale et sont historiques ; les comportements ci-dessus et le code courant font foi.

---

# Tamponnage des pièces — livraison du 23 octobre 2026

Le module est intégré dans **Applications → Tamponnage**, réservé aux administrateurs du portail CDInnov. La livraison est développée et testée localement, sur la branche `codex/tamponnage`, à partir de `08e91d9164423005488ec0a6d73f656a8c717ed1`. Aucune modification de production n'a été effectuée.

## Utilisation

1. Créer un lot. Choisir l'assistance Qwen, la préférence première/dernière page et, si souhaité, autoriser une annexe lorsqu'aucun emplacement ne convient.
2. Importer les PDF et le fichier XLSX ou CSV UTF-8. Les originaux sont conservés séparément.
3. Choisir la feuille et associer les colonnes. Le mode « tableau par blocs » reprend les identifiants dans le bloc, avec arrêt sur ligne vide. Le mode tableau large associe les colonnes aux projets. Les profils de correspondance sont réutilisables.
4. Vérifier et confirmer le tableau. Les erreurs bloquent sa confirmation. Les calculs à partir des pourcentages et les exclusions de lignes nécessitent une décision explicite.
5. Analyser les pièces. Chaque pièce a son état et peut être relancée indépendamment. Une ambiguïté demande un rapprochement et une assiette relus par l'utilisateur.
6. Examiner le résultat, les montants, le reliquat et les références de cellules. Le déplacement du tampon se fait sur l'original, puis « Recalculer l'aperçu » vérifie de nouveau les collisions. Une correction de montant requiert confirmation et motif ; elle est exportée comme `OVERRIDE`.
7. Cocher la relecture, valider chaque pièce puis tamponner les pièces prêtes. Télécharger les PDF ou le ZIP avec `rapport.csv` et `tracabilite.json`.

Une fois l'analyse commencée, le tableau du lot est verrouillé. Pour changer la ventilation source, créer un nouveau lot. Un PDF déjà tamponné par ce module ne peut pas être retamponné ; utiliser l'original.

## Architecture intégrée

| Composant | Implémentation |
|---|---|
| Navigation et session | `index.html`, `platform/client/stamping-bridge.js`, session existante `budgetsEnsureSession` |
| Interface | React/TypeScript `platform/client/stamping.tsx`, CSS utilisant les variables du portail, thèmes clair/sombre et mobile |
| API privée | `platform/stamping.ts`, route `/api/v1/stamping/*`, intégrée au Worker existant |
| Persistance | D1 existante `BUDGETS_DB` ; 4 nouvelles tables `stamp_*`, migrations additives séparées |
| Fichiers | Bucket existant `CET_FILES`, préfixe privé `stamping/<empreinte-propriétaire>/<lot>/` ; accès uniquement par l'API authentifiée |
| Traitement asynchrone | Nouvelle queue `STAMPING_QUEUE` ; un message par pièce, état durable D1, versions, reprise et expiration du verrou |
| Moteur documentaire | Service FastAPI existant Factur-X ; nouveau `/api/stamping/process`, clé serveur existante, processus Python jetable par requête |
| PDF | pypdf préserve les objets, ReportLab ajoute les tampons vectoriels, PDFium contrôle visuellement le résultat |
| OCR | Tesseract installé dans le service documentaire, langues français/anglais/italien ; aucun service OCR externe |
| Qwen | Binding existant `MARKETS_AI`, modèle et budget partagés avec Marchés, adaptateur `platform/stamping-ai.ts` |

Le propriétaire du lot est l'identité serveur, jamais un champ fourni par le navigateur. Les lots sont isolés entre utilisateurs, y compris entre administrateurs. L'application actuelle a un espace partagé ; aucun système de tenants fictif n'a été ajouté.

## Qwen et données

Le Qwen existant est `@cf/qwen/qwen3-30b-a3b-fp8`, fourni par Cloudflare Workers AI. L'utilisateur a explicitement autorisé son utilisation dans ce chat le 23/10/2026 : « Ok utilise le Qwen qui passe par CloudFlare c'est pas un souci ». Cette décision remplace l'exigence initiale de Qwen local. L'OCR reste exécuté dans le service documentaire.

Si l'assistance est cochée, Qwen reçoit uniquement une sélection de lignes d'identification et de contrôle, limitée à 8 000 caractères, et non les fichiers PDF/XLSX ni l'image des pages. Les lignes portant les libellés d'adresse, NIR ou coordonnées bancaires sont exclues ; des identifiants de salarié/fournisseur et des montants de contrôle peuvent figurer dans les extraits. Ce filtrage n'est pas une anonymisation garantie.

Les suggestions doivent être citées dans les extraits, respecter un schéma fermé et concerner uniquement les identifiants. L'IA ne peut produire ni montant d'imputation, ni projet, ni programme. Une réponse incorrecte, une indisponibilité ou un quota épuisé laisse les règles déterministes fonctionner, puis demande une relecture si nécessaire. Il n'existe pas de fournisseur IA de secours. Version de prompt, modèle et état sont tracés.

Le branchement au modèle réel est implémenté. Les tests locaux ont simulé ses réponses, notamment une tentative d'inventer un montant ; aucun appel Qwen de production n'a été effectué. Un essai synthétique sur l'infrastructure reste à faire après activation.

## Contrôles et conservation

- Calculs `Decimal` et centimes entiers, sans correction automatique des montants fournis ; total, reliquat et écart d'arrondi affichés.
- Rapprochement salarié + période ou fournisseur + numéro de facture. Un montant seul ne suffit pas. Les divergences sont bloquantes sans décision documentée.
- Assiette relevée dans le PDF, comparée au tableau. Assiette absente ou éligible : confirmation manuelle. Dépassement interdit.
- Carte d'occupation issue des pixels, objets graphiques et annotations. Marge de sécurité de 7 points. Repli compact, blocs fractionnés, puis annexe uniquement si autorisée.
- En-tête générique par défaut. Un programme spécifique doit correspondre aux programmes renseignés dans toutes les imputations concernées.
- Contrôle après composition : texte source, géométrie, annotations, montants/libellés et comparaison visuelle hors tampon. Le PDF produit doit correspondre à l'empreinte de l'aperçu approuvé.
- PDF chiffrés, signatures/champs de signature, actions actives repérées et géométries non prises en charge sont refusés.
- Pas de journal des fichiers ni de texte intégral dans la sortie du sous-processus serveur ; pipes privés, dossiers OCR temporaires supprimés, sous-processus arrêtés en cas de délai dépassé.
- Conservation des lots 30 jours. Accès coupé dès expiration. Nettoyage quotidien requis, au plus 20 lots par déclenchement ; suppression manuelle disponible et protégée pendant un travail actif. Originaux et copies intermédiaires restent dans le lot jusqu'à suppression ou échéance, afin de permettre les reprises.
- Le CSV protège ses cellules contre l'interprétation des préfixes de formule. Les téléchargements utilisent les droits du lot et `Cache-Control: no-store`.

## Limites explicites

100 PDF / 200 Mio par lot ; 20 Mio et 30 pages par PDF ; XLSX/CSV 5 Mio, 5 000 lignes, 100 colonnes, 25 feuilles. Les archives XLSX décompressées sont bornées à 30 Mio et le tableau normalisé avec sa traçabilité à 1,2 Mo par lot ; un tableau trop détaillé demande plusieurs lots. Les signatures, macros et fichiers `.xls` ne sont pas pris en charge. EUR uniquement, valeurs négatives refusées. 200 imputations maximum par pièce ; police de 8 à 12 points. ZIP limité à 30 Mio de PDF, avec téléchargement individuel au-delà.

La reconnaissance automatique couvre les libellés usuels français, certaines variantes de dates et les identifiants explicitement présents. Elle ne couvre pas tous les modèles de bulletins ou factures ; les cas non reconnus passent en vérification. Les pièces italiennes peuvent être OCRisées, mais leur rapprochement peut demander une confirmation manuelle. Le contrôle visuel raster est une mesure conservatrice à résolution finie, pas une preuve mathématique pour tous les PDF possibles. Une copie de sortie n'est pas certifiée PDF/A ou signature électronique.

L'interface permet l'approbation par pièce et le tamponnage collectif des pièces approuvées. Les profils portent sur l'import ; la disposition et le programme sont réglés sur la pièce. Il n'existe pas d'éditeur général de modèles graphiques.

Le moteur dispose d'un délai de 95 secondes par appel, d'un budget CPU de 85 secondes et d'une limite d'espace mémoire de 384 Mio sur Linux. Le service documentaire partage son sémaphore existant avec la facturation : un traitement chargé peut provoquer une attente ou un refus temporaire. Aucun test Docker/Linux ni mesure de mémoire totale du service de production n'a été effectué sur ce poste Windows.

## Vérifications effectuées

Toutes les pièces et identités des essais sont fictives.

| Vérification | Résultat |
|---|---|
| Moteur/import/API tamponnage | 28 tests Python réussis |
| Régression PDF et annotations existants, avec tests tamponnage | 45 tests et 26 sous-tests réussis, 2 avertissements de dépréciation du client de test |
| Worker réel avec D1/R2/Queue isolés et moteur Python réel | 8 scénarios réussis : accès, imports, source intacte, reprise, Qwen malveillant simulé, approbations concurrentes, empreinte, export, isolation et suppression |
| Parcours navigateur | Import, mapping, analyse, six projets, collision manuelle refusée, relance, approbation, téléchargement, sombre/mobile : réussi |
| Portail complet | Navigation réelle, droits administrateur/collaborateur, persistance du lot et effacement à la déconnexion : réussis |
| Migration SQL de déploiement | Appliquée deux fois sans erreur dans une base isolée |
| OCR local réel | Scan fictif reconnu par Tesseract puis tamponné et contrôlé : réussi |
| TypeScript / compilation | Réussis |
| Régression portail / rôles / identité | Réussie |
| Charge 20 pièces | 19 aperçus + 1 refus attendu, 39,272 s, pic RSS du processus Node 214 Mio |
| Charge 40 pièces | 39 aperçus + 1 refus attendu, 66,174 s, pic RSS du processus Node 213 Mio |

Mesures sur Windows, AMD Ryzen 7 7730U, moteur local et services Cloudflare émulés, assistance IA désactivée. Le RSS Node exclut les processus Python et workerd ; ces nombres ne représentent ni une promesse de performance ni un plafond mémoire de production.

Le scénario de référence comporte six projets : **6 459,40 EUR** imputés sur **7 177,10 EUR**, reliquat **717,70 EUR**, écart d'arrondi signalé de **0,01 EUR**. Les tests couvrent aussi 1 à 8 et 12 imputations, factures, pages tournées/rognées, scans, annotations, tableaux fusionnés/groupés/larges, correction explicite, programme incohérent, PDF chiffré/signé, absence de zone libre et préservation visuelle.

Les preuves locales sont dans `.private/stamping-qa/` : capture du portail, écran de contrôle des six projets, captures sombre/mobile, `checks.json` et `six-projets_tamponne.pdf`. Ce dossier n'est pas publié par Git.

## Relancer les contrôles

Installer Node 24 et les dépendances `pnpm install --frozen-lockfile`, puis les dépendances Python de `facturx-service/requirements-lock.txt`. Tesseract avec `fra`, `eng`, `ita` est nécessaire pour le smoke test OCR. `STAMP_TEST_PYTHON` peut désigner l'exécutable Python et `PLAYWRIGHT_PACKAGE` le chemin du package Playwright. Le navigateur de test est Edge.

```text
pnpm typecheck
pnpm build
pnpm test:stamping
pnpm test:stamping:browser
pnpm test:stamping:portal
pnpm test:stamping:load
# Depuis facturx-service :
python -m pytest tests/test_stamping.py tests/test_stamping_api.py -q
python -m deployment.verify_stamping
```

`STAMP_TEST_COUNT=40` sélectionne le second essai de charge (20 par défaut). Voir [STAMPING-DEPLOYMENT.md](STAMPING-DEPLOYMENT.md) pour l'activation et [STAMPING-LICENSES.md](STAMPING-LICENSES.md) pour les bibliothèques.
