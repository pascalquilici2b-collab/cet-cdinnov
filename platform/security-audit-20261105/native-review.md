# Ghostscript — rétroportage vérifiable du 5 novembre 2026

## Décision et preuve des correctifs

Les deux avis ouverts le 30 octobre ont désormais un correctif officiel identifié.
Les fiches Debian consultées le 5 novembre indiquent toujours Trixie
`10.05.1~dfsg-1+deb13u3` affecté, et `10.08.0~dfsg-1` comme première version Debian
corrigée pour [CVE-2026-110133](https://security-tracker.debian.org/tracker/CVE-2026-110133)
et [CVE-2026-112922](https://security-tracker.debian.org/tracker/CVE-2026-112922).

La livraison préparée reconstruit la source officielle Debian Trixie u3 et ajoute
les deux patches Artifex exacts, sans adaptation :

| Avis | Correctif officiel | Effet dans la source |
|---|---|---|
| 110133 | [0e623dbd83b93bbbe70ebfe93431b5968e006789](https://github.com/ArtifexSoftware/ghostpdl/commit/0e623dbd83b93bbbe70ebfe93431b5968e006789) | Désactivation de l'ancien interpréteur de bytecode TrueType dans `gxttfb.c` et `ttfmain.c`, selon le choix officiel Artifex ; les polices restent prises en charge, notamment via FreeType. |
| 112922 | [4f878064736b09811694dace00102bd89639874e](https://github.com/ArtifexSoftware/ghostpdl/commit/4f878064736b09811694dace00102bd89639874e) | Vérification de l'index après conversion en entier, avec refus d'un index négatif dans `gxshade.c`. |

Il s'agit d'un vrai rétroportage du correctif source, pas d'une option `SAFER`
supplémentaire ni d'une affirmation fondée sur un numéro amont. L'étiquette
`10.05.1~dfsg-1+deb13u3+cdi1` identifie notre reconstruction locale ; elle ne
désigne pas une version publiée par l'équipe sécurité Debian. Le choix conserve
les bibliothèques système et la recette Debian déjà utilisées par l'application.
`debian/rules` reste inchangé et son SHA-256 est contrôlé. Les tests Debian ne sont
pas désactivés. Le profil `nodoc` omet uniquement la génération de documentation.

## Chaîne de construction et refus des substitutions

[Dockerfile](../../facturx-service/Dockerfile) construit les quatre paquets
Ghostscript dans une étape séparée. L'image finale contient les paquets reconstruits
et les outils documentaires existants, sans compilateur ni source de compilation.

[build_ghostscript.py](../../facturx-service/deployment/build_ghostscript.py)
télécharge le [descripteur officiel Debian](https://security.debian.org/debian-security/pool/updates/main/g/ghostscript/ghostscript_10.05.1~dfsg-1+deb13u3.dsc)
et ses deux archives avec contrôle SHA-256. Le descripteur vérifié donne les
empreintes de l'archive amont `ca4ff3a4…843add1` et du delta Debian
`f7635b85…b7080c2`. Les empreintes intégrales sont suivies dans
[lock.json](../../facturx-service/deployment/ghostscript/lock.json).

Le même verrou contient les empreintes des patches officiels et des trois fichiers
C résultants. Les patches doivent s'appliquer sans approximation de contexte ;
les fichiers corrigés sont contrôlés avant puis après compilation. La collecte
vérifie les versions des quatre paquets et produit un manifeste comprenant les
empreintes des paquets et des fichiers natifs installables.

[verify_native_packages.py](../../facturx-service/deployment/verify_native_packages.py)
refuse ensuite une version différente, une provenance absente ou différente, et
une modification de l'exécutable, de la bibliothèque `libgs` ou du profil sRGB.
Il vérifie que le convertisseur utilise `/usr/bin/gs`. Une simple révision Debian
ultérieure n'est pas acceptée automatiquement : ses correctifs devront être
réexaminés avant remplacement de ce verrou. Java et Tesseract gardent leurs seuils
Debian existants, avec acceptation de leurs révisions de sécurité ultérieures.

Le fichier `.dockerignore` omettait plusieurs vérificateurs pourtant copiés par
le Dockerfile. Il permet maintenant explicitement leur inclusion et celle des
nouveaux éléments de construction. Le déploiement doit inclure le dossier
`deployment/ghostscript/` et `deployment/build_ghostscript.py`.

## Vérifications locales réellement exécutées

- Les réponses officielles Debian et Artifex du 5 novembre ont été sauvegardées
  sous `platform/.private/security-audit-20261105/`, avec URL, date UTC, statut,
  en-tête Date et SHA-256 dans `native-source-receipts.json`.
- Les deux archives Debian ont été téléchargées ; leurs empreintes correspondent
  au descripteur officiel. Les deux patches locaux correspondent octet pour octet
  aux versions officielles récupérées à nouveau le 5 novembre.
- Les patches ont été appliqués par GNU patch aux trois fichiers C de l'archive
  Debian : aucun rejet, aucun fuzz, aucun décalage. Les patches Debian u3 ne
  modifient aucun de ces trois fichiers ; leurs autres correctifs restent dans
  la reconstruction.
- `pytest -q tests/test_native_packages.py tests/test_native_process_environment.py`
  : **13 tests réussis**. Couverture : refus des versions non prouvées, absence
  de bibliothèque/provenance, patch altéré, provenance source incorrecte et
  bibliothèque installée altérée malgré un numéro de paquet inchangé. Le contrôle
  existant de l'environnement du processus Ghostscript passe également.
- Compilation syntaxique des trois scripts Python modifiés/créés : réussie.
- `git diff --check` sur les fichiers natifs modifiés : réussi, avec avertissements
  habituels LF/CRLF. Une règle locale impose LF aux patches dont l'empreinte est
  verrouillée.

## Contrôles Linux obligatoires et limite de cette sous-revue

Ce poste ne dispose ni de Docker ni d'une distribution WSL installée. **La
compilation Linux et les conversions natives corrigées n'ont donc pas été
exécutées localement par cette sous-revue.** Les résultats ci-dessus ne doivent
pas être présentés comme un build natif réussi ou comme une correction déjà
publiée. La publication reste conditionnée à la réussite et à la collecte des
journaux du build Linux piloté par le responsable de livraison.

Le Dockerfile exige, sous UID 10001, les quatre vérifications suivantes :

1. `deployment.verify_native_packages` : versions et intégrité de la reconstruction.
2. `deployment.verify_document_security` : PDF actifs refusés et sous-processus borné.
3. `deployment.verify_runtime` : conversion réelle PDF/A-3b/Factur-X, XML intégré,
   montants, annotations et transparence. L'essai supplémentaire crée trois pages
   et deux polices TrueType réellement incorporées ; il vérifie accents, ordre des
   pages, rendu visuel et validation finale complète.
4. `deployment.verify_stamping` : vrai OCR Tesseract sur données fictives,
   tamponnage, conservation de la source, scan multipage, scan gris partiel et
   tableau de paiement dense sous le sous-processus borné.

La comparaison visuelle ne constitue pas un test d'exploitation des CVE. La
preuve de correction repose sur les patches officiels et leur chaîne de
construction. La procédure est reproductible au niveau des sources et correctifs ;
les bibliothèques Trixie et l'image de base suivent les mises à jour, donc elle
ne promet pas des binaires identiques entre deux dates de compilation.

Aucun changement du calcul métier, de l'API, des comptes, des secrets ou de
l'envoi de messages n'a été fait dans ce volet. Aucun document de production
n'a été utilisé. Le filtrage d'environnement antérieur reste une défense
complémentaire ; ce travail n'ajoute pas un confinement OS complet. Les avis
Tesseract déjà qualifiés comme nécessitant un modèle hostile ne sont pas déclarés
corrigés par cette mise à jour Ghostscript.
