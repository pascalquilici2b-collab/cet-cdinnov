# Revue sécurité — pièces, facturation, PDF/OCR et IA — 28 octobre 2026

Périmètre source : dépôt `billing-refonte-20261019`, base de revue `531ea21`, puis modifications de l'audit. Aucun document réel, secret ou destinataire réel n'a été utilisé dans les essais. Les preuves sont des PDF, identifiants et archives fictifs créés en mémoire. La validation de l'image Render publiée est documentée ci-dessous à partir du relevé du parent ; les autres publications applicatives sont consignées dans son rapport global.

## Constats et corrections

| Référence | Priorité | Constat vérifié | Correction locale |
|---|---|---|---|
| DOC-01 | P2 | Une annotation PDF `/SubmitForm` était acceptée par `open_source()` et conservée par `canonical()`. Le filtre initial ne couvrait pas `/Launch`, les chaînes `/Next`, les actions des signets ou XFA. Une copie tamponnée pouvait donc conserver une action externe exécutée par un lecteur PDF compatible, sous ses propres règles d'interaction. Aucune action n'a été exécutée pendant l'essai. | Nouveau `pdf_safety.py:8` : parcours du graphe avec protection contre les cycles et limite de complexité, refus des actions actives, conservation des liens HTTP(S)/mailto et navigation interne. Appliqué au tamponnage et à `pdf_import.py:62`, donc également à la source de conversion Factur-X avant Ghostscript. Les attributs de structure des PDF balisés ne sont pas confondus avec des actions. La réparation existante d'un signet racine absent reste autorisée sous son contrôle visuel. |
| DOC-02 | P2 | Le filtrage des extraits IA supprimait les lignes avec le mot « IBAN », mais conservait un IBAN sans libellé situé sur une ligne « Fournisseur ». Des variantes de NIR avec séparateurs ou code départemental corse échappaient aussi à la suppression. | Filtrage local dans `stamping_pdf.py:125` et second contrôle à la sortie dans `platform/stamping-ai.ts:4`. Les anciennes lectures en cache sont couvertes par ce second contrôle ; la version du lecteur est aussi renouvelée pour invalider les anciens reçus de cache. Les suggestions sont validées uniquement contre les extraits filtrés. Aucun appel IA si tous les extraits sont écartés. Cela réduit les données transmises, sans prétendre anonymiser les noms nécessaires au rapprochement. |
| DOC-03 | P2 | Import, aperçu et contrôle de source de conversion utilisaient pypdf/PyMuPDF dans le processus du serveur web. Le plafond de 20 Mo ne borne pas la taille décompressée ni le temps de lecture d'un PDF hostile. Aucune charge destructive n'a été exécutée. | `pdf_import.py:21` exécute la lecture dans `pdf_read_worker.py`. Délai parent de 35 s, sortie temporaire plafonnée à 6 Mio, arrêt/récupération de l'enfant par `subprocess.run`. Sous Linux : espace d'adressage 384 Mio, CPU 25/30 s, fichier de sortie 6 Mio. Le contrôle du texte s'effectue progressivement. Les erreurs du parseur ne renvoient ni contenu extrait ni chemin interne. |
| DOC-04 | P2 | Les imports ZIP des marchés et Office donnaient tout le flux compressé à fflate en un seul appel. Le contrôle du volume dans le callback arrivait après l'allocation de ce bloc décompressé, notamment avec des métadonnées de taille mensongères. | `marches/import-files.js:59` et `marches/reader.js:17` alimentent désormais la décompression par blocs de 4 Kio, comme le tamponnage. Les limites existantes de taille réelle sont vérifiées entre ces étapes. Essais sur archives compressées fictives de 6/17 Mio et import normal. |
| DOC-05 | P1 pour mise à jour | Les versions verrouillées certifi 2026.7.22, Pillow 12.3.0 et pypdf 6.19.0 étaient signalées par l'audit OSV du parent. Cela constitue une exposition de dépendance ; aucun exploit de ces CVE n'a été lancé et toutes les fonctions des bibliothèques ne sont pas nécessairement accessibles depuis l'application. | Versions verrouillées et environnement local actualisés : certifi 2026.10.23, Pillow 13.0.0, pypdf 6.21.3. `pip check` ne détecte aucun conflit, notamment avec factur-x 6.8. |
| DOC-06 | P1 pour mise à jour | Le relevé du parent sur l'image Render précédente contient Ghostscript `10.0.0~dfsg-11+deb12u8`. Le suivi Debian marque quatre avis importants comme non corrigés sur Bookworm et corrigés sur Trixie. Ce constat concerne le paquet installé ; aucun exploit natif n'a été exécuté. | Dockerfile passé à Debian Trixie et Java 21 ; contrôle obligatoire des révisions Debian corrigées de Ghostscript/libgs10 et Java, avant les trois tests natifs existants. Image Render publiée et tests Linux réussis, selon le relevé du parent détaillé ci-dessous. |

Le parseur XMP du contrôle final d'assemblage utilise maintenant explicitement `resolve_entities=False, no_network=True`, comme le parseur du rapport veraPDF. Le XML concerné est produit par le service ; cette modification est un renforcement et non une preuve de XXE exploitable.

Sources officielles vérifiées le 28 octobre 2026 : [pypdf, complexité de lecture des références croisées, corrigée à partir de 6.21.2](https://github.com/py-pdf/pypdf/security/advisories/GHSA-jr96-gvgh-j3r4), [certifi, retrait des racines emSign après compromission d'intermédiaires](https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2), [publication Pillow 13.0.0](https://github.com/python-pillow/Pillow/releases/tag/13.0.0). Le relevé OSV détaillé est conservé par le parent dans les éléments privés de l'audit.

## Couverture de la revue

- API Python et démarrage : contrôles d'hôte/origine, clé serveur, authentification, taille des corps, sémaphore de concurrence, pipes privés, délais de sous-processus. Les opérations de tamponnage et de génération numérotée exigent la clé machine, même lorsqu'un jeton utilisateur est valable.
- Fichiers : `billing.ts`, `billing-report.ts`, `billing-engagement.ts`, `client-employees.ts`, `data-export.ts`, consultation de la route commune `filesRoute`. Préfixes de stockage des factures, du tamponnage et des salariés interdits dans la route générique ; accès par le module habilité. Les marchés exigent un administrateur. L'export global exige un administrateur et exclut les vérificateurs de mot de passe de `portal_accounts`.
- Les lots de tamponnage sont explicitement partagés en lecture avec l'équipe habilitée ; leur modification reste réservée au propriétaire/administrateur. Ce comportement n'a pas été qualifié à tort de fuite entre utilisateurs. Aucun contrôle de rôle supplémentaire n'a été inventé.
- SSRF : service PDF choisi par configuration serveur, HTTPS, pas de paramètres ou identifiants dans l'URL, redirections manuelles sans retransmission de clé ; annuaire public à destination constante, redirections désactivées et réponse bornée. Aucun suivi d'URL issue des documents ou des réponses IA identifié dans ce périmètre.
- Archives : imports sans extraction sur disque, refus des traversées dans les ZIP utilisateur ; XLSX du moteur limité en taille totale décompressée, nombre d'entrées, lignes/colonnes, macros et chiffrement, et traité dans le sous-processus du tamponnage. Office côté navigateur refuse DOCTYPE/ENTITY et sélectionne explicitement ses composants XML.
- IA : aucun outil ni action exécutable ; budget quotidien partagé et atomique, délais, schémas et citations vérifiées. Les documents et marchés sélectionnés sont rattachés au dossier demandé. Les propositions demeurent soumises à validation métier.
- PDF : commandes sans shell, chemins temporaires fixes, Ghostscript `-dSAFER`, XML généré côté serveur, contrôles d'empreintes/assemblage et sorties forcées en pièce jointe. Aucun chemin local construit à partir d'un nom de téléversement n'a été trouvé dans le moteur.

## Validation locale

Environnement : Python 3.12.14 du venv local existant, après mise à jour des trois dépendances ; Node 24.18.0.

- Suite complète `facturx-service/tests` après mises à jour et garde import/conversion : **261 tests réussis, 2 ignorés, 52 sous-tests réussis**, en 69 s. Les ignorés sont uniquement les deux conversions exigeant le runtime natif complet.
- Ajustement final pour conserver les ressources PDF nommées `/A` (ce nom n'est pas toujours une action), contrôlé par les suites sécurité, vision et rendu : **56 tests et 26 sous-tests réussis**, puis smoke documentaire réussi. Les liens, attributs de PDF balisés, ressources et réparations de signets restent couverts avec les refus d'actions actives.
- Régression dédiée `test_document_security.py` : actions actives, chaîne Next, liens conservés, PDF balisés, IBAN/NIR fictifs, isolement, expiration, confidentialité des erreurs.
- `node platform/stamping-ai-security-test.mjs` : PASS, appel IA entièrement simulé, contrôle de la charge transmise et rejet des suggestions non fondées/interdites.
- `node platform/stamping-zip-test.mjs` : PASS, chemins, tailles réelles, nombre, archives malformées/tronquées.
- `node marches/import-test.mjs` : PASS, import, citations, valeurs manuelles et propositions.
- `node marches/archive-security-test.mjs` : PASS, métadonnées de taille mensongères et import normal.
- `python -m deployment.verify_document_security` : PASS sur Windows ; contrôle vrai sous-processus et refus SubmitForm. Le résultat indique explicitement `linux_resource_limits: false` sur Windows.
- Complément runtime : `pytest -q tests/test_native_packages.py tests/test_document_security.py` : **35 tests réussis**, également repassés par le parent. Les commandes Debian sont simulées dans les quatre tests du contrôle des paquets ; seul le build Linux peut confirmer les révisions réellement installées.
- `pip check` : aucun conflit ; `git diff --check` : aucune erreur sur les fichiers de ce périmètre.

Commandes reproductibles depuis la racine du dépôt sous PowerShell :

```powershell
Push-Location facturx-service
& ../platform/.private/facturx-venv/Scripts/python.exe -m pip check
& ../platform/.private/facturx-venv/Scripts/python.exe -m pytest -q -rs --disable-warnings tests
& ../platform/.private/facturx-venv/Scripts/python.exe -m deployment.verify_document_security
Pop-Location
node platform/stamping-ai-security-test.mjs
node platform/stamping-zip-test.mjs
node marches/import-test.mjs
node marches/archive-security-test.mjs
```

## Image Linux / validation Render

Docker n'est pas disponible sur le poste : ni commande détectée, ni binaire dans l'emplacement standard. Aucune installation système ni construction locale d'image n'a été effectuée. Les limites Linux n'ont pas été validées sur ce poste Windows. `deployment/verify_document_security.py` figure dans les copies et tests obligatoires du Dockerfile, sous l'utilisateur non privilégié ; le build Render a vérifié la lecture réelle et les limites AS/CPU/FSIZE de l'enfant.

Le parent a confirmé le déploiement Render **LIVE** de la révision `10718c1`, identifiant `dep-dbh1n94s728c73cjofc0`, le **28 octobre 2026 à 16:00:08 UTC**. Son relevé de l'image effective établit :

- Ghostscript et libgs10 : `10.05.1~dfsg-1+deb13u3` ; Java 21 : `21.0.13+9-1~deb13u2` ; Tesseract : `5.5.0-1+b1`.
- `verify_document_security` réussi avec `linux_resource_limits: true`.
- Conversions PDF/A et Factur-X, annotations et remises : réussies.
- Tamponnage, scans multipages et partiels, document de paiement de 28 lignes : réussis.

Cette preuve provient de la reconstruction et de la validation conduites par le parent, sans nouveau traitement de document client par cette sous-revue.

Le Dockerfile corrigé utilise `python:3.12-slim-trixie` (sans digest), Ghostscript et OpenJDK 21 depuis les dépôts Debian stables. `deployment.verify_native_packages` bloque désormais le build sous la révision Debian corrigée de Ghostscript/libgs10 `10.05.1~dfsg-1+deb13u3`, Java 21 `21.0.13+9-1~deb13u2` et Tesseract `5.5.0-1`. Les futurs correctifs restent acceptés. La motivation, les sources officielles, la compatibilité Java et les limites restantes sont détaillées dans `ghostscript-runtime-update.md`. Chaque reconstruction doit conserver le relevé des versions effectives ; les versions ci-dessus décrivent celle validée le 28 octobre. veraPDF reste verrouillé à 1.30.2 avec vérification SHA-256 de l'installateur. Le service conserve UID/GID 10001, un seul traitement simultané, heap Java plafonnée à 192 Mio et absence de journal d'accès.

Sources natives vérifiées le 28 octobre 2026 : [suivi Debian de Ghostscript](https://security-tracker.debian.org/tracker/source-package/ghostscript), [paquet corrigé Trixie](https://packages.debian.org/trixie/ghostscript) et [matrice officielle veraPDF 1.30.2 incluant Java 21](https://raw.githubusercontent.com/veraPDF/veraPDF-apps/v1.30.2/.github/workflows/test-pr.yml). Debian confirme également que le seuil Java retenu corrige [CVE-2026-101516](https://security-tracker.debian.org/tracker/CVE-2026-101516) et [CVE-2026-91403](https://security-tracker.debian.org/tracker/CVE-2026-91403). Les avis Ghostscript [CVE-2025-59800](https://security-tracker.debian.org/tracker/CVE-2025-59800) et [CVE-2025-59801](https://security-tracker.debian.org/tracker/CVE-2025-59801) restent signalés sur le paquet source, avec une note Debian indiquant que les composants concernés ne sont pas compilés dans son binaire. Le seuil Tesseract fixe la version attendue de Trixie ; il ne prouve pas que tous les avis du moteur OCR sont corrigés. Aucune conclusion « zéro CVE » n'est tirée de ce contrôle.

Commandes de revalidation dans le répertoire `/app` du shell Render, sans afficher les variables secrètes :

```sh
python -m deployment.verify_document_security
python -m deployment.verify_native_packages
python -c "import json,os,urllib.request; r=json.load(urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8080')+'/api/health',timeout=5)); assert r['ready']; print({'ready':r['ready'],'authentication_required':r['authentication_required']})"
python -c "from importlib.metadata import version; print({p:version(p) for p in ('certifi','pillow','pypdf','factur-x')})"
dpkg-query -W ghostscript libgs10 openjdk-21-jre-headless tesseract-ocr ca-certificates
```

Les tests natifs complets existants `python -m deployment.verify_runtime` et `python -m deployment.verify_stamping` emploient eux aussi des données fictives et sont déjà obligatoires au build Docker. Aucun fichier de client ne doit être utilisé pour ce contrôle. Les deux tests Python qui nécessitent explicitement ce runtime complet restent indiqués comme ignorés sur le poste Windows.

La publication des actifs incluant `marches/reader.js`, `marches/import-files.js` et du worker contenant `stamping-ai.ts` relève du rapport global du parent. Aucun bundle global, commit, migration ou déploiement n'a été effectué par cette sous-revue. Le pipeline Ghostscript/Java a passé les contrôles de l'image Linux réelle décrits ci-dessus ; la nouvelle isolation ne prétend pas cloisonner à elle seule chaque étape native de conversion.

## Complément — trois modèles publics

Revue locale des trois fichiers suivis, sans affichage de valeurs personnelles. Seul le nettoyage de métadonnées du classeur a été autorisé et réalisé.

| Modèle | Données et métadonnées | Contenu actif / externe | Intégrité |
|---|---|---|---|
| `modele_suivi_CET.xlsx` | 1 métadonnée nominative de dernier rédacteur retirée ; 0 répétition de cette identité dans les composants du classeur ; 2 zones d'identité avec saisies vides. Aucune adresse email, donnée bancaire ou téléphone détecté dans les cellules. | 0 macro, objet embarqué, relation externe, formule externe, commentaire ou feuille cachée. | 11 feuilles et 12 formules ; les 20 composants ZIP autres que `docProps/core.xml` sont identiques octet par octet à HEAD. Aucune cellule, formule, valeur calculée, style ou mise en page n'a été modifié. |
| `templates/client-mission-v1.docx` | 0 champ auteur/dernier rédacteur nominatif ; aucun email, identifiant bancaire, téléphone ou chemin local détecté dans le texte. | 0 macro, objet embarqué, relation externe, commentaire, modification suivie ou champ actif. | Fichier identique à HEAD ; 10 placeholders distincts, 11 occurrences, tous contigus dans le XML et remplacés correctement par des valeurs fictives. |
| `templates/client-mission-v2.docx` | Même résultat que v1. | Même résultat que v1. | Fichier identique à HEAD ; mêmes 10 placeholders distincts et 11 occurrences ; remplacement fictif valide sans champ restant. |

Chaque DOCX contient les 2 mêmes images de marque attendues, sans EXIF ni métadonnée textuelle détectée. Ces images n'ont pas été supprimées ou modifiées. Le nettoyage du XLSX n'affecte que la propriété du dernier rédacteur : l'équivalence des composants de rendu est démontrée par comparaison binaire, sans recalcul ni réenregistrement des feuilles. Les contrôles de motifs ne constituent pas une reconnaissance exhaustive de toute donnée personnelle possible ; aucune donnée individuelle renseignée n'a été identifiée dans les zones prévues à cet effet.
