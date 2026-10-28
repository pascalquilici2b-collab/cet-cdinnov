# Correction du runtime Ghostscript — 28 octobre 2026

## Choix implémenté dans le dépôt

Le Dockerfile passe de `python:3.12-slim-bookworm` à l'image officielle `python:3.12-slim-trixie` (Debian 13). Java headless passe de la branche 17 à la branche 21 disponible dans cette distribution. Ghostscript continue de provenir des paquets Debian signés ; aucune compilation privée, nouvelle source APT, modification de forfait ou installation sur le poste n'est introduite.

Ce choix apporte les correctifs maintenus par Debian et conserve une chaîne de mises à jour cohérente. Le tag Python 3.12 slim trixie figure dans le [catalogue officiel des images Python](https://raw.githubusercontent.com/docker-library/official-images/master/library/python). Le tag n'est pas épinglé à un digest : la version exacte de l'image de base doit être relevée avec le build effectif.

## Versions et contrôles bloquants

Le nouveau module `facturx-service/deployment/verify_native_packages.py` vérifie que l'image est Debian trixie, que les quatre paquets sont effectivement installés et que leurs révisions Debian atteignent au moins les seuils suivants. Il utilise `dpkg --compare-versions` ; une erreur, une absence ou une version insuffisante arrête le build. Il imprime uniquement la distribution et les versions, jamais les variables d'environnement ou les secrets.

| Paquet | Minimum bloquant | Source officielle |
|---|---|---|
| ghostscript, libgs10 | `10.05.1~dfsg-1+deb13u3` | [Paquet stable avec mise à jour de sécurité](https://packages.debian.org/trixie/ghostscript) |
| openjdk-21-jre-headless | `21.0.13+9-1~deb13u2` | [Paquet Java 21 de sécurité](https://packages.debian.org/trixie/openjdk-21-jre-headless) |
| tesseract-ocr | `5.5.0-1` | [Paquet OCR trixie](https://packages.debian.org/trixie/tesseract-ocr) |

Ces seuils permettent les futures versions de sécurité. Il ne s'agit pas d'une déclaration « zéro CVE ». `gs --version` indique la version amont ; il ne suffit pas à vérifier un correctif rétroporté par Debian.

Pour Java 21, les fiches Debian de [CVE-2026-101516](https://security-tracker.debian.org/tracker/CVE-2026-101516) et [CVE-2026-91403](https://security-tracker.debian.org/tracker/CVE-2026-91403) indiquent toutes deux `21.0.13+9-1~deb13u2` comme corrigé, via DSA-6588-1. Cette révision précise, et non la seule version amont, motive le seuil Java. Le minimum Tesseract correspond au paquet de la distribution retenue et ne constitue pas une affirmation que tous ses avis de sécurité sont corrigés.

Le [suivi de sécurité Debian de Ghostscript](https://security-tracker.debian.org/tracker/source-package/ghostscript), consulté le 28 octobre 2026, marque les quatre avis importants encore ouverts sur Bookworm comme corrigés dans Trixie : TEMP-0000000-E17884, CVE-2026-103226, CVE-2026-101258 et CVE-2026-39919. Le parent a relevé `10.0.0~dfsg-11+deb12u8` dans l'image Render antérieure. Le contrôle minimum empêche de conserver silencieusement cette version lors du nouveau build. Aucun de ces exploits n'a été exécuté.

Deux avis restent marqués sur la version source Trixie, mais les notes Debian précisent des composants absents de son binaire : [CVE-2025-59800](https://security-tracker.debian.org/tracker/CVE-2025-59800), support OCR Tesseract non compilé dans Ghostscript Debian ; [CVE-2025-59801](https://security-tracker.debian.org/tracker/CVE-2025-59801), code GhostXPS non compilé. Le service invoque le périphérique fixe `pdfwrite` ; son OCR utilise le programme Tesseract séparé avec des langues système fixes. La revue native complémentaire détaille les conditions restantes des avis Java/Tesseract.

## Compatibilité et validation PDF/A

La [matrice CI officielle au tag veraPDF v1.30.2](https://raw.githubusercontent.com/veraPDF/veraPDF-apps/v1.30.2/.github/workflows/test-pr.yml) inclut Java 21. Cela soutient le choix de la branche ; cela ne remplace pas le test du binaire dans l'image reconstruite. Le JAR et son SHA-256 restent inchangés. Le [paquet libgs-common Trixie](https://packages.debian.org/trixie/all/libgs-common/filelist) contient toujours le profil `srgb.icc` au chemin utilisé par le service.

Le build exécute, sous UID/GID 10001 et sans tolérance à l'échec :

1. `python -m deployment.verify_native_packages` — distribution et révisions corrigées ;
2. `python -m deployment.verify_document_security` — lecture isolée, refus des actions PDF, limites Linux ;
3. `python -m deployment.verify_runtime` — vraie conversion d'une facture fictive, XML embarqué, validation PDF/A-3b, annotations/transparence et scénario de remise ;
4. `python -m deployment.verify_stamping` — OCR réel et tamponnage de scans fictifs, sous-processus bornés et conservation visuelle.

Les trois tests documentaires existants ne sont ni retirés ni affaiblis. Les écarts éventuels du rendu de Ghostscript ou de l'OCR avec Trixie devront être corrigés sans contourner leurs assertions.

## Résultats disponibles et suite

Sur Windows, `pytest -q tests/test_native_packages.py tests/test_document_security.py` : **35 tests réussis**. Les quatre nouveaux tests vérifient le refus de Bookworm, d'un paquet manquant, d'une ancienne version de Ghostscript et l'obligation de contrôler les quatre révisions. Les appels Debian sont simulés dans ces tests locaux ; aucun succès Linux n'est revendiqué. `git diff --check` : aucune erreur.

Docker est absent du poste ; aucune construction Linux locale n'a été possible. Le parent a ensuite confirmé la reconstruction et le déploiement Render **LIVE** de la révision `10718c1`, identifiant `dep-dbh1n94s728c73cjofc0`, le **28 octobre 2026 à 16:00:08 UTC**. Le relevé effectif contient Ghostscript/libgs10 `10.05.1~dfsg-1+deb13u3`, Java 21 `21.0.13+9-1~deb13u2` et Tesseract `5.5.0-1+b1`.

Le contrôle documentaire Linux est réussi avec `linux_resource_limits: true`. Les conversions PDF/A/Factur-X, les annotations et remises, le tamponnage et les scans multipages/partiels ainsi que le document de paiement de 28 lignes ont passé les contrôles. Cette preuve a été fournie par le parent ; aucun document client n'a été utilisé par cette sous-revue. Aucune construction Render, aucun déploiement ni commit n'a été exécuté par cette sous-tâche.

Les sorties du build et les versions doivent être conservées pour cette révision. Lors d'une prochaine reconstruction, `python -m deployment.verify_native_packages`, le contrôle de santé loopback et les tests fictifs restent nécessaires, car le tag de base et les dépôts APT peuvent évoluer.
