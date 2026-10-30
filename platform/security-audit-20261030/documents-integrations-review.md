# Revue documents et intégrations — 30 octobre 2026

Revue de la révision `493f91b`, avec comparaison des changements depuis le correctif de sécurité `bc4a9fe` du 28 octobre et lecture des rapports `documents-review.md`, `frontend-outlook-review.md` et `native-runtime-review.md` de cet audit. Les rapports et modifications préexistants ont été conservés. Travail réalisé selon `AGENTS.md` et le skill de revue de code.

Les reproductions utilisent uniquement des données fictives, un modèle IA simulé, Graph simulé, un Worker local et le service documentaire Python local. Aucun message envoyé, aucune requête IA externe, aucun fichier client de production ouvert et aucune configuration ou publication modifiée par cette sous-revue.

## Constat confirmé et corrigé

### DOC30-01 — P2 / confidentialité — métadonnées et montants d'exemple du nouveau parcours IA

La fonction de reconnaissance de tableaux inconnus ajoutée le 29 octobre traite les textes de cellules avec le filtre de confidentialité existant, mais envoyait aussi `candidate.sheet` sans filtrage à `MARKETS_AI`. Le titre d'une feuille XLSX est libre ; un IBAN fictif de 27 caractères est un titre Excel valide. Un identifiant bancaire/social placé dans ce titre pouvait donc être transmis au modèle même si le même identifiant était retiré des cellules. Ce chemin concerne les tableaux dont l'organisation n'est pas reconnue localement et pour lesquels le binding IA est configuré ; il n'est pas activé pour tous les documents.

Une seconde incohérence du même parcours concernait les cellules contenant une somme enregistrée comme texte, par exemple `2 345,67 EUR`. `layout_sample()` masquait les cellules numériques et les chaînes avec le symbole euro, mais pas le suffixe `EUR`. La promesse de n'envoyer que la structure, avec nombres masqués, n'était donc pas tenue pour ce format courant. La sortie Worker faisait également confiance à un champ `kind: number` provenant du service/cache sans remettre systématiquement le masque ; cette variante est un renforcement de la frontière, pas la preuve que le service actuel émet une valeur brute dans ce champ.

**Reproduction.** `layout-ai-privacy-proof.mjs --baseline` compile la source exacte de `493f91b`, sans réinitialiser le dépôt. Le faux modèle intercepte son entrée : `bankTransmitted=true` via le titre de feuille, `currencyCellTransmitted=true` pour la somme en texte. Aucun service externe n'est appelé. Les nouveaux tests Python passent également par un véritable XLSX fictif, `openpyxl`, puis `inspect()` pour vérifier la construction des candidats du chemin actuel.

**Correction locale.** Dans [stamping-layout-ai.ts](../stamping-layout-ai.ts:18), chaque feuille est représentée uniquement par `table-1`, `table-2`, etc. pendant l'appel IA. Après validation de la réponse contre les références fournies, le serveur rétablit le nom original pour la résolution locale. Un nom source brut ou une référence inventée dans une réponse IA est refusé. L'index d'origine reste stable quand une première feuille est entièrement filtrée. Les adresses de cellules et métadonnées sont bornées à leurs formes structurelles.

Le Worker masque systématiquement les cellules déclarées numériques et les chaînes numériques avec `EUR`. Le même format est reconnu dans [stamping_layout.py](../../facturx-service/cdi_facturx/stamping_layout.py:22). La version de consigne est renouvelée à `payment-layout-v2`.

**Préservation du métier.** Le masque s'applique seulement aux exemples destinés à reconnaître les colonnes et lignes. Le classeur source, les montants, les périodes, les références de cellules et les fonctions de normalisation comptable ne sont pas réécrits. Le parcours Worker + véritable sous-processus Python retrouve les affectations fictives `125000` et `90000` centimes, conserve les octets du fichier source et ne confirme pas automatiquement l'import. Aucune extension du masquage à un autre prompt d'extraction n'a été faite.

**Après correction.** La preuve indique les quatre transmissions sensibles à `false`, `originalSheetRestored=true`, `groundedReferencePreserved=true`, `skippedSourceMappingPreserved=true`. Les entrées entièrement filtrées ne déclenchent pas l'appel au modèle. Ce filtre ne prétend pas anonymiser tous les noms nécessaires au rapprochement ni détecter toute information personnelle possible dans du texte libre. Aucun incident réel de transmission n'a été recherché ni établi ; le constat porte sur le code et la reproduction locale.

### AUTH30-DOC — P2 — empreinte de vérificateur lisible dans les sessions du service Render

À la demande du parent, la revue a été étendue à `server_auth.py`. Le claim `account` des jetons signés contenait `SHA256(salt:iter:hash_PBKDF2)`. Une signature protège l'intégrité d'un jeton mais ne chiffre pas ses claims. Si un attaquant possède ce jeton et connaît le sel et le nombre d'itérations, il peut vérifier des candidats de mot de passe hors ligne contre ce claim, sans la limitation de tentatives du service.

**Condition d'exposition.** Ce module Python ne publie pas lui-même le sel. Son format est compatible avec les vérificateurs du portail ; lorsque les mêmes paramètres y sont réutilisés, le challenge public du portail fournit sel et itérations, comme établi par le volet d'authentification indépendant. La connaissance de ces paramètres n'a pas été vérifiée sur des comptes réels et aucun secret de production n'a été lu. Le constat doit conserver cette condition, sans annoncer une récupération de mot de passe effective.

**Preuve et correction.** `render-session-proof.py` exécute le code exact de `493f91b` avec un compte et une clé fictifs : un des trois candidats correspond à l'ancien claim, aucun au nouveau. [server_auth.py](../../facturx-service/cdi_facturx/server_auth.py:53) produit désormais un HMAC sous la clé serveur, avec identité et vérificateur et un domaine séparé `cdi-facturx-account-v2`. La signature des sessions utilise un autre domaine et une version 2 obligatoire. Aucun repli vers l'ancien claim n'est accepté. Les tests confirment la connexion API, le refus des anciens jetons, l'expiration et la révocation après changement de mot de passe, suppression de compte ou rotation de clé.

**Effet de livraison :** les utilisateurs du convertisseur hébergé devront se reconnecter après mise en ligne. La clé machine et son usage par le Worker ne changent pas. Le HMAC retire l'oracle du claim ; il n'empêche pas l'utilisation d'un jeton valide déjà volé jusqu'à sa révocation/expiration.

La revue indépendante du volet accès a relu le correctif et exécuté les quatre tests d'authentification ainsi que la preuve comparative : résultats concordants. Le client conserve un nom historique de stockage `cdi_facturx_session_v1`, mais ne décode pas les claims et purge son jeton en réponse à un `401` ; ce nom n'implique pas l'acceptation des sessions cryptographiques v1.

**Réserve existante d'architecture :** les comptes `FACTURX_USERS_JSON` et les sessions du service Render sont distincts du Worker. La suppression du jeton dans le navigateur ou une révocation sur le portail ne révoquent pas automatiquement une copie du bearer Render, dont la durée est huit heures. Le service ne dispose pas d'une route de déconnexion serveur avec liste de révocation. Les tests de suppression/changement de mot de passe portent sur la configuration du service Render ; ils ne prouvent pas une révocation interservice. Le déploiement v2 invalide les anciennes sessions une fois, sans supprimer cette limite générale.

### NAT30-01 — réserve native ouverte — nouveaux avis Ghostscript du 29 octobre

Sources primaires relues le 30 octobre : les fiches Debian marquent `10.05.1~dfsg-1+deb13u3` affecté, sans version Debian corrigée renseignée, pour [CVE-2026-112922](https://security-tracker.debian.org/tracker/CVE-2026-112922) et [CVE-2026-110133](https://security-tracker.debian.org/tracker/CVE-2026-110133). Les mêmes avis concernent la version instable `10.08.0~dfsg-2` dans le tableau consulté. Le simple rebuild sur Trixie ou un numéro amont plus élevé ne prouve donc pas leur correction. Les réponses HTML originales sont conservées sous `CVE-2026-112922-debian.html`, `CVE-2026-110133-debian.html` et `ghostscript-package-debian.html` dans le dossier privé de preuve ; `ghostscript-source-receipts.json` contient URL, statut HTTP, date de récupération UTC, en-tête Date et SHA-256. L'outil de consultation web retournait « inaccessible » pour les deux fiches ; leur lecture a réussi en HTTPS avec `Invoke-WebRequest`. Les réponses Red Hat sont également sauvegardées sous les noms `CVE-…-redhat.html`.

- **112922 :** les données de dégradés maillés et leurs indices de couleur peuvent provoquer une lecture mémoire hors limites, avec crash ou divulgation limitée. La description vise explicitement les documents PDF et PostScript. L'argument « entrée PDF uniquement » n'écarte donc pas ce chemin. La [fiche Red Hat](https://access.redhat.com/security/cve/CVE-2026-112922) ne fournit pas de mitigation qualifiée répondant à ses critères de déploiement.
- **110133 :** le calcul du nombre de points lors du rendu d'une police TrueType peut contourner un contrôle de tampon et conduire à un débordement de tas ; crash ou exécution de code sont des impacts possibles selon l'avis. Un PDF peut embarquer cette police. La [fiche Red Hat](https://access.redhat.com/security/cve/CVE-2026-110133) évoque l'évitement des contenus non fiables, une éventuelle désactivation de l'exécution TrueType et un sandbox restrictif. La désactivation globale n'a pas été appliquée : les PDF commerciaux utilisent ordinairement ces polices, et aucun contrôle de compatibilité n'établit qu'une telle option fermerait exactement le défaut sans casser le rendu.

**Applicabilité à ce service.** [convert_pdfa()](../../facturx-service/cdi_facturx/service.py:77) reçoit le PDF choisi, lance Ghostscript avec `pdfwrite` puis valide la sortie. Ces options ne constituent pas une preuve que les dégradés et les polices ne sont jamais interprétés ; aucun graphe d'appel natif ni test d'exploitation n'a établi une exemption. Le contrôle des actions JavaScript/Launch/XFA et `-dSAFER` ne réparent pas une corruption mémoire du parseur. Une entrée préalablement lisible par pypdf ou un PDF/A final conforme ne prouve pas l'innocuité du traitement intermédiaire. Les avis restent donc **ouverts**, sans affirmation qu'un exploit fonctionne sur notre image.

**Réduction de risque appliquée, pas correction des CVE.** L'appel Ghostscript reçoit maintenant un environnement explicite limité aux chemins système/temporaire, locale et configuration de police. `FACTURX_API_KEY`, `FACTURX_USERS_JSON`, autres identifiants de déploiement, `GS_OPTIONS`, `LD_PRELOAD` et `PYTHONPATH` ne lui sont plus hérités. Les paramètres `pdfwrite`, PDF/A, incorporation des polices, le délai et les chemins de fichiers fixes restent inchangés. Le test dédié vérifie cet appel avec un sous-processus simulé ; la conversion native effective doit passer les vérifications de l'image publiée.

**Limite essentielle :** cet environnement réduit l'exposition directe des secrets dans le processus enfant, mais n'isole ni réseau ni système de fichiers. Un processus compromis sous le même UID peut encore avoir des possibilités de lecture de `/proc` ou de fichiers du service. Les limites de taille/temps, l'authentification et l'UID non privilégié réduisent certains effets ; ce ne sont pas un sandbox OS complet. La priorité résiduelle est d'appliquer le correctif officiel dès sa disponibilité ou de disposer d'un confinement natif réellement séparé et vérifié. Aucun changement d'orchestration/hébergeur ni blocage global des PDF n'a été tenté dans ce lot.

## Autres frontières réexaminées

| Frontière | Résultat de cette revue et portée |
|---|---|
| PDF et conversions Factur-X | Le contrôle des actions actives reste appliqué aux sources avant canonicalisation et conversion. Les tests ciblés couvrent notamment SubmitForm, chaînes Next, liens permis, XFA/JavaScript, PDF balisés et ressources légitimes. Le vrai sous-processus de lecture a été vérifié localement. Aucun nouveau contournement démontré dans les changements relus. |
| Nouvelle lecture de paie/tableaux | Les changements depuis le 28 concernent surtout la sélection des pages de bulletin, le coût employeur, le contexte des grilles et la résolution sémantique. Les propositions IA ne fournissent pas les montants : `apply_layout()` relit les cellules originales, contrôle les références et les colonnes monétaires et bloque les structures ambiguës. Les étapes natives restent sous le processus documentaire borné. |
| ZIP / Office | Les protections de décompression progressive et de taille réelle des archives restent présentes ; les tests négatifs réels sur archives fictives passent. Les XLSX du service refusent macros/chiffrement, bornent feuilles/lignes/colonnes et ne suivent pas les liens externes. Le DOCX de lettre utilise le modèle local fixé et échappe les valeurs insérées dans le XML ; les formules XLSX sont construites depuis des adresses et des nombres, pas depuis les noms utilisateur. |
| Téléchargements et export global | Les routes examinées utilisent des objets de stockage et noms contrôlés, des réponses `attachment` et les contrôles d'accès de leur module. La route d'export global reste administrative et retire les vérificateurs de mots de passe. Le volet ACL indépendant du parent reste la référence pour la preuve exhaustive des autorisations. |
| Aperçus PDF et impression | Le nouveau lecteur charge PDF.js depuis les actifs locaux, lui transmet des octets, désactive l'évaluation et le rendu des annotations actives. Le texte extrait passe par React. Les liens de champs éditables sont reconnus par une liste de chemins explicite ; aucun chemin vers `prototype` ou `constructor` n'est permis. L'impression dessine les pages en images Blob, sans réinjecter le texte PDF comme HTML. Cette relecture ne constitue pas un fuzzing du parseur PDF.js. |
| XSS / CSV | Les régressions du 28 passent encore : refus des schémas actifs et d'origines étrangères pour les fichiers, échappement des signatures, neutralisation des débuts de formules CSV, en-têtes inclus ; conservation des textes XLSX comme chaînes. Aucune nouvelle exécution XSS n'a été démontrée dans les sources examinées. |
| Outlook / Graph | Les tests fictifs confirment le compte propre à la session, le périmètre `/me`, les limites de pièces jointes, le refus des injections MIME et des liens non autorisés, la relecture des destinataires/corps/PJ avant envoi, les gardes de session et l'absence de renvoi automatique après résultat incertain. La signature `%PDF-` d'une pièce n'est pas un antivirus du fichier. Aucun brouillon ni message n'a été créé dans Microsoft réel. |
| Confidentialité IA existante | Le filtre des identifiants bancaires/sociaux est toujours réappliqué à la sortie du Worker, y compris pour d'anciennes lectures. Les citations doivent provenir des extraits transmis. Le modèle ne reçoit aucun outil d'exécution ou navigation dans les deux parcours de tamponnage examinés. Le nouveau contournement de métadonnées est corrigé ci-dessus. |

## Vérifications exécutées

| Commande / groupe | Résultat observé |
|---|---|
| `node platform/security-audit-20261030/layout-ai-privacy-proof.mjs --baseline` | Reproduction positive sur `493f91b`, données fictives, zéro requête externe. |
| `node platform/security-audit-20261030/layout-ai-privacy-proof.mjs` | Correction vérifiée, restauration des identités et cas d'ordre/filtrage vérifiés. |
| `node platform/stamping-layout-ai-test.mjs` | Références ancrées, schéma, quota et retour indisponible : PASS. |
| `node platform/stamping-ai-security-test.mjs` | Filtre de sortie existant, propositions interdites et absence d'appel après filtrage intégral : PASS. |
| `node platform/stamping-layout-test.mjs` | Worker local + service Python réel : PASS ; montants source préservés. |
| `python -m pytest -q tests/test_stamping_layout_security.py tests/test_stamping_layout.py tests/test_document_security.py` | **51 tests réussis**, 8,86 s. |
| `python -m deployment.verify_document_security` | `document_security=passed`, `reader_subprocess=true`, `active_pdf_rejected=true`, `linux_resource_limits=false`. |
| `node platform/stamping-zip-test.mjs` | Traversées, limites réelles/nombre, données malformées ou tronquées et import normal : PASS. |
| `node marches/archive-security-test.mjs` | Tailles déclarées trompeuses rejetées, imports normaux conservés : PASS. |
| Sécurité frontend + Microsoft draft/send/testmail (quatre fichiers ciblés) | **20 tests réussis**, tous les appels Microsoft étant simulés. |
| `git diff --check` sur les quatre fichiers suivis modifiés | Réussi ; seulement les avertissements habituels LF/CRLF. |
| `python platform/security-audit-20261030/render-session-proof.py` | Oracle conditionnel : 1 correspondance / 3 candidats avant, 0 / 3 après ; ancien jeton refusé, nouveau accepté. |
| `python -m pytest -q tests/test_server_auth_security.py tests/test_native_process_environment.py tests/test_billing_issuance.py tests/test_native_packages.py` | **14 tests réussis, 1 ignoré**, 6,26 s. L'ignoré exige le runtime natif complet ; les deux avertissements sont des dépréciations TestClient. |
| `git diff --check` sur `server_auth.py` et `service.py` | Réussi. |

Les deux preuves JSON comparatives et le relevé des résultats sont sous `platform/.private/security-audit-20261030/`. Le script de preuve est suivi dans le nouveau dossier d'audit. Le premier lancement du parcours Worker utilisait le Python système et échouait sur le chemin Windows virtualisé du fixture ; ce problème d'environnement a été résolu par le venv explicite et la racine canonique. Le même test actuel a alors passé ses assertions métier sans les retirer. Les anciennes suites d'interface connues obsolètes n'ont pas été relancées ni déclarées vertes.

Pour reproduire le parcours de bout en bout sous ce poste Windows :

```powershell
$env:STAMP_TEST_PYTHON='C:/Users/quili/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/CDInnov/billing-refonte-20261019/platform/.private/facturx-venv/Scripts/python.exe'
# Depuis la racine canonique de ce même worktree, sans changement de source :
node platform/stamping-layout-test.mjs
```

## Livraison et limites

Fichiers fonctionnels modifiés : `platform/stamping-layout-ai.ts`, `facturx-service/cdi_facturx/stamping_layout.py`, `facturx-service/cdi_facturx/server_auth.py`, `facturx-service/cdi_facturx/service.py`. Régressions : `platform/stamping-layout-ai-test.mjs`, `platform/stamping-layout-test.mjs`, `facturx-service/tests/test_stamping_layout_security.py`, `facturx-service/tests/test_server_auth_security.py`, `facturx-service/tests/test_native_process_environment.py` et les deux scripts de preuve du présent audit.

Le parent doit intégrer la correction Worker et l'image Python dans sa livraison globale. Aucune route, clé, permission Microsoft, variable de déploiement ou réponse de santé n'a été modifiée dans ce lot. Les vérifications de build natives existantes (`verify_native_packages`, `verify_document_security`, `verify_runtime`, `verify_stamping`) restent requises sur l'image effective ; aucune attestation de déploiement n'est produite ici.

Cette revue ciblée ne renouvelle pas l'inventaire CVE complet, réalisé par le parent ; elle qualifie les deux nouveaux avis Ghostscript ci-dessus sans requalifier les avis Tesseract/Ghostscript du 28 à partir de simples tests fonctionnels. Les limites AS/CPU/FSIZE Linux, les permissions effectives de l'image Render, les consentements/scopes Entra, la rétention fournisseur IA et les contenus des boîtes Microsoft n'ont pas été inspectés en production. Les jetons applicatifs lisibles en JavaScript restent exposés à une future XSS du même domaine. Aucun verdict « zéro vulnérabilité » ou certification globale ne découle de ces contrôles.
